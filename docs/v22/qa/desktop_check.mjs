// QA v22, ПК (Chromium, мышь и клавиатура): пауза (пробел, кнопка), журнал (скорость, наведение, клик → камера),
// камера у выбранного зверя (вращение и приближение), кнопка «Линза», подсказки «Состояния», кнопки времени суток.
//   node qa/desktop_check.mjs <адрес страницы с ?qa>
import { chromium } from 'playwright';
const url = process.argv[2];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const has = sel => page.$(sel).then(Boolean);
await page.goto(url + '&lowres=1&spawn=dolphin,seagull,whale', { waitUntil: 'load' });
await page.waitForFunction(() => window.__omReady && window.__om?.visual?.assets, null, { timeout: 90000 });
if (await has('#pause')) { await page.keyboard.press('Space'); await page.waitForTimeout(200);
  ok(!(await page.$eval('#pause', e => e.classList.contains('on'))), 'пробел на экране входа — не пауза'); }
await page.click('#gate-btn');
await page.waitForFunction(() => window.__om.audio.ready, null, { timeout: 90000 });
if (await has('#pause')) ok(await page.evaluate(() => window.__om.audio.ctx.state) === 'running', 'после входа звук идёт');
await page.waitForTimeout(3000);
const W = () => page.evaluate(() => ({ t: window.__om.world.sim.state.t, snd: window.__om.audio.ctx.state, cam: window.__om.visual.camera.position.toArray().map(x => +x.toFixed(2)) }));

