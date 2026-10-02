// QA v22: рост памяти за N минут живого мира (ищем утечки). Каждые 30 с — после принудительной сборки мусора:
// куча JS, геометрии/текстуры/шейдеры three.js, объекты сцены и живые эффекты, узлы DOM и строки журнала, обработчики
// событий на window/document, живые источники звука (запущены и ещё не закончились). Утечка — рост между 2-й минутой
// и концом, который не объясняется числом зверей. Текстуры: у каждой копии модели свой скелет и своя текстура костей
// (их число идёт за числом зверей на сцене) — отдельно выводятся «текстуры без костей», они должны стоять на месте.
//   node qa/memory_check.mjs <адрес страницы с ?qa> [минут=10] [имя]
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const [url, mins = '10', name = 'mem'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } }), page = await ctx.newPage(), errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
await page.addInitScript(() => {
  window.__src = { live: 0, started: 0 };
  const S = window.AudioScheduledSourceNode?.prototype; if (!S) return;
  const st = S.start;
  S.start = function (...a) { window.__src.live++; window.__src.started++; this.addEventListener('ended', () => window.__src.live--, { once: true }); return st.apply(this, a); };
});
await page.goto(url + '&lowres=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.__omReady && window.__om?.visual?.assets, null, { timeout: 90000 });
await page.click('#gate-btn');
await page.waitForFunction(() => window.__om.audio.ready && !document.body.classList.contains('gate-open'), null, { timeout: 90000 });
const cdp = await ctx.newCDPSession(page);
await cdp.send('HeapProfiler.enable'); await cdp.send('DOMDebugger.enable').catch(() => {});
const listeners = async expr => { const { result } = await cdp.send('Runtime.evaluate', { expression: expr }); const r = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId }); return r.listeners.length; };
const rows = [], t0 = Date.now();
for (let i = 0; i <= +mins * 2; i++) {
  if (i) await page.waitForTimeout(30000);
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  const r = await page.evaluate(() => { const v = window.__om.visual, w = window.__om.world, inf = v.renderer.info; let objs = 0; v.scene.traverse(() => objs++);
    const sk = new Set(); v.scene.traverse(n => { if (n.skeleton?.boneTexture) sk.add(n.skeleton); });
    return { worldMin: +(w.sim.state.t / 60).toFixed(1), geo: inf.memory.geometries, tex: inf.memory.textures, bones: sk.size, prog: inf.programs?.length ?? 0, objs, fx: v.fx.length,
      agents: v.agents.size, dom: document.getElementsByTagName('*').length, log: v.logList.children.length, src: window.__src.live, started: window.__src.started,
      bufs: Object.values(window.__om.audio.buffers).reduce((s, b) => s + b.length, 0) }; });
  r.heapMB = +(usedSize / 1048576).toFixed(1); r.lisWin = await listeners('window'); r.lisDoc = await listeners('document'); r.min = +((Date.now() - t0) / 60000).toFixed(1);
  rows.push(r);
  console.log(`${String(r.min).padStart(4)} мин (мир ${r.worldMin} мин): куча ${r.heapMB} МБ, геометрий ${r.geo}, текстур ${r.tex} (костей ${r.bones}, без костей ${r.tex - r.bones}), шейдеров ${r.prog}, объектов сцены ${r.objs}, эффектов ${r.fx}, зверей ${r.agents}, DOM ${r.dom}, журнал ${r.log}, обработчиков window/document ${r.lisWin}/${r.lisDoc}, звуков играет ${r.src} (всего запущено ${r.started}), записей ${r.bufs}`);
}
const a = rows.find(r => r.min >= 2) || rows[0], b = rows[rows.length - 1];
console.log(`\nрост со 2-й минуты до конца: куча ${(b.heapMB - a.heapMB).toFixed(1)} МБ, геометрий ${b.geo - a.geo}, текстур ${b.tex - a.tex} (без костей ${(b.tex - b.bones) - (a.tex - a.bones)}), шейдеров ${b.prog - a.prog}, объектов сцены ${b.objs - a.objs}, DOM ${b.dom - a.dom}, обработчиков ${b.lisWin - a.lisWin}/${b.lisDoc - a.lisDoc}, звуков ${b.src - a.src}`);
console.log(`ошибок в консоли: ${errs.length}${errs.length ? ' — ' + errs.slice(0, 3).join(' | ') : ''}`);
writeFileSync(`${process.env.OUT || '.'}/mem_${name}.json`, JSON.stringify(rows));
await browser.close();
