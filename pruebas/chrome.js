/* Driver mínimo de Chrome por CDP. Node 22 ya trae WebSocket global. */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function esperar(ms) { return new Promise(r => setTimeout(r, ms)); }

async function lanzar(puerto = 9333) {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'mist-chrome-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + perfil, '--allow-file-access-from-files',
    '--window-size=1440,900', '--remote-debugging-port=' + puerto, 'about:blank'
  ], { stdio: 'ignore' });

  let objetivo = null;
  for (let i = 0; i < 60 && !objetivo; i++) {
    await esperar(250);
    try {
      const lista = await fetch('http://127.0.0.1:' + puerto + '/json/list').then(r => r.json());
      objetivo = lista.find(t => t.type === 'page');
    } catch (e) { /* todavía no levantó */ }
  }
  if (!objetivo) { proc.kill(); throw new Error('Chrome no respondió'); }

  const ws = new WebSocket(objetivo.webSocketDebuggerUrl);
  await new Promise((ok, mal) => { ws.onopen = ok; ws.onerror = mal; });

  let id = 0;
  const pendientes = new Map();
  const eventos = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pendientes.has(m.id)) {
      const { ok, mal } = pendientes.get(m.id);
      pendientes.delete(m.id);
      m.error ? mal(new Error(JSON.stringify(m.error))) : ok(m.result);
    } else if (m.method) {
      eventos.push(m);
    }
  };
  function enviar(method, params = {}) {
    const n = ++id;
    ws.send(JSON.stringify({ id: n, method, params }));
    return new Promise((ok, mal) => pendientes.set(n, { ok, mal }));
  }

  await enviar('Page.enable');
  await enviar('Runtime.enable');
  await enviar('Log.enable');

  return {
    eventos,
    /* Se ejecuta antes de cualquier script de la página: sirve para sacarle una
     * API al navegador y ver cómo se comporta la app sin ella. */
    async antesDeCargar(codigo) {
      return enviar('Page.addScriptToEvaluateOnNewDocument', { source: codigo });
    },
    async ir(url) {
      const listo = new Promise(ok => {
        const t = setInterval(() => {
          if (eventos.some(e => e.method === 'Page.loadEventFired')) { clearInterval(t); ok(); }
        }, 100);
      });
      await enviar('Page.navigate', { url });
      await Promise.race([listo, esperar(15000)]);
      await esperar(400);
    },
    async js(codigo) {
      const r = await enviar('Runtime.evaluate', {
        expression: '(async () => {' + codigo + '})()',
        awaitPromise: true, returnByValue: true
      });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails));
      return r.result.value;
    },
    async foto(destino) {
      const r = await enviar('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(destino, Buffer.from(r.data, 'base64'));
      return destino;
    },
    errores() {
      return eventos.filter(e => e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
        .map(e => e.params.entry.text);
    },
    cerrar() { try { ws.close(); } catch (e) {} proc.kill(); try { fs.rmSync(perfil, { recursive: true, force: true, maxRetries: 3 }); } catch (e) {} }
  };
}

module.exports = { lanzar, esperar };
