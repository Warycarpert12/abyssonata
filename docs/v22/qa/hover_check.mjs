// QA v22: подпись при наведении на зверя («Чайка №4») — стабильна. Курсор ведёт за зверем (как рука человека: с
// небольшим отставанием и дрожью) 12 с; каждые 50 мс — видна ли подпись. Итог: доля времени с подписью и сколько раз
// она пропадала. Для нескольких видов.
//   node qa/hover_check.mjs <адрес страницы с ?qa>
import { chromium } from 'playwright';
const url = process.argv[2];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.goto(url + '&noaudio=1&lowres=1&spawn=seagull,dolphin,sea_turtle,whale,fish_school,pelican', { waitUntil: 'load' });
await page.waitForFunction(() => window.__om?.visual?.assets, null, { timeout: 90000 });
await page.waitForTimeout(3000);
let all = [];
for (const sp of ['seagull', 'dolphin', 'sea_turtle', 'whale', 'fish_school', 'pelican']) {
  // камера — на зверя (как «показать обитателя»), потом отпускаем: зверь в кадре, но движется
  await page.evaluate(sp => { const v = window.__om.visual; v.focusSpecies(sp); }, sp);
  await page.waitForTimeout(6000);
  await page.evaluate(() => { const v = window.__om.visual; v._follow = null; v._idle = 0; });
  let shown = 0, n = 0, drops = 0, prev = null;
  for (let i = 0; i < 240; i++) {
    const p = await page.evaluate(sp => {
      const v = window.__om.visual, o = [...v.agents.values()].find(q => q.sp === sp && !q.gone); if (!o) return null;
      v._idle = 0;   // человек ведёт мышью — камера не уходит в облёт
      const q = (o.fish?.length ? o.fish[0].obj.position : o.obj.position).clone().project(v.camera), r = v.canvas.getBoundingClientRect();
      return { x: r.left + (q.x * .5 + .5) * r.width, y: r.top + (-q.y * .5 + .5) * r.height, show: v.tipEl.classList.contains('show') };
    }, sp);
    if (!p) break;
    if (i % 3 === 0) await page.mouse.move(p.x + Math.sin(i) * 6, p.y + Math.cos(i * 1.3) * 6);   // рука догоняет зверя раз в ~150 мс
    if (i > 4) { n++; if (p.show) shown++; if (prev === true && !p.show) drops++; prev = p.show; }
    await page.waitForTimeout(50);
  }
  console.log(`${sp.padEnd(12)} подпись видна ${n ? (shown / n * 100).toFixed(0) : '—'}% времени, пропадала ${drops} раз`);
  all.push([sp, n ? shown / n : 0, drops]);
}
await browser.close();
