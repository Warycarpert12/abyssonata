// Abyssonata — склейка: мир теперь считается прямо в браузере (World оборачивает sim.js),
// один поток данных кормит картинку (Visual) и звук (OceanAudio), поэтому они всегда синхронны.
// Звук стартует по клику (гейт «Войти в океан») — без жеста пользователя браузер звук не запустит.
import { World } from './world.js';
import { Visual } from './visual.js';
import { OceanAudio } from './audio.js';

// v21 QA: &rseed=N — повторяемые случайные числа (одинаковые сцены для снимков «было/стало»); без параметра — как всегда
{ const rs = new URLSearchParams(location.search).get('rseed');
  if (rs !== null) { let r = (+rs * 2654435761) >>> 0; Math.random = () => { r = (r + 0x6D2B79F5) >>> 0; let x = Math.imul(r ^ (r >>> 15), 1 | r); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; } }

// --- место в океане (v17, интернет-версия на колонке, serve_public.py: не больше 30 зрителей одновременно).
// Сначала просим место; пока мест нет — «слишком много людей, подождите», пробуем снова раз в 15 с (модели и звуки
// до этого не качаются). Локальный serve.py про места не знает (404) — тогда просто входим.
// v22: только при запуске с домашнего сервера — статическая сборка (GitHub Pages, APK: метка om-site от build_site.py)
// мест не считает, и запрос давал там красную ошибку в консоли
if (document.querySelector('meta[name="om-site"]')?.content !== 'static' && !location.hostname.endsWith('.github.io')) {
  const gateP = document.querySelector('#gate-card p'), btn = document.querySelector('#gate-btn');
  const join = async () => {
    try {   // v21: не дольше 5 с (AbortController — есть и в старом Safari)
      const ac = new AbortController(), to = setTimeout(() => ac.abort(), 5000);
      const r = await fetch('/api/join', { method: 'POST', signal: ac.signal }); clearTimeout(to);
      return r.ok ? await r.json() : { ok: true, local: true };
    }
    catch { return { ok: true, local: true }; }
  };
  let j = await join();
  if (j.ok === false) {
    window.__omReady = true;   // v21: код работает, просто очередь — запасное сообщение не нужно
    const txt = gateP.textContent; btn.style.display = 'none';
    while (j.ok === false) {
      gateP.textContent = `Сейчас в океане слишком много людей (${j.count} из ${j.limit}). Подождите — страница зайдёт сама, как только освободится место.`;
      await new Promise(r => setTimeout(r, 15000)); j = await join();
    }
    gateP.textContent = txt; btn.style.display = '';
  }
  if (!j.local) {   // держим место, пока страница открыта; уходим — освобождаем
    setInterval(() => fetch('/api/ping', { method: 'POST' }).catch(() => {}), 25000);
    addEventListener('pagehide', () => navigator.sendBeacon('/api/leave'));
  }
}

const stage = document.querySelector('#stage');
const visual = new Visual(stage);
const world = new World();
const audio = new OceanAudio('.');   // v19: пути от страницы — сайт может лежать в подпапке (GitHub Pages)

world.onState(m => visual.onState(m));
world.onEvent(m => visual.onEvent(m));
world.onState(m => { if (audio.ready) audio.update(m); });
// звук события — из той же точки, где его видно на экране (сторона/дальность относительно камеры)
world.onEvent(m => { if (audio.ready) audio.onEvent({ ...m, ...visual.spatial(m) }).catch(e => console.warn('звук события:', e)); });

// местные звуки от картинки: плеск (рифовая рыбка, прыжки из воды), стрекот кузнечика, звуки при приближении
// (бульки, треск креветок, щёлканье краба) — из той точки, где это видно; k — насколько близко (1 — вплотную)
// громкость и высота: креветки и краб звучат выше записи (запись — шипение/щелчки, на них похоже в ускорении)
const LOCAL = { grasshopper: [.09, 1], splash: [.05, 1], bubbles: [.08, 1], shrimp: [.05, 1.05], crab: [.07, 1.5] };   // v14: креветки — настоящая гидрофонная запись, почти без ускорения
visual.onLocalSound = (cat, pos, k = 1) => {
  if (!audio.ready) return;
  const sp = visual.spatialAt(pos), [amp, rate] = LOCAL[cat] || [.05, 1];
  audio.playLocal(cat, sp.panorama, sp.distance, amp * k, rate).catch(e => console.warn('местный звук:', e));
};

const qs = new URLSearchParams(location.search);
// старт всегда днём (раньше был случайный час — можно было попасть на тёмный/тусклый первый
// экран, отсюда была часть жалоб «серый камень»); из URL можно переопределить для QA
const startTod = qs.has('tod') ? parseFloat(qs.get('tod')) : .5;
if (qs.has('qa')) window.__om = { world, visual, audio };   // v22 QA: доступ для автопроверок (только с ?qa в адресе)
const seed = qs.has('seed') ? parseInt(qs.get('seed'), 10) : null;
world.start({ startTod, seed });

// ?spawn=shark,orca,jellyfish,... — вызвать гостя сразу (программный рендер в QA успевает лишь пару первых кадров);
// два нулевых шага: на первом симуляция только снимает начальное состояние, экосистема появляется на втором
if (qs.has('spawn')) { world.step(0); world.step(0); qs.get('spawn').split(',').forEach(k => world.debugSpawn(k.trim())); visual.synced = false; }   // гости — сразу на месте, не из дымки
// v21 QA (только с параметрами в адресе, на обычный мир не влияет): &qa=dry — баклан сразу сушит крылья на камне;
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

// --- гейт входа: запускает AudioContext по клику (обязателен жест пользователя) ---
const gate = document.querySelector('#gate');
// v18: телефон — на весь экран. Браузер разрешает это только по нажатию: при входе в океан и кнопкой #fs, которая
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

// --- уход экрана входа (v22): вуаль тает, размытие снимается — мир становится чётким; карточка «рассыпается»: её стирает
// слева направо, край дробится шумом (SVG-фильтр #dust), из стирающегося края разлетаются частицы. На телефоне, при
// «Низком» качестве и при «меньше движения» в системе — просто плавно растворяется (simple — сразу так)
// v22: интерфейс мира (панели, кнопки внизу, подпись) скрыт, пока открыт вход (body.gate-open, index.html), и проявляется,
// когда карточка уже рассыпалась/растворилась
const showUI = () => document.body.classList.remove('gate-open');
const leaveGate = simple => {
  if (!gate.isConnected || gate.classList.contains('clear')) return;
  const card = gate.querySelector('#gate-card');
  gate.classList.add('clear');
  if (simple || phone || matchMedia('(prefers-reduced-motion: reduce)').matches || qMode === 'low') {
    card.classList.add('fade'); setTimeout(showUI, 800); setTimeout(() => gate.remove(), 1200); return;
  }
  const r = card.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), cv = Object.assign(document.createElement('canvas'), { id: 'gate-dust' });
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; document.body.appendChild(cv);
  const g = cv.getContext('2d'), disp = document.getElementById('dust-disp'), COL = ['#d3dcd3', '#92bfbd', '#eef4ee', '#6a8a80'];
  // ход растворения копится по кадрам, не больше 0.05 с за кадр: при 60 и 30 кадрах/с — те же 1.4 с, а на слабом
  // устройстве долгий кадр сразу после входа не «съедает» анимацию (карточка исчезала разом, без частиц)
  const parts = [], DUR = 1.4; let u = 0, last = performance.now();
  card.style.filter = 'url(#dust)';
  const tick = now => {
    const dt = Math.min(.05, Math.max(0, now - last) / 1000); last = now; u = Math.min(1, u + dt / DUR);
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

const enter = async () => {
  audio.unlock();   // v22: звук — первым делом и до любого await (iPhone включает звук только так)
  if (phone) goFull();   // до первого await — пока браузер считает это нажатием
  const btn = gate.querySelector('#gate-btn');
  btn.textContent = 'Открываю иллюминатор…';
  try {
    await audio.start();
    leaveGate();
  } catch (e) {
    if (e?.noAudio) { console.warn('океан без звука:', e.message); leaveGate(); return; }   // v21
    console.error('audio start failed', e);
    btn.textContent = 'Не вышло — нажми ещё раз';
    const msg = gate.querySelector('#gate-err') || Object.assign(document.createElement('p'), { id: 'gate-err' });
    msg.textContent = String(e?.message || e);
    if (!msg.parentNode) gate.querySelector('#gate-card').appendChild(msg);
  }
};
gate.querySelector('#gate-btn').addEventListener('click', enter);
// v22: iPhone останавливает звук при блокировке экрана, звонке, уходе в другое приложение («interrupted») и снова
// включить его разрешает только по нажатию — будим звук на любое касание/клавишу после входа
for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, () => { if (audio.ready) audio.unlock(); }, { capture: true, passive: true });
// v21: код океана запустился — запасное сообщение из index.html не нужно (если медленный телефон успел его показать — убираем)
window.__omReady = true; document.getElementById('gate-err')?.remove(); gate.querySelector('#gate-btn').style.display = '';
// &noaudio=1 — без Web Audio (для скриншотов/QA в безголовом браузере, там AudioContext.resume() виснет)
if (qs.get('noaudio') === '1') leaveGate(true);

// v22: проект переименован — настройки теперь под ключами abyssonata.*; сохранённые раньше под om.* переносим, чтобы
// громкость, качество картинки и линза не сбросились (сайт остаётся на том же адресе-источнике warycarpert12.github.io)
try {
  for (const k of ['vol.nature', 'vol.music', 'quality', 'lens']) {
    const old = localStorage.getItem('om.' + k); if (old === null) continue;
    if (localStorage.getItem('abyssonata.' + k) === null) localStorage.setItem('abyssonata.' + k, old);
    localStorage.removeItem('om.' + k);
  }
} catch { /* приватное окно — не страшно */ }
// --- громкость (v11): «Природа» управляет всеми звуками мира, «Музыка» — заготовка на будущее (значение хранится,
// но ни на что не влияет). Положение полосок запоминается в браузере
{
  const load = k => { try { const v = localStorage.getItem(k); return v === null ? null : +v; } catch { return null; } };
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* приватное окно — не страшно */ } };
  // v14: «Музыка» заработала — это абстрактный слой, как у образца (audio._abstract)
  for (const [id, key, apply] of [['nature', 'abyssonata.vol.nature', v => audio.setNature(v / 100)], ['music', 'abyssonata.vol.music', v => audio.setMusic(v / 100)]]) {
    const el = document.getElementById('vol-' + id), out = document.getElementById('v-' + id), v0 = load(key);
    if (v0 !== null) el.value = v0;
    const upd = () => { out.textContent = el.value; apply(+el.value); save(key, el.value); };
    el.addEventListener('input', upd); upd();
  }
}

