// Abyssonata — склейка: мир считается прямо в браузере (World оборачивает sim.js), один поток данных кормит
// картинку (Visual) и звук (OceanAudio), поэтому они всегда синхронны. Звук стартует по нажатию «Войти в океан» —
// без жеста браузер звук не запустит.
import { World } from './world.js';
import { Visual } from './visual.js';
import { OceanAudio } from './audio.js';
import { initBestiary } from './bestiary.js';
import { boot, steps, step, within, device, autoLite, startLite, lastBootFailed, markBoot } from './boot.js';

// &rseed=N — повторяемые случайные числа (одинаковые сцены для снимков и сравнений); без параметра — как всегда
{ const rs = new URLSearchParams(location.search).get('rseed');
  if (rs !== null) { let r = (+rs * 2654435761) >>> 0; Math.random = () => { r = (r + 0x6D2B79F5) >>> 0; let x = Math.imul(r ^ (r >>> 15), 1 | r);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; } }

const stage = document.querySelector('#stage');
// «Лёгкое» качество — с самого начала (мало памяти, прошлый вход не дошёл до мира, выбрано в настройках), см. boot.js
const visual = new Visual(stage, { lite: startLite });
const world = new World();
const audio = new OceanAudio('.', { lite: startLite });   // пути от страницы — сайт может лежать в подпапке (GitHub Pages)

world.onState(m => visual.onState(m));
world.onEvent(m => visual.onEvent(m));
world.onState(m => { if (audio.ready) audio.update(m); });
// звук события — из той же точки, где его видно на экране (сторона/дальность относительно камеры)
world.onEvent(m => { if (audio.ready) audio.onEvent({ ...m, ...visual.spatial(m) }).catch(e => console.warn('звук события:', e)); });

// местные звуки от картинки: плеск (рифовая рыбка, прыжки из воды), стрекот кузнечика, звуки при приближении
// (бульки, треск креветок, щёлканье краба) — из той точки, где это видно; k — насколько близко (1 — вплотную)
// громкость и высота: креветки и краб звучат выше записи (запись — шипение/щелчки, на них похоже в ускорении)
// креветки — гидрофонная запись, почти без ускорения; sand — шорох песка у черепашат, тихо (они маленькие)
const LOCAL = { grasshopper: [.09, 1], splash: [.05, 1], bubbles: [.08, 1], shrimp: [.05, 1.05], crab: [.07, 1.5], sand: [.025, 1.1] };
visual.onLocalSound = (cat, pos, k = 1) => {
  if (!audio.ready) return;
  const sp = visual.spatialAt(pos), [amp, rate] = LOCAL[cat] || [.05, 1];
  audio.playLocal(cat, sp.panorama, sp.distance, amp * k, rate).catch(e => console.warn('местный звук:', e));
};

const qs = new URLSearchParams(location.search);
// старт всегда днём (в случайный час можно попасть на тёмный первый экран); ?tod= переопределяет.
// ?spawn=hatching — вылупление черепашат сразу; без tod в адресе — ночью (событие ночное)
const startTod = qs.has('tod') ? parseFloat(qs.get('tod')) : /hatching/.test(qs.get('spawn') || '') ? .02 : .5;
if (qs.has('qa')) window.__abyssonata = { world, visual, audio };   // доступ для автопроверок (только с ?qa в адресе)
const seed = qs.has('seed') ? parseInt(qs.get('seed'), 10) : null;
world.start({ startTod, seed });

// ?spawn=shark,orca,jellyfish,... — вызвать гостя сразу (программный рендер при проверке успевает лишь пару кадров);
// два нулевых шага: на первом симуляция только снимает начальное состояние, экосистема появляется на втором
if (qs.has('spawn')) { world.step(0); world.step(0); qs.get('spawn').split(',').forEach(k => world.debugSpawn(k.trim())); visual.synced = false; }   // гости — сразу на месте, не из дымки
// ?spawn=hatching — камера сама летит к выводку, как по нажатию на запись журнала
if (/hatching/.test(qs.get('spawn') || '')) { const t = setInterval(() => { if ([...visual.agents.values()].some(o => o.sp === 'hatchling' && o.kids)) { visual.focusSpecies('hatchling'); clearInterval(t); } }, 500); }
// для проверок (только с параметрами в адресе, на обычный мир не влияет): &qa=dry — баклан сразу сушит крылья на камне;
// &pre=N — прожить N секунд мира и движения зверей до первого кадра (в безголовом снимке мир живёт ~1 с)
if (qs.get('qa') === 'dry') {
  world.step(0); world.step(0); world.debugSpawn('cormorant'); visual.synced = false;
  const eco = world.sim.eco, cs = eco.agents.filter(a => a.species === 'cormorant'), b = cs[cs.length - 1];
  eco.agents = eco.agents.filter(a => a.species !== 'cormorant' || a === b);   // единственный — не отправят улетать «лишним»
  b.state = 'dry'; b.dryLeft = 1e9;
}
// &qa=crabs — четыре краба и медуза на песке на одном берегу почти в одной точке; &qa=lionswim — морской лев плывёт
if (qs.get('qa') === 'crabs') {
  world.step(0); world.step(0); for (const k of ['crab', 'crab', 'crab', 'crab', 'stranded']) world.debugSpawn(k); visual.synced = false;
  world.sim.eco.agents.filter(a => a.species === 'crab' || a.stranded).forEach((a, i) => { a.site = 0; a.x = .62 + i * .006; a.life = 1e9; a.tAct = 1e9; a.c = { ...a.c, drift: 0 }; });
}
if (qs.get('qa') === 'lionswim') {
  world.step(0); world.step(0); world.debugSpawn('sea_lion'); visual.synced = false;
  for (const a of world.sim.eco.agents) if (a.species === 'sea_lion') { a.away = 1e9; a.rafty = 0; a.life = 1e9; }
}
for (let i = 0, n = Math.min(600, +qs.get('pre') * 10 || 0); i < n; i++) { world.step(.1); for (const o of visual.agents.values()) visual._stepAgent(o, .1); visual._separate(.1); }

// --- экран входа: запускает AudioContext по нажатию (нужен жест) ---
const gate = document.querySelector('#gate');
// телефон — на весь экран. Браузер разрешает это только по нажатию: при входе в океан и кнопкой #fs, которая
// появляется, когда телефон повёрнут горизонтально, а полноэкранного режима нет (сам поворот нажатием не считается).
// На iPhone Safari полноэкранного режима для страниц нет — там кнопки не будет (выход — «На экран Домой»)
const phone = matchMedia('(pointer: coarse)').matches, fsBtn = document.getElementById('fs');
const fsOn = () => document.fullscreenElement || document.webkitFullscreenElement;
const goFull = () => {
  const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
  Promise.resolve(req?.call(el, { navigationUI: 'hide' })).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
};
const fsUpd = () => fsBtn.classList.toggle('show', phone && !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) && !fsOn() && matchMedia('(orientation: landscape)').matches);
fsBtn.addEventListener('click', goFull);
for (const ev of ['resize', 'orientationchange', 'fullscreenchange', 'webkitfullscreenchange']) (ev.includes('full') ? document : window).addEventListener(ev, fsUpd);
fsUpd();
// высота страницы (--app-h, index.html) — то, что реально видно, а не 100dvh: мобильный браузер после входа в полный
// экран с поворотом может считать окно выше экрана на высоту своей панели (~52 px) — нижний ряд кнопок, журнал и
// низ «Обитателей» уезжают за край. Берём меньшее из окна, видимой области и — в полном экране на сенсорном —
// самого экрана. Пересчёт на каждое событие размера и ещё раз через 0.3 и 1 с после смены полного экрана и поворота:
// размер приходит с опозданием, иногда без события
let appH = 0;
const fitH = () => {
  const vv = window.visualViewport;
  let h = Math.min(innerHeight, vv ? vv.height * vv.scale : Infinity);
  if (phone && fsOn()) h = Math.min(h, innerWidth > innerHeight ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height));
  if (!(h > 0) || Math.abs(h - appH) < .5) return;
  appH = h; document.documentElement.style.setProperty('--app-h', h + 'px'); visual.resize();
};
const fitLater = () => { fitH(); setTimeout(fitH, 300); setTimeout(fitH, 1000); };
addEventListener('resize', fitH); window.visualViewport?.addEventListener('resize', fitH);
addEventListener('orientationchange', fitLater);
for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, fitLater);
fitH();

