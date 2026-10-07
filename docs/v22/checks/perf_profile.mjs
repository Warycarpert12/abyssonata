// Профиль кадров в Chromium (Playwright + CDP). Сайт открывается, «Войти в океан», N секунд живого мира;
// пишется трасса DevTools (сборка мусора, задачи главного потока) и отметки самой страницы: распаковка звука
// (decodeAudioData), компиляция шейдеров (linkProgram), длительность работы кадра. Итог — самый долгий кадр, сколько
// кадров дольше 50 мс и что совпало по времени с долгими кадрами.
//   node docs/v22/checks/perf_profile.mjs <адрес страницы> [секунд=180] [замедление CPU=1] [имя=run]
// Без видеокарты (SwiftShader) картинка рисуется программно и каждый кадр долгий — поэтому отдельно
// считается «работа кадра» (JS в requestAnimationFrame): периодические всплески видны в ней без шума отрисовки.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const [url, secs = '180', thr = '1', name = 'run'] = process.argv.slice(2);
const DUR = +secs * 1000, OUT = process.env.OUT || '.';

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const ctx = await browser.newContext({ viewport: { width: +(process.env.W || 960), height: +(process.env.H || 540) } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  const P = window.__perf = { frames: [], work: [], decode: [], link: [], longtask: [], marks: [] };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => raf(ts => { const t0 = performance.now(); P.frames.push(t0); if (P.frames.length % 50 === 0) performance.mark('omsync:' + t0); try { cb(ts); } finally { P.work.push(performance.now() - t0); } });
  for (const C of [window.AudioContext, window.OfflineAudioContext, window.BaseAudioContext].filter(Boolean)) {
    const d = C.prototype.decodeAudioData; if (!d || d.__w) continue;
    C.prototype.decodeAudioData = function (...a) { const t0 = performance.now(); return d.apply(this, a).then(b => { P.decode.push([t0, performance.now(), b.length]); return b; }); };
    C.prototype.decodeAudioData.__w = 1;
  }
  for (const G of [window.WebGL2RenderingContext, window.WebGLRenderingContext].filter(Boolean)) {
    const l = G.prototype.linkProgram, gp = G.prototype.getProgramParameter;
    G.prototype.linkProgram = function (p) { const t0 = performance.now(); const r = l.call(this, p); P.link.push([t0, performance.now() - t0, 'link']); return r; };
    G.prototype.getProgramParameter = function (p, k) { const t0 = performance.now(); const r = gp.call(this, p, k); const dt = performance.now() - t0; if (dt > 2) P.link.push([t0, dt, 'wait']); return r; };
  }
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) P.longtask.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch { /* нет */ }
});
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
const cdp = await ctx.newCDPSession(page);
if (+thr > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: +thr });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__abyssonataReady, null, { timeout: 60000 });
const events = [];
cdp.on('Tracing.dataCollected', d => { for (const e of d.value) if (e.ph === 'X' || e.ph === 'B' || e.ph === 'E' || e.ph === 'I') events.push(e); });
const done = new Promise(r => cdp.once('Tracing.tracingComplete', r));
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start');
await cdp.send('Tracing.start', { categories: 'devtools.timeline,v8,v8.gc,disabled-by-default-v8.gc,blink.user_timing', transferMode: 'ReportEvents' });
const tEnter = await page.evaluate(() => performance.now());
await page.click('#gate-btn');
await page.waitForTimeout(DUR);
const P = await page.evaluate(() => window.__perf);
const { profile } = await cdp.send('Profiler.stop');
const timeOrigin = await page.evaluate(() => performance.timeOrigin);
await cdp.send('Tracing.end'); await done;
await browser.close();

