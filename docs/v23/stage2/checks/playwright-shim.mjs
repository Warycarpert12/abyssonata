// Прослойка «как Playwright» поверх безголового Edge по CDP — для скриптов docs/v22/checks без установки Playwright.
// Положить как node_modules/playwright/index.mjs рядом со скриптом; GPU=1 — рисовать видеокартой ПК (иначе программно).
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function connect(url) {
  const ws = new WebSocket(url); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const wait = new Map(), subs = [];
  ws.onmessage = m => { const d = JSON.parse(m.data);
    if (d.id && wait.has(d.id)) { const [r, j] = wait.get(d.id); wait.delete(d.id); d.error ? j(new Error(d.error.message)) : r(d.result); }
    else if (d.method) for (const s of [...subs]) if (s.m === d.method) { s.f(d.params); if (s.once) subs.splice(subs.indexOf(s), 1); } };
  return { send: (method, params = {}) => new Promise((r, j) => { const i = ++id; wait.set(i, [r, j]); ws.send(JSON.stringify({ id: i, method, params })); }),
    on: (m, f) => subs.push({ m, f }), once: (m, f) => subs.push({ m, f, once: 1 }), close: () => ws.close() };
}
export const chromium = {
  async launch({ args = [] } = {}) {
    const port = 9400 + Math.floor(Math.random() * 400), dir = mkdtempSync(join(tmpdir(), 'pwshim-'));
    const keep = args.filter(a => !/use-gl=|use-angle=|unsafe-swiftshader/.test(a));
    const proc = spawn(EDGE, ['--headless=new', '--disable-extensions', '--no-first-run', `--user-data-dir=${dir}`, `--remote-debugging-port=${port}`,
      ...(process.env.GPU ? ['--use-angle=d3d11', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), ...keep, 'about:blank'], { stdio: 'ignore' });
    for (let i = 0; i < 100; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); break; } catch { await sleep(100); } }
    const t = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(x => x.type === 'page');
    const c = await connect(t.webSocketDebuggerUrl); await c.send('Page.enable'); await c.send('Runtime.enable');
    const handlers = { console: [], pageerror: [] };
    c.on('Runtime.consoleAPICalled', p => handlers.console.forEach(f => f({ type: () => p.type === 'warning' ? 'warn' : p.type, text: () => p.args.map(a => a.value ?? a.description).join(' ') })));
    c.on('Runtime.exceptionThrown', p => handlers.pageerror.forEach(f => f({ message: p.exceptionDetails.exception?.description || p.exceptionDetails.text })));
    const ev = async (fn, arg) => { const r = await c.send('Runtime.evaluate', { expression: typeof fn === 'function' ? `(${fn})(${JSON.stringify(arg)})` : fn, awaitPromise: true, returnByValue: true, userGesture: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
    const page = {
      on: (e, f) => handlers[e]?.push(f),
      addInitScript: fn => c.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${fn})()` }),
      async goto(url) { await c.send('Page.navigate', { url }); await sleep(300); for (let i = 0; i < 600; i++) { if (await ev('document.readyState').catch(() => '') === 'complete') return; await sleep(100); } },
      async waitForFunction(fn, arg, { timeout = 30000 } = {}) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await ev(`!!((${fn})(${JSON.stringify(arg ?? null)}))`).catch(() => false)) return; await sleep(200); } throw new Error('waitForFunction timeout'); },
      evaluate: (fn, arg) => ev(fn, arg),
      waitForTimeout: ms => sleep(ms),
      async click(sel) { const [x, y] = await ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
        for (const type of ['mousePressed', 'mouseReleased']) await c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); },
    };
    const browser = {
      async newContext({ viewport = { width: 1280, height: 720 } } = {}) {
        await c.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false });
        return { newPage: async () => page, newCDPSession: async () => c, close: async () => {} };
      },
      close: async () => { try { c.close(); } catch {} proc.kill(); },
    };
    return browser;
  },
};
export const devices = {};
