// Тот же ли мир в странице на main и на ветке (?rseed, игровой цикл страницы выключен, 5 минут мира шагом 1/60) —
// картинка не должна сдвигать случайные числа мира. Адреса — в списке ниже (статические серверы над web/).
import { launch } from './cdp.mjs';
for (const [name, url] of [['main', 'http://localhost:8771/'], ['ветка', 'http://localhost:8772/']]) {
  const s = await launch();
  await s.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 360, deviceScaleFactor: 1, mobile: false });
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.requestAnimationFrame = () => 0' });
  await s.goto(`${url}?noaudio=1&lowres=1&qa&seed=7&rseed=7&tod=.5`);
  await s.until('window.__om?.visual?.assets', 180000);
  const r = await s.eval(`(() => { const { world } = window.__om; window.requestAnimationFrame = () => 0; let h = 2166136261, n = 0;
    world.onEvent(e => { n++; for (const ch of e.type) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; });
    for (let i = 0; i < 18000; i++) world.step(1 / 60);
    const pop = {}; for (const a of world.sim.agentsSnapshot()) pop[a.species] = (pop[a.species] || 0) + 1;
    return { events: n, hash: h.toString(16), pop: JSON.stringify(pop) }; })()`);
  console.log(name, JSON.stringify(r)); s.close();
}
process.exit(0);