// ?debug=1 — поверх экрана: размеры окна и экрана, полный экран, safe-area, сработавшие медиа-условия раскладки, где
// каждый блок интерфейса (виден ли) и последние события размера — для снимка экрана с телефона. Окно не ловит
// нажатий — «Войти» под ним нажимается как обычно
if (qs.get('debug') === '1') {
  const pre = document.createElement('pre'), probe = document.createElement('div'), t0 = performance.now(), evs = [], n = Math.round;
  pre.style.cssText = 'position:fixed;left:50%;top:0;transform:translateX(-50%);z-index:99;margin:0;padding:3px 6px;max-height:100%;max-width:100%;white-space:pre-wrap;overflow:hidden;' +
    'font:9px/1.22 ui-monospace,Consolas,monospace;letter-spacing:0;text-transform:none;color:#fff;background:rgba(0,0,0,.6);pointer-events:none';
  probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  const units = ['vh', 'dvh', 'svh', 'lvh'].map(u => { const d = document.createElement('div'); d.style.cssText = `position:fixed;left:0;top:0;width:0;height:100${u};visibility:hidden;pointer-events:none`; return [u, d]; });
  document.body.append(pre, probe, ...units.map(u => u[1]));
  const MQ = { 'h≤560': '(max-height: 560px)', 'w≤899': '(max-width: 899px)', 'w≤995&>4:3': '(max-width: 995px) and (min-aspect-ratio: 1001/750)',
    'w≤640&h≤560': '(max-width: 640px) and (max-height: 560px)', '≤4:3&big': '(max-aspect-ratio: 4/3) and (min-height: 561px) and (min-width: 900px)',
    landscape: '(orientation: landscape)', coarse: '(pointer: coarse)', hover: '(hover: hover)', 'display-mode:fullscreen': '(display-mode: fullscreen)' };
  const draw = () => {
    // «виден» — внутри окна и, в полном экране, внутри самого экрана (окно может оказаться выше экрана)
    const vv = window.visualViewport, sa = getComputedStyle(probe), de = document.documentElement, scr = innerWidth > innerHeight ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
    const W = vv ? vv.width : innerWidth, H = Math.min(vv ? vv.height : innerHeight, fsOn() ? scr : Infinity);
    const L = [
      `${((performance.now() - t0) / 1000).toFixed(0)}s  inner ${innerWidth}×${innerHeight}  client ${de.clientWidth}×${de.clientHeight}  dpr ${devicePixelRatio}`,
      vv ? `visualViewport ${vv.width.toFixed(1)}×${vv.height.toFixed(1)} off ${vv.offsetLeft.toFixed(1)},${vv.offsetTop.toFixed(1)} scale ${vv.scale.toFixed(3)}` : 'visualViewport нет',
      `screen ${screen.width}×${screen.height} avail ${screen.availWidth}×${screen.availHeight}  scroll ${scrollX},${scrollY}`,
      `orient ${screen.orientation?.type || '—'} ${screen.orientation?.angle ?? window.orientation ?? ''}  fullscreen ${fsOn() ? 'ДА' : 'нет'}  gate-open ${document.body.classList.contains('gate-open')}`,
      `safe-area t${sa.paddingTop} r${sa.paddingRight} b${sa.paddingBottom} l${sa.paddingLeft}`,
      units.map(([u, d]) => `100${u}=${d.getBoundingClientRect().height.toFixed(1)}`).join(' ') + `  body ${n(document.body.getBoundingClientRect().height)}`,
      'media: ' + Object.entries(MQ).filter(([, q]) => matchMedia(q).matches).map(([k]) => k).join(', '),
      (navigator.userAgent.match(/(EdgA|Edg|Chrome|Firefox|SamsungBrowser|YaBrowser|HuaweiBrowser|Version)\/[\d.]+/g) || [navigator.userAgent]).join(' '),
      ...dbgPerf(),
    ];
    for (const id of ['hud', 'census', 'vol', 'log', 'tod', 'follow', 'fs', 'gate', 'rotate', 'gl']) {
      const el = document.getElementById(id); if (!el) { L.push(`${id.padEnd(6)} нет`); continue; }
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el), shown = cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > .05 && r.width > 0;
      const where = !shown ? 'скрыт' : r.left >= -1 && r.top >= -1 && r.right <= W + 1 && r.bottom <= H + 1 ? 'виден'
        : r.right <= 0 || r.bottom <= 0 || r.left >= W || r.top >= H ? 'ЗА КРАЕМ' : 'ЧАСТЬ ЗА КРАЕМ';
      L.push(`${id.padEnd(6)} ${where.padEnd(14)} ${n(r.left)},${n(r.top)} ${n(r.width)}×${n(r.height)}` + (shown ? '' : `  (${cs.display} ${cs.visibility} ${(+cs.opacity).toFixed(2)})`));
    }
    pre.textContent = L.concat(evs).join('\n');
  };
  const note = ev => {
    evs.push(`${((performance.now() - t0) / 1000).toFixed(2)}s ${ev} → ${innerWidth}×${innerHeight}` + (window.visualViewport ? ` vv ${visualViewport.height.toFixed(0)}` : '') + (fsOn() ? ' FS' : ''));
    if (evs.length > 8) evs.shift(); draw();
  };
  for (const ev of ['resize', 'orientationchange']) addEventListener(ev, () => note(ev));
  for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, () => note(ev));
  window.visualViewport?.addEventListener('resize', () => note('vv.resize'));
  screen.orientation?.addEventListener?.('change', () => note('orientation'));
  document.getElementById('gate-btn').addEventListener('click', () => note('ВОЙТИ'));
  fsBtn.addEventListener('click', () => note('НА ВЕСЬ ЭКРАН'));
  setInterval(draw, 500); setTimeout(draw, 0);   // после разбора модуля — draw читает качество и кадры (объявлены ниже)
}
// ?debug=1 — ещё ход загрузки (шаг, сколько длился, итог), память (оценка) и кадры: частота, время кадра, худшие 1%,
// качество, разрешение отрисовки, вызовы отрисовки, треугольники
let memT = 0, memS = '';
function dbgPerf() {
  const L = [], n = Math.min(ftI, ft.length), a = Array.from(ft.subarray(0, n)).sort((x, y) => x - y);
  if (n) { const avg = a.reduce((x, y) => x + y, 0) / n, p99 = a[Math.min(n - 1, Math.floor(n * .99))];
    const cv = visual.renderer.domElement, db = { x: cv.width, y: cv.height }, d = visual.drawn || {};   // размер холста = буфер отрисовки
    L.push(`кадр ${(1000 / avg).toFixed(0)} к/с  ${avg.toFixed(1)} мс  худшие 1% ${p99.toFixed(0)} мс  качество ${qMode}${qMode === 'auto' ? ' ступень ' + qLevel : ''}`,
      `отрисовка ${db.x}×${db.y} (×${visual.renderer.getPixelRatio().toFixed(2)}${visual.rt.samples ? ', MSAA ' + visual.rt.samples : ''})  вызовов ${d.calls ?? '—'}  треуг. ${d.tris ? (d.tris / 1000).toFixed(0) + 'k' : '—'}  шейдеров ${visual.renderer.info.programs?.length ?? '—'}`); }
  if (performance.now() - memT > 2000) { memT = performance.now();
    try { const m = visual.memEstimate(), heap = performance.memory?.usedJSHeapSize;
      memS = `память ~ звук ${audio.memMB().toFixed(0)} МБ · текстуры ${m.tex.toFixed(0)} · геометрии ${m.geo.toFixed(0)} · буфер кадра ${m.rt.toFixed(0)}` + (heap ? ` · куча JS ${(heap / 1048576).toFixed(0)} МБ` : ''); } catch { memS = 'память — нет данных'; } }
  L.push(memS, `deviceMemory ${device.mem ?? 'нет'}  лёгкое: ${qMode === 'lite' ? 'ДА' : 'нет'}${autoLite ? ' (авто)' : ''}${lastBootFailed ? '  прошлый вход не дошёл до мира' : ''}  звук облегч. ${audio.lite ? 'да' : 'нет'}  звук готов ${audio.ready ? 'да' : 'нет'}`);
  L.push('загрузка: ' + steps.map(x => `${x.name} ${x.t1 ? ((x.t1 - x.t0) / 1000).toFixed(1) + ' с' : ((performance.now() - x.t0) / 1000).toFixed(0) + ' с…'}${x.st !== 'готово' && x.t1 ? ' ' + x.st.toUpperCase() : ''}${x.note ? ' (' + x.note + ')' : ''}`).join(' | '));
  return L;
}

