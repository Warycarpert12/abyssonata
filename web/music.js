// Abyssonata — фоновая музыка (v15): процедурная, рождается прямо в браузере из состояния мира. Как «музыкальный
// слой» образца, которым вдохновлён проект (см. README): там колонка генерирует музыку, настроение которой задаёт
// погода (на их сайте играют часовые записи с колонки — файлы *-mus.mp3). Здесь — свой генератор, только синтез
// (осцилляторы, никакого шума):
//  • лад и тоника — по настроению: ясный день — лидийский, день — мажор, сумерки — дорийский, ночь — минор,
//    туман — «пустые» кварты-квинты, шторм/напряжение — фригийский;
//  • пэд — мягкий аккорд (треугольник + синус, фильтр светлее днём и в ветер), смена раз в 14–30 с с перекрытием;
//  • низкий гул тоники — громче ночью и в напряжение;
//  • колокольчики — редкие ноты аккорда (FM-синтез) с эхом; чем живее мир (события за минуту), тем чаще;
//    ночью — «стеклянные», в шторм — низкие; в дождь — «капли»; в сильное напряжение — глухой пульс;
//  • некоторые голоса зверей откликаются нотой: кит — низким колоколом, дельфин — арпеджио, чайка — высокой нотой.
// Выход — out (audio.absOut, полоска «Музыка»). ponytail: всё планируется на ~0.15 с вперёд из update() — без таймеров.
const mtof = m => 440 * 2 ** ((m - 69) / 12);
const rr = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

// лад (ступени от тоники) и тоника (MIDI) для каждого настроения
const MOODS = {
  bright: { mode: [0, 2, 4, 6, 7, 9, 11], root: 50 },   // ре лидийский — светло, «воздух»
  day:    { mode: [0, 2, 4, 5, 7, 9, 11], root: 50 },   // ре мажор
  dusk:   { mode: [0, 2, 3, 5, 7, 9, 10], root: 48 },   // до дорийский — тепло и немного грустно
  night:  { mode: [0, 2, 3, 5, 7, 8, 10], root: 45 },   // ля минор — глубже, реже, «стекло»
  fog:    { mode: [0, 2, 5, 7, 9], root: 48 },          // пентатоника без терций — пусто, подвешено
  storm:  { mode: [0, 1, 3, 5, 7, 8, 10], root: 47 },   // си фригийский — тревожно
};
const PROG = [0, 3, 4, 5, 1, 2];                         // куда охотнее идти от тоники (ступени), по убыванию