// --- панели (v14): сворачиваются нажатием на заголовок; на маленьком экране (телефон горизонтально) «Состояние» и
// «Журнал» сразу свёрнуты — океан главнее
for (const p of document.querySelectorAll('.panel')) p.querySelector('h2')?.addEventListener('click', () => p.classList.toggle('min'));
if (matchMedia('(pointer: coarse) and (max-height: 560px), (pointer: coarse) and (max-width: 760px)').matches) for (const id of ['hud', 'log']) document.getElementById(id).classList.add('min');   // только телефон

// --- подсказки «Состояния» (v22): что значит параметр — при наведении мышью на название, на телефоне — по нажатию
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

// --- время суток: 4 кнопки (утро/день/вечер/ночь) — по-настоящему двигают часы живого мира
// (не предпросмотр): погода/волны/существа продолжают жить с нового момента. Раньше здесь было
// кольцо-перемотка с драгом по кругу (работало, но убрали по просьбе пользователя — заодно оно
// перехватывало указатель у OrbitControls/наведения, см. CHANGELOG); сам механизм остался в
// world.setTimeOfDay(frac), эти кнопки — просто другой UI поверх него.
const todButtons = document.querySelectorAll('#tod button[data-tod]');
// v22: выделена кнопка той части суток, что сейчас в мире (границы — посередине между кнопками), а не только нажатая
const markTod = tod => { const k = tod < .15 || tod >= .87 ? 0 : tod < .39 ? 1 : tod < .61 ? 2 : 3; todButtons.forEach((b, i) => b.classList.toggle('active', i === k)); };
todButtons.forEach(btn => btn.addEventListener('click', () => {
  world.setTimeOfDay(parseFloat(btn.dataset.tod));
  markTod(parseFloat(btn.dataset.tod));
  // v22: на паузе — сразу показать новый момент (мир при этом стоит): часы симуляции сдвинуты, но небо, свет и панель
  // пересчитываются только шагом мира — без этого кнопка «Ночь» горела, а на экране оставался день. Нулевой шаг даёт
  // ровно то, что дал бы следующий обычный шаг (рассвет/звёзды/дождь — события на новый момент); картинка — сразу, без
  // плавного перехода
  if (paused) { visual.snapped = false; try { world.step(0); } catch (e) { console.error('world step failed', e?.stack || e); } visual.hud(); }
}));
world.onState(m => { if ((markTod.n = (markTod.n || 0) + 1) % 30 === 0) markTod(m.time_of_day); });   // раз в ~0.5 с

