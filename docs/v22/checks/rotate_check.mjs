// Телефон: поворот экрана (вертикально — просьба повернуть, горизонтально — океан; картинка меняет размер под
// экран), кнопка «На весь экран» (появляется горизонтально без полноэкранного режима, работает, прячется в нём), вход,
// пауза и подсказка после поворотов. Эмуляция Pixel 7 и iPhone 13 в Chromium. На ПК узкое высокое окно повернуть не просит.
//   node docs/v22/checks/rotate_check.mjs <адрес страницы с ?qa>
import { chromium, devices } from 'playwright';
const url = process.argv[2];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fails++; };
for (const name of ['Pixel 7', 'iPhone 13']) {
  const dev = devices[name], ctx = await browser.newContext(dev), page = await ctx.newPage(), errs = [];   // вертикально
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(url + '&lowres=1', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__omReady && window.__om?.visual?.assets, null, { timeout: 90000 });
  const st = () => page.evaluate(() => { const v = window.__om.visual, c = v.renderer.domElement;
    return { rot: getComputedStyle(document.getElementById('rotate')).display !== 'none', fs: document.getElementById('fs').classList.contains('show'),
      full: !!(document.fullscreenElement || document.webkitFullscreenElement), vw: innerWidth, vh: innerHeight, cw: c.clientWidth, ch: c.clientHeight, aspect: +v.camera.aspect.toFixed(3) }; });
  // браузер шлёт resize и fullscreenchange только между кадрами, а кадр в программном рендере долгий — ждём условия до 6 с
  const until = async (cond, ms = 6000) => { const t0 = Date.now(); let v = await st(); while (!cond(v) && Date.now() - t0 < ms) { await page.waitForTimeout(100); v = await st(); } v.wait = Date.now() - t0; return v; };
  let s = await st(); ok(s.rot && await page.evaluate(() => getComputedStyle(document.querySelector('#rotate .tel')).display !== 'none' && getComputedStyle(document.querySelector('#rotate .pc')).display === 'none'), `${name}: вертикально — «Поверните телефон» (${s.vw}×${s.vh})`);
  const { width: W, height: H } = dev.viewport;
  const land = v => !v.rot && v.cw === v.vw && v.ch === v.vh && Math.abs(v.aspect - v.vw / v.vh) < .01;
  await page.setViewportSize({ width: H, height: W });   // повернули горизонтально
  s = await until(land); ok(land(s), `${name}: горизонтально — океан, картинка ${s.cw}×${s.ch}, пропорции камеры ${s.aspect} (через ${s.wait} мс)`);
  await page.tap('#gate-btn');
  await page.waitForFunction(() => window.__om.audio.ready && !document.body.classList.contains('gate-open'), null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  s = await st();
  if (name === 'Pixel 7') {
    ok(s.full || s.fs, `${name}: после входа — полноэкранный режим (${s.full}) или кнопка «На весь экран» (${s.fs})`);
    if (s.full) { await page.evaluate(() => document.exitFullscreen()); s = await until(v => v.fs && !v.full); }
    ok(s.fs && !s.full, `${name}: без полноэкранного режима — кнопка «На весь экран» видна (через ${s.wait} мс)`);
    await page.tap('#fs'); s = await until(v => v.full && !v.fs);
    ok(s.full && !s.fs, `${name}: кнопка включила полноэкранный режим и спряталась (через ${s.wait} мс)`);
    if (s.full) { await page.evaluate(() => document.exitFullscreen()); await until(v => !v.full); }
  }
  // повернули обратно вертикально и снова горизонтально — мир живёт, размер верный
  await page.setViewportSize({ width: W, height: H });
  s = await until(v => v.rot && !v.fs); ok(s.rot && !s.fs, `${name}: снова вертикально — просьба повернуть, кнопки «На весь экран» нет (через ${s.wait} мс)`);
  const t0 = await page.evaluate(() => window.__om.world.sim.state.t);
  await page.setViewportSize({ width: H, height: W }); await page.waitForTimeout(1000);
  s = await until(land); const t1 = await page.evaluate(() => window.__om.world.sim.state.t);
  ok(land(s) && t1 > t0, `${name}: снова горизонтально — картинка ${s.cw}×${s.ch}, пропорции камеры ${s.aspect}, мир идёт (+${(t1 - t0).toFixed(1)} с, через ${s.wait} мс)`);
  // пауза и подсказка после поворотов
  await page.tap('#pause'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => window.__om.audio.paused && document.getElementById('pause').classList.contains('on')), `${name}: пауза касанием`);
  await page.tap('#pause'); await page.waitForTimeout(300);
  await page.evaluate(() => document.getElementById('hud').classList.remove('min'));
  const k = await page.evaluate(() => { const e = [...document.querySelectorAll('#hud .k')].find(x => /Ветер/.test(x.textContent)).getBoundingClientRect(); return { x: e.left + 8, y: e.top + e.height / 2 }; });
  await page.tap('#hud h2'); await page.tap('#hud h2');   // свернуть/развернуть — работает
  await page.touchscreen.tap(k.x, k.y); await page.waitForTimeout(300);
  ok(await page.$eval('#hint', e => e.classList.contains('show') && /ветра/.test(e.textContent)), `${name}: подсказка по нажатию на «Ветер»`);
  ok(!errs.length, `${name}: ошибок в консоли нет` + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}
// ПК: узкое высокое окно — просьбы «повернуть телефон» нет (мышь, не сенсор), панели и кнопки видны
for (const [w, h] of [[860, 1000], [600, 900], [420, 800]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } }), page = await ctx.newPage();
  await page.goto(url + '&lowres=1&noaudio=1', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__om?.visual?.assets && !document.body.classList.contains('gate-open'), null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => { const shown = sel => getComputedStyle(document.querySelector(sel)).display !== 'none';
    return { rot: shown('#rotate'), tel: shown('#rotate .tel'), pc: shown('#rotate .pc'),
      vis: ['hud', 'census', 'vol', 'log', 'tod'].every(id => { const b = document.getElementById(id).getBoundingClientRect(); return b.width > 0 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1; }) }; });
  if (w >= 600) ok(!r.rot && r.vis, `окно ПК ${w}×${h}: просьбы повернуть нет, панели и кнопки на экране`);
  else ok(r.rot && r.pc && !r.tel, `окно ПК ${w}×${h} (панели не помещаются): «Растяните окно шире», про телефон — ничего`);
  await ctx.close();
}
await browser.close();
console.log(fails ? `ПРОВАЛОВ: ${fails}` : 'всё прошло');
process.exit(fails ? 1 : 0);
