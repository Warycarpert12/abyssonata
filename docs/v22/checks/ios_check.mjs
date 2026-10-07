// iPhone (эмуляция в Chromium, без WebKit): вход касанием, звук создаётся прямо в нажатии,
// тихий <audio> и audioSession, «старый Safari» (только webkitAudioContext, распаковка без Promise, без
// StereoPanner), «старый браузер» (нет модулей) — понятное сообщение.
//   node docs/v22/checks/ios_check.mjs <адрес страницы с ?qa>
import { chromium, devices } from 'playwright';
const url = process.argv[2];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const iphone = { ...devices['iPhone 13 landscape'] };
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fails++; };

async function run(name, init, block) {
  const ctx = await browser.newContext(iphone), page = await ctx.newPage(), errs = [];
  if (block) await page.route(block, r => r.abort());
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.addInitScript(init || (() => {}));
  await page.addInitScript(() => {
    const L = window.__log = { ctor: [], resume: [], play: [], session: null };
    const wrap = name => { const C = window[name]; if (!C) return;
      window[name] = class extends C { constructor(...a) { L.ctor.push(window.event?.type || 'вне нажатия'); super(...a); }
        resume() { L.resume.push(window.event?.type || 'вне нажатия'); return super.resume(); } }; };
    wrap('AudioContext'); wrap('webkitAudioContext');
    const p = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { L.play.push((window.event?.type || 'вне нажатия') + ':' + this.loop); return p.call(this); };
    Object.defineProperty(navigator, 'audioSession', { value: { set type(v) { L.session = v; }, get type() { return L.session; } }, configurable: true });
  });
  await page.goto(url, { waitUntil: 'load' });
  return { ctx, page, errs };
}

{ // обычный iPhone
  const { ctx, page, errs } = await run('iphone');
  await page.waitForFunction(() => window.__omReady, null, { timeout: 60000 });
  await page.tap('#gate-btn');
  await page.waitForFunction(() => window.__om?.audio?.ready, null, { timeout: 60000 });
  await page.waitForTimeout(3000);
  const r = await page.evaluate(() => ({ log: window.__log, state: window.__om.audio.ctx.state, rate: window.__om.audio.ctx.sampleRate, lite: window.__om.audio.lite,
    keep: !!window.__om.audio.keep && !window.__om.audio.keep.paused, surf: (window.__om.audio.buffers.surf || []).length, gate: !!document.querySelector('#gate:not(.hidden)') }));
  console.log('iPhone:', JSON.stringify(r));
  ok(r.log.ctor[0] === 'click' || r.log.ctor[0] === 'pointerup' || r.log.ctor[0] === 'touchend', 'AudioContext создан прямо в нажатии (' + r.log.ctor[0] + ')');
  ok(r.log.resume[0] === r.log.ctor[0], 'resume() вызван в том же нажатии (' + r.log.resume[0] + ')');
  ok(r.log.session === 'playback', 'navigator.audioSession.type = playback');
  ok(r.keep && r.log.play.some(p => p.endsWith(':true')), 'тихий <audio> играет по кругу (беззвучный переключатель)');
  ok(r.state === 'running', 'звук запущен (state = running)');
  ok(r.surf > 0 && r.lite, `облегчённый звук, записи прибоя загружены (${r.surf}), частота ${r.rate}`);
  ok(!r.gate, 'экран входа ушёл');
  ok(!errs.length, 'ошибок в консоли нет' + (errs.length ? ': ' + errs.join(' | ') : ''));
  // iOS остановил звук (блокировка экрана) — касание будит
  await page.evaluate(() => window.__om.audio.ctx.suspend());
  await page.tap('#gl'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => window.__om.audio.ctx.state) === 'running', 'после «interrupted» касание снова включает звук');
  await ctx.close();
}

{ // «старый Safari»: только webkitAudioContext, decodeAudioData без Promise, без StereoPanner
  const { ctx, page, errs } = await run('old-safari', () => {
    const C = window.AudioContext;
    class W extends C {
      constructor() { super(); }   // старый конструктор без параметров
      decodeAudioData(ab, ok, err) { super.decodeAudioData(ab).then(ok, err); }   // только обратный вызов, без Promise
    }
    W.prototype.createStereoPanner = undefined;
    window.webkitAudioContext = W; delete window.AudioContext;
  });
  await page.waitForFunction(() => window.__omReady, null, { timeout: 60000 });
  await page.tap('#gate-btn');
  const ready = await page.waitForFunction(() => window.__om?.audio?.ready, null, { timeout: 60000 }).then(() => true, () => false);
  await page.waitForTimeout(2000);
  const r = await page.evaluate(() => ({ surf: (window.__om.audio.buffers.surf || []).length, state: window.__om.audio.ctx?.state }));
  ok(ready && r.surf > 0 && r.state === 'running', `старый Safari: записи распаковались (${r.surf}), звук ${r.state}`);
  await page.evaluate(() => window.__om.audio._abstract({ daylight: .5 }));   // «эхо» без StereoPanner
  ok(!errs.length, 'старый Safari: ошибок нет' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

{ // «старый браузер» без модулей — понятное сообщение сразу
  const { ctx, page } = await run('old-browser', () => { Object.defineProperty(HTMLScriptElement.prototype, 'noModule', { get: undefined, configurable: true }); delete HTMLScriptElement.prototype.noModule; }, '**/main.js');   // в старом браузере модуль океана не запустится
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({ msg: document.getElementById('gate-err')?.textContent || '', btn: getComputedStyle(document.getElementById('gate-btn')).display }));
  ok(/слишком старый/.test(r.msg), 'старый браузер: сообщение «' + r.msg.slice(0, 60) + '…»');
  await ctx.close();
}
await browser.close();
console.log(fails ? `ПРОВАЛОВ: ${fails}` : 'всё прошло');
process.exit(fails ? 1 : 0);