// --- уход экрана входа: вуаль тает, размытие снимается — мир становится чётким; карточка «рассыпается»: её стирает
// слева направо, край дробится шумом (SVG-фильтр #dust), из стирающегося края разлетаются частицы. На телефоне, при
// «Низком» качестве и при «меньше движения» в системе — просто плавно растворяется (simple — сразу так)
// интерфейс мира (панели, кнопки внизу, подпись) скрыт, пока открыт вход (body.gate-open, index.html), и проявляется,
// когда карточка уже рассыпалась/растворилась
const showUI = () => document.body.classList.remove('gate-open');
const leaveGate = simple => {
  if (!gate.isConnected || gate.classList.contains('clear')) return;
  const card = gate.querySelector('#gate-card');
  gate.classList.add('clear');
  if (simple || phone || matchMedia('(prefers-reduced-motion: reduce)').matches || qMode === 'low' || qMode === 'lite') {
    card.classList.add('fade'); setTimeout(showUI, 800); setTimeout(() => gate.remove(), 1200); return;
  }
  const r = card.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), cv = Object.assign(document.createElement('canvas'), { id: 'gate-dust' });
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; document.body.appendChild(cv);
  const g = cv.getContext('2d'), disp = document.getElementById('dust-disp'), COL = ['#d3dcd3', '#92bfbd', '#eef4ee', '#6a8a80'];
  // ход растворения копится по кадрам, не больше 0.15 с за кадр: при 60 и 30 кадрах/с — те же 1.4 с, долгий кадр сразу
  // после входа не «съедает» анимацию, а на совсем медленном устройстве она всё равно заканчивается не позже чем через
  // 4 с — интерфейс не ждёт дольше
  const parts = [], DUR = 1.4; let u = 0, last = performance.now(); const tEnd = last + 4000;
  card.style.filter = 'url(#dust)';
  const tick = now => {
    const step = Math.max(0, now - last) / 1000, dt = Math.min(.05, step); last = now;
    u = now >= tEnd ? 1 : Math.min(1, u + Math.min(.15, step) / DUR);
    if (u >= 1) showUI();   // карточка стёрта целиком — интерфейс проявляется (частицы ещё догорают)
    const m = -.2 + u * 1.45, mask = `linear-gradient(100deg, transparent ${(m * 100).toFixed(1)}%, #000 ${(m * 100 + 24).toFixed(1)}%)`;
    card.style.webkitMaskImage = card.style.maskImage = mask;
    disp.setAttribute('scale', (50 * u * u * u).toFixed(1));   // дробление нарастает к концу — пока карточка видна, текст читается
    if (u < 1) for (let i = 0; i < 16; i++) {   // из стирающегося края — частицы
      const x = r.left + (m + .12 + Math.random() * .1) * r.width; if (x < r.left || x > r.right) continue;
      parts.push({ x, y: r.top + Math.random() * r.height, vx: 40 + Math.random() * 120, vy: -15 - Math.random() * 60, a: 0, life: .8 + Math.random() * .9,
        s: 1 + Math.random() * 1.8, c: COL[(Math.random() * COL.length) | 0] });
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.a += dt; if (p.a >= p.life) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 20 * dt; p.vx *= 1 - dt * .6;
      g.globalAlpha = (1 - p.a / p.life) * .9; g.fillStyle = p.c; g.fillRect(p.x, p.y, p.s, p.s);
    }
    if (u < 1 || parts.length) requestAnimationFrame(tick); else { cv.remove(); gate.remove(); }
  };
  requestAnimationFrame(tick);
};

