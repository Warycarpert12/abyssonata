// QA v22: сочетания функций — пауза + время суток, пауза + слежение + клик по журналу, пауза + смена качества,
// «заморозка» вкладки (браузер усыпляет фоновую вкладку: CDP Page.setWebLifecycleState frozen) на паузе и без неё,
// частые нажатия пробела. Итог — состояния согласованы, ошибок в консоли нет.
//   node qa/combo_check.mjs <адрес страницы с ?qa>
import { chromium } from 'playwright';
const url = process.argv[2];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage(), errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fails++; };
await page.goto(url + '&spawn=dolphin,seagull,whale&tod=.5', { waitUntil: 'load' });
await page.waitForFunction(() => window.__omReady && window.__om?.visual?.assets, null, { timeout: 90000 });
await page.click('#gate-btn');
await page.waitForFunction(() => window.__om.audio.ready && !document.body.classList.contains('gate-open'), null, { timeout: 90000 });
await page.waitForTimeout(2500);
const cdp = await ctx.newCDPSession(page);
const S = () => page.evaluate(() => { const o = window.__om, v = o.visual; return { t: +o.world.sim.state.t.toFixed(3), tod: +o.world.sim.state.time_of_day.toFixed(3),
  day: +v.cur.daylight.toFixed(3), time: document.getElementById('v-time').textContent, paused: document.getElementById('pause').classList.contains('on'),
  snd: o.audio.ctx.state, follow: v._follow?.id ?? null, fly: !!v._fly, tg: v.controls.target.toArray().map(x => +x.toFixed(2)), pr: +v.renderer.getPixelRatio().toFixed(3) }; });
const pause = async want => { if ((await S()).paused !== want) { await page.click('#pause'); await page.waitForTimeout(300); } };
await page.mouse.move(640, 200);

// 1. пауза + время суток
await pause(true);
let a = await S(); await page.click('#tod button[data-tod=".02"]'); await page.waitForTimeout(800);
let b = await S(); await page.waitForTimeout(1500); let c = await S();
ok(b.paused && b.snd === 'suspended', 'пауза держится после нажатия «Ночь»');
ok(a.day > .8 && b.day < .2, `на паузе «Ночь» видна сразу: свет ${a.day} → ${b.day}`);
ok(a.time !== b.time && /^0[0-1]:/.test(b.time), `часы на панели сразу ночные: ${a.time} → ${b.time}`);
ok(b.t === c.t, `мир при этом стоит (время мира ${b.t} → ${c.t})`);
ok((await page.$$eval('#tod button.active', bs => bs.map(x => x.textContent))).join() === 'Ночь', 'выделена «Ночь»');

// 2. пауза + слежение + клик по журналу (запись об ушедшем звере — перелёт к месту)
await page.evaluate(() => window.__om.visual.focusSpecies('dolphin'));
await page.waitForTimeout(2500);
b = await S(); ok(b.follow !== null && b.paused, `на паузе «показать обитателя» — камера следит (№${b.follow})`);
await page.evaluate(() => { const v = window.__om.visual; v._logQ.length = 0; v._addLog({ type: 'qa_combo', agent: 999999, time: '00:31', text: 'проверка сочетаний', panorama: .85, distance: .3 }); });
// на паузе очередь журнала стоит — запись появится после «Дальше»; кладём её сразу, как сделала бы очередь
await page.evaluate(() => { const v = window.__om.visual, rec = v._logQ.shift(), li = document.createElement('li'); v._fillLog(li, rec); v.logList.prepend(li); });
await page.locator('#log li', { hasText: 'проверка сочетаний' }).click(); await page.mouse.move(640, 200);
await page.waitForTimeout(300);
b = await S(); ok(b.follow === null && b.fly, 'клик по записи на паузе: слежение снято, камера летит к месту');
await page.waitForFunction(() => !window.__om.visual._fly, null, { timeout: 60000 });
c = await S(); ok(c.paused && c.t === b.t, 'перелёт закончился, пауза держится, мир стоит');

// 3. пауза + смена качества
await page.click('#quality [data-q=low]'); await page.waitForTimeout(300); const lo = await S();
await page.click('#quality [data-q=auto]'); await page.waitForTimeout(300); const au = await S();
ok(lo.pr < au.pr && au.paused && au.snd === 'suspended', `на паузе качество меняется (×${lo.pr} → ×${au.pr}), пауза и тишина держатся`);

// 4. вкладку усыпили на паузе
await cdp.send('Page.setWebLifecycleState', { state: 'frozen' }); await new Promise(r => setTimeout(r, 3000));
await cdp.send('Page.setWebLifecycleState', { state: 'active' }); await page.waitForTimeout(1000);
b = await S(); ok(b.paused && b.snd === 'suspended' && b.t === c.t, 'вкладка проснулась — пауза, тишина и мир на месте');
await pause(false); await page.waitForTimeout(1500);
c = await S(); ok(!c.paused && c.snd === 'running' && c.t > b.t, `«Дальше»: звук ${c.snd}, мир идёт (${b.t} → ${c.t})`);

// 5. вкладку усыпили без паузы — мир не «догоняет» рывком, звук идёт
a = await S();
await cdp.send('Page.setWebLifecycleState', { state: 'frozen' }); await new Promise(r => setTimeout(r, 4000));
await cdp.send('Page.setWebLifecycleState', { state: 'active' }); await page.waitForTimeout(1500);
b = await S(); ok(b.snd === 'running' && b.t > a.t && b.t - a.t < 3.5, `после сна вкладки мир продолжил без рывка (+${(b.t - a.t).toFixed(2)} с мира за ~5.5 с), звук ${b.snd}`);

// 6. частые нажатия пробела
for (let i = 0; i < 7; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(60); }
await page.waitForTimeout(800);
b = await S(); ok(b.paused === (b.snd === 'suspended'), `7 нажатий пробела подряд: кнопка «${b.paused ? 'Дальше' : 'Пауза'}», звук ${b.snd} — согласованы`);
if (b.paused) await pause(false);

ok(!errs.length, 'ошибок в консоли нет' + (errs.length ? ': ' + errs.slice(0, 5).join(' | ') : ''));
await browser.close();
console.log(fails ? `ПРОВАЛОВ: ${fails}` : 'всё прошло');
process.exit(fails ? 1 : 0);
