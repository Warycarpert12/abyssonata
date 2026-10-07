// Пальмы после переключения на «Лёгкое» на ходу (switch), с самого входа (start) и на «Высоком» (high)
//   node docs/v24/checks/lite_switch.mjs <адрес> switch|start|high <снимок.png>
import { launch, sleep } from './cdp.mjs';
const [url, mode, out] = process.argv.slice(2);
const s = await launch({ gpu: true });
await s.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 560, deviceScaleFactor: 1, mobile: false });
await s.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('abyssonata.quality', '${mode === 'start' ? 'lite' : 'high'}'); localStorage.setItem('abyssonata.quality.user', '1') } catch {}` });
await s.goto(`${url}?qa&noaudio=1&seed=7&rseed=7&tod=.45`); await s.until('window.__om?.visual?.assets', 90000); await sleep(3000);
if (mode === 'switch') { await s.eval(`document.querySelector('#quality button[data-q="lite"]').click()`); await sleep(1500); }
await s.eval(`(() => { const v = window.__om.visual; v._freeCam = true; v.camera.position.set(26, 16, 40); v.controls.target.set(0, 5, 0); v.controls.update();
  for (const id of ['hud', 'census', 'vol', 'log', 'tod', 'credits', 'bst-btn']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; } })()`);
await sleep(3000); await s.shot(out);
console.log(mode, await s.eval(`(() => { const v = window.__om.visual, r = []; for (const m of v.palms) for (const mt of [m.material].flat()) { const t = mt.map; r.push(t ? (t.image?.constructor?.name + ' ' + t.image?.width + 'x' + t.image?.height + ' v' + t.version) : 'нет map'); } return r.join(' | '); })()`));
s.close(); process.exit(0);