// вход не ждёт дольше 8 с и не останавливается на ошибке: не успел звук — мир открывается без него, звук догоняет
// сам (audio.ready); не вышло совсем — мир без звука, а любое следующее нажатие пробует включить звук снова
let entering = false;
const enter = async () => {
  audio.unlock();   // звук — первым делом и до любого await (iPhone включает звук только так)
  if (phone) goFull();   // до первого await — пока браузер считает это нажатием
  if (entering) return; entering = true;
  markBoot(true);   // снимается, когда мир уже 8 с на экране — иначе следующая загрузка начнётся в «Лёгком»
  gate.querySelector('#gate-btn').textContent = 'Открываю иллюминатор…';
  const st = step('вход');
  try { await within(audio.start(), 8000, 'звук'); st.done(); }
  catch (e) { st.done(e?.timeout ? 'long' : false, e?.message); console.warn('океан пока без звука:', e?.message || e); }
  leaveGate(); setTimeout(() => markBoot(false), 8000);
};
gate.querySelector('#gate-btn').addEventListener('click', enter);
// iPhone останавливает звук при блокировке экрана, звонке, уходе в другое приложение («interrupted») и снова
// включить его разрешает только по нажатию — будим звук на любое касание/клавишу после входа; звук не включился
// при входе (ошибка, а не долгая загрузка) — пробуем снова на нажатие
for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, () => {
  if (audio.ready) audio.unlock(); else if (entering && !gate.isConnected && !audio._starting) audio.start().catch(() => {});
}, { capture: true, passive: true });

// ход загрузки на экране входа — полоска и что сейчас грузится; шаг упал или идёт дольше 20 с — понятная надпись и
// кнопка «Войти в облегчённом режиме» (сразу «Лёгкое» качество и вход)
{
  const box = document.getElementById('gate-load'), bar = box.querySelector('i'), txt = box.querySelector('span'), liteBtn = document.getElementById('gate-lite');
  const last = n => { let r = null; for (const x of steps) if (x.name === n) r = x; return r; };
  const part = x => !x ? 0 : x.t1 ? 1 : (m => m ? m[1] / m[2] : 0)(/(\d+) из (\d+)/.exec(x.note));
  const show = () => {
    if (!gate.isConnected) return;
    const M = last('модели'), S = last('шейдеры'), A = last('звук: прибой');
    bar.style.width = (100 * (entering ? part(M) * .5 + part(S) * .25 + part(A) * .25 : (part(M) * .5 + part(S) * .25) / .75)).toFixed(0) + '%';
    const now = steps.filter(x => !x.t1).map(x => x.name + (x.note ? ' ' + x.note : ''));
    const bad = steps.filter(x => x.st === 'ошибка' || (!x.t1 && performance.now() - x.t0 > 20000));
    txt.textContent = bad.length ? 'Загрузка идёт с трудом: ' + bad.map(x => x.name).join(', ') + '. Можно войти в облегчённом режиме.'
      : now.length ? 'Загружается: ' + now.join(' · ') : 'Океан готов';
    liteBtn.hidden = !bad.length || qMode === 'lite';
  };
  boot.onChange = show; const tick = setInterval(() => gate.isConnected ? show() : clearInterval(tick), 1000); show();
  liteBtn.addEventListener('click', () => { setQMode('lite', true); enter(); });
}
// код океана запустился — запасное сообщение из index.html не нужно (если медленный телефон успел его показать — убираем)
window.__abyssonataReady = true; document.getElementById('gate-err')?.remove(); gate.querySelector('#gate-btn').style.display = '';
// &noaudio=1 — без Web Audio (для снимков в безголовом браузере, там AudioContext.resume() виснет)
if (qs.get('noaudio') === '1') leaveGate(true);

