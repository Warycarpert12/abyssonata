// Качество картинки. Выбор Авто/Высокое/Низкое и запоминание; «Авто» на медленном телефоне (программный рендер +
// замедление CPU) — до какого разрешения опускается картинка (main: ×0.55 от basePR, без сглаживания).
//   node docs/v22/checks/quality_check.mjs <адрес страницы с ?qa> [секунд автоснижения=60] [папка снимков]
import { chromium, devices } from 'playwright';
const [url, secs = '60', shots] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const st = page => page.evaluate(() => { const v = window.__om.visual; return { pr: +v.renderer.getPixelRatio().toFixed(3), base: v.basePR, msaa: v.rt.samples, active: document.querySelector('#quality .active')?.dataset.q }; });

{ // ПК: выбор и запоминание
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage();
  await page.goto(url + '&noaudio=1', { waitUntil: 'load' }); await page.waitForFunction(() => window.__om?.visual, null, { timeout: 60000 });
  if (await page.$('#quality')) {
    let s = await st(page); ok(s.active === 'auto' && s.pr === s.base, `по умолчанию «Авто», разрешение ×${s.pr} (полное)`);
    await page.click('#quality [data-q=low]'); s = await st(page); ok(s.active === 'low' && s.pr < s.base && s.msaa === 0, `«Низкое»: ×${s.pr}, без сглаживания`);
    await page.reload(); await page.waitForFunction(() => window.__om?.visual, null, { timeout: 60000 }); s = await st(page);
    ok(s.active === 'low' && s.pr < s.base, `после перезагрузки выбор запомнен (${s.active}, ×${s.pr})`);
    await page.click('#quality [data-q=high]'); s = await st(page); ok(s.active === 'high' && s.pr === s.base, `«Высокое»: ×${s.pr}`);
    if (shots) { await page.mouse.move(5, 700); await page.waitForTimeout(300); await page.locator('#vol').screenshot({ path: shots + '/settings_pc.png' }); }
  } else console.log('(переключателя качества нет — main)');
  await ctx.close();
}
{ // медленный телефон, «Авто»
  const ctx = await browser.newContext({ ...devices['Pixel 7 landscape'] }), page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(url, { waitUntil: 'load' }); await page.waitForFunction(() => window.__omReady, null, { timeout: 90000 });
  await page.tap('#gate-btn'); await page.waitForTimeout(+secs * 1000);
  const s = await page.evaluate(() => { const v = window.__om.visual; return { pr: +v.renderer.getPixelRatio().toFixed(3), base: v.basePR, weak: window.__om.audio.weak, dpr: devicePixelRatio }; });
  console.log(`медленный телефон, Авто через ${secs} с: разрешение ×${s.pr} (полное ×${s.base}), точек на пиксель экрана ${s.pr.toFixed(2)}, облегчённый звук: ${s.weak}`);
  ok(s.pr >= 1 - 1e-6, 'автоснижение не ниже одной точки на пиксель экрана');
  if (shots) { await page.evaluate(() => document.getElementById('vol').classList.remove('min')); await page.locator('#vol').screenshot({ path: shots + '/settings_phone.png' }); }
  await ctx.close();
}
await browser.close();
console.log(fails ? `ПРОВАЛОВ: ${fails}` : 'всё прошло');
process.exit(fails ? 1 : 0);
