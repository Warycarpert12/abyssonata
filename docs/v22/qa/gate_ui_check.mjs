// QA v22: пока открыт экран входа, интерфейс мира скрыт и не ловит нажатия/наведение; после входа — проявляется, когда
// карточка уже рассыпалась (ПК) или растворилась (телефон), примерно за 0.9 с. И на слабом ПК (долгий кадр сразу после
// входа) карточка всё равно рассыпается, а не исчезает разом; при 2 кадрах/с интерфейс появляется не позже чем через ~4 с.
//   node qa/gate_ui_check.mjs <адрес страницы с ?qa>
import { chromium, devices } from 'playwright';
const url = process.argv[2];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const UI = ['#hud', '#census', '#vol', '#log', '#tod', '#credits'];

async function run(name, opt, tap, stall = 0, slow = 0) {
  const ctx = await browser.newContext(opt), page = await ctx.newPage(), errs = [];
  // stall — слабое устройство: первый кадр растворения приходит через stall мс (долгий кадр сразу после входа);
  // slow — совсем медленное: после «Войти» каждый кадр — через slow мс (2 кадра/с при 500)
  if (stall || slow) await page.addInitScript(([ms, every]) => { const raf = window.requestAnimationFrame.bind(window); let done = false;
    window.requestAnimationFrame = cb => { if (!document.getElementById('gate-dust')) return raf(cb); window.__dust ??= performance.now();
      if (every) { setTimeout(() => raf(t => { (window.__frames ||= []).push(performance.now()); cb(t); }), every); return 0; }
      if (!done) { done = true; setTimeout(() => raf(cb), ms); return 0; } return raf(cb); }; }, [stall, slow]);
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  // момент, когда снимается body.gate-open: сколько карточки ещё не стёрто (маска) и видна ли она (растворение)
  await page.addInitScript(() => {
    window.__ui = null;
    addEventListener('DOMContentLoaded', () => new MutationObserver(() => {
      if (window.__ui || document.body.classList.contains('gate-open')) return;
      const c = document.getElementById('gate-card'), m = c && (c.style.webkitMaskImage || c.style.maskImage), op = c ? +getComputedStyle(c).opacity : 0;
      window.__ui = { t: performance.now(), mask: m ? parseFloat(m.match(/transparent ([-\d.]+)%/)?.[1]) : null, cardOpacity: op, fade: c?.classList.contains('fade') };
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] }));
  });
  await page.goto(url + '&lowres=1', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__omReady && window.__om?.visual?.assets, null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  const vis = () => page.evaluate(UI => UI.map(s => { const e = document.querySelector(s), c = getComputedStyle(e), r = e.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + Math.min(20, r.width / 2), r.top + Math.min(20, r.height / 2));
    return { s, vis: c.visibility, op: +c.opacity, pe: c.pointerEvents, mine: !!hit && e.contains(hit) }; }), UI);
  const a = await vis();
  ok(a.every(x => x.vis === 'hidden' && x.op === 0 && !x.mine), `${name}: до входа скрыто и не ловит нажатия: ${a.filter(x => x.vis !== 'hidden' || x.mine).map(x => x.s).join(', ') || 'всё'}`);
  // наведение на место панели «Состояние» — ни подсказки, ни линзы
  const hb = await page.evaluate(() => { const r = document.getElementById('hud').getBoundingClientRect(); return { x: r.left + 40, y: r.top + 120 }; });
  if (!tap) { await page.mouse.move(hb.x, hb.y); await page.mouse.move(hb.x + 5, hb.y + 5); await page.waitForTimeout(300);
    ok(!(await page.$eval('#hint', e => e.classList.contains('show'))) && !(await page.$$eval('.panel', es => es.some(e => e.style.filter))), `${name}: наведение на скрытую панель — ничего`); }
  const t0 = await page.evaluate(() => performance.now());
  if (tap) await page.tap('#gate-btn'); else await page.click('#gate-btn');
  await page.waitForFunction(() => window.__ui, null, { timeout: 60000 });
  const u = await page.evaluate(() => window.__ui);
  if (u.mask !== null) ok(u.mask >= 124, `${name}: интерфейс начал проявляться, когда карточка стёрта (маска ${u.mask}%)`);
  else ok(u.fade, `${name}: интерфейс начал проявляться после растворения карточки (растворение запущено, прошло ${((u.t - t0) / 1000).toFixed(1)} с)`);
  // не позже первого кадра после 4 с (без видеокарты кадр бывает и через 1–2 с — ждать дольше этого кадра нельзя)
  if (slow) { const r = await page.evaluate(() => { const lim = window.__dust + 4000, f = (window.__frames || []).find(t => t >= lim);
      return { d: (window.__ui.t - window.__dust) / 1000, f: f ? (f - window.__dust) / 1000 : null }; });
    ok(r.f !== null && r.d <= r.f + .1, `${name}: интерфейс проявился через ${r.d.toFixed(1)} с после начала растворения — на первом кадре после 4 с (${r.f?.toFixed(1)} с)`); }
  // переход 0.9 с; без видеокарты кадры редкие (а время анимаций идёт по кадрам) — ждём до 8 с, пока всё проявится
  let b = await vis(); for (let k = 0; k < 40 && !b.every(x => x.vis === 'visible' && x.op > .99); k++) { await page.waitForTimeout(200); b = await vis(); }
  ok(b.every(x => x.vis === 'visible' && x.op > .99), `${name}: после входа всё видно: ${b.filter(x => x.vis !== 'visible' || x.op <= .99).map(x => x.s + ' ' + x.op).join(', ') || 'всё'}`);
  const nm = b.filter(x => x.s !== '#credits' && x.s !== '#tod' && !x.mine);
  ok(!nm.length, `${name}: панели снова ловят нажатия` + (nm.length ? ': не ловят ' + nm.map(x => x.s).join(', ') : ''));
  ok(!errs.length, `${name}: ошибок в консоли нет` + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}
await run('ПК', { viewport: { width: 1280, height: 720 } }, false);
await run('телефон', devices['Pixel 7 landscape'], true);
await run('iPhone', devices['iPhone 13 landscape'], true);
await run('ПК, долгий кадр (2 с) сразу после входа', { viewport: { width: 1280, height: 720 } }, false, 2000);
await run('ПК, 2 кадра в секунду после входа', { viewport: { width: 1280, height: 720 } }, false, 0, 500);
await browser.close();
console.log(fails ? `ПРОВАЛОВ: ${fails}` : 'всё прошло');
process.exit(fails ? 1 : 0);