// трасса: время в мкс от монотонных часов; привязываем к performance.now по метке TimeStamp / первому кадру нельзя
// напрямую — используем разницу между событиями «FireAnimationFrame» трассы и кадрами страницы
// часы трассы (мкс) ↔ performance.now страницы: метки omsync:<now> ставятся в кадре (см. addInitScript)
const syncs = events.filter(e => typeof e.name === 'string' && e.name.startsWith('omsync:')).map(e => e.ts / 1000 - +e.name.slice(7));
function median(a) { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1] || 0; }
const shift = median(syncs);
const toPage = us => us / 1000 - shift;
const gc = events.filter(e => e.ph === 'X' && /^(MinorGC|MajorGC|V8\.GC_MC_BACKGROUND|V8\.GCFinalizeMC|V8\.GCScavenger|V8\.GC_MARK_COMPACTOR)$/.test(e.name) && e.dur)
  .map(e => [toPage(e.ts), e.dur / 1000, e.name]).filter(g => g[2] === 'MinorGC' || g[2] === 'MajorGC' || g[2] === 'V8.GCFinalizeMC' || g[2] === 'V8.GCScavenger');
const timers = events.filter(e => e.ph === 'X' && e.name === 'TimerFire' && e.dur > 3000).map(e => [toPage(e.ts), e.dur / 1000]);
const fcalls = events.filter(e => e.ph === 'X' && e.name === 'FunctionCall' && e.dur > 20000).map(e => [toPage(e.ts), e.dur / 1000, e.args?.data?.functionName || '', (e.args?.data?.url || '').split('/').pop() + ':' + (e.args?.data?.lineNumber ?? '')]);

