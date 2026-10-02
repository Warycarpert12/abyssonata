// QA v22: islandH ветки — до бита та же, что в эталоне (main), и насколько быстрее. Функция вырезается из visual.js
// вместе с тем, от чего зависит (шум, константы островков и рифа), и считается в Node на сетке ±150 м с шагом 0.25 м
// (1.4 млн точек) и на 1 млн случайных точек.
//   node qa/terrain_check.mjs <visual.js эталона> <visual.js ветки>
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
const grab = (s, start) => { const i = s.indexOf(start); if (i < 0) throw new Error('нет ' + start); let d = 0, j = s.indexOf('{', i);
  for (let k = j; k < s.length; k++) { if (s[k] === '{') d++; else if (s[k] === '}' && !--d) return s.slice(i, k + 1); } };
const line = (s, start) => { const i = s.indexOf(start); return s.slice(i, s.indexOf('\n', i)); };
async function load(file) {
  const s = readFileSync(file, 'utf8');
  const { Noise2D } = await import(pathToFileURL(resolve(dirname(file), 'noise.js')).href + '?f=' + encodeURIComponent(file));
  const src = [line(s, 'const clamp ='), line(s, 'const lerp ='), line(s, 'const smooth ='), line(s, 'const R = 30'), line(s, 'const NZ ='), line(s, 'const nz ='), line(s, 'const fbm ='),
    line(s, 'const ISLETS ='), grab(s, 'export function islandH').replace('export ', ''), line(s, 'export const REEF').replace('export ', ''), grab(s, 'export function reefH').replace('export ', ''),
    'return islandH;'].join('\n');
  return new Function('Noise2D', src)(Noise2D);
}
const [fa, fb] = process.argv.slice(2), A = await load(fa), B = await load(fb);
let n = 0, diff = 0, first = null;
const cmp = (x, z) => { const a = A(x, z), b = B(x, z); n++; if (!Object.is(a, b)) { diff++; first ??= [x, z, a, b]; } };
for (let x = -150; x <= 150; x += .25) for (let z = -150; z <= 150; z += .25) cmp(x, z);
let s = 12345; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 1e6; i++) cmp((rnd() - .5) * 320, (rnd() - .5) * 320);
console.log(`точек ${n}: различий ${diff}${first ? ' — первое ' + JSON.stringify(first) : ''}`);
// скорость на точках, где ходят звери: вода у острова и островков (радиус 30–110 м)
const pts = []; for (let i = 0; i < 400000; i++) { const a = rnd() * 6.2832, r = 30 + rnd() * 80; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
const time = f => { let acc = 0; const t0 = performance.now(); for (const [x, z] of pts) acc += f(x, z); return [performance.now() - t0, acc]; };
time(A); time(B);
const [ta] = time(A), [tb] = time(B);
console.log(`400 тыс. точек у острова (30–110 м): эталон ${ta.toFixed(0)} мс, ветка ${tb.toFixed(0)} мс — быстрее в ${(ta / tb).toFixed(1)} раза`);
process.exit(diff ? 1 : 0);
