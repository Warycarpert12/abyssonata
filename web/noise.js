// 2D-шум для симуляции: классический value-noise на решётке с косинусной интерполяцией — гладкое поле -1..1, без
// углов и решётчатых артефактов на глаз, без внешних зависимостей. Алгоритм общеизвестный (Perlin-style value noise).
import { lerp } from './util.js';
export class Noise2D {
  constructor(seed) {
    // маленький детерминированный PRNG (mulberry32) — всегда одно и то же поле для seed
    let s = (seed >>> 0) || 1;
    const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0;[p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  _grad(hash, x, y) {
    // 8 направлений — достаточно для гладкого поля
    switch (hash & 7) {
      case 0: return x + y; case 1: return x - y; case 2: return -x + y; case 3: return -x - y;
      case 4: return x; case 5: return -x; case 6: return y; default: return -y;
    }
  }
  noise2(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const p = this.perm;
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1], ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    const x1 = lerp(this._grad(aa, xf, yf), this._grad(ba, xf - 1, yf), u);
    const x2 = lerp(this._grad(ab, xf, yf - 1), this._grad(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v) * 1.4; // приблизительная нормировка к -1..1
  }
  // фрактальный броуновский шум: fbm(x, y_off, octaves, pers, lac)
  fbm(x, yOff, octaves = 3, pers = 0.5, lac = 2.0) {
    let amp = 1, freq = 1, total = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      total += amp * this.noise2(x * freq, yOff);
      norm += amp; amp *= pers; freq *= lac;
    }
    return total / norm;
  }
}
