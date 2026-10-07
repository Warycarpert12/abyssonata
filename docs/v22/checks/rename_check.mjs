// Переименование: настройки, сохранённые под старыми ключами (om.*), переезжают под новые (abyssonata.*) —
// громкость «Природа»/«Музыка», качество картинки и линза после обновления сайта те же; старые ключи убраны; на
// странице, в манифесте и в credits.html — новое имя. Что старого имени нигде не осталось, проверяет поиск по файлам
// репозитория (git grep) — сам скрипт его не содержит.
//   node docs/v22/checks/rename_check.mjs <адрес страницы с ?qa>
import { chromium } from 'playwright';
const url = process.argv[2];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage(), errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
const ready = () => page.waitForFunction(() => window.__abyssonataReady && window.__abyssonata?.visual?.assets, null, { timeout: 90000 });
await page.goto(url + '&noaudio=1&lowres=1', { waitUntil: 'load' }); await ready();
// так настройки лежали у человека до переименования
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('om.vol.nature', '37'); localStorage.setItem('om.vol.music', '12');
  localStorage.setItem('om.quality', 'low'); localStorage.setItem('om.lens', '0'); });
await page.goto(url + '&noaudio=1', { waitUntil: 'load' }); await ready();   // без &lowres: качество картинки выбирается
const st = () => page.evaluate(() => ({ nature: document.getElementById('vol-nature').value, music: document.getElementById('vol-music').value,
  q: document.querySelector('#quality button.active')?.dataset.q, lens: document.getElementById('lens-btn')?.classList.contains('on'),
  keys: Object.keys(localStorage).sort(), title: document.title, h1: document.querySelector('#gate-card h1')?.textContent || '(вход уже ушёл)' }));
let s = await st();
ok(s.nature === '37' && s.music === '12', `громкость перенесена: «Природа» ${s.nature}, «Музыка» ${s.music}`);
ok(s.q === 'low', `качество перенесено: ${s.q}`);
ok(s.lens === false, `линза перенесена: ${s.lens ? 'включена' : 'выключена'}`);
ok(!s.keys.some(k => k.startsWith('om.')) && ['abyssonata.lens', 'abyssonata.quality', 'abyssonata.vol.music', 'abyssonata.vol.nature'].every(k => s.keys.includes(k)), `ключи: ${s.keys.join(', ')}`);
ok(s.title === 'Abyssonata', `заголовок вкладки: ${s.title}`);
// новые ключи не перетираются старыми (если старый вдруг остался, например из закэшированной старой страницы)
await page.evaluate(() => { localStorage.setItem('om.vol.nature', '90'); localStorage.setItem('abyssonata.vol.nature', '55'); });
await page.reload({ waitUntil: 'load' }); await ready();
s = await st();
ok(s.nature === '55' && !s.keys.includes('om.vol.nature'), `новое значение важнее старого: «Природа» ${s.nature}, старый ключ убран`);
// чистый браузер: всё по умолчанию
await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' }); await ready();
s = await st();
ok(s.nature === '100' && s.music === '70' && s.q === 'auto' && s.lens === true, `чистый браузер — по умолчанию: ${s.nature}/${s.music}, ${s.q}, линза ${s.lens}`);
const man = await page.evaluate(async () => (await fetch('manifest.json')).json()).catch(() => null);
ok(man?.name === 'Abyssonata' && man?.short_name === 'Abyssonata', `manifest.json: ${man?.name} / ${man?.short_name}`);
const crText = await page.evaluate(async () => (await fetch('credits.html')).text()), cr = { title: /<title>([^<]*)/.exec(crText)?.[1], code: /Код ([^—<]+) —/.exec(crText)?.[1]?.trim() };
ok(cr.title === 'Abyssonata — авторы и лицензии' && cr.code === 'Abyssonata', `credits.html: «${cr.title}», «Код ${cr.code}»`);
await page.close();   // вторая страница — без первой (программный рендер двух вкладок сразу очень медленный)
const page2 = await ctx.newPage(); page2.on('pageerror', e => errs.push('pageerror: ' + e.message));
await page2.goto(url + '&lowres=1', { waitUntil: 'commit' });
await page2.waitForSelector('#gate-card h1', { timeout: 90000 });
ok(await page2.evaluate(() => document.querySelector('#gate-card h1')?.textContent) === 'Abyssonata', 'экран входа: «Abyssonata»');
ok(!errs.length, 'ошибок в консоли нет' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await browser.close();
console.log(fails ? `ПРОВАЛОВ: ${fails}` : 'всё прошло');
process.exit(fails ? 1 : 0);
