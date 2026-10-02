// QA v22: подпись при наведении на зверя («Чайка №4») — стабильна. Курсор ведёт за зверем (как рука человека: с
// небольшим отставанием и дрожью) 12 с; каждые 50 мс — видна ли подпись. Итог: доля времени с подписью и сколько раз
// она пропадала. Для нескольких видов. Время, когда зверь вылетел из кадра (камера отпущена, мир случайный) или
// оказался под панелью/кнопками (курсор тогда над ними, подписи и не должно быть), не считается — доля выводится отдельно.
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
  let shown = 0, n = 0, drops = 0, prev = null, off = 0;
  for (let i = 0; i < 240; i++) {
    const p = await page.evaluate(sp => {
      const v = window.__om.visual, o = [...v.agents.values()].find(q => q.sp === sp && !q.gone); if (!o) return null;
      v._idle = 0;   // человек ведёт мышью — камера не уходит в облёт
      const q = (o.fish?.length ? o.fish[0].obj.position : o.obj.position).clone().project(v.camera), r = v.canvas.getBoundingClientRect();
      return { x: r.left + (q.x * .5 + .5) * r.width, y: r.top + (-q.y * .5 + .5) * r.height, show: v.tipEl.classList.contains('show'),
        off: q.x < -.98 || q.x > .98 || q.y < -.98 || q.y > .98 || q.z > 1,
        under: (() => { const x = r.left + (q.x * .5 + .5) * r.width, y = r.top + (-q.y * .5 + .5) * r.height, e = document.elementFromPoint(x, y); return !!e && e !== v.canvas; })() };
    }, sp);
    if (!p) break;
    if (i % 3 === 0) await page.mouse.move(p.x + Math.sin(i) * 6, p.y + Math.cos(i * 1.3) * 6);   // рука догоняет зверя раз в ~150 мс
    if (i > 4 && (p.off || p.under)) { off++; prev = null; }   // вне кадра или под панелью — подписи и не должно быть
    else if (i > 4) { n++; if (p.show) shown++; if (prev === true && !p.show) drops++; prev = p.show; }
    await page.waitForTimeout(50);
  }
  console.log(`${sp.padEnd(12)} подпись видна ${n ? (shown / n * 100).toFixed(0) : '—'}% времени в кадре, пропадала ${drops} раз` + (off ? ` (вне кадра или под панелью ${(off / (off + n) * 100).toFixed(0)}% времени — не считается)` : ''));
  all.push([sp, n ? shown / n : 0, drops]);
}
await browser.close();