// прежнее имя проекта — настройки под ключами om.* переносим в abyssonata.*, чтобы громкость, качество картинки
// и линза не сбросились
try {
  for (const k of ['vol.nature', 'vol.music', 'quality', 'lens']) {
    const old = localStorage.getItem('om.' + k); if (old === null) continue;
    if (localStorage.getItem('abyssonata.' + k) === null) localStorage.setItem('abyssonata.' + k, old);
    localStorage.removeItem('om.' + k);
  }
} catch { /* приватное окно — не страшно */ }
// --- громкость: «Природа» управляет всеми звуками мира, «Музыка» — музыкой и абстрактным слоем
// (audio._abstract). Положение полосок запоминается в браузере
{
  const load = k => { try { const v = localStorage.getItem(k); return v === null ? null : +v; } catch { return null; } };
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* приватное окно — не страшно */ } };
  for (const [id, key, apply] of [['nature', 'abyssonata.vol.nature', v => audio.setNature(v / 100)], ['music', 'abyssonata.vol.music', v => audio.setMusic(v / 100)]]) {
    const el = document.getElementById('vol-' + id), out = document.getElementById('v-' + id), v0 = load(key);
    if (v0 !== null) el.value = v0;
    const upd = () => { out.textContent = el.value; apply(+el.value); save(key, el.value); };
    el.addEventListener('input', upd); upd();
  }
}

// --- панели: сворачиваются нажатием на заголовок; на маленьком экране (телефон горизонтально) «Состояние» и
// «Журнал» сразу свёрнуты — океан главнее
for (const p of document.querySelectorAll('.panel')) p.querySelector('h2')?.addEventListener('click', () => p.classList.toggle('min'));
// только телефон
if (matchMedia('(pointer: coarse) and (max-height: 560px), (pointer: coarse) and (max-width: 760px)').matches) for (const id of ['hud', 'log']) document.getElementById(id).classList.add('min');

// --- подсказки «Состояния»: что значит параметр — при наведении мышью на название, на телефоне — по нажатию
// (повторное нажатие или касание в другом месте — убрать; сама уходит через 7 с)
{
  const hint = document.getElementById('hint'); let at = null, tmo = 0;
  const show = el => {
    at = el; hint.textContent = el.dataset.tip; hint.classList.add('show');
    const r = el.getBoundingClientRect(), p = document.getElementById('hud').getBoundingClientRect();
    hint.style.left = Math.min(p.right + 10, innerWidth - hint.offsetWidth - 8) + 'px';
    hint.style.top = Math.max(8, Math.min(r.top - 6, innerHeight - hint.offsetHeight - 8)) + 'px';
    clearTimeout(tmo); tmo = setTimeout(hide, 7000);
  };
  const hide = () => { at = null; hint.classList.remove('show'); };
  let kind = '';   // тип указателя — из pointerdown (у click в старых Safari его нет)
  for (const el of document.querySelectorAll('#hud [data-tip]')) {
    el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') show(el); });
    el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(); });
    el.addEventListener('pointerdown', e => { kind = e.pointerType; });
    el.addEventListener('click', e => { if (kind === 'mouse') return; e.stopPropagation(); at === el ? hide() : show(el); });
  }
  addEventListener('pointerdown', e => { if (at && !e.target.closest?.('#hud [data-tip]')) hide(); });
}

// --- время суток: 4 кнопки (утро/день/вечер/ночь) по-настоящему двигают часы живого мира (не предпросмотр):
// погода/волны/существа продолжают жить с нового момента (world.setTimeOfDay).
const todButtons = document.querySelectorAll('#tod button[data-tod]');
// выделена кнопка той части суток, что сейчас в мире (границы — посередине между кнопками), а не только нажатая
const markTod = tod => { const k = tod < .15 || tod >= .87 ? 0 : tod < .39 ? 1 : tod < .61 ? 2 : 3; todButtons.forEach((b, i) => b.classList.toggle('active', i === k)); };
todButtons.forEach(btn => btn.addEventListener('click', () => {
  world.setTimeOfDay(parseFloat(btn.dataset.tod));
  markTod(parseFloat(btn.dataset.tod));
  // на паузе — сразу показать новый момент (мир при этом стоит): часы симуляции сдвинуты, но небо, свет и панель
  // пересчитываются только шагом мира. Нулевой шаг даёт ровно то, что дал бы следующий обычный шаг
  // (рассвет/звёзды/дождь — события на новый момент); картинка — сразу, без плавного перехода
  if (paused) { visual.snapped = false; try { world.step(0); } catch (e) { console.error('world step failed', e?.stack || e); } visual.hud(); }
}));
world.onState(m => { if ((markTod.n = (markTod.n || 0) + 1) % 30 === 0) markTod(m.time_of_day); });   // раз в ~0.5 с

// --- пауза: кнопка «Пауза» и пробел. Мир не считается, звук приостановлен, журнал не пополняется, звери и вода
// замирают; камеру можно крутить и приближать (visual.frame получает шаг мира 0 и настоящий шаг кадра)
let paused = false;
const pauseBtn = document.getElementById('pause');
const setPaused = p => {
  paused = p; visual.paused = p; audio.setPaused(p);
  try { if (navigator.mediaSession) navigator.mediaSession.playbackState = p ? 'paused' : 'playing'; } catch { /* нет — не страшно */ }
  const sp = document.getElementById('sndonly-pause'); if (sp) sp.textContent = p ? 'Дальше' : 'Пауза';
  pauseBtn.classList.toggle('on', p); pauseBtn.textContent = p ? 'Дальше' : 'Пауза'; pauseBtn.title = (p ? 'Продолжить' : 'Пауза') + ' (пробел)';
};
pauseBtn.addEventListener('click', () => setPaused(!paused));
// бестиарий (bestiary.js) — открытый ставит мир на паузу; вид найден — когда навёлся, выбрал или следил (visual.onDiscover)
const bestiary = initBestiary({ pause: on => { const was = paused; setPaused(on); return was; } });
visual.onDiscover = sp => bestiary.discover(sp);
// слежение за зверем — камера крутится вокруг него и приближается; отпустить — «✕» на плашке или Esc
document.querySelector('#follow button').addEventListener('click', () => visual.unfollow());
addEventListener('keydown', e => { if (e.key === 'Escape') visual.unfollow(); });
addEventListener('keydown', e => {
  if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (document.querySelector('#gate:not(.clear)') || bestiary.open) return;   // до входа пробел нажимает «Войти», не пауза; в бестиарии мир стоит
  e.preventDefault(); setPaused(!paused);   // и не «нажимаем» кнопку, на которой фокус
});

