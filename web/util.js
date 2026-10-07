// Мелкие общие функции симуляции, картинки и звука. Math.random берётся в момент вызова — подмена генератора
// (?rseed, проверки баланса) действует и здесь.
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);   // не clamp: −0 остаётся −0, как в прототипе
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
export const rnd = (a, b) => a + Math.random() * (b - a);
export const choice = arr => arr[(Math.random() * arr.length) | 0];