// кадры после входа (первые 2 с — сам вход, не считаем)
const fr = [], wk = [];
for (let i = 1; i < P.frames.length; i++) if (P.frames[i - 1] >= tEnter + 2000) { fr.push([P.frames[i - 1], P.frames[i] - P.frames[i - 1]]); wk.push([P.frames[i - 1], P.work[i - 1]]); }
const base = median(fr.map(f => f[1])), baseW = median(wk.map(w => w[1]));
const spikes = fr.filter(f => f[1] > Math.max(50, base * 1.8));
const spikesW = wk.filter(w => w[1] > Math.max(25, baseW * 3));
const over = (t0, t1, list) => list.filter(x => x[0] < t1 && x[0] + (x[1] || 0) > t0);
const cause = (t0, dur) => {
  const c = [];
  for (const g of over(t0, t0 + dur, gc)) c.push(`${g[2]} ${g[1].toFixed(0)}мс`);
  for (const l of P.link.filter(l => l[0] >= t0 - 1 && l[0] <= t0 + dur)) c.push(`шейдер(${l[2]}) ${l[1].toFixed(0)}мс`);
  for (const d of P.decode.filter(d => d[1] >= t0 - 30 && d[1] <= t0 + dur)) c.push(`распаковка звука ${(d[2] / 1000).toFixed(0)}k отсчётов`);
  for (const f of over(t0, t0 + dur, fcalls)) c.push(`вызов ${f[2] || '(аноним)'} ${f[3]} ${f[1].toFixed(0)}мс`);
  for (const t of over(t0, t0 + dur, timers)) c.push(`таймер ${t[1].toFixed(0)}мс`);
  return [...new Set(c)].join(', ');
};
// выборочный профиль CPU: в каких функциях (собственное время) прошли долгие «работы кадра»
const nodes = new Map(profile.nodes.map(n => [n.id, n])), parent = new Map();
for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
const sampT = []; { let t = profile.startTime; for (const d of profile.timeDeltas) { t += d; sampT.push(toPage(t)); } }
const fnName = n => { const f = n.callFrame; return `${f.functionName || '(аноним)'} ${(f.url || '').split('/').pop()}:${f.lineNumber + 1}`; };
const hot = (t0, dur, k = 4) => {
  const self = new Map(), incl = new Map();
  profile.samples.forEach((id, i) => { if (sampT[i] < t0 || sampT[i] > t0 + dur) return;
    const n = nodes.get(id); self.set(fnName(n), (self.get(fnName(n)) || 0) + 1);
    const seen = new Set(); for (let q = id; q; q = parent.get(q)) { const nm = fnName(nodes.get(q)); if (seen.has(nm)) continue; seen.add(nm); incl.set(nm, (incl.get(nm) || 0) + 1); } });
  const tot = [...self.values()].reduce((a, b) => a + b, 0) || 1;
  const pick = m => [...m].filter(([n]) => !/^\((root|program|idle)\)|^\(аноним\) :0/.test(n)).sort((a, b) => b[1] - a[1]).slice(0, k).map(([n, c]) => `${n} ${(c / tot * 100).toFixed(0)}%`).join('; ');
  return 'собств.: ' + pick(self) + ' | вкл.: ' + pick(new Map([...incl].filter(([n]) => !/frame main\.js|\(anonymous\)|^\(аноним\) main/.test(n))), 6);
};
const rel = t => ((t - tEnter) / 1000).toFixed(1) + ' с';
const lines = [];
lines.push(`== ${name}: ${secs} с, замедление CPU ×${thr}, ${fr.length} кадров ==`);
lines.push(`кадр: медиана ${base.toFixed(0)} мс, самый долгий ${Math.max(...fr.map(f => f[1])).toFixed(0)} мс, дольше 50 мс: ${fr.filter(f => f[1] > 50).length}, всплесков (>1.8× медианы и >50 мс): ${spikes.length}`);
lines.push(`работа кадра (JS): медиана ${baseW.toFixed(1)} мс, самая долгая ${Math.max(...wk.map(w => w[1])).toFixed(0)} мс, дольше 50 мс: ${wk.filter(w => w[1] > 50).length}, всплесков (>3× медианы и >25 мс): ${spikesW.length}`);
lines.push(`сборка мусора: MinorGC ${gc.filter(g => g[2] === 'MinorGC').length} раз (сумма ${gc.filter(g => g[2] === 'MinorGC').reduce((s, g) => s + g[1], 0).toFixed(0)} мс), MajorGC ${gc.filter(g => g[2] === 'MajorGC').length} раз (самая долгая ${Math.max(0, ...gc.filter(g => g[2] === 'MajorGC').map(g => g[1])).toFixed(0)} мс)`);
lines.push(`распаковано записей во время игры: ${P.decode.filter(d => d[0] > tEnter + 2000).length} из ${P.decode.length}; шейдеров собрано во время игры: ${P.link.filter(l => l[2] === 'link' && l[0] > tEnter + 2000).length} из ${P.link.filter(l => l[2] === 'link').length}`);
const top = wk.slice().sort((a, b) => b[1] - a[1]).slice(0, 15).sort((a, b) => a[0] - b[0]);
lines.push('самые долгие «работы кадра»:');
for (const [t, d] of top) lines.push(`  ${rel(t).padStart(8)}  ${d.toFixed(0).padStart(4)} мс  ${cause(t, d)}${d > 60 ? '\n            ' + hot(t, d) : ''}`);
const topF = fr.slice().sort((a, b) => b[1] - a[1]).slice(0, 10).sort((a, b) => a[0] - b[0]);
lines.push('самые долгие кадры (интервал):');
for (const [t, d] of topF) lines.push(`  ${rel(t).padStart(8)}  ${d.toFixed(0).padStart(4)} мс  ${cause(t, d)}`);
// период всплесков: интервалы между соседними всплесками работы кадра
const gaps = spikesW.slice(1).map((s, i) => (s[0] - spikesW[i][0]) / 1000).filter(g => g > 1);
if (gaps.length) lines.push(`интервал между всплесками работы кадра: медиана ${median(gaps).toFixed(1)} с (${gaps.length} интервалов)`);
lines.push(`ошибок в консоли: ${errors.length}${errors.length ? ' — ' + errors.slice(0, 5).join(' | ') : ''}`);
console.log(lines.join('\n'));
writeFileSync(`${OUT}/perf_${name}.json`, JSON.stringify({ name, secs: +secs, thr: +thr, frames: fr, work: wk, gc, link: P.link, decode: P.decode, tEnter, errors, fcalls, timers }));
