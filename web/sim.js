// Abyssonata — симуляция мира (погода/волны/сутки + каталог явлений среды). Считается в браузере: время можно
// мгновенно перематывать, сервер не нужен. Перенесено из прототипа на Python — числа и правила те же.
import { Noise2D } from './noise.js';
import { Ecosystem } from './agents.js';

const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoothstep = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const rnd = (a, b) => a + Math.random() * (b - a);
const choice = arr => arr[(Math.random() * arr.length) | 0];

export const DAY_LENGTH_SECONDS_DEFAULT = 32 * 60;

const TIER = {
  frequent: { rate: 0.18, cooldown: 3.0 },
  common: { rate: 0.05, cooldown: 12.0 },
  rare: { rate: 0.004, cooldown: 60.0 },
};
// Существа теперь ведут агенты (agents.js) — их каталожные события здесь отключены.
const AGENT_TYPES = new Set(['fish_school', 'flying_fish', 'seagull', 'cormorant', 'tern', 'pelican',
  'albatross', 'whale', 'dolphin', 'sea_lion', 'shark',
  'jellyfish', 'stingray', 'starfish', 'octopus', 'shrimp_swarm', 'sea_turtle']);   // мелкие обитатели — тоже агенты
const TENSION_IMPULSES = { shark: 0.28, shark_hunt: 0.12, orca_arrive: 0.2, whale_arrive: 0.16, storm_start: 0.30, wave_break: 0.02 };

const _storm = s => smoothstep(0.60, 0.80, s.weather);
const _calm = s => 1.0 - smoothstep(0.50, 0.78, s.weather);
const _warm = s => smoothstep(0.50, 0.72, s.temperature);
const _day = s => s.daylight;
const _night = s => 1.0 - s.daylight;
const _dusk = s => {
  const d1 = 1.0 - Math.abs(s.time_of_day - 0.25) * 6.0, d2 = 1.0 - Math.abs(s.time_of_day - 0.75) * 6.0;
  return clamp01(Math.max(d1, d2));
};

