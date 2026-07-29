/* MIST — núcleo criptográfico
 *
 * SHA-256 y HMAC-SHA256 en JS puro y sincrónico. No usamos crypto.subtle acá
 * a propósito: subtle sólo existe en contextos seguros y la idea es que este
 * archivo se abra con doble clic desde file://, sin servidor y sin internet.
 * crypto.getRandomValues sí está siempre disponible, así que la clave maestra
 * se genera con eso.
 */
(function (global) {
  'use strict';

  var K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);

  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

  function sha256(bytes) {
    var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    var h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

    var len = bytes.length;
    var bitLenHi = Math.floor(len / 536870912);
    var bitLenLo = (len << 3) >>> 0;
    var padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
    padded.set(bytes);
    padded[len] = 0x80;
    var dv = new DataView(padded.buffer);
    dv.setUint32(padded.length - 8, bitLenHi, false);
    dv.setUint32(padded.length - 4, bitLenLo, false);

    var w = new Uint32Array(64);
    for (var off = 0; off < padded.length; off += 64) {
      for (var i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
      for (i = 16; i < 64; i++) {
        var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (i = 0; i < 64; i++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }

    var out = new Uint8Array(32);
    var ov = new DataView(out.buffer);
    ov.setUint32(0, h0, false); ov.setUint32(4, h1, false);
    ov.setUint32(8, h2, false); ov.setUint32(12, h3, false);
    ov.setUint32(16, h4, false); ov.setUint32(20, h5, false);
    ov.setUint32(24, h6, false); ov.setUint32(28, h7, false);
    return out;
  }

  function hmacSha256(keyBytes, msgBytes) {
    var block = new Uint8Array(64);
    if (keyBytes.length > 64) block.set(sha256(keyBytes));
    else block.set(keyBytes);

    var inner = new Uint8Array(64 + msgBytes.length);
    var outer = new Uint8Array(64 + 32);
    for (var i = 0; i < 64; i++) {
      inner[i] = block[i] ^ 0x36;
      outer[i] = block[i] ^ 0x5c;
    }
    inner.set(msgBytes, 64);
    outer.set(sha256(inner), 64);
    return sha256(outer);
  }

  var utf8 = new TextEncoder();
  function bytes(str) { return utf8.encode(str); }

  /* Alfabeto base32 sin caracteres ambiguos (sin i, l, o, u): un token leído en
   * voz alta o copiado a mano no se rompe, y no aparecen palabras accidentales. */
  var ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

  function encode(hashBytes, chars) {
    var out = '';
    var acc = 0, bits = 0, idx = 0;
    while (out.length < chars) {
      if (bits < 5) {
        acc = (acc << 8) | hashBytes[idx % hashBytes.length];
        bits += 8;
        idx++;
      }
      bits -= 5;
      out += ALPHABET[(acc >>> bits) & 31];
    }
    return out;
  }

  function toBase64(u8) {
    var s = '';
    for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
  }

  function fromBase64(b64) {
    var s = atob(b64);
    var u8 = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
    return u8;
  }

  function randomKey() {
    var k = new Uint8Array(32);
    crypto.getRandomValues(k);
    return toBase64(k);
  }

  /* Huella corta de la clave maestra. Se muestra siempre en pantalla: dos
   * sesiones con la misma huella producen exactamente los mismos tokens. */
  function fingerprint(keyB64) {
    return encode(sha256(bytes('mist:huella:' + keyB64)), 8);
  }

  global.MIST = global.MIST || {};
  global.MIST.hash = {
    sha256: sha256,
    hmac: hmacSha256,
    bytes: bytes,
    encode: encode,
    toBase64: toBase64,
    fromBase64: fromBase64,
    randomKey: randomKey,
    fingerprint: fingerprint,
    ALPHABET: ALPHABET
  };
})(window);
