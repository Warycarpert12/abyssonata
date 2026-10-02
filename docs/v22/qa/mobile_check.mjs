// QA v22: телефон (эмуляция Android в Chromium, касания через CDP) и iPhone-раскладка: листание «Обитателей» и журнала
// пальцем не нажимает строку, короткий тап — нажимает; пауза; клик по записи журнала; кнопка «Линза» (на телефоне её нет).
//   node qa/mobile_check.mjs <адрес страницы с ?qa> [устройство='Pixel 7 landscape']
import { chromium, devices } from 'playwright';
const [url, dev = 'Pixel 7 landscape'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ ...devices[dev] });
const page = await ctx.newPage(), errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const SPAWN = 'seagull,tern,cormorant,pelican,albatross,dolphin,whale,orca,shark,sea_lion,fish_school,sea_turtle,stingray,jellyfish,octopus,shrimp_swarm,crab,starfish,ship';
await page.goto(url + '&noaudio=1&lowres=1&spawn=' + SPAWN, { waitUntil: 'load' });
await page.waitForFunction(() => window.__om?.visual?.assets, null, { timeout: 90000 });
await page.waitForTimeout(2500);
const cdp = await ctx.newCDPSession(page);
// палец: касание в (x, y), ведём на dy пикселей шагами, отпускаем
async function swipe(x, y, dy, steps = 8) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + dy * i / steps }] }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(400);
}
const box = sel => page.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, h: r.height }; }, sel);

// раскрыть свёрнутые на телефоне панели
await page.evaluate(() => { for (const id of ['hud', 'log', 'census']) document.getElementById(id).classList.remove('min'); });
// журнал: 30 записей
await page.evaluate(() => { const v = window.__om.visual; for (let i = 0; i < 30; i++) v._addLog({ type: 'seagull', time: '12:' + String(i).padStart(2, '0'), text: 'чайка №' + i + ' сделала круг над водой' }); });
await page.waitForTimeout(500);

