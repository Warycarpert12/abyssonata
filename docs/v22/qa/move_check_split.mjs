// QA v22: баланс мира ветки против эталона (main). Только симуляция (web/sim.js + agents.js), без картинки и звука.
// Повторяемые случайные числа (Math.random заменён генератором от номера мира) — один и тот же мир даёт одну и ту же
// последовательность событий. Сравниваются: события по типам, численность видов по минутам и отпечаток (хеш) всей
// последовательности событий (тип + время с точностью до кадра).
//   node qa/move_check_split.mjs <папка web эталона> <папка web ветки> [минут=40]
//   node qa/move_check_split.mjs web            — только посчитать (без сравнения)
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// 6 миров (3 днём, 2 ночью, 1 вечером) + 2 запасных с другим шагом кадра; шаг 1/60 — как в браузере
const WORLDS = [
  { seed: 11, tod: .50, dt: 1 / 60 }, { seed: 22, tod: .35, dt: 1 / 60 }, { seed: 33, tod: .60, dt: 1 / 60 },
  { seed: 44, tod: .02, dt: 1 / 60 }, { seed: 55, tod: .90, dt: 1 / 60 }, { seed: 66, tod: .72, dt: 1 / 60 },
  { seed: 77, tod: .50, dt: 1 / 30 }, { seed: 88, tod: .10, dt: .1 },
];

function seeded(n) {
  let r = (n * 2654435761) >>> 0;
  return () => { r = (r + 0x6D2B79F5) >>> 0; let x = Math.imul(r ^ (r >>> 15), 1 | r); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
const fnv = (h, s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };

export async function runWorlds(webDir, minutes = 40) {
  const { OceanSimulation } = await import(pathToFileURL(resolve(webDir, 'sim.js')).href + '?d=' + encodeURIComponent(webDir));
  const out = [];
  const orig = Math.random;
  for (const w of WORLDS) {
    Math.random = seeded(w.seed);
    const sim = new OceanSimulation({ seed: w.seed });
    sim.setStartTod(w.tod);
    const per = {}, pop = [];
    let h = 2166136261, n = Math.round(minutes * 60 / w.dt), total = 0;
    for (let i = 0; i < n; i++) {
      for (const e of sim.update(w.dt)) { per[e.type] = (per[e.type] || 0) + 1; total++; h = fnv(h, e.type + '@' + i); }
      if (i % Math.round(60 / w.dt) === 0) {
        const c = {}; for (const a of sim.agentsSnapshot()) c[a.species] = (c[a.species] || 0) + 1;
        pop.push(c); h = fnv(h, JSON.stringify(c));
      }
    }
    out.push({ ...w, total, per, pop, hash: h.toString(16) });
  }
  Math.random = orig;
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [a, b, m] = process.argv.slice(2);
  const minutes = +(b && !isNaN(+b) ? b : m) || 40;
  const ref = await runWorlds(a, minutes);
  if (!b || !isNaN(+b)) { for (const r of ref) console.log(`мир ${r.seed} (tod ${r.tod}, dt ${r.dt.toFixed(3)}): событий ${r.total}, отпечаток ${r.hash}`); process.exit(0); }
  const cur = await runWorlds(b, minutes);
  let same = 0;
  console.log(`баланс: ${WORLDS.length} миров × ${minutes} игровых минут, эталон ${a} против ${b}`);
  for (let i = 0; i < ref.length; i++) {
    const r = ref[i], c = cur[i], ok = r.hash === c.hash && JSON.stringify(r.per) === JSON.stringify(c.per) && JSON.stringify(r.pop) === JSON.stringify(c.pop);
    same += ok;
    console.log(`  мир ${r.seed} (tod ${r.tod.toFixed(2)}): событий ${r.total} / ${c.total}, отпечаток ${r.hash} / ${c.hash} — ${ok ? 'СОВПАДАЕТ' : 'РАЗОШЁЛСЯ'}`);
    if (!ok) for (const k of new Set([...Object.keys(r.per), ...Object.keys(c.per)])) if (r.per[k] !== c.per[k]) console.log(`      ${k}: ${r.per[k] || 0} → ${c.per[k] || 0}`);
  }
  console.log(`итог: ${same}/${ref.length} миров совпадают с эталоном`);
  process.exit(same === ref.length ? 0 : 1);
}
