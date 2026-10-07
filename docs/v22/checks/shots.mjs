// Снимки «было / стало» — экран входа (ПК и телефон), «Состояние» с подсказкой, «Обитатели» на телефоне
// (пролистанный список). Мир одинаковый (&rseed, &seed), время — день.
//   node docs/v22/checks/shots.mjs <адрес страницы с ?qa> <папка> <префикс>
import { chromium, devices } from 'playwright';
const [url, dir, pre] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const open = async (opt, extra = '') => {
  const ctx = await browser.newContext(opt), page = await ctx.newPage();
  await page.goto(url + '&lowres=1&rseed=7&seed=7' + extra, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__omReady && window.__om?.visual?.assets, null, { timeout: 90000 });
  await page.waitForTimeout(4000);
  return { ctx, page };
};
{ const { ctx, page } = await open({ viewport: { width: 1280, height: 720 } });
  await page.mouse.move(5, 5); await page.screenshot({ path: `${dir}/${pre}_gate_pc.png` }); await ctx.close(); }
{ const { ctx, page } = await open(devices['Pixel 7 landscape']);
  await page.screenshot({ path: `${dir}/${pre}_gate_phone.png` }); await ctx.close(); }
{ const { ctx, page } = await open({ viewport: { width: 1280, height: 720 } }, '&noaudio=1');
  await page.waitForTimeout(1500);
  const k = page.locator('#hud .k', { hasText: 'Напряжение' }); await k.hover(); await page.waitForTimeout(400);
  await page.screenshot({ path: `${dir}/${pre}_hud_pc.png`, clip: { x: 0, y: 0, width: 700, height: 360 } }); await ctx.close(); }
{ const { ctx, page } = await open(devices['Pixel 7 landscape'], '&noaudio=1&spawn=seagull,tern,cormorant,pelican,albatross,dolphin,whale,orca,shark,sea_lion,fish_school,sea_turtle,stingray,jellyfish,octopus,shrimp_swarm,crab,starfish');
  await page.waitForTimeout(1500);
  // свайп пальцем вверх по списку (касания через CDP): на main листание «нажимало» строку — камера улетала к зверю
  const cdp = await page.context().newCDPSession(page);
  const b = await page.evaluate(() => { const r = document.getElementById('census').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * .7, h: r.height }; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x, y: b.y }] });
  for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x, y: b.y - b.h * .5 * i / 8 }] }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${dir}/${pre}_census_phone.png` }); await ctx.close(); }
await browser.close();
console.log('снимки:', dir, pre);
