// QA v23, баг А: телефон, вход «Войти» → полный экран. Эмуляция Huawei Pura 70 Ultra горизонтально (CSS 807×282 с
// панелью Edge, 807×376 в полном экране, плотность 3.35). Размер окна приходит с задержкой 0 / 0.7 / 1.5 с; в режиме
// «как в Edge» окно оказывается выше экрана на высоту панели браузера (428 вместо 376) — так было на фото с телефона.
// Нижний ряд кнопок, журнал и «Обитатели» должны остаться в пределах экрана, картинка — во весь экран.
//   node docs/v23/qa/fullscreen_check.mjs <адрес страницы, напр. http://localhost:8765/>
import { launch, phone, sleep } from './cdp.mjs';
const base = process.argv[2];
const W = 807, H0 = 282, HS = 376;
let fails = 0;
for (const [edge, delay] of [[1, 0], [1, 700], [1, 1500], [0, 0], [0, 700], [0, 1500]]) {
  const s = await launch();
  try {
    await phone(s, { w: W, h: H0, dpr: 3.35, sw: 849, sh: HS });
    await s.goto(`${base}?seed=7&rseed=7&lowres=1&qa`);
    await s.until('window.__omReady && window.__om?.visual?.assets', 180000);
    await sleep(500);
    await s.tapSel('#gate-btn');
    await sleep(delay);   // полный экран включился, а размер окна пришёл позже
    await phone(s, { w: W, h: edge ? 428 : HS, dpr: 3.35, sw: 849, sh: HS });
    await s.until('!document.body.classList.contains("gate-open")', 180000);
    await sleep(1500);
    const r = await s.eval(`(() => { const o = {}; for (const id of ['census', 'log', 'tod', 'gl']) o[id] = Math.round(document.getElementById(id).getBoundingClientRect().bottom);
      o.fs = !!document.fullscreenElement; o.inner = innerHeight; return o; })()`);
    const bad = ['census', 'log', 'tod'].filter(id => r[id] > HS + 1), good = !bad.length && Math.abs(r.gl - HS) <= 1 && r.fs;
    console.log(`${good ? 'OK  ' : 'FAIL'} ${edge ? 'окно выше экрана (как в Edge)' : 'обычный телефон'}, размер через ${delay} мс: ` +
      `низ «Обитателей» ${r.census}, журнала ${r.log}, кнопок ${r.tod}, картинки ${r.gl} (экран ${HS}, окно ${r.inner})` + (bad.length ? ` — за краем: ${bad.join(', ')}` : ''));
    if (!good) fails++;
  } finally { s.close(); }
}
console.log(fails ? `ПРОВАЛОВ: ${fails}` : 'всё прошло');
process.exit(fails ? 1 : 0);