// ---------------------------------------------------------------- каталог явлений среды (не-агенты)
function buildCatalog() {
  const cat = [];
  const add = (type, tier, gate, descs, duration, panorama = [0, 1], intensity = 0.5) =>
    cat.push({ type, tier, gate, descs, duration, panorama, intensity });

  add('fish_school', 'common', s => _calm(s) * (1 - s.tension),
    ['стая рыб прошла на глубине', 'косяк серебристых рыб скользнул мимо', 'мелкая рыба ходит кругами под поверхностью', 'плотный косяк рыб мелькнул в толще воды'],
    [3, 7], [0, 1], s => 0.4 + _calm(s) * 0.3);
  add('flying_fish', 'common', s => _day(s) * _calm(s),
    ['летучая рыба выпрыгнула из воды', 'несколько летучих рыб пронеслись над гребнями', 'летучая рыба пролетела над волной и плюхнулась обратно'],
    [1, 2], [0, 1], s => 0.3 + s.wave_height * 0.3);
  add('jellyfish', 'common', s => _calm(s) * 0.9,
    ['медуза мерно пульсирует у поверхности', 'прозрачная медуза дрейфует по течению', 'медуза медленно опускается в глубину'],
    [4, 8], [0, 1], 0.35);
  add('stingray', 'rare', s => _calm(s) * _warm(s),
    ['скат бесшумно скользнул над дном', 'тень ската промелькнула в мутной воде', 'скат взмахнул крыльями и ушёл на глубину'],
    [3, 6], [0, 1], 0.4);
  add('starfish', 'common', s => 0.35 * _calm(s),
    ['морская звезда медленно ползёт по камню', 'в прибрежной луже копошится морская звезда'],
    [2, 4], [0, 1], 0.25);
  add('octopus', 'rare', s => _calm(s) * (0.4 + _night(s) * 0.6),
    ['осьминог мелькнул между камнями и скрылся', 'осьминог сменил цвет и растворился среди скал', 'щупальце осьминога проскользнуло в расщелину'],
    [2, 5], [0, 1], 0.4);
  add('shrimp_swarm', 'common', s => _calm(s),
    ['рой креветок закипел у подводной скалы', 'облако креветок метнулось врассыпную', 'креветки роятся у дна, вспыхивая в лучах'],
    [2, 4], [0, 1], 0.3);

  add('seagull', 'frequent', s => _day(s) * _calm(s),
    ['чайка сделала круг над водой', 'чайка пронеслась над гребнем волны', 'чайка закричала и ушла к берегу', 'чайка камнем упала и вынырнула с добычей', 'стайка чаек потёрлась над прибоем'],
    [1, 2.5], [0, 1], s => 0.3 + _day(s) * 0.2);
  add('cormorant', 'common', s => _day(s) * 0.8,
    ['баклан нырнул и вынырнул с рыбой', 'баклан сушил крылья на прибрежном камне', 'баклан низко пролетел над водой'],
    [2, 4], [0, 1], 0.35);
  add('tern', 'common', s => _day(s) * _calm(s),
    ['крачка зависла над волной и камнем упала в воду', 'крачка пронзительно крикнула и спикировала', 'пара крачек танцевала над прибоем'],
    [1, 2.5], [0, 1], 0.3);
  add('pelican', 'common', s => _day(s) * _calm(s) * 0.7,
    ['пеликан нырнул за добычей с размаху', 'пеликан пролетел клином с сородичами', 'пеликан выловил рыбу и загрузил её в мешок'],
    [2, 4], [0, 1], 0.4);
  add('albatross', 'rare', s => _day(s) * 0.6,
    ['вдалеке показался альбатрос', 'альбатрос медленно скользил над горизонтом', 'огромный альбатрос проплыл над водой, почти не шевеля крыльями'],
    [4, 8], [0, 0.4], 0.4);

  add('whale', 'rare', s => 0.4 + _calm(s) * 0.3 + _dusk(s) * 0.3,
    ['кит показался вдалеке и выпустил фонтан', 'кит поднял хвостовой плавник и ушёл на глубину', 'громкий всплеск — кит ударил хвостом по воде', 'столб пара взвился над морем — дышит кит'],
    [5, 10], [0.1, 0.9], s => 0.6 + s.tension * 0.2);
  add('dolphin', 'common', s => _day(s) * _calm(s) * 0.8 + _dusk(s) * 0.3,
    ['дельфин выпрыгнул из воды', 'стайка дельфинов играла у поверхности', 'дельфин пронёсся вдоль гребней, кувыркаясь в воздухе'],
    [2, 5], [0, 1], s => 0.4 + _day(s) * 0.2);
  add('sea_lion', 'common', s => _day(s) * 0.6,
    ['морской котик вынырнул и уставился на берег', 'котик лениво перекатывался в прибое', 'котик громко пролаял и ушёл под воду'],
    [2, 4], [0, 1], 0.35);

  add('shark', 'rare', s => (_night(s) * 0.6 + _dusk(s) * 0.5) * (0.3 + s.weather * 0.6),
    ['тень акулы прошла у поверхности', 'спинной плавник рассёк воду и исчез', 'акула развернулась в глубине и растворилась во мраке'],
    [3, 6], [0.2, 0.8], s => 0.5 + s.tension * 0.3);
  add('sea_turtle', 'rare', s => _day(s) * _warm(s) * _calm(s),
    ['морская черепаха всплыла подышать', 'черепаха медленно плыла, глядя вверх', 'черепаха грузно опустилась на дно'],
    [4, 8], [0, 1], 0.35);
  add('bioluminescence', 'rare', s => _night(s) * _calm(s) * 0.9,
    ['вода вспыхнула бирюзовым светом — планктон', 'береговую линию окрасило мерцающим светом', 'капли светятся, как звёздная пыль, — биолюминесценция'],
    [5, 12], [0, 1], s => 0.4 + _night(s) * 0.3);

  // волны и брызги — реже (иначе шум волн слишком частый)
  add('wave_break', 'frequent', s => (0.3 + s.wave_height * 0.7) * 0.7,
    ['волна разбилась о берег', 'волна с грохотом обрушилась на камни', 'пенная шапка накрыла прибрежные камни', 'волна докатилась до песка и шипя отхлынула'],
    [1, 3], [0, 1], s => 0.3 + s.wave_height * 0.6);
  add('splash', 'frequent', s => s.wave_height * 0.7,
    ['брызги долетели до берега', 'ветер сорвал гребни в брызги', 'пена шлёпнулась о камень'],
    [0.5, 1.5], [0, 1], s => 0.2 + s.wave_height * 0.4);
  add('surf_surge', 'common', (s, dw) => (dw > 0.003 ? clamp01(dw / 0.02) : 0.0),
    ['прибой усилился', 'накат стал мощнее', 'волны пошли одна за другой, выше'],
    [3, 8], [0, 1], s => 0.3 + s.wave_height * 0.5);
  add('surf_calm', 'common', (s, dw) => (dw < -0.003 ? clamp01(-dw / 0.02) : 0.0),
    ['прибой улёгся', 'накат стал тише', 'волны заметно сникли'],
    [3, 6], [0, 1], s => 0.3 + (1 - s.wave_height) * 0.3);

  return cat;
}

