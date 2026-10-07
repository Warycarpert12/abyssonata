// Панели и нижний ряд кнопок не налезают друг на друга на разных экранах (телефоны горизонтально, окна ПК разной
// величины), заголовки панелей нажимаются, кнопки внизу — не больше чем в 3 ряда (не столбиком посреди картинки).
//   node docs/v22/checks/layout_check.mjs <адрес страницы с ?qa>
import { chromium, devices } from 'playwright';
const url = process.argv[2];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const SCREENS = [['iPhone 13 landscape'], ['iPhone SE landscape'], ['Pixel 7 landscape'], ['Galaxy S8 landscape'], ['iPad Mini landscape'],
  ['ПК 1280×720', { viewport: { width: 1280, height: 720 } }], ['окно ПК 760×520', { viewport: { width: 760, height: 520 } }], ['ПК 1920×1080', { viewport: { width: 1920, height: 1080 } }],
  // окна ПК средней величины (половина экрана, маленький ноутбук): нижний ряд не должен вставать столбиком посреди картинки
  ...[[800, 600], [900, 700], [960, 1080], [1000, 650], [1024, 768], [1024, 600], [1100, 650], [1366, 768]].map(([w, h]) => [`окно ПК ${w}×${h}`, { viewport: { width: w, height: h } }])];
for (const [name, opt] of SCREENS) {
  const ctx = await browser.newContext(opt || devices[name]), page = await ctx.newPage();
  await page.goto(url + '&noaudio=1&lowres=1', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__om?.visual?.assets && !document.body.classList.contains('gate-open'), null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  for (const st of ['свёрнуты по умолчанию', 'все раскрыты']) {
    if (st === 'все раскрыты') await page.evaluate(() => document.querySelectorAll('.panel').forEach(p => p.classList.remove('min')));
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const ids = ['hud', 'census', 'vol', 'log', 'tod'], vis = id => getComputedStyle(document.getElementById(id)).display !== 'none';
      const bx = id => { const r = document.getElementById(id).getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
      const ov = (a, b) => a[0] < b[2] - 1 && b[0] < a[2] - 1 && a[1] < b[3] - 1 && b[1] < a[3] - 1, over = [];
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (vis(ids[i]) && vis(ids[j]) && ov(bx(ids[i]), bx(ids[j]))) over.push(ids[i] + '×' + ids[j]);
      const out = ['hud', 'census', 'vol', 'log', 'tod'].filter(id => { const b = bx(id); return b[0] < -1 || b[1] < -1 || b[2] > innerWidth + 1 || b[3] > innerHeight + 1; });
      const heads = [...document.querySelectorAll('.panel h2')].filter(h => { const r = h.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width * .3, r.top + r.height / 2); return !(e && h.contains(e)); }).map(h => h.parentElement.id);
      const rows = new Set([...document.querySelectorAll('#tod button')].filter(b => b.offsetParent).map(b => Math.round(b.getBoundingClientRect().top))).size;
      return { vw: innerWidth, vh: innerHeight, over, out, heads, rows };
    });
    // на крошечных экранах раскрытые все панели разом могут не поместиться — это отмечаем, но не считаем провалом
    const strict = st === 'свёрнуты по умолчанию' || r.vw >= 700;
    const good = !r.over.length && !r.out.length && !r.heads.length && r.rows <= 3;
    if (strict) ok(good, `${name} (${r.vw}×${r.vh}), ${st}: ` + (good ? `без наложений, кнопки внизу в ${r.rows} ряд(а)` : `наложения ${r.over.join(', ') || '—'}; за краем ${r.out.join(', ') || '—'}; закрытые заголовки ${r.heads.join(', ') || '—'}; рядов кнопок внизу ${r.rows}`));
    else console.log(`ИНФО ${name} (${r.vw}×${r.vh}), ${st}: ` + (good ? 'без наложений' : `наложения ${r.over.join(', ') || '—'}; закрытые заголовки ${r.heads.join(', ') || '—'}`));
  }
  await ctx.close();
}
await browser.close();
console.log(fails ? `ПРОВАЛОВ: ${fails}` : 'всё прошло');
process.exit(fails ? 1 : 0);
