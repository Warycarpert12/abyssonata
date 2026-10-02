// QA v22: щелчки и обрывы звука — пауза/«Дальше», «сон» вкладки, облегчённый режим. Выход движка записывается
// AudioWorklet'ом (звуковой поток, не зависит от тормозов страницы); у каждого блока — время по часам. Остановка звука —
// разрыв во времени между блоками. Край: самая громкая выборка за 3 мс у края, делённая на среднюю громкость за 0.5 с
// рядом (≈1 и больше — звук обрывается/включается на полной громкости, это слышно как щелчок; ≈0 — плавно).
//   node qa/audio_check.mjs <адрес страницы с ?qa> [доп. параметры адреса, напр. &lite=1]
import { chromium } from 'playwright';
const [url, extra = ''] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } }), page = await ctx.newPage(), errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
await page.addInitScript(() => {   // что подключено к выходу — туда же подключим запись
  const c = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (d, ...a) { if (d instanceof AudioDestinationNode) (window.__toDest ||= []).push(this); return c.call(this, d, ...a); };
});
await page.goto(url + '&lowres=1' + extra, { waitUntil: 'load' });
await page.waitForFunction(() => window.__omReady && window.__om?.visual?.assets, null, { timeout: 90000 });
await page.click('#gate-btn');
await page.waitForFunction(() => window.__om.audio.ready && !document.body.classList.contains('gate-open'), null, { timeout: 90000 });
const rate = await page.evaluate(async () => {
  const ctx = window.__om.audio.ctx;
  const src = `class R extends AudioWorkletProcessor { process(i) { const ch = i[0] && i[0][0]; if (ch) this.port.postMessage({ w: Date.now(), d: ch.slice(0) }); return true; } } registerProcessor('qa-rec', R);`;
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([src], { type: 'application/javascript' })));
  const rec = new AudioWorkletNode(ctx, 'qa-rec', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' }), z = ctx.createGain(); z.gain.value = 0;
  window.__rec = []; rec.port.onmessage = e => window.__rec.push(e.data);
  for (const n of window.__toDest) n.connect(rec); rec.connect(z); z.connect(ctx.destination);
  return ctx.sampleRate;
});
const marks = [];
const mark = async what => { marks.push({ what, w: await page.evaluate(() => Date.now()) }); };
await page.waitForTimeout(6000);
for (let i = 0; i < 3; i++) {   // пауза / «Дальше»
  await mark('пауза'); await page.click('#pause'); await page.waitForTimeout(2000);
  await mark('дальше'); await page.click('#pause'); await page.waitForTimeout(3000);
}
const cdp = await ctx.newCDPSession(page);   // «сон» вкладки
await mark('сон вкладки'); await cdp.send('Page.setWebLifecycleState', { state: 'frozen' }); await new Promise(r => setTimeout(r, 3000));
await cdp.send('Page.setWebLifecycleState', { state: 'active' }); await page.waitForTimeout(3000);
const blocks = await page.evaluate(() => window.__rec.map(b => ({ w: b.w, d: Array.from(b.d) })));
// склеиваем; разрыв по часам > 250 мс — звук стоял
const N = blocks.reduce((s, b) => s + b.d.length, 0), x = new Float32Array(N), gaps = [];
let k = 0;
for (let i = 0; i < blocks.length; i++) {
  if (i && blocks[i].w - blocks[i - 1].w > 250) gaps.push({ at: k, w0: blocks[i - 1].w, w1: blocks[i].w });
  x.set(blocks[i].d, k); k += blocks[i].d.length;
}
const rms = (a, b) => { a = Math.max(0, a); b = Math.min(N, b); let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };
const peak = (a, b) => { a = Math.max(0, a); b = Math.min(N, b); let m = 0; for (let i = a; i < b; i++) m = Math.max(m, Math.abs(x[i])); return m; };
const e3 = Math.round(rate * .003), h = Math.round(rate * .5);
console.log(`записано ${(N / rate).toFixed(1)} с звука (${rate} Гц), остановок звука: ${gaps.length}`);
let worst = 0;
for (const g of gaps) {
  const m = marks.filter(q => q.w <= g.w1 + 50).pop()?.what || '?';
  const lvBefore = rms(g.at - h, g.at - e3 * 30), lvAfter = rms(g.at + e3 * 30, g.at + h);
  const out = peak(g.at - e3, g.at) / (lvBefore || 1e-9), inn = peak(g.at, g.at + e3) / (lvAfter || 1e-9);
  worst = Math.max(worst, out, inn);
  console.log(`  ${m.padEnd(12)} стоял ${((g.w1 - g.w0) / 1000).toFixed(1)} с: край остановки ${out.toFixed(2)}, край возобновления ${inn.toFixed(2)} (громкость вокруг ${lvBefore.toFixed(3)} / ${lvAfter.toFixed(3)})`);
}
// обрывы посреди игры: выборки, отличающиеся от соседних сильнее, чем обычно бывает (разрыв волны)
let jumps = 0; { let mean = 0; for (let i = 1; i < N; i++) mean += Math.abs(x[i] - x[i - 1]); mean /= N; for (let i = 1; i < N; i++) if (Math.abs(x[i] - x[i - 1]) > mean * 40 + .05) jumps++; }
console.log(`резких скачков волны посреди записи: ${jumps}`);
console.log(`худший край: ${worst.toFixed(2)} (меньше 0.3 — без щелчка)`);
console.log(`ошибок в консоли: ${errs.length}${errs.length ? ' — ' + errs.slice(0, 3).join(' | ') : ''}`);
await browser.close();