// ---------------------------------------------------------------- симуляция
export class OceanSimulation {
  constructor({ seed = null, agents = true, dayLengthSeconds = DAY_LENGTH_SECONDS_DEFAULT } = {}) {
    this.useAgents = agents; this.eco = null;
    this.seed = seed ?? Math.floor(Math.random() * 1e9);
    this.noise = new Noise2D(this.seed);
    this.dayLength = dayLengthSeconds;
    this.state = {
      kind: 'state', t: 0, time_of_day: 0, time: '00:00', daylight: 0, weather: 0, weather_label: 'штиль',
      wind_speed: 0, wave_height: 0, temperature: 0.5, tension: 0, rain: 0, rain_active: false,
      fog: 0, fog_active: false, storm_active: false, tide: 0.5, stars_active: false,
    };
    this.tensionBase = 0; this.tensionImpulse = 0;
    this.rainActive = false; this.fogActive = false; this.stormActive = false; this.starsActive = false;
    this.lastFire = new Map();
    this.prevWave = 0; this.prevTide = 0.5; this.prevDaylight = 0; this.prevTod = 0;
    this.firstTick = true;
    this.tThunder = rnd(5, 12);
    this.catalog = buildCatalog();
  }

  // стартовое время суток
  setStartTod(frac) { this.state.t = frac * this.dayLength; }
  // настоящая перемотка: двигаем часы мира по кратчайшей дуге суток — погода/волна/ветер тоже
  // честно пересчитаются на новый момент (все они функции того же t), а уже живущие существа
  // просто продолжат с той точки, на которой их застали (не телепортируются)
  setTimeOfDay(frac) {
    const cur = ((this.state.t % this.dayLength) + this.dayLength) % this.dayLength, curFrac = cur / this.dayLength;
    let d = frac - curFrac; d -= Math.round(d);
    this.state.t += d * this.dayLength;
    // метки «когда событие было в последний раз» сдвигаем вместе с часами: при перемотке назад они оказались бы
    // в будущем, и волны/брызги/гром молчали бы до нескольких минут (кулдаун считается от будущего момента)
    for (const [k, v] of this.lastFire) this.lastFire.set(k, v + d * this.dayLength);
  }

  _mk(type, s, descs, intensity, duration, panorama = [0, 1]) {
    const dur = Array.isArray(duration) ? rnd(duration[0], duration[1]) : duration;
    return { kind: 'event', timestamp: s.t, time: s.time, type, text: choice(descs),
      intensity: clamp01(intensity), duration: dur, panorama: rnd(panorama[0], panorama[1]),
      agent: 0, distance: 0.5, voice: 0, act: '' };
  }

