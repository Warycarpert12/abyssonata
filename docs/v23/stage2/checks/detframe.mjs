// Кадр за кадром на одном и том же мире и с одинаковым шагом (1/60): world.step + visual.frame с отрисовкой на
// видеокарте ПК (ANGLE D3D11), CPU ×4. Без случайностей живого прогона — одинаковые кадры main и ветки сравнимы напрямую.
//   node docs/v23/stage2/checks/detframe.mjs <адрес собранного сайта> <имя> [секунд=150] [качество: auto|high|low]
import { launch, sleep } from './cdp.mjs';
const [url, name, secs = '150', q] = process.argv.slice(2);
const s = await launch({ gpu: true });
await s.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
await s.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.requestAnimationFrame = () => 0' });
if (q) await s.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('abyssonata.quality', '${q}') } catch {}` });
await s.goto(`${url}?noaudio=1&qa&seed=7&rseed=7&tod=.5`);
await s.until('window.__abyssonata?.visual?.assets && !document.body.classList.contains("gate-open")', 180000);
await sleep(2000);
await s.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const r = await s.eval(`(async () => { const { world, visual: v } = window.__abyssonata, T = []; let wt = 0;
  for (let i = 0; i < ${+secs * 60}; i++) { await new Promise(r => setTimeout(r, 0)); const t0 = performance.now(); world.step(1 / 60); v.frame(1 / 60, wt += 1 / 60, 1 / 60); T.push(performance.now() - t0); }
  const s = T.slice().sort((a, b) => a - b), q = p => s[Math.floor(p * (s.length - 1))];
  const top = T.map((d, i) => [i, d]).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([i, d]) => (i / 60).toFixed(1) + 'с:' + d.toFixed(0));
  return { med: +q(.5).toFixed(1), p99: +q(.99).toFixed(1), max: +s[s.length - 1].toFixed(0), over50: T.filter(d => d > 50).length, top }; })()`);
console.log(name.padEnd(5), JSON.stringify(r));
s.close(); process.exit(0);