let last = performance.now(), hudT = 0, wt = last / 1000;   // wt — время мира (на паузе стоит)
// --- качество картинки: «Авто / Высокое / Низкое / Лёгкое» в настройках, выбор запоминается в браузере.
// Высокое — разрешение basePR (до ×1.5 на телефоне, до ×2 на ПК) и сглаживание. Низкое и Лёгкое — не ниже ×1.15 и ×1.0
// точки на пиксель экрана, без сглаживания, растений 60% / 40% (life — доля растений, светлячков и мотыльков;
// раскладка случайная — редеют равномерно). Лёгкое — для устройств с малой памятью: текстуры моделей до 256 точек,
// звук облегчённый с выгрузкой давно не звучавших записей. На телефоне (сенсорный экран) Высокое — сглаживание 2×
const kAt = pr => Math.min(1, pr / visual.basePR);
// (на глаз не отличить от 4×) и 65% растений: запас к 60 к/с на средней видеокарте. ?aa=4 / 2 / 0 — сглаживание
// вручную. В снимках с &lowres качество не меняется.
const AA = qs.get('aa'), MSAA = AA !== null ? (+AA || false) : device.touch ? 2 : true, LIFE = device.touch ? .65 : 1;
const Q = { high: { k: 1, msaa: MSAA, life: LIFE }, low: { k: kAt(1.15), msaa: false, life: .6 },
  lite: { k: kAt(1), msaa: false, life: .4, lite: true } };
// «Авто» — 6 ступеней: разрешение (k от basePR, но не ниже одной точки на пиксель экрана — ниже картинка «мылится»),
// сглаживание только на первой, доля растений и огоньков (life). Уровень — по настоящему времени кадра, решение раз
// в 1.5 с: цель — 60 к/с; медиана кадра хуже цели на 25% или каждый 10-й кадр вдвое дольше — ступень ниже сразу.
// Ступень ниже не дала хотя бы 10% — упираемся не в картинку (процессор, предел 30 к/с в режиме экономии): шаг
// назад и дальше не снижаем. Выше — после 8 с ровной работы и не раньше 20 с после понижения; ступень, где дважды
// не справились, больше не пробуем. Звук разгружается (audio.weak) с 4-й ступени «Авто» или после двух плохих окон
// подряд на ручном качестве
const kMin = Math.min(1, 1 / visual.basePR);
const AUTO = [[1, 1], [1, 1], [.85, 1], [.75, .8], [.67, .6], [.67, .4]].map(([k, life], i) => ({ k: Math.max(kMin, k), msaa: i === 0 && MSAA, life: Math.min(life, LIFE) }));
let qMode = 'auto'; try { qMode = localStorage.getItem('abyssonata.quality') || 'auto'; } catch { /* приватное окно */ }
if (!Q[qMode] && qMode !== 'auto') qMode = 'auto';
if (startLite) qMode = 'lite';   // само — не запоминаем (выбор в настройках важнее, см. boot.js)
const autoQ = !qs.has('lowres'); let qLevel = 0, aT = -5, aWin = [], aGood = 0, aDownT = -1e9, aClock = 0, aBad = 0, aPrev = 0, aLock = false;
const aFail = AUTO.map(() => 0);
const applyQ = () => { if (autoQ) visual.setQuality(qMode === 'auto' ? AUTO[qLevel] : Q[qMode]); };
const setQMode = (m, user = false) => {
  // смена выбора — 3 с не считаем кадры; при запуске остаётся −5 (первые 5 с после входа)
  qMode = m; qLevel = 0; aT = Math.min(aT, -3); aWin = []; aGood = aBad = aPrev = 0; aLock = false; aFail.fill(0); applyQ();
  if (m === 'lite') { audio.lite = audio.tiny = true; }
  if (user) try { localStorage.setItem('abyssonata.quality', m); localStorage.setItem('abyssonata.quality.user', '1'); } catch { /* приватное окно */ }
  document.querySelectorAll('#quality button').forEach(b => b.classList.toggle('active', b.dataset.q === m));
};
let benchHold = false;   // ?bench — на время замера «Авто» не трогает качество
const watchFps = raw => {
  if (!autoQ || benchHold || document.hidden || paused || (!audio.ready && document.querySelector('#gate'))) return;   // до входа — не считаем
  aClock += raw; aT += raw; if (aT < 0) return;   // первые 5 с после входа и 2 с после смены ступени — не считаем
  aWin.push(raw); if (aT < 1.5) return;
  const b = aWin.sort((x, y) => x - y), q = p => b[Math.min(b.length - 1, Math.floor(p * b.length))];
  const tgt = 1 / 60, sc = q(.75), bad = q(.5) > tgt * 1.25 || q(.9) > tgt * 2, good = q(.5) < tgt * 1.08 && q(.9) < tgt * 1.5;
  aT = 0; aWin = [];
  if (qMode !== 'auto') { aBad = bad ? aBad + 1 : 0; if (aBad >= 2) audio.weak = true; return; }
  if (!bad) aPrev = 0;
  if (bad && aPrev && sc > aPrev * .9) {   // прошлая ступень вниз не помогла — вернуть и больше не снижать
    aLock = true; aPrev = 0; aFail[--qLevel] = 0; aT = -2; applyQ(); console.info(`[quality] ниже — не легче (кадр ${(q(.5) * 1000).toFixed(0)} мс): ступень ${qLevel}, дальше не снижаю`);
  } else if (bad && !aLock && qLevel < AUTO.length - 1) {
    aPrev = sc; aFail[qLevel]++; qLevel++; aDownT = aClock; aGood = 0; aT = -2; applyQ();
    if (qLevel >= 3) audio.weak = true;
    console.info(`[quality] кадр ${(q(.5) * 1000).toFixed(0)} мс (цель ${(tgt * 1000).toFixed(0)}) — ступень ${qLevel}`);
  } else if (good) {
    aGood += 1.5;
    if (aGood >= 8 && qLevel > 0 && aClock - aDownT > 20 && aFail[qLevel - 1] < 2) { qLevel--; aGood = 0; aT = -2; applyQ(); console.info(`[quality] запас есть — ступень ${qLevel}`); }
  } else aGood = 0;
};
document.querySelectorAll('#quality button').forEach(b => b.addEventListener('click', () => setQMode(b.dataset.q, true)));
setQMode(qMode);
// ?bench=1 — замер «что сколько стоит» на самом устройстве (bench.js): сам, через 4 с после входа в мир
if (qs.get('bench') === '1' || qs.get('bench') === '2') (async () => {   // 2 — короткий прогон (главные строки)
  while (document.querySelector('#gate:not(.clear)') || !visual.assets) await new Promise(r => setTimeout(r, 500));
  await new Promise(r => setTimeout(r, 4000));
  (await import('./bench.js')).runBench({ visual, world, setPaused, high: Q.high, short: qs.get('bench') === '2', hold: on => { benchHold = on; } });
})();
// потеря контекста WebGL (не хватило видеопамяти): надпись поверх мира; браузер вернул контекст — картинка снова
// рисуется, качество на ступень ниже («Авто» — следующая ступень, иначе «Лёгкое»); не вернул за 6 с — кнопка перезапуска
// страницы в «Лёгком»
{
  const box = document.getElementById('gl-lost'), msg = box.querySelector('p'), btn = box.querySelector('button'); let tmo = 0;
  visual.onLost = () => {
    const st = step('картинка: контекст потерян'); visual._lostStep = st;
    msg.textContent = 'Устройству не хватило памяти для картинки — восстанавливаю…'; btn.hidden = true; box.hidden = false;
    clearTimeout(tmo); tmo = setTimeout(() => { if (visual.lost) { msg.textContent = 'Картинка не восстановилась.'; btn.hidden = false; } }, 6000);
  };
  visual.onRestored = () => {
    visual._lostStep?.done(); clearTimeout(tmo); box.hidden = true;
    if (qMode === 'auto' && qLevel < AUTO.length - 1) { qLevel++; applyQ(); } else if (qMode !== 'lite') setQMode('lite');
    else applyQ();
  };
  btn.addEventListener('click', () => { try { localStorage.setItem('abyssonata.quality', 'lite'); localStorage.setItem('abyssonata.quality.user', '1'); } catch { /* приватное окно */ } location.reload(); });
}
const ft = new Float32Array(300); let ftI = 0;   // последние 300 кадров (мс) — для ?debug=1
let rafOn = true;
function frame(now) {
  if (soundOnly) { rafOn = false; return; }   // «Только звук»: кадры не рисуются вовсе, мир ведёт фоновый таймер
  requestAnimationFrame(frame);   // первым делом — ошибка ниже не должна остановить цикл
  visual.bg = false;
  // метка первого кадра бывает РАНЬШЕ performance.now() при загрузке — без нижней границы шаг выходит
  // отрицательным, и мир с панелью «отматываются назад»
  const raw = (now - last) / 1000, dt = Math.max(0, Math.min(raw, .1)); last = now;
  if (raw > 0 && raw < 1) { watchFps(raw); ft[ftI++ % ft.length] = raw * 1000; }
  // одна ошибка (в мире или в отрисовке) не должна насовсем остановить requestAnimationFrame-цикл
  const wdt = paused ? 0 : dt; wt += wdt;
  if (!paused) try { world.step(dt); } catch (e) { console.error('world step failed', e?.stack || e); }
  try { audio.prox = visual.proximity(); } catch { /* до загрузки сцены */ }   // насекомые слышны, только когда камера у острова
  try { visual.frame(wdt, wt, dt); hudT += wdt; if (hudT > .25) { hudT = 0; visual.hud(); } }
  catch (e) { console.error('render frame failed', e?.stack || e); }
}
requestAnimationFrame(frame);