  static timeLabel(tod) {
    const total = tod * 24 * 60, h = Math.floor(total / 60) % 24, m = Math.floor(total % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  static weatherLabel(w) {
    if (w < 0.25) return 'штиль'; if (w < 0.50) return 'лёгкий бриз'; if (w < 0.70) return 'свежий бриз';
    if (w < 0.85) return 'сильный ветер'; return 'шторм';
  }

  update(dt) {
    const s = this.state;
    s.t += dt; const t = s.t;

    // кнопки времени суток двигают t по кратчайшей дуге и могут увести его в минус; % в JS тогда отрицательный
    // (часы показали бы «-13:-22») — поэтому остаток приводится к 0..1
    s.time_of_day = ((t / this.dayLength) % 1.0 + 1.0) % 1.0;
    s.daylight = clamp01(Math.sin((s.time_of_day - 0.25) * 2 * Math.PI));
    s.time = OceanSimulation.timeLabel(s.time_of_day);

    const w = this.noise.fbm(t * 0.004, 100.0, 3); s.weather = clamp01((w + 1) * 0.5); s.weather_label = OceanSimulation.weatherLabel(s.weather);
    const windN = this.noise.fbm(t * 0.010, 200.0, 2); s.wind_speed = clamp01(0.12 + s.weather * 0.70 + windN * 0.12);
    const waveN = this.noise.fbm(t * 0.020, 300.0, 2); s.wave_height = clamp01(0.08 + s.wind_speed * 0.75 + waveN * 0.10);
    const tempN = this.noise.fbm(t * 0.005, 400.0, 2); s.temperature = clamp01(0.50 + tempN * 0.18 + (s.daylight - 0.5) * 0.18);
    const rainN = this.noise.fbm(t * 0.008, 500.0, 2), rainGate = smoothstep(0.35, 0.55, (this.noise.fbm(t * 0.0011, 800.0, 2) + 1) * 0.5);
    s.rain = clamp01(((rainN + 1) * 0.30 + s.weather * 0.50 - 0.20) * rainGate);   // дождь — редкость
    const fogN = this.noise.fbm(t * 0.006, 600.0, 2); s.fog = clamp01((fogN + 1) * 0.40 - 0.15 + _night(s) * 0.15);
    const tideN = this.noise.fbm(t * 0.0008, 700.0, 2); s.tide = clamp01((tideN + 1) * 0.5);

    const tensionTarget = s.weather * 0.35 + _night(s) * 0.12, tau = 25.0;
    this.tensionBase += (tensionTarget - this.tensionBase) * (1 - Math.exp(-dt / tau));
    this.tensionImpulse *= Math.exp(-dt / 10.0);
    s.tension = clamp01(this.tensionBase + this.tensionImpulse);

    if (this.firstTick) {
      this.prevWave = s.wave_height; this.prevTide = s.tide; this.prevDaylight = s.daylight; this.prevTod = s.time_of_day;
      this.rainActive = s.rain > 0.55; this.fogActive = s.fog > 0.60; this.stormActive = s.weather > 0.72; this.starsActive = s.daylight < 0.12;
      s.rain_active = this.rainActive; s.fog_active = this.fogActive; s.storm_active = this.stormActive; s.stars_active = this.starsActive;
      this.firstTick = false;
      return [];
    }

    let events = [];
    events = events.concat(this._updateThresholdChannels());
    events = events.concat(this._updateDayPhase());
    events = events.concat(this._updateTide());
    events = events.concat(this._updateProbabilistic(dt));

    if (s.rain > 0.7) {
      this.tThunder -= dt;
      if (this.tThunder <= 0) {
        this.tThunder = rnd(12, 30);
        events.push({ kind: 'event', timestamp: s.t, time: s.time, type: 'thunder',
          text: choice(['раскат грома прокатился над морем', 'далёкий удар грома', 'гром рокочет над горизонтом']),
          intensity: rnd(0.6, 1.0), duration: 4.0, panorama: rnd(0.1, 0.9), agent: 0, distance: rnd(0.3, 0.7), voice: 0, act: '' });
      }
    } else {
      this.tThunder = Math.min(this.tThunder, rnd(5, 12));
    }

    if (this.useAgents) {
      if (!this.eco) this.eco = new Ecosystem(s, this.seed);   // номер мира — для своего генератора вылупления черепашат
      for (const d of this.eco.update(dt, s)) {
        events.push({ kind: 'event', timestamp: s.t, time: s.time, type: d.type, text: d.text,
          intensity: clamp01(d.intensity), duration: d.duration, panorama: clamp01((d.x + 1) / 2),
          agent: d.agent, distance: d.dist, voice: d.voice, act: d.act });
      }
    }

    for (const ev of events) {
      if (TENSION_IMPULSES[ev.type] !== undefined) this.tensionImpulse += TENSION_IMPULSES[ev.type];
    }

    this.prevWave = s.wave_height; this.prevDaylight = s.daylight; this.prevTod = s.time_of_day;
    return events;
  }

  _updateThresholdChannels() {
    const s = this.state, out = [];
    if (!this.rainActive && s.rain > 0.55) { this.rainActive = true; out.push(this._mk('rain_start', s, ['начался дождь', 'пошёл дождь', 'накрапал мелкий дождь'], s.rain, [20, 60], [0.4, 0.6])); }
    else if (this.rainActive && s.rain < 0.40) { this.rainActive = false; out.push(this._mk('rain_end', s, ['дождь закончился', 'дождь прекратился', 'дождь стих'], s.rain, 2.0, [0.4, 0.6])); }
    if (!this.fogActive && s.fog > 0.60) { this.fogActive = true; out.push(this._mk('fog_descend', s, ['туман опустился на воду', 'над морем поднялся туман'], s.fog, 30.0, [0.4, 0.6])); }
    else if (this.fogActive && s.fog < 0.45) { this.fogActive = false; out.push(this._mk('fog_clear', s, ['туман рассеялся', 'туман поднялся'], s.fog, 5.0, [0.4, 0.6])); }
    if (!this.stormActive && s.weather > 0.72) { this.stormActive = true; out.push(this._mk('storm_start', s, ['погода портится — начинается шторм', 'налетел шторм', 'море разыгралось не на шутку'], s.weather, 120.0, [0.5, 0.5])); }
    else if (this.stormActive && s.weather < 0.62) { this.stormActive = false; out.push(this._mk('storm_end', s, ['шторм утихает', 'шторм прошёл', 'море успокаивается'], s.weather, 30.0, [0.5, 0.5])); }
    s.rain_active = this.rainActive; s.fog_active = this.fogActive; s.storm_active = this.stormActive;
    return out;
  }

  _updateDayPhase() {
    const s = this.state, out = [], tod = s.time_of_day;
    if (this.prevTod < 0.25 && 0.25 <= tod) out.push(this._mk('sunrise', s, ['занимается рассвет', 'небо розовеет на востоке — рассвет', 'поднялось солнце'], 0.6, 20.0, [0.3, 0.4]));
    if (this.prevTod < 0.75 && 0.75 <= tod) out.push(this._mk('sunset', s, ['солнце садится за горизонт', 'начался закат', 'небо налилось медью — закат'], 0.6, 20.0, [0.6, 0.7]));
    if (!this.starsActive && s.daylight < 0.12) { this.starsActive = true; out.push(this._mk('stars_appear', s, ['на небе проступили звёзды', 'зажглись первые звёзды'], 0.4, 10.0, [0.5, 0.5])); }
    else if (this.starsActive && s.daylight > 0.15) { this.starsActive = false; out.push(this._mk('stars_gone', s, ['звёзды поблекли', 'звёзды исчезли в предрассветных сумерках'], 0.3, 10.0, [0.5, 0.5])); }
    s.stars_active = this.starsActive;
    return out;
  }

  _updateTide() {
    const s = this.state, out = [];
    if (this.prevTide < 0.5 && 0.5 <= s.tide) out.push(this._mk('tide_in', s, ['начался прилив', 'приливная волна пошла к берегу'], s.tide, 60.0, [0.4, 0.6]));
    else if (this.prevTide >= 0.5 && 0.5 > s.tide) out.push(this._mk('tide_out', s, ['начался отлив', 'вода отходит от берега'], 1 - s.tide, 60.0, [0.4, 0.6]));
    this.prevTide = s.tide;
    return out;
  }

  _updateProbabilistic(dt) {
    const s = this.state, deltaWave = s.wave_height - this.prevWave, fired = [];
    for (const cfg of this.catalog) {
      if (this.useAgents && AGENT_TYPES.has(cfg.type)) continue;
      const last = this.lastFire.get(cfg.type) ?? -1e9;
      if (s.t - last < TIER[cfg.tier].cooldown) continue;
      const weight = cfg.gate(s, deltaWave);
      if (weight <= 0) continue;
      const p = TIER[cfg.tier].rate * weight * dt;
      if (Math.random() < p) {
        let inten = cfg.intensity; if (typeof inten === 'function') inten = inten(s);
        fired.push(this._mk(cfg.type, s, cfg.descs, inten, cfg.duration, cfg.panorama));
        this.lastFire.set(cfg.type, s.t);
      }
    }
    return fired;
  }

  // снимок обитателей для картинки
  agentsSnapshot() { return this.eco ? this.eco.snapshot() : []; }
}