// --- пауза (v22): кнопка «Пауза» и пробел. Мир не считается, звук приостановлен, журнал не пополняется, звери и вода
// замирают; камеру можно крутить и приближать (visual.frame получает шаг мира 0 и настоящий шаг кадра)
let paused = false;
const pauseBtn = document.getElementById('pause');
const setPaused = p => {
  paused = p; visual.paused = p; audio.setPaused(p);
  pauseBtn.classList.toggle('on', p); pauseBtn.textContent = p ? 'Дальше' : 'Пауза'; pauseBtn.title = (p ? 'Продолжить' : 'Пауза') + ' (пробел)';
};
pauseBtn.addEventListener('click', () => setPaused(!paused));
// v22: слежение за зверем — камера крутится вокруг него и приближается; отпустить — «✕» на плашке или Esc
document.querySelector('#follow button').addEventListener('click', () => visual.unfollow());
addEventListener('keydown', e => { if (e.key === 'Escape') visual.unfollow(); });
addEventListener('keydown', e => {
  if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (document.querySelector('#gate:not(.clear)')) return;   // до входа пробел — как раньше (нажимает «Войти»), не пауза
  e.preventDefault(); setPaused(!paused);   // и не «нажимаем» кнопку, на которой фокус
});

let last = performance.now(), hudT = 0, wt = last / 1000;   // wt — время мира (на паузе стоит)
// --- качество картинки (v22): «Авто / Высокое / Низкое» в настройках, выбор запоминается в браузере.
// Высокое — полное разрешение (basePR: до ×1.5 на телефоне, до ×2 на ПК) и сглаживание. Низкое — ×0.75 от одной точки на
// пиксель экрана, без сглаживания. Авто — начинает с высокого; если картинка долго ниже ~24 кадров/с, сначала снимает
// сглаживание, потом разрешение не ниже ×0.8 и не ниже одной точки на пиксель экрана (в v21 доходило до ×0.55 — «мыло»
// на Honor 30); только понижает — туда-обратно не переключается. Звук разгружается (audio.weak) как в v21: после двух
// «плохих» ступеней подряд — при любом выборе. В QA-снимках (&lowres) — без изменений
const Q = { high: { k: 1, msaa: true }, low: { k: Math.min(1, 1 / visual.basePR) * .75, msaa: false } };
const AUTO = [Q.high, { k: 1, msaa: false }, { k: Math.max(.8, Math.min(1, 1 / visual.basePR)), msaa: false }];
let qMode = 'auto'; try { qMode = localStorage.getItem('abyssonata.quality') || 'auto'; } catch { /* приватное окно */ }
if (!Q[qMode] && qMode !== 'auto') qMode = 'auto';
const autoQ = !qs.has('lowres'); let fpsT = -5, fpsN = 0, fpsSum = 0, qLevel = 0, strain = 0, badW = 0;
const applyQ = () => { if (autoQ) visual.setQuality(qMode === 'auto' ? AUTO[qLevel] : Q[qMode]); };
const setQMode = m => {
  qMode = m; qLevel = 0; fpsT = -3; fpsN = fpsSum = badW = 0; applyQ();
  try { localStorage.setItem('abyssonata.quality', m); } catch { /* приватное окно */ }
  document.querySelectorAll('#quality button').forEach(b => b.classList.toggle('active', b.dataset.q === m));
};
const watchFps = raw => {
  if (!autoQ || document.hidden || paused || strain >= 2 || (!audio.ready && document.querySelector('#gate'))) return;   // до входа — не считаем
  fpsT += raw; if (fpsT < 0) return;   // первые 5 с после входа — догрузка и распаковка, не считаем
  fpsN++; fpsSum += raw;
  if (fpsT < 3) return;
  badW = fpsSum / fpsN > 1 / 24 ? badW + 1 : 0;   // две плохие трёхсекундные полосы подряд — не разовая заминка
  if (badW >= 2) {
    badW = 0; strain++;
    if (qMode === 'auto' && qLevel < AUTO.length - 1) { qLevel++; applyQ(); }
    if (strain >= 2) audio.weak = true;
    console.info('[quality] слабое устройство — ступень', strain, qMode === 'auto' ? `(картинка: ${qLevel})` : `(картинка: ${qMode}, не меняется)`); fpsT = -2;
  }
  else fpsT = 0;
  fpsN = 0; fpsSum = 0;
};
document.querySelectorAll('#quality button').forEach(b => b.addEventListener('click', () => setQMode(b.dataset.q)));
setQMode(qMode);
function frame(now) {
  requestAnimationFrame(frame);   // v21: первым делом — ошибка ниже не должна остановить цикл
  // метка первого кадра бывает РАНЬШЕ performance.now() при загрузке — без нижней границы шаг выходил
  // отрицательным (в безголовом браузере −0.74 с), и мир с панелью «отматывались назад»
  const raw = (now - last) / 1000, dt = Math.max(0, Math.min(raw, .1)); last = now;
  if (raw > 0 && raw < 1) watchFps(raw);
  // одна ошибка (в мире или в отрисовке) не должна насовсем остановить requestAnimationFrame-цикл
  const wdt = paused ? 0 : dt; wt += wdt;
  if (!paused) try { world.step(dt); } catch (e) { console.error('world step failed', e?.stack || e); }
  try { audio.prox = visual.proximity(); } catch { /* до загрузки сцены */ }   // насекомые слышны, только когда камера у острова
  try { visual.frame(wdt, wt, dt); hudT += wdt; if (hudT > .25) { hudT = 0; visual.hud(); } }
  catch (e) { console.error('render frame failed', e?.stack || e); }
}
requestAnimationFrame(frame);

