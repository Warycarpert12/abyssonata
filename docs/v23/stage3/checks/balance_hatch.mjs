// Этап 3: баланс мира ветки против main — всё, КРОМЕ нового события (вылупление черепашат: события 'hatching*',
// вид 'hatchling'), должно совпасть до бита: события по типам, численность видов по минутам, отпечаток всей
// последовательности (тип + номер кадра). Те же 8 миров, что в docs/v22/checks/move_check_split.mjs.
// P — вероятность вылупления за ночь на ветке (по умолчанию как в игре; P=1 — каждую ночь: проверка, что даже частое
// событие не сдвигает остальной мир). Новые события печатаются отдельно — сколько их было и когда.
//   node docs/v23/stage3/checks/balance_hatch.mjs <папка web main> <папка web ветки> [минут=40] [P]
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const WORLDS = [
  { seed: 11, tod: .50, dt: 1 / 60 }, { seed: 22, tod: .35, dt: 1 / 60 }, { seed: 33, tod: .60, dt: 1 / 60 },
  { seed: 44, tod: .02, dt: 1 / 60 }, { seed: 55, tod: .90, dt: 1 / 60 }, { seed: 66, tod: .72, dt: 1 / 60 },
  { seed: 77, tod: .50, dt: 1 / 30 }, { seed: 88, tod: .10, dt: .1 },
];
const NEW = t => /^hatching/.test(t);
function seeded(n) {
  let r = (n * 2654435761) >>> 0;
  return () => { r = (r + 0x6D2B79F5) >>> 0; let x = Math.imul(r ^ (r >>> 15), 1 | r); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
const fnv = (h, s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };

async function runWorlds(webDir, minutes, P) {
  const url = pathToFileURL(resolve(webDir, 'sim.js')).href;
  const { OceanSimulation } = await import(url);
  if (P !== undefined) { const { Ecosystem } = await import(pathToFileURL(resolve(webDir, 'agents.js')).href); if (Ecosystem.HATCH_P !== undefined) Ecosystem.HATCH_P = P; }
  const out = [], orig = Math.random;
  for (const w of WORLDS) {
    Math.random = seeded(w.seed);
    const sim = new OceanSimulation({ seed: w.seed });
    sim.setStartTod(w.tod);
    const per = {}, pop = [], hatch = [];
    let h = 2166136261, total = 0;
    for (let i = 0, n = Math.round(minutes * 60 / w.dt); i < n; i++) {
      for (const e of sim.update(w.dt)) {
        if (NEW(e.type)) { hatch.push(`${e.type}@${(i * w.dt / 60).toFixed(1)}мин`); continue; }
        per[e.type] = (per[e.type] || 0) + 1; total++; h = fnv(h, e.type + '@' + i);
      }
      if (i % Math.round(60 / w.dt) === 0) {
        const c = {}; for (const a of sim.agentsSnapshot()) if (a.sp !== 'hatchling') c[a.sp] = (c[a.sp] || 0) + 1;
        pop.push(c); h = fnv(h, JSON.stringify(c));
      }
    }
    out.push({ ...w, total, per, pop, hatch, hash: h.toString(16) });
  }
  Math.random = orig;
  return out;
}

const [a, b, m = '40', p] = process.argv.slice(2), minutes = +m;
const ref = await runWorlds(a, minutes), cur = await runWorlds(b, minutes, p === undefined ? undefined : +p);
let same = 0;
console.log(`баланс без вылупления: ${WORLDS.length} миров × ${minutes} мин, main ${a} против ${b}${p !== undefined ? `, вероятность за ночь ${p}` : ''}`);
for (let i = 0; i < ref.length; i++) {
  const r = ref[i], c = cur[i], ok = r.hash === c.hash && JSON.stringify(r.per) === JSON.stringify(c.per) && JSON.stringify(r.pop) === JSON.stringify(c.pop);
  same += ok;
  console.log(`  мир ${r.seed} (tod ${r.tod.toFixed(2)}): событий ${r.total} / ${c.total}, отпечаток ${r.hash} / ${c.hash} — ${ok ? 'СОВПАДАЕТ' : 'РАЗОШЁЛСЯ'}` +
    (c.hatch.length ? `; вылупление: ${c.hatch.filter(x => x.startsWith('hatching@')).length} раз (${c.hatch.join(', ')})` : ''));
  if (!ok) for (const k of new Set([...Object.keys(r.per), ...Object.keys(c.per)])) if (r.per[k] !== c.per[k]) console.log(`      ${k}: ${r.per[k] || 0} → ${c.per[k] || 0}`);
}
console.log(`итог: ${same}/${ref.length} миров совпадают с main (кроме нового события)`);
process.exit(same === ref.length ? 0 : 1);