// ?fire=whale_blow,gull_dive,… — проверка звука и картинки событий: после входа выпускает такие же события, какие даёт
// мир (от настоящего зверя нужного вида, в журнале — с пометкой «проверка»), по одному раз в 2 с и по кругу. Только с
// этим параметром; сама симуляция не меняется. Зверей вызвать — ?spawn=, камера за ними — ?follow=
if (qs.has('fire')) {
  const FIRE = {
    whale_blow: ['whale', 'whale_blow', 'blow', 'кит шумно выдохнул фонтаном'],
    whale_song: ['whale', 'whale', 'song', 'кит издаёт низкий зов'],
    whale_slap: ['whale', 'dive_splash', 'tailslap', 'кит хлопнул хвостом по воде'],
    dolphin_jump: ['dolphin', 'jump_splash', 'jump', 'дельфин выпрыгнул из воды'],
    dolphin_whistle: ['dolphin', 'dolphin', 'whistle', 'дельфин свистит'],
    gull: ['seagull', 'seagull', 'call', 'чайка кричит над водой'],
    gull_dive: ['seagull', 'dive_splash', 'dive', 'чайка нырнула за рыбой'],
    flying_fish: ['fish_school', 'flying_fish', 'jump', 'летучая рыба выпрыгнула из воды'],
    spray: [null, 'splash', '', 'брызги долетели до берега'],
    thunder: [null, 'thunder', '', 'гром'],
  };
  const codes = qs.get('fire').split(',').map(c => c.trim()).filter(c => FIRE[c]);
  let i = 0, side = 0;
  const fire = () => {
    setTimeout(fire, i % codes.length === codes.length - 1 ? 8000 : 2000);
    const [sp, type, act, text] = FIRE[codes[i++ % codes.length]];
    if ((!audio.ready && !qs.has('noaudio')) || paused || !codes.length) return;
    const o = sp && [...visual.agents.values()].find(q => q.sp === sp && !q.gone);
    if (sp && !o) return;   // такого зверя сейчас нет — ждём (?spawn=)
    world._emit({ kind: 'event', timestamp: 0, time: visual.timeLabel || '', type, act, text: 'проверка: ' + text, intensity: .8, duration: 2,
      panorama: [.25, .5, .75][side++ % 3], distance: sp ? .3 : .12, agent: o ? o.id : 0, voice: o ? o.id * 7919 : 0 });
  };
  if (codes.length) setTimeout(fire, 3000);
}