if (await has('#pause')) { // пауза
  await page.mouse.move(640, 300);
  await page.keyboard.press('Space'); await page.waitForTimeout(400);
  const a = await W(); await page.waitForTimeout(2000);
  await page.mouse.down(); await page.mouse.move(760, 330, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(600);
  const b = await W();
  ok(a.t === b.t, `пробел — пауза: время мира стоит (${a.t.toFixed(2)})`);
  ok(b.snd === 'suspended', `пауза: звук приостановлен (${b.snd})`);
  ok(JSON.stringify(a.cam) !== JSON.stringify(b.cam), 'пауза: камеру можно повернуть мышью');
  ok(await page.$eval('#pause', e => e.classList.contains('on') && /Дальше/.test(e.textContent)), 'кнопка показывает «Дальше»');
  await page.keyboard.press('Space'); await page.waitForTimeout(1200);
  const c = await W(); ok(c.t > b.t && c.snd === 'running', `пробел ещё раз — мир идёт (${b.t.toFixed(1)} → ${c.t.toFixed(1)}), звук ${c.snd}`);
  await page.click('#pause'); await page.waitForTimeout(300);
  ok((await W()).snd === 'suspended', 'кнопка «Пауза» мышью — тоже пауза'); await page.click('#pause');
}
if (await page.evaluate(() => typeof window.__om.visual.focusEvent === 'function')) { // журнал
  const n = () => page.evaluate(() => window.__om.visual.logList.children.length);
  const add = (k, type, agent) => page.evaluate(([k, type, agent]) => { const v = window.__om.visual; for (let i = 0; i < k; i++) v._addLog({ type: type || 'qa' + i, agent, time: '12:00', text: 'проверка ' + (type || i), panorama: .3, distance: .4 }); }, [k, type, agent]);
  await page.mouse.move(640, 200); await page.waitForTimeout(2500);   // очередь от живого мира — разошлась
  let n0 = await n(); await add(20); await page.waitForTimeout(2000);
  let d = await n() - n0; ok(d >= 1 && d <= 4, `20 разных событий разом → за 2 с добавилось ${d} строк (не больше одной за 0.9 с)`);
  const drained = () => page.waitForFunction(() => !window.__om.visual._logQ.length, null, { timeout: 120000 });   // очередь разошлась (без видеокарты время мира идёт медленнее)
  await drained(); n0 = await n();
  await add(5, 'qa_same'); await drained(); await page.waitForTimeout(300);
  const same = await page.evaluate(() => [...window.__om.visual.logList.children].filter(li => /qa_same/.test(li.textContent)).map(li => li.textContent));
  ok(same.length === 1 && /×5/.test(same[0]), `5 одинаковых событий → одна строка «${same[0]}»`);
  // наведение — журнал стоит
  const lb = await page.locator('#log').boundingBox(); await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
  n0 = await n(); await add(3, 'qa_hover'); await page.waitForTimeout(2500);
  ok(await n() === n0, 'мышь над журналом — новые строки ждут');
  await page.mouse.move(640, 200); await page.waitForTimeout(1500);
  ok(await n() > n0, 'мышь ушла — строки появились');
  // клик по записи: зверь жив — камера следит за ним; зверя нет — камера летит к месту
  const id = await page.evaluate(() => [...window.__om.visual.agents.values()].find(o => !o.gone && o.sp === 'dolphin')?.id);
  await add(1, 'qa_dolphin', id); await drained(); await page.waitForTimeout(300);
  await page.locator('#log li', { hasText: 'qa_dolphin' }).click(); await page.waitForTimeout(500);
  const f = await page.evaluate(() => window.__om.visual._follow?.id);
  ok(f === id, `клик по записи о дельфине №${id} → камера следит за ним (${f})`);
  await page.mouse.move(640, 200);
  await page.evaluate(() => { const v = window.__om.visual; v._follow = null; v._addLog({ type: 'qa_gone', agent: 999999, time: '12:01', text: 'проверка ушедшего', panorama: .9, distance: .2 }); });
  await drained(); await page.waitForTimeout(300);
  const tg0 = await page.evaluate(() => window.__om.visual.controls.target.toArray());
  await page.locator('#log li', { hasText: 'проверка ушедшего' }).click(); await page.waitForTimeout(300);
  await page.mouse.move(640, 200); await page.waitForFunction(() => !window.__om.visual._fly, null, { timeout: 60000 });
  const r = await page.evaluate(() => { const v = window.__om.visual, p = v._logRecs.get([...v.logList.children].find(li => /ушедшего/.test(li.textContent))).pos; return { d: v.controls.target.distanceTo(p.clone().setY(v.controls.target.y)), tg: v.controls.target.toArray() }; });
  ok(r.d < 3, `клик по записи без зверя → камера у места события (до него ${r.d.toFixed(1)} м, была ${Math.hypot(tg0[0] - r.tg[0], tg0[2] - r.tg[2]).toFixed(0)} м назад)`);
}
if (await has('#follow')) { // камера у выбранного зверя: вращение и приближение вокруг него, плашка, Esc
  await page.mouse.move(640, 200);
  await page.evaluate(() => window.__om.visual.focusSpecies('dolphin'));
  await page.waitForFunction(() => { const v = window.__om.visual; return v._follow && v._follow.t > 4; }, null, { timeout: 60000 });
  const S = () => page.evaluate(() => { const v = window.__om.visual, o = v.agents.get(v._follow?.id), c = v.camera.position, t = v.controls.target;
    return { id: v._follow?.id, d: +c.distanceTo(t).toFixed(1), az: +Math.atan2(c.x - t.x, c.z - t.z).toFixed(2), toAnimal: o ? +t.distanceTo(o.obj.position).toFixed(1) : -1,
      chip: document.getElementById('follow').classList.contains('show') ? document.querySelector('#follow span').textContent : '' }; });
  const a = await S();
  ok(/Слежу: Дельфин №/.test(a.chip), `плашка «${a.chip}»`);
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.move(820, 360, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(1500);
  const b = await S();
  ok(b.id === a.id, 'после поворота мышью камера всё ещё следит за тем же дельфином');
  ok(Math.abs(b.az - a.az) > .2, `камера повернулась вокруг зверя (азимут ${a.az} → ${b.az})`);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(120); }
  await page.waitForTimeout(2500);
  const c = await S();
  ok(c.id === a.id && c.d < b.d - 1, `колесо приближает к зверю (${b.d} → ${c.d} м) и не возвращается само`);
  ok(c.toAnimal < 6, `точка обзора на звере (${c.toAnimal} м)`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  const d = await S(); ok(!d.id && !d.chip, 'Esc — камера отпущена, плашки нет');
}
if (await has('#lens-btn')) { // кнопка «Линза»
  const bf = () => page.$eval('#lens-noise', e => e.getAttribute('baseFrequency'));
  const changes = async ms => { let n = 0, p = await bf(); const t0 = Date.now(); while (Date.now() - t0 < ms) { await page.waitForTimeout(40); const q = await bf(); if (q !== p) n++; p = q; } return n; };
  const hud = await page.locator('#hud').boundingBox();
  ok(await page.$eval('#lens-btn', e => e.classList.contains('on')), 'линза по умолчанию включена');
  await page.mouse.move(640, 200); await page.waitForTimeout(300);
  ok(await changes(800) === 0, 'линза включена, но курсор не над панелью — таймер стоит');
  await page.mouse.move(hud.x + 60, hud.y + 40); await page.mouse.move(hud.x + 80, hud.y + 50); await page.waitForTimeout(200);
  ok(/lens/.test(await page.$eval('#hud', e => e.style.filter)) && await changes(800) > 3, 'над панелью — фильтр линзы и «течение»');
  await page.click('#lens-btn'); await page.waitForTimeout(200);
  await page.mouse.move(hud.x + 60, hud.y + 40); await page.mouse.move(hud.x + 90, hud.y + 60); await page.waitForTimeout(200);
  const off = { cls: await page.$eval('#lens-btn', e => e.classList.contains('on')), f: await page.$$eval('.panel, #tod button', es => es.filter(e => e.style.filter).length), n: await changes(1000) };
  ok(!off.cls && off.f === 0 && off.n === 0, `линза выключена: фильтров на элементах ${off.f}, изменений «течения» за 1 с ${off.n}`);
  await page.reload(); await page.waitForFunction(() => window.__omReady, null, { timeout: 60000 });
  ok(!(await page.$eval('#lens-btn', e => e.classList.contains('on'))), 'после перезагрузки линза осталась выключенной');
  await page.$eval('#lens-btn', e => e.click()); ok(await page.$eval('#lens-btn', e => e.classList.contains('on')), 'включается обратно');   // экран входа поверх — нажимаем из страницы
  await page.click('#gate-btn'); await page.waitForFunction(() => window.__om.audio.ready && !document.querySelector('#gate'), null, { timeout: 90000 });   // снова в океан
}
if (await has('#hint')) { // подсказки «Состояния»
  await page.$eval('#hud', e => e.classList.remove('min'));
  await page.hover('#hud .k:text("Напряжение")'); await page.waitForTimeout(300);
  const h = await page.$eval('#hint', e => ({ show: e.classList.contains('show'), txt: e.textContent }));
  ok(h.show && /тревожно/.test(h.txt), `наведение на «Напряжение» — подсказка «${h.txt.slice(0, 50)}…»`);
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/hint_pc.png', clip: { x: 0, y: 0, width: 640, height: 300 } });
  await page.mouse.move(640, 500); await page.waitForTimeout(300);
  ok(!(await page.$eval('#hint', e => e.classList.contains('show'))), 'курсор ушёл — подсказки нет');
}
ok(!errs.length, 'ошибок в консоли нет' + (errs.length ? ': ' + errs.join(' | ') : ''));
await browser.close();
console.log(fails ? `ПРОВАЛОВ: ${fails}` : 'всё прошло');
process.exit(fails ? 1 : 0);