// --- интерфейс «жидкое стекло»: под курсором панель/кнопка подтекает и бликует (SVG-фильтр #lens).
// ponytail: один фильтр на страницу — линза одновременно на одном элементе; убрать эффект — удалить этот блок.
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
  // v22: кнопка «Линза» (рядом с «Паузой», выбор запоминается, по умолчанию включена). Выключена — нет ни обработчика
  // движения мыши, ни фильтра на элементах, ни таймера «течения». И включённая: таймер тикает, только пока линза над
  // панелью/кнопкой (раньше — всегда, каждые 60 мс). На телефоне линзы нет — и кнопки (index.html, pointer: coarse)
  let cur = null, t = 0, timer = 0, lensOn = true;
  const flow = () => { t += .05; noise.setAttribute('baseFrequency', (0.012 + 0.004 * Math.sin(t)).toFixed(4)); };   // лёгкое «течение»
  const put = el => {
    if (el === cur) return;
    if (cur) cur.style.filter = '';
    cur = el; if (el) el.style.filter = 'url(#lens)';
    if (el && !timer) timer = setInterval(flow, 60); else if (!el && timer) { clearInterval(timer); timer = 0; }
  };
  const move = ev => {
    if (ev.pointerType !== 'mouse') return;   // v18: на телефоне линзы нет — под пальцем она оставалась и всё «плыло»
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