// --- мир живёт и звучит, когда картинка не рисуется: вкладка скрыта или свёрнута, режим «Только звук». В скрытой вкладке
// requestAnimationFrame не вызывается, а таймеры страницы замедляются — шаги задаёт таймер в Web Worker (его браузер не
// тормозит). Мир догоняет настоящее время шагами по 1/60 с — тот же код симуляции, что и в кадре; больше 1 с за раз не
// догоняет (страницу морозили — мир продолжается с того же места, без пачки событий и звуков разом). Пауза — стоит
let soundOnly = false, bgAcc = 0;
const BG_STEP = 1 / 60, BG_MAX = 1;
try {
  const bgTick = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 100)'], { type: 'text/javascript' })));
  bgTick.onmessage = () => {
    if (!document.hidden && !soundOnly) return;   // картинка рисуется — мир ведёт кадр
    const now = performance.now(); bgAcc = Math.min(bgAcc + Math.max(0, now - last) / 1000, BG_MAX); last = now;
    visual.bg = true;
    if (paused) { bgAcc = 0; return; }
    try { for (; bgAcc >= BG_STEP; bgAcc -= BG_STEP) { world.step(BG_STEP); wt += BG_STEP; } } catch (e) { console.error('world step failed', e?.stack || e); }
  };
} catch { /* без Web Worker — как раньше: пока вкладка скрыта, мир стоит */ }

// «Только звук»: картинка не рисуется (холст спрятан), поверх — тёмный экран с именем; мир и звук идут дальше
{
  const box = document.getElementById('sndonly'), stage = document.getElementById('stage');
  const set = on => {
    soundOnly = on; box.hidden = !on; stage.style.visibility = on ? 'hidden' : '';
    if (!on && !rafOn) { rafOn = true; last = performance.now(); requestAnimationFrame(frame); }
  };
  document.getElementById('snd-btn').addEventListener('click', () => set(true));
  document.getElementById('sndonly-back').addEventListener('click', () => set(false));
  document.getElementById('sndonly-pause').addEventListener('click', () => setPaused(!paused));
}

// медиа-сессия: на телефоне в шторке — «Abyssonata» и кнопка паузы (пока звук играет), в фоне в том числе
try {
  if (navigator.mediaSession && window.MediaMetadata) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: 'Abyssonata', artist: 'живой океан' });
    navigator.mediaSession.setActionHandler('play', () => setPaused(false));
    navigator.mediaSession.setActionHandler('pause', () => setPaused(true));
  }
} catch { /* нет — не страшно */ }

// --- интерфейс «жидкое стекло»: под курсором панель/кнопка подтекает и бликует (SVG-фильтр #lens).
// один фильтр на страницу — линза одновременно на одном элементе; убрать эффект — удалить этот блок.
{
  const R = 75, c = document.createElement('canvas'); c.width = c.height = 96;
  const x = c.getContext('2d'), img = x.createImageData(96, 96);
  for (let j = 0; j < 96; j++) for (let i = 0; i < 96; i++) {
    const dx = (i + .5) / 48 - 1, dy = (j + .5) / 48 - 1, r = Math.hypot(dx, dy);
    // капля: в центре почти плоско, к краю сильное смещение к центру — как толстое стекло
    const f = r < 1 ? Math.sin(Math.min(1, r) * Math.PI) ** 1.6 : 0, k = (j * 96 + i) * 4;
    img.data[k] = 128 - dx / (r || 1) * f * 120; img.data[k + 1] = 128 - dy / (r || 1) * f * 120; img.data[k + 2] = 128; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const map = document.getElementById('lens-map'), light = document.getElementById('lens-light'), noise = document.getElementById('lens-noise');
  map.setAttribute('href', c.toDataURL()); map.setAttribute('width', 2 * R); map.setAttribute('height', 2 * R);
  // кнопка «Линза» (рядом с «Паузой», выбор запоминается, по умолчанию включена). Выключена — нет ни обработчика
  // движения мыши, ни фильтра на элементах, ни таймера «течения»; включённая — таймер тикает, только пока линза над
  // панелью/кнопкой. На телефоне линзы нет — и кнопки (index.html, pointer: coarse)
  let cur = null, t = 0, timer = 0, lensOn = true;
  const flow = () => { t += .05; noise.setAttribute('baseFrequency', (0.012 + 0.004 * Math.sin(t)).toFixed(4)); };   // лёгкое «течение»
  const put = el => {
    if (el === cur) return;
    if (cur) cur.style.filter = '';
    cur = el; if (el) el.style.filter = 'url(#lens)';
    if (el && !timer) timer = setInterval(flow, 60); else if (!el && timer) { clearInterval(timer); timer = 0; }
  };
  const move = ev => {
    if (ev.pointerType !== 'mouse') return;   // на телефоне линзы нет — под пальцем она оставалась бы, и всё «плыло»
    const el = ev.target.closest?.('.panel, #tod button, #gate-btn');
    put(el);
    if (el) {
      const b = el.getBoundingClientRect(), mx = ev.clientX - b.left, my = ev.clientY - b.top;
      map.setAttribute('x', mx - R); map.setAttribute('y', my - R);
      light.setAttribute('x', mx); light.setAttribute('y', my);
    }
  };
  const lensBtn = document.getElementById('lens-btn');
  const setLens = on => {
    lensOn = on; lensBtn.classList.toggle('on', on); lensBtn.setAttribute('aria-pressed', on);
    if (on) addEventListener('pointermove', move); else { removeEventListener('pointermove', move); put(null); }
    try { localStorage.setItem('abyssonata.lens', on ? '1' : '0'); } catch { /* приватное окно */ }
  };
  lensBtn.addEventListener('click', () => setLens(!lensOn));
  let saved = null; try { saved = localStorage.getItem('abyssonata.lens'); } catch { /* приватное окно */ }
  setLens(saved !== '0');
}
