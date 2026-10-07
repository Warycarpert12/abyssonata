// Баг А: раскладка ветки = раскладка main на 16 экранах (без бага окна): места панелей, ряда кнопок и размер картинки/камеры.
// Плюс телефон: выход из полного экрана и поворот — высота страницы идёт за окном.
//   node docs/v23/checks/layout_cmp.mjs <адрес main> <адрес ветки>   (оба — статический сервер над web/)
import { launch, phone, sleep } from './cdp.mjs';
const [refUrl, newUrl] = process.argv.slice(2);
const Q = '?noaudio=1&seed=7&rseed=7&lowres=1&qa';
const SCREENS = [['iPhone 13', 750, 342, 3, 1], ['iPhone SE', 568, 320, 2, 1], ['Pixel 7', 863, 360, 2.625, 1], ['Galaxy S8', 740, 360, 3, 1], ['iPad Mini', 1024, 768, 2, 1],
  ['Android 807×376', 807, 376, 3.35, 1], ...[[1280, 720], [760, 520], [1920, 1080], [800, 600], [900, 700], [960, 1080], [1000, 650], [1024, 768], [1024, 600], [1100, 650], [1366, 768]].map(([w, h]) => [`ПК ${w}×${h}`, w, h, 1, 0])];
const grab = s => s.eval(`(() => { const o = {}; for (const id of ['hud','census','vol','log','tod','gl']) { const b = document.getElementById(id).getBoundingClientRect(); o[id] = (id === 'census' || id === 'log' ? [b.left, b.bottom, b.width] : [b.left, b.top, b.width, b.height]).map(Math.round).join(','); }
  o.aspect = window.__om.visual.camera.aspect.toFixed(4); o.min = [...document.querySelectorAll('.panel.min')].map(p => p.id).join(' '); return o; })()`);
let fails = 0;
const s = await launch();
for (const [name, w, h, dpr, touch] of SCREENS) {
  const res = [];
  for (const u of [refUrl, newUrl]) {
    if (touch) await phone(s, { w, h, dpr });
    else { await s.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await s.send('Emulation.setTouchEmulationEnabled', { enabled: false }); }
    await s.goto(u + Q);
    await s.until('window.__om?.visual?.assets && !document.body.classList.contains("gate-open")', 120000);
    await sleep(1200);
    res.push(await grab(s));
  }
  const diff = Object.keys(res[0]).filter(k => res[0][k] !== res[1][k]);
  console.log(`${diff.length ? 'FAIL' : 'OK  '} ${name}: ${diff.length ? diff.map(k => `${k} ${res[0][k]} → ${res[1][k]}`).join('; ') : 'как в main'}`);
  if (diff.length) fails++;
}
// телефон: вход в полный экран и выход, поворот туда-обратно — картинка и низ страницы по окну
await phone(s, { w: 807, h: 282, dpr: 3.35, sw: 849, sh: 376 });
await s.goto(newUrl + Q); await s.until('window.__om?.visual?.assets && !document.body.classList.contains("gate-open")', 120000);
const st = () => s.eval(`({ ih: innerHeight, gl: document.getElementById('gl').getBoundingClientRect().height, tod: document.getElementById('tod').getBoundingClientRect().bottom, aspect: +window.__om.visual.camera.aspect.toFixed(3), fs: !!document.fullscreenElement })`);
const check = async (m, H) => { await sleep(1500); const v = await st(); const good = Math.abs(v.gl - H) < 1 && v.tod <= H && Math.abs(v.aspect - 807 / H) < .01;
  console.log(`${good ? 'OK  ' : 'FAIL'} ${m}: ${JSON.stringify(v)}`); if (!good) fails++; };
await check('телефон, без полного экрана', 282);
await s.eval('document.documentElement.requestFullscreen()'); await phone(s, { w: 807, h: 376, dpr: 3.35, sw: 849, sh: 376 }); await check('полный экран', 376);
await s.eval('document.exitFullscreen()'); await phone(s, { w: 807, h: 282, dpr: 3.35, sw: 849, sh: 376 }); await check('вышли из полного экрана', 282);
await phone(s, { w: 376, h: 807, dpr: 3.35, sw: 376, sh: 849 }); await sleep(800); await phone(s, { w: 807, h: 282, dpr: 3.35, sw: 849, sh: 376 }); await check('повернули туда-обратно', 282);
s.close();
console.log(fails ? `ПРОВАЛОВ: ${fails}` : 'всё прошло');
process.exit(fails ? 1 : 0);