{ // «Обитатели»: листание — не нажатие
  const c = await box('#census'), over = await page.evaluate(() => { const e = document.getElementById('census'); return e.scrollHeight - e.clientHeight; });
  ok(over > 10, `список обитателей длиннее панели на ${over} px (есть что листать)`);
  await swipe(c.x, c.y + c.h * .25, -c.h * .45);
  const r = await page.evaluate(() => ({ st: document.getElementById('census').scrollTop, f: window.__om.visual._follow }));
  ok(r.st > 10, `«Обитатели» пролистались пальцем (scrollTop ${r.st})`);
  ok(!r.f, 'листание не выбрало зверя');
  // короткий тап — выбирает
  const row = await page.evaluate(() => { const e = [...document.querySelectorAll('#census .cs')].find(r => { const b = r.getBoundingClientRect(), p = document.getElementById('census').getBoundingClientRect(); return b.top > p.top + 20 && b.bottom < p.bottom - 4; }); const b = e.getBoundingClientRect(); return { x: b.left + 30, y: b.top + b.height / 2, sp: e.dataset.sp }; });
  await page.touchscreen.tap(row.x, row.y); await page.waitForTimeout(400);
  const f = await page.evaluate(() => window.__om.visual._follow?.sp);
  ok(f === row.sp, `короткий тап по строке «${row.sp}» — камера к зверю (${f})`);
}
{ // журнал листается
  const l = await box('#log ul'), over = await page.evaluate(() => { const e = document.querySelector('#log ul'); return e.scrollHeight - e.clientHeight; });
  ok(over > 10, `журнал длиннее панели на ${over} px`);
  await swipe(l.x, l.y + l.h * .3, -l.h * .5);
  const st = await page.evaluate(() => document.querySelector('#log ul').scrollTop);
  ok(st > 10, `журнал пролистался пальцем (scrollTop ${st})`);
}
if (await page.$('#pause')) { // пауза: касание по кнопке — мир, звери и журнал стоят; камера крутится пальцем
  const snap = () => page.evaluate(() => { const v = window.__om.visual, w = window.__om.world; const o = [...v.agents.values()].find(q => !q.gone && q.sp === 'dolphin') || [...v.agents.values()][0];
    return { t: w.sim.state.t, p: o.obj.position.toArray().map(x => +x.toFixed(3)), log: v.logList.children.length, cam: v.camera.position.toArray().map(x => +x.toFixed(2)) }; });
  await page.evaluate(() => { const v = window.__om.visual; v._follow = null; });
  await page.tap('#pause'); await page.waitForTimeout(300);
  const a = await snap(); await page.waitForTimeout(2500);
  const c = await box('#gl'); await swipe(c.x + 120, c.y, 0); // касание без сдвига — не считается
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y }] });
  for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x + i * 15, y: c.y }] }); await page.waitForTimeout(30); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(800);
  const b = await snap();
  ok(a.t === b.t, `пауза: время мира стоит (${a.t.toFixed(1)} → ${b.t.toFixed(1)})`);
  ok(JSON.stringify(a.p) === JSON.stringify(b.p), 'пауза: зверь замер на месте');
  ok(a.log === b.log, 'пауза: журнал не пополняется');
  ok(JSON.stringify(a.cam) !== JSON.stringify(b.cam), 'пауза: камеру можно повернуть пальцем');
  await page.tap('#pause'); await page.waitForTimeout(1500);
  const d = await snap(); ok(d.t > b.t, `после «Дальше» мир идёт (${b.t.toFixed(1)} → ${d.t.toFixed(1)})`);
}
if (await page.$('#pause')) ok(!(await page.isVisible('#lens-btn')), 'на телефоне кнопки «Линза» нет');
if (await page.$('#hint')) { // подсказка «Состояния» по нажатию
  await page.evaluate(() => { document.getElementById('hud').classList.remove('min'); window.__om.visual.unfollow?.(); });
  const k = await page.$eval('#hud .k[data-tip]:last-of-type', () => 0).catch(() => 0);
  const b = await page.evaluate(() => { const e = [...document.querySelectorAll('#hud .k')].find(x => /Напряжение/.test(x.textContent)).getBoundingClientRect(); return { x: e.left + 10, y: e.top + e.height / 2 }; });
  await page.touchscreen.tap(b.x, b.y); await page.waitForTimeout(300);
  const h = await page.$eval('#hint', e => ({ show: e.classList.contains('show'), txt: e.textContent }));
  ok(h.show && /тревожно/.test(h.txt), 'нажатие на «Напряжение» — подсказка');
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/hint_phone.png' });
  await page.touchscreen.tap(b.x, b.y); await page.waitForTimeout(300);
  ok(!(await page.$eval('#hint', e => e.classList.contains('show'))), 'повторное нажатие — подсказка убрана');
}
{ // кнопки времени суток: на сенсорном экране подсветка не «залипает», выделена одна — текущая часть суток
  const st = () => page.$$eval('#tod button[data-tod]', bs => bs.map(b => { const c = getComputedStyle(b); return { t: b.textContent, act: b.classList.contains('active'), tr: c.transform, col: c.color }; }));
  // эмулятор Chromium «залипший» :hover после тапа не воспроизводит (на main проверка ниже тоже проходит) — главное, что на
  // телефоне правила подсветки наведения не действуют: они только под (hover: hover)
  const hov = await page.evaluate(() => matchMedia('(hover: hover)').matches);
  await page.tap('#tod button[data-tod=".02"]'); await page.waitForTimeout(300);
  await page.tap('#tod button[data-tod=".28"]'); await page.waitForTimeout(600);
  const a = await st(), night = a[0], morning = a[1];
  ok(!hov, 'телефон: (hover: hover) не срабатывает');
  ok(night.tr === 'none' && !night.act && night.col !== 'rgb(255, 255, 255)', `«Ночь» после нажатия не подсвечена (transform ${night.tr}, цвет ${night.col})`);
  ok(morning.act && a.filter(b => b.act).length === 1, 'выделена одна кнопка — «Утро»');
  if (process.env.SHOTS) await page.locator('#tod').screenshot({ path: process.env.SHOTS + '/tod_phone.png' });
  await page.evaluate(() => window.__om.world.setTimeOfDay(.52));
  await page.waitForFunction(() => document.querySelector('#tod button[data-tod=".5"]').classList.contains('active'), null, { timeout: 20000 }).catch(() => {});
  const b = await st(); ok(b[2].act && b.filter(x => x.act).length === 1, 'время в мире стало днём — выделен «День» сам');
}
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
ok(!errs.length, 'ошибок в консоли нет' + (errs.length ? ': ' + errs.join(' | ') : ''));
await browser.close();
console.log(fails ? `ПРОВАЛОВ: ${fails}` : 'всё прошло');
process.exit(fails ? 1 : 0);
