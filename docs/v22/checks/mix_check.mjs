// Нормализация и разбор записей (audio.js) — новые (по частям, async) дают побитово тот же результат, что в main.
//   node docs/v22/checks/mix_check.mjs <audio.js эталона> <audio.js ветки>
import { readFileSync } from 'node:fs';
const grab = (file, name) => { const s = readFileSync(file, 'utf8'), i = s.search(new RegExp(`(async )?function ${name}\\(`)); let d = 0, j = s.indexOf('{', i);
  for (let k = j; k < s.length; k++) { if (s[k] === '{') d++; else if (s[k] === '}' && !--d) return s.slice(i, k + 1); } };
const load = file => { const head = /const CHUNK[^\n]*/.exec(readFileSync(file, 'utf8'))?.[0] || '';
  return new Function(`${head}\n${grab(file, 'normalize')}\n${grab(file, 'analyse')}\nreturn { normalize, analyse };`)(); };
const [a, b] = process.argv.slice(2).map(load);
let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const mk = (n, ch) => { const d = Array.from({ length: ch }, () => new Float32Array(n)); for (const x of d) for (let i = 0; i < n; i++) x[i] = (rnd() * 2 - 1) * (i % 9000 < 3000 ? .05 : .7) * Math.sin(i / 300);
  return { numberOfChannels: ch, sampleRate: 44100, length: n, getChannelData: c => d[c], d }; };
let same = 0, all = 0;
for (const [n, ch, step] of [[1_200_000, 2], [3_438_000, 1], [30_000, 2], [777_777, 1], [1_200_000, 2, Infinity], [3_438_000, 1, Infinity]]) {   // step Infinity — стартовые записи «сразу целиком»
  seed = 1 + all; const X = mk(n, ch); seed = 1 + all; const Y = mk(n, ch);   // одинаковые данные
  await a.normalize(X, .8); await b.normalize(Y, .8, step);
  const ra = await a.analyse(X), rb = await b.analyse(Y, step);
  const eq = X.d.every((c, k) => Buffer.compare(Buffer.from(c.buffer), Buffer.from(Y.d[k].buffer)) === 0) && ra.rms === rb.rms && JSON.stringify(ra.on) === JSON.stringify(rb.on);
  console.log(`запись ${n} отсчётов × ${ch}${step ? ' (сразу целиком)' : ''}: нормализация и разбор ${eq ? 'совпадают побитово' : 'РАЗОШЛИСЬ'} (rms ${ra.rms.toFixed(6)}, вступлений ${ra.on.length})`);
  same += eq; all++;
}
console.log(`итог: ${same}/${all}`); process.exit(same === all ? 0 : 1);
