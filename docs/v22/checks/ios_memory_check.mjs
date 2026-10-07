// Память распакованных записей. iPhone/iPad (облегчённый звук): контекст в родной частоте устройства, записи —
// в 32 кГц (распаковывает отдельный офлайн-контекст), звук идёт. ПК: записи распаковывает основной контекст, частота
// записей = частота контекста (как в main). Память: сумма (отсчёты × каналы × 4 байта) — сколько занимают записи после
// входа и если прозвучат все категории (худший случай за долгую сессию).
//   node docs/v22/checks/ios_memory_check.mjs <адрес страницы с ?qa>
import { chromium, devices } from 'playwright';
const url = process.argv[2];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const mem = page => page.evaluate(() => { const a = window.__abyssonata.audio; let bytes = 0; const rates = new Set();
  for (const bs of Object.values(a.buffers)) for (const b of bs) { bytes += b.length * b.numberOfChannels * 4; rates.add(b.sampleRate); }
  return { mb: +(bytes / 1048576).toFixed(0), rates: [...rates], ctx: a.ctx.sampleRate, cats: Object.keys(a.buffers).length }; });
for (const [name, opt, rate] of [['iPhone 13 (48 кГц)', devices['iPhone 13 landscape'], 48000], ['ПК', { viewport: { width: 1280, height: 720 } }, 0]]) {
  const ctx = await browser.newContext(opt), page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  // родная частота настоящего iPhone — 48 кГц (в Chromium без заказа частоты контекст был бы 44.1 кГц)
  if (rate) await page.addInitScript(r => { const C = window.AudioContext; window.AudioContext = class extends C { constructor(o = {}) { super({ ...o, sampleRate: o.sampleRate || r }); } }; }, rate);
  await page.goto(url + '&lowres=1', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__abyssonataReady && window.__abyssonata?.visual?.assets, null, { timeout: 90000 });
  if (rate) await page.tap('#gate-btn'); else await page.click('#gate-btn');
  await page.waitForFunction(() => window.__abyssonata.audio.ready, null, { timeout: 120000 });
  await page.waitForTimeout(4000);
  const a = await mem(page);
  const run = await page.evaluate(async () => { const a = window.__abyssonata.audio, r = a.ctx.state; return r; });
  // худший случай: все категории загружены (облегчённый звук грузит их по первому звуку)
  await page.evaluate(async () => { const a = window.__abyssonata.audio; await Promise.all(Object.keys(a.manifest).map(c => a._loadCategory(c))); });
  const b = await mem(page);
  console.log(`${name}: контекст ${a.ctx} Гц, записи ${a.rates.join('/')} Гц; после входа ${a.mb} МБ (${a.cats} категорий), все категории ${b.mb} МБ (${b.cats})`);
  if (rate) ok(a.ctx === rate && b.rates.length === 1 && b.rates[0] === 32000 && run === 'running', `${name}: звук в ${a.ctx} Гц, записи в 32 кГц, звук ${run}`);
  else ok(b.rates.length === 1 && b.rates[0] === a.ctx && run === 'running', `${name}: записи в частоте контекста (${a.ctx} Гц), как в main`);
  ok(!errs.length, `${name}: ошибок нет` + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}
await browser.close();
console.log(fails ? `ПРОВАЛОВ: ${fails}` : 'всё прошло');
process.exit(fails ? 1 : 0);
