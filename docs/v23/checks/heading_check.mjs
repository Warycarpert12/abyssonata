// «плывёт задом наперёд». Для каждого зверя, птицы и рыбы сравнивает, куда смотрит нос модели (её +z в мире),
// с тем, куда она на самом деле сдвинулась за последние 0.5 с, и считает кадры, где они расходятся больше чем на 90°
// («задом») и на 60–90° («боком»). Считаются только кадры, где зверь заметно движется (быстрее 0.5 м/с), и «задом» —
// только если и за последние 0.1 с он сдвинулся назад (у рыб в тугом шаре за 0.5 с проходит пол-круга — это не «задом»).
// У медузы, морской звезды, осьминога «носа» нет, краб бегает боком — их считаем отдельно, для справки.
// Мир живёт в странице как в игре (world.step + visual.frame, шаг 1/60 с), только без отрисовки — 25 минут мира
// за пару минут. Случайные числа повторяемые (rseed) — прогон «до» и «после» видит один и тот же мир.
// Без Playwright: безголовый Edge по CDP (cdp.mjs рядом).
//   node docs/v23/checks/heading_check.mjs <адрес страницы, напр. http://localhost:8765/> [минут=25]
import { launch } from './cdp.mjs';
const [base, minArg = '25'] = process.argv.slice(2), MIN = +minArg;
// миры: день, ночь, вечер; в двух — сразу морские львы (их мало и не всегда приходят), в одном лев купается всё время
const WORLDS = [
  { seed: 11, tod: .50, extra: '&qa&spawn=sea_lion,sea_lion' }, { seed: 44, tod: .02, extra: '&qa&spawn=sea_lion' },
  { seed: 66, tod: .72, extra: '&qa' }, { seed: 7, tod: .40, extra: '&qa=lionswim' },
];
const MEASURE = `(() => {
  const { world, visual } = window.__abyssonata;
  window.requestAnimationFrame = () => 0;   // игровой цикл страницы останавливается — шагаем сами
  visual.renderer.render = () => {}; visual.renderer.setRenderTarget = () => {};
  const st = window.__hc = { t: 0, sp: {}, ex: {} }, hist = new WeakMap(), fwd = new (visual.camera.position.constructor)();
  const ang = (dx, dz) => Math.acos(Math.max(-1, Math.min(1, (fwd.x * dx + fwd.z * dz) / (Math.hypot(fwd.x, fwd.z) * Math.hypot(dx, dz) || 1)))) * 180 / Math.PI;
  // px, pz — где тело в мире; q — его поворот (нос модели — её +z)
  const look = (key0, px, pz, q, vis, o, sp) => {
    let h = hist.get(key0); if (!h) hist.set(key0, h = []);
    h.push(st.t, px, pz); while (h.length > 3 && st.t - h[0] > .5) h.splice(0, 3);
    if (st.t - h[0] < .45 || !vis) return;
    const dx = px - h[1], dz = pz - h[2], v = Math.hypot(dx, dz) / (st.t - h[0]); if (v < .5) return;
    fwd.set(0, 0, 1).applyQuaternion(q); if (Math.hypot(fwd.x, fwd.z) < .2) return;   // нос вертикально — направление не определено
    let i = h.length - 3; while (i > 0 && st.t - h[i] < .1) i -= 3;   // сдвиг за последние ~0.1 с
    const a = ang(dx, dz), a1 = ang(px - h[i + 1], pz - h[i + 2]);
    const s = st.sp[sp] ??= { n: 0, back: 0, side: 0, by: {} }; s.n++;
    if (a > 90 && a1 > 90) {
      const key = (o.fish ? 'рыба ' : '') + (o.st || '') + (o.sp === 'sea_lion' ? (o.wet ? ' в воде' : ' на суше') : '') + (o.gone ? ' уходит' : '');
      s.back++; s.by[key] = (s.by[key] || 0) + 1;
      const E = st.ex[sp] ??= []; if (E.length < 25 && (E.at(-1)?.id !== o.id || st.t - E.at(-1).t > 5)) E.push({ t: +st.t.toFixed(1), id: o.id, key, a: Math.round(a), v: +v.toFixed(2) });
    } else if (a > 60) s.side++;
  };
  const q2 = new (visual.camera.quaternion.constructor)();
  st.run = (sec, dt = 1 / 60) => {
    for (let i = 0, n = Math.round(sec / dt); i < n; i++) {
      world.step(dt); visual.frame(dt, (st.wt = (st.wt || 0) + dt), dt); st.t += dt;
      for (const o of visual.agents.values()) {
        if (o.fish?.length) { for (const f of o.fish) look(f.obj, f.obj.position.x, f.obj.position.z, f.obj.quaternion, f.obj.visible, o, o.sp); continue; }
        if (o.shrimp?.length) {   // рой: каждая креветка внутри группы (группа не поворачивается)
          for (const sh of o.shrimp) look(sh.m, o.obj.position.x + sh.m.position.x, o.obj.position.z + sh.m.position.z, q2.copy(o.obj.quaternion).multiply(sh.m.quaternion), o.obj.visible, o, o.sp);
          continue;
        }
        if (o.obj && o.sp !== 'ship') look(o.obj, o.obj.position.x, o.obj.position.z, o.obj.quaternion, o.obj.visible, o, o.sp);
      }
    }
    return st.t;
  };
  return true;
})()`;
let loading = Promise.resolve();   // страницы грузим по одной (простой сервер не выдерживает 4 браузера разом), считаем — параллельно
const runWorld = async w => {
  const s = await launch();
  try {
    const load = async () => {
      await s.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 360, deviceScaleFactor: 1, mobile: false });
      await s.goto(`${base}?noaudio=1&lowres=1&seed=${w.seed}&rseed=${w.seed}&tod=${w.tod}${w.extra}`);
      await s.until('window.__abyssonata?.visual?.assets && !document.body.classList.contains("gate-open")', 180000);
      await s.eval(MEASURE);
    };
    await (loading = loading.then(load, load));
    for (let m = 0; m < MIN; m++) await s.eval('window.__hc.run(60)');
    return { ...w, res: await s.eval('({ sp: window.__hc.sp, ex: window.__hc.ex })') };
  } finally { s.close(); }
};
const all = await Promise.all(WORLDS.map(runWorld));
const tot = {};
for (const w of all) for (const [sp, s] of Object.entries(w.res.sp)) {
  const T = tot[sp] ??= { n: 0, back: 0, side: 0, by: {} }; T.n += s.n; T.back += s.back; T.side += s.side;
  for (const [k, v] of Object.entries(s.by)) T.by[k] = (T.by[k] || 0) + v;
}
console.log(`нос против движения: ${WORLDS.length} мира × ${MIN} мин (кадры, где зверь движется быстрее 0.5 м/с; шаг 1/60 с)`);
const NOSELESS = new Set(['jellyfish', 'starfish', 'octopus', 'crab']);
console.log('вид'.padEnd(14), 'кадров'.padStart(9), 'задом >90°'.padStart(14), 'боком 60–90°'.padStart(16), '  где «задом»');
for (const [sp, T] of Object.entries(tot).sort((a, b) => NOSELESS.has(a[0]) - NOSELESS.has(b[0]) || b[1].back / b[1].n - a[1].back / a[1].n)) {
  if (NOSELESS.has(sp) && !tot.__said) { tot.__said = 1; console.log('— без «носа» по замыслу (медуза, звезда, осьминог) и краб, который бегает боком, — для справки:'); }
  const pc = x => (x / T.n * 100).toFixed(2) + '%';
  console.log(sp.padEnd(14), String(T.n).padStart(9), `${T.back} (${pc(T.back)})`.padStart(14), `${T.side} (${pc(T.side)})`.padStart(16), '  ' +
    Object.entries(T.by).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k || '—'}: ${v}`).join(', '));
}
// EX=1 SP=sea_lion — примеры кадров «задом» (мир, время, особь, состояние, угол, скорость)
if (process.env.EX) for (const w of all) for (const [sp, E] of Object.entries(w.res.ex)) if (!process.env.SP || sp === process.env.SP) for (const e of E) console.log(JSON.stringify({ seed: w.seed, sp, ...e }));
process.exit(0);