// v22: Safari до 14.1 не знает StereoPanner (каждая нота роняла шаг мира) — там звучит без панорамы
const stereo = ctx => ctx.createStereoPanner ? ctx.createStereoPanner() : Object.assign(ctx.createGain(), { pan: { value: 0 } });
export class Music {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.out = ctx.createGain(); this.out.gain.value = .7; this.out.connect(out);   // на 100% полоски — на ~4 дБ тише природы (замер replay -only music)
    // эхо колокольчиков: задержка с затухающим повтором через мягкий фильтр
    this.echoIn = ctx.createGain(); this.echoIn.gain.value = .45;
    const dl = ctx.createDelay(2), fb = ctx.createGain(), lp = ctx.createBiquadFilter();
    dl.delayTime.value = .48; fb.gain.value = .38; lp.type = 'lowpass'; lp.frequency.value = 2600;
    this.echoIn.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(this.out);
    this.mood = null; this.deg = 0; this.chord = null; this.nextChord = 0; this.nextStep = 0; this.nextShimmer = 0;
    this.events = []; this.p = { day: 1, tense: 0, rain: 0, fog: 0, wind: .3, act: 0 };
  }

  // вызывать на каждое состояние мира; now — время звукового контекста
  update(s, now) {
    const storm = clamp((s.weather - .5) / .35), tense = Math.max(s.tension || 0, storm);
    const rain = s.rain_active ? clamp((s.rain - .3) / .5) : 0, fog = s.fog_active ? (s.fog ?? .5) : 0, day = s.daylight;
    const dusk = clamp(Math.max(1 - Math.abs(s.time_of_day - .25) * 6, 1 - Math.abs(s.time_of_day - .75) * 6));
    const mood = tense > .55 ? 'storm' : fog > .4 ? 'fog' : dusk > .5 ? 'dusk' : day < .25 ? 'night'
      : day > .7 && s.temperature > .5 && s.wind_speed < .5 ? 'bright' : 'day';
    this.events = this.events.filter(x => now - x < 60);
    this.p = { day, tense, rain, fog, wind: s.wind_speed, act: clamp(this.events.length / 40) };
    if (now >= this.nextChord) {   // смена аккорда; настроение меняется только на границе аккорда — без рывков
      if (mood !== this.mood) { this.mood = mood; this.deg = 0; }
      else { let d; do d = pick(PROG.concat(PROG.slice(0, 3))); while (d === this.deg); this.deg = d; }
      this._chord(Math.max(now, this.nextChord - 2));
    }
    const beat = this.mood === 'storm' ? .42 : this.mood === 'night' ? .75 : .6;
    if (this.nextStep < now) this.nextStep = now;
    while (this.nextStep < now + .15) { this._step(this.nextStep); this.nextStep += beat * (Math.random() < .2 ? 2 : 1); }
    if (day < .3 && now > this.nextShimmer) {   // ночью изредка — тихий высокий «стеклянный» отзвук
      this.nextShimmer = now + rr(10, 22);
      for (const iv of [36, 43]) this._pad(this._note(this.deg) + iv, now, 3, 3, 6, 6000, rr(-.8, .8), .25, 'sine');
    }
  }

  // голоса зверей откликаются нотой (не всегда)
  onEvent(e, t) {
    this.events.push(t);
    if (!this.chord) return;
    const r = Math.random(), hi = () => pick(this.chord.slice(1));
    if (e.type === 'whale' && r < .6) this._bell(this.chord[0] + 12, t + .4, 'low');
    else if ((e.type === 'seagull' || e.type === 'tern') && r < .2) this._bell(hi() + 24, t, 'pluck');
    else if (e.type === 'dolphin' && r < .35) [0, 2, 4].forEach((d, i) => this._bell(this._note(this.deg + d) + 24, t + i * .14, 'pluck'));
    else if (e.type === 'jump_splash' && r < .2) this._bell(hi() + 24, t, 'glass');
    // v23: черепашата выбираются из песка — тихая восходящая россыпь «стеклянных» колокольчиков (только синтез)
    else if (e.type === 'hatching') [0, 2, 4, 7, 9, 11].forEach((d, i) => this._bell(this._note(this.deg + d) + 24, t + .3 + i * .42, 'glass'));
  }

  _note(d) { const M = MOODS[this.mood], L = M.mode.length; return M.root + M.mode[((d % L) + L) % L] + 12 * Math.floor(d / L); }

  _chord(t) {
    const p = this.p, dur = rr(14, 24) * (1 - p.wind * .3) * (this.mood === 'night' ? 1.3 : 1);
    this.nextChord = t + dur;
    // тоника аккорда внизу, терция/квинта/септима (или нона) — октавой выше: мягко и просторно
    this.chord = [0, 2, 4, Math.random() < .5 ? 6 : 8].map((k, i) => this._note(this.deg + k) + (i ? 12 : 0));
    const cutoff = 300 + 2200 * p.day * (1 - p.rain * .6) + p.wind * 600, atk = rr(3, 5), rel = rr(6, 9);
    this.chord.forEach((m, i) => this._pad(m, t, dur + 2, atk, rel, cutoff, (i / 3 - .5) * 1.2, i ? .7 : .9));
    this._pad(this._note(this.deg) - 12, t, dur + 2, 5, 8, 220, 0, .5 + p.tense * .6 + (1 - p.day) * .3, 'sine');   // гул тоники
  }

  _pad(m, t, dur, atk, rel, cutoff, pan, amp, type = 'triangle') {
    const ctx = this.ctx, f = mtof(m), g = ctx.createGain(), lp = ctx.createBiquadFilter(), pn = stereo(ctx);
    lp.type = 'lowpass'; lp.Q.value = .7;
    lp.frequency.setValueAtTime(cutoff * .6, t); lp.frequency.linearRampToValueAtTime(cutoff, t + dur * .5); lp.frequency.linearRampToValueAtTime(cutoff * .7, t + dur);
    const A = .018 * amp;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(A, t + atk); g.gain.setValueAtTime(A, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + rel);
    for (const [ty, det] of [[type, -4], ['sine', 5]]) {
      const o = ctx.createOscillator(); o.type = ty; o.frequency.value = f; o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + dur + rel + .1);
    }
    lp.connect(g); g.connect(pn); pn.pan.value = pan; pn.connect(this.out);
  }

  _step(t) {
    const p = this.p, m = this.mood;
    let prob = (.1 + p.act * .35 + (m === 'bright' ? .08 : 0) - (m === 'fog' ? .06 : 0)) * (m === 'night' ? .7 : 1);
    if (Math.random() < prob) {
      const note = Math.random() < .6 ? pick(this.chord.slice(1)) + 12 : this._note(this.deg + ((Math.random() * 10) | 0)) + 12;
      this._bell(note + (Math.random() < .25 ? 12 : 0), t, m === 'night' || m === 'fog' ? 'glass' : m === 'storm' ? 'low' : 'pluck');
    }
    if (p.rain > .1 && Math.random() < p.rain * .35) this._bell(this._note(this.deg + pick([4, 7, 9, 11])) + 24, t + rr(0, .3), 'drip');
    if (p.tense > .5 && Math.random() < (p.tense - .5) * .8) this._boom(t);
  }

  // колокольчик: FM (модулятор на частоте × ratio, индекс быстро гаснет) — [ratio, индекс, длина, громкость]
  _bell(m, t, kind) {
    const K = { pluck: [2, 1.2, .9, .022], glass: [3.5, 2.2, 2.6, .016], low: [1.5, 3, 1.8, .026], drip: [4, .8, .25, .01] }[kind];
    const ctx = this.ctx, f = mtof(m), car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain(), pn = stereo(ctx);
    car.frequency.value = f; mod.frequency.value = f * K[0];
    mg.gain.setValueAtTime(f * K[1], t); mg.gain.exponentialRampToValueAtTime(f * .01, t + K[2]);
    mod.connect(mg); mg.connect(car.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(K[3], t + .006); g.gain.exponentialRampToValueAtTime(.0001, t + K[2] * 1.4);
    car.connect(g); g.connect(pn); pn.pan.value = rr(-.7, .7); pn.connect(this.out); g.connect(this.echoIn);
    for (const o of [car, mod]) { o.start(t); o.stop(t + K[2] * 1.5 + .1); }
  }

  // глухой пульс в напряжение: синус с падающей высотой
  _boom(t) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), A = .05 * this.p.tense;
    o.frequency.setValueAtTime(58, t); o.frequency.exponentialRampToValueAtTime(36, t + .6);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(A, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + 1.2);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 1.3);
  }
}
