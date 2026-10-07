// Рыбы не заходят в остров. Страница (?qa&noaudio=1&lowres), мир и движение зверей считаются без отрисовки
// (как &pre=N), каждую секунду проверяется каждая рыбка: рифовые стайки, стайки у острова, дальние рыбы у поверхности
// и косяк-агент (fish_school). «В острове» — ниже рельефа под ней (+5 см) или над водой там, где под ней суша.
//   node docs/v22/checks/fish_check.mjs <адрес страницы с ?qa> [секунд мира=900] [загрузок=3]
import { chromium } from 'playwright';
const [url, secs = '900', loads = '3'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const tot = {};
for (let L = 0; L < +loads; L++) {
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  await page.goto(url + (url.includes('?') ? '&' : '?') + 'noaudio=1&lowres=1&spawn=fish_school&seed=' + (L + 1), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__om?.visual?.assets && window.__om.visual.reefShoals, null, { timeout: 90000 });
  const r = await page.evaluate(async secs => {
    const { islandH } = await import('./visual.js');
    const { world, visual: v } = window.__om, M = new (v.camera.matrix.constructor)(), out = {};
    const add = (k, x, y, z, hid = false) => { if (hid) { (out[k] ||= [0, 0, 0])[2] = (out[k][2] || 0) + 1; (out[k])[0]++; return; } const g = islandH(x, z), bad = y < g + .05 || (g > -.05 && y > -.05); (out[k] ||= [0, 0, 0])[0]++; if (bad) out[k][1]++; };
    const inst = (k, list) => { for (const s of list || []) for (let i = 0; i < s.m.count; i++) { s.m.getMatrixAt(i, M); add(k, M.elements[12], M.elements[13], M.elements[14], Math.hypot(M.elements[0], M.elements[1], M.elements[2]) < 1e-6); } };
    let t = 0;
    for (let i = 0; i < secs * 10; i++) {
      t += .1; world.step(.1);
      for (const o of v.agents.values()) v._stepAgent(o, .1);
      v._separate(.1); v._stepAmbient(.1, t);
      for (let k = v.fx.length - 1; k >= 0; k--) if (!v.fx[k](.1)) v.fx.splice(k, 1);
      if (i % 10) continue;
      inst('рифовые стайки', v.reefShoals); inst('стайки у острова', v.shoals); inst('дальние рыбы', v.farShoals);
      for (const o of v.agents.values()) if (o.sp === 'fish_school' && !o.gone) for (const f of o.fish || []) add('косяк (агент)', f.obj.position.x, f.obj.position.y, f.obj.position.z, !f.obj.visible);
    }
    return out;
  }, +secs);
  for (const [k, [n, b, h = 0]] of Object.entries(r)) { tot[k] ||= [0, 0, 0]; tot[k][0] += n; tot[k][1] += b; tot[k][2] += h; }
  await page.close();
}
await browser.close();
let bad = 0;
for (const [k, [n, b, h]] of Object.entries(tot)) { console.log(`${k.padEnd(18)} проверок ${String(n).padStart(8)}, в острове ${String(b).padStart(6)} (${(b / n * 100).toFixed(2)}%), скрыто у мели ${(h / n * 100).toFixed(2)}%`); bad += b; }
console.log(bad ? `ИТОГО в острове: ${bad}` : 'ни одной рыбки в острове');
