// Ocean Murmur — склейка: мир теперь считается прямо в браузере (World оборачивает sim.js),
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
{
  const gateP = document.querySelector('#gate-card p'), btn = document.querySelector('#gate-btn');
  const join = async () => {
    try { const r = await fetch('/api/join', { method: 'POST' }); return r.ok ? await r.json() : { ok: true, local: true }; }
    catch { return { ok: true, local: true }; }
  };
  let j = await join();
  if (!j.ok) {
    const txt = gateP.textContent; btn.style.display = 'none';
    while (!j.ok) {
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
world.onEvent(m => { if (audio.ready) audio.onEvent({ ...m, ...visual.spatial(m) }); });

// местные звуки от картинки: плеск (рифовая рыбка, прыжки из воды), стрекот кузнечика, звуки при приближении
// (бульки, треск креветок, щёлканье краба) — из той точки, где это видно; k — насколько близко (1 — вплотную)
// громкость и высота: креветки и краб звучат выше записи (запись — шипение/щелчки, на них похоже в ускорении)
const LOCAL = { grasshopper: [.09, 1], splash: [.05, 1], bubbles: [.08, 1], shrimp: [.05, 1.05], crab: [.07, 1.5] };   // v14: креветки — настоящая гидрофонная запись, почти без ускорения
visual.onLocalSound = (cat, pos, k = 1) => {
  if (!audio.ready) return;
  const sp = visual.spatialAt(pos), [amp, rate] = LOCAL[cat] || [.05, 1];
  audio.playLocal(cat, sp.panorama, sp.distance, amp * k, rate);
};

const qs = new URLSearchParams(location.search);
// старт всегда днём (раньше был случайный час — можно было попасть на тёмный/тусклый первый
// экран, отсюда была часть жалоб «серый камень»); из URL можно переопределить для QA
const startTod = qs.has('tod') ? parseFloat(qs.get('tod')) : .5;
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

const enter = async () => {
  if (phone) goFull();   // до первого await — пока браузер считает это нажатием
  const btn = gate.querySelector('#gate-btn');
  btn.textContent = 'Открываю иллюминатор…';
  try {
    await audio.start();
    gate.classList.add('hidden'); setTimeout(() => gate.remove(), 800);
  } catch (e) {
    console.error('audio start failed', e);
    btn.textContent = 'Не вышло — нажми ещё раз';
    const msg = gate.querySelector('#gate-err') || Object.assign(document.createElement('p'), { id: 'gate-err' });
    msg.textContent = String(e?.message || e);
    if (!msg.parentNode) gate.querySelector('#gate-card').appendChild(msg);
  }
};
gate.querySelector('#gate-btn').addEventListener('click', enter);
// &noaudio=1 — без Web Audio (для скриншотов/QA в безголовом браузере, там AudioContext.resume() виснет)
if (qs.get('noaudio') === '1') { gate.classList.add('hidden'); setTimeout(() => gate.remove(), 800); }

// --- громкость (v11): «Природа» управляет всеми звуками мира, «Музыка» — заготовка на будущее (значение хранится,
// но ни на что не влияет). Положение полосок запоминается в браузере
{
  const load = k => { try { const v = localStorage.getItem(k); return v === null ? null : +v; } catch { return null; } };
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* приватное окно — не страшно */ } };
  // v14: «Музыка» заработала — это абстрактный слой «как в мурмур» (audio._abstract)
  for (const [id, key, apply] of [['nature', 'om.vol.nature', v => audio.setNature(v / 100)], ['music', 'om.vol.music', v => audio.setMusic(v / 100)]]) {
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

// --- время суток: 4 кнопки (утро/день/вечер/ночь) — по-настоящему двигают часы живого мира
// (не предпросмотр): погода/волны/существа продолжают жить с нового момента. Раньше здесь было
// кольцо-перемотка с драгом по кругу (работало, но убрали по просьбе пользователя — заодно оно
// перехватывало указатель у OrbitControls/наведения, см. CHANGELOG); сам механизм остался в
// world.setTimeOfDay(frac), эти кнопки — просто другой UI поверх него.
const todButtons = document.querySelectorAll('#tod button');
todButtons.forEach(btn => btn.addEventListener('click', () => {
  world.setTimeOfDay(parseFloat(btn.dataset.tod));
  todButtons.forEach(b => b.classList.remove('active')); btn.classList.add('active');
}));

let last = performance.now(), hudT = 0;
function frame(now) {
  // метка первого кадра бывает РАНЬШЕ performance.now() при загрузке — без нижней границы шаг выходил
  // отрицательным (в безголовом браузере −0.74 с), и мир с панелью «отматывались назад»
  const dt = Math.max(0, Math.min((now - last) / 1000, .1)); last = now;
  // одна ошибка (в мире или в отрисовке) не должна насовсем остановить requestAnimationFrame-цикл
  try { world.step(dt); } catch (e) { console.error('world step failed', e?.stack || e); }
  audio.prox = visual.proximity();   // насекомые слышны, только когда камера у острова
  try { visual.frame(dt, now / 1000); hudT += dt; if (hudT > .25) { hudT = 0; visual.hud(); } }
  catch (e) { console.error('render frame failed', e?.stack || e); }
  requestAnimationFrame(frame);
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
  let cur = null, t = 0;
  setInterval(() => { t += .05; noise.setAttribute('baseFrequency', (0.012 + 0.004 * Math.sin(t)).toFixed(4)); }, 60);   // лёгкое «течение»
  addEventListener('pointermove', ev => {
    if (ev.pointerType !== 'mouse') return;   // v18: на телефоне линзы нет — под пальцем она оставалась и всё «плыло»
    const el = ev.target.closest?.('.panel, #tod button, #gate-btn');
    if (el !== cur) { if (cur) cur.style.filter = ''; cur = el; if (el) el.style.filter = 'url(#lens)'; }
    if (el) {
      const b = el.getBoundingClientRect(), mx = ev.clientX - b.left, my = ev.clientY - b.top;
      map.setAttribute('x', mx - R); map.setAttribute('y', my - R);
      light.setAttribute('x', mx); light.setAttribute('y', my);
    }
  });
}
