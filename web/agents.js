// Abyssonata — экосистема существ (см. заголовок sim.js). Каждое существо — мини-агент со своим состоянием и
// правилами; Ecosystem решает, кто прилетает/уплывает по погоде и времени суток, агенты влияют друг на друга
// (перекличка, испуг косяка рыб, заразительные прыжки дельфинов). Поведение сверено с открытыми источниками
// (Википедия: названия статей — в комментариях у правил).
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const rnd = (a, b) => a + Math.random() * (b - a);
const randint = (a, b) => Math.floor(rnd(a, b + 1));
const choice = arr => arr[(Math.random() * arr.length) | 0];
const gauss = (mu = 0, sigma = 1) => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const copysign = (a, b) => (b < 0 ? -Math.abs(a) : Math.abs(a));

const _calm = s => 1.0 - smooth(0.50, 0.78, s.weather);
const _warm = s => smooth(0.50, 0.72, s.temperature);
const _night = s => 1.0 - s.daylight;
// места на берегу: 0 — главный остров, 1..7 — островки (картинка знает, где какой; visual.js ISLETS)
const SITES = 8;
const pickSite = () => (Math.random() < 0.35 ? 0 : randint(1, SITES - 1));
const _dusk = s => {
  const d1 = 1.0 - Math.abs(s.time_of_day - 0.25) * 6.0, d2 = 1.0 - Math.abs(s.time_of_day - 0.75) * 6.0;
  return clamp01(Math.max(d1, d2));
};

// Перекличка: species -> [вероятность ответа соседа, длина цепочки, [задержка ответа от, до]]
const REPLY = {
  seagull: [0.30, 1, [0.6, 2.5]],
  tern: [0.35, 1, [0.6, 2.0]],
  sea_lion: [0.60, 2, [0.8, 3.0]],
  dolphin: [0.20, 1, [0.5, 2.0]],
  orca: [0.50, 1, [1.0, 3.5]],
  whale: [0.90, 1, [6.0, 14.0]],
};

// ---------------------------------------------------------------- базовый агент
class Agent {
  constructor(eco, species, name, x, dist) {
    this.eco = eco; this.species = species; this.name = name;
    this.uid = eco.nextUid(); this.num = eco.nextNum(species);
    this.x = x; this.dist = dist;
    this.voice = randint(1, 1e6);
    this.talk = rnd(0.7, 1.4);
    this.state = 'stay'; this.done = false; this.pending = []; this.fem = false;
    // с кем сейчас связан (uid) и как: 'to' — держится рядом (охота, кормёжка, стая), 'from' — уходит прочь.
    // Картинка ставит зверя по этой связи — «рядом» в журнале значит рядом и на экране
    this.rel = 0; this.rk = ''; this.relT = 0;
  }
  relate(o, kind = '', t = 0) {
    if (o && !o.done) { this.rel = o.uid; this.rk = kind; this.relT = t; } else { this.rel = 0; this.rk = ''; this.relT = 0; }
  }
  get label() { return `${this.name} №${this.num}`; }
  w(stem) { return stem + (this.fem ? 'а' : ''); }
  ev(type_, text, intensity = 0.5, duration = 2.0, act = '') {
    return { type: type_, text, intensity, duration, x: this.x, dist: this.dist, agent: this.uid, voice: this.voice, act };
  }
  later(delay, type_, text, act, depth = 0) { this.pending.push([delay, type_, text, act, depth]); }
  _runPending(dt) {
    const out = [], due = [];
    for (const p of this.pending) { p[0] -= dt; if (p[0] <= 0) due.push(p); }
    if (due.length) this.pending = this.pending.filter(p => p[0] > 0);
    for (const [, type_, text, act, depth] of due) {
      out.push(this.ev(type_, text, 0.5, 2.0, act));
      if (type_ === this.species && depth > 0) this.eco.onCall(this, depth);
    }
    return out;
  }
  callEvent(text, act = 'call') {
    this.eco.onCall(this, (REPLY[this.species] || [0, 0, [0, 0]])[1]);
    return [this.ev(this.species, text, rnd(0.4, 0.8), 2.0, act)];
  }
}

// ---------------------------------------------------------------- птицы
const BIRDS = {
  seagull: { name: 'чайка', fem: true, call: [25, 60], dive: [60, 150], speed: 0.10, dist: [0.25, 0.6], drift: 0.02,
    says: ['кричит над водой', 'перекликается с ветром', 'резко вскрикнула'] },
  tern: { name: 'крачка', fem: true, call: [30, 80], dive: [40, 100], speed: 0.16, dist: [0.3, 0.65], drift: 0.03,
    says: ['пронзительно кричит', 'стрекочет над волной', 'тонко вскрикнула'] },
  // «Cormorant» (Википедия): после ныряния баклан выходит на камень и сушит раскинутые крылья — dry: сколько сушит
  cormorant: { name: 'баклан', fem: false, call: [50, 120], dive: [40, 110], speed: 0.12, dist: [0.35, 0.5], drift: 0.0, dry: [30, 70],
    says: ['хрипло каркает на камне', 'гортанно крикнул'] },
  // «Brown pelican»: ныряет с высоты камнем, клювом вперёд; вынырнув, сливает воду из мешка и глотает рыбу
  pelican: { name: 'пеликан', fem: false, call: null, dive: [50, 140], speed: 0.08, dist: [0.3, 0.6], drift: 0.01, plunge: true, says: [] },
  albatross: { name: 'альбатрос', fem: false, call: [60, 140], dive: null, speed: 0.04, dist: [0.7, 0.9], drift: 0.005,
    says: ['протяжно кричит вдали'] },
};

class Bird extends Agent {
  constructor(eco, species, instant = false, lead = null) {
    const c = BIRDS[species], side = lead ? lead.side : choice([-1, 1]);
    super(eco, species, c.name, lead ? lead.x : side * 1.25, 0.95);
    this.c = c; this.fem = c.fem; this.side = side;
    this.tx = lead ? Math.max(-0.75, Math.min(0.75, lead.tx + rnd(-0.05, 0.05))) : rnd(-0.75, 0.75); this.td = lead ? lead.td : rnd(c.dist[0], c.dist[1]);
    this.state = 'arrive'; this.tDry = 0; this.dryLeft = 0;
    this.tCall = this._gap(c.call); this.tDive = this._gap(c.dive);
    this.life = species === 'albatross' ? rnd(90, 200) : null;
    // «Brown pelican»: пеликаны летают группой цепочкой — ведомый держится за ведущим (картинка ставит в линию)
    if (lead) this.relate(lead, 'flock', 1e9);
    if (instant) { this.x = this.tx; this.dist = this.td; this.state = 'stay'; }
  }
  _gap(rng) { return rng ? rnd(rng[0], rng[1]) * this.talk : 1e9; }
  leave(text = null) {
    if (this.state === 'leave') return [];
    this.state = 'leave'; this.side = this.x >= 0 ? 1 : -1;
    return [this.ev(`${this.species}_leave`, text || `${this.label} ${this.w('улетел')}`, 0.2, 3.0, 'leave')];
  }
  _call(act = 'call') { return this.c.call ? this.callEvent(`${this.label} ${choice(this.c.says)}`, act) : []; }
  _dive() {
    this.eco.disturb(this.x, 0.5);
    this.eco.startleShore(this.x);
    // крачка сначала зависает над водой, потом ныряет («Tern»); баклан уходит под воду с полупрыжком и выныривает
    // поодаль («Cormorant»)
    const text = this.c.plunge ? `${this.label} сложил крылья и камнем упал в воду за рыбой`
      : this.species === 'tern' ? `${this.label} зависла над волной и нырнула за рыбой`
      : this.species === 'cormorant' ? `${this.label} подпрыгнул и ушёл под воду за рыбой` : `${this.label} ${this.w('нырнул')} за рыбой`;
    const out = [this.ev('dive_splash', text, 0.5, 1.5, this.species === 'tern' ? 'hover' : 'dive')];
    if (this.species === 'cormorant') this.x = Math.max(-0.9, Math.min(0.9, this.x + gauss(0, 0.06)));
    if (this.c.call && Math.random() < 0.5)
      this.later(rnd(1.5, 3.0), this.species, `${this.label} ${this.w('вынырнул')} с добычей`, 'catch');
    if (this.c.plunge && Math.random() < 0.6) { const d = rnd(3.0, 5.0); this.later(d, `${this.species}_catch`, `${this.label} сливает воду из клюва и глотает рыбу`, 'catch'); this.eco.onCatch(this, d); }
    if (this.species === 'cormorant' && Math.random() < 0.3) this.eco.onCatch(this, rnd(2, 4));
    if (this.c.dry && Math.random() < 0.6) this.tDry = rnd(4, 8);   // вынырнет — и на камень сушиться
    return out;
  }
  step(dt, s) {
    let out = this._runPending(dt);
    const c = this.c;
    if (this.life !== null && this.state !== 'leave') {
      this.life -= dt;
      if (this.life <= 0) out = out.concat(this.leave());
    }
    if (this.state === 'arrive') {
      const dx = this.tx - this.x;
      this.x += copysign(Math.min(Math.abs(dx), c.speed * dt), dx);
      this.dist += (this.td - this.dist) * Math.min(1.0, dt * 0.1);
      this.tCall -= dt;
      if (this.tCall <= 0) { out = out.concat(this._call('fly')); this.tCall = this._gap(c.call) * 0.6; }
      if (Math.abs(dx) < 0.03) {
        this.state = 'stay';
        out.push(this.ev(`${this.species}_arrive`, `${this.label} ${this.w('прилетел')} и кружит у берега`, 0.3, 3.0, 'arrive'));
      }
    } else if (this.state === 'dry') {   // сидит на камне с раскинутыми крыльями; может каркнуть, не ныряет
      this.dryLeft -= dt; this.tCall -= dt;
      if (this.tCall <= 0) { out = out.concat(this._call()); this.tCall = this._gap(c.call); }
      if (this.dryLeft <= 0) this.state = 'stay';
    } else if (this.state === 'sit') {   // «Albatross»: без ветра парить не может — сидит на воде, пока ветер не вернётся
      if (s.wind_speed > 0.3) { this.state = 'stay'; out.push(this.ev(`${this.species}_arrive`, `${this.label} поймал ветер и снова парит над волнами`, 0.2, 3.0, 'soar')); }
    } else if (this.state === 'stay') {
      if (this.tDry > 0 && (this.tDry -= dt) <= 0) {
        this.state = 'dry'; this.dryLeft = rnd(c.dry[0], c.dry[1]);
        out.push(this.ev(`${this.species}_dry`, `${this.label} сел на камень и расправил крылья сушиться`, 0.2, 3.0, 'dry'));
        return out;
      }
      if (this.species === 'albatross') {
        if (s.wind_speed < 0.22) { this.state = 'sit'; out.push(this.ev(`${this.species}_sit`, `${this.label}: ветер стих — сел на воду и качается на волне`, 0.2, 3.0, 'sit')); return out; }
        // держится за китом — подбирает объедки; за пароходом улетает к горизонту
        const whale = this.eco.agents.find(a => a.species === 'whale' && a.state === 'surface' && !a.done);
        if (whale && this.rel !== whale.uid && Math.random() < 0.05 * dt) { this.relate(whale, 'to', 60); out.push(this.ev(`${this.species}_follow`, `${this.label} кружит над китом`, 0.2, 3.0, 'follow')); }
        if (this.eco.count('ship') && Math.random() < 0.004 * dt) return out.concat(this.leave(`${this.label} полетел вслед за пароходом`));
      }
      if (c.drift) this.x = Math.max(-0.9, Math.min(0.9, this.x + gauss(0, c.drift) * Math.sqrt(dt)));
      // «Gull», «Tern»: птицы слетаются туда, где охотятся дельфины, кит или косатки и рыба у поверхности
      const feed = this.eco.feed;
      if (c.dive && feed && this.rel !== feed.a.uid && Math.random() < 0.08 * dt) this.relate(feed.a, 'to', feed.t);
      const atFeed = feed && this.rel === feed.a.uid && this.relT > 0;
      if (atFeed) this.x += Math.max(-0.05, Math.min(0.05, feed.a.x - this.x)) * dt;
      this.tCall -= dt; this.tDive -= dt;
      if (this.tCall <= 0) { out = out.concat(this._call()); this.tCall = this._gap(c.call); }
      const sch = this.eco.school;
      const hot = c.dive && ((sch && sch.alert > 0 && Math.abs(sch.x - this.x) < 0.45) || atFeed);
      if (this.tDive <= 0 || (hot && Math.random() < 0.10 * dt)) { out = out.concat(this._dive()); this.tDive = this._gap(c.dive); }
    } else {
      this.x += this.side * c.speed * dt * 1.5;
      this.dist = Math.min(1.0, this.dist + dt * 0.02);
      if (Math.abs(this.x) > 1.3 || this.dist >= 1.0) this.done = true;
    }
    return out;
  }
}

// ---------------------------------------------------------------- дельфины: стая (Pod) + особи
class Pod {
  constructor(eco, instant = false) {
    this.eco = eco; this.side = choice([-1, 1]);
    this.x = instant ? rnd(-0.6, 0.6) : this.side * 1.25;
    this.dist = rnd(0.35, 0.65);
    this.vx = -this.side * rnd(0.008, 0.015);
    this.mode = 'travel'; this.tMode = rnd(25, 50);
    this.life = rnd(100, 240); this.leaving = false; this.done = false; this.members = [];
  }
  step(dt, s) {
    this.life -= dt;
    if (!this.leaving && (this.life <= 0 || _calm(s) < 0.2)) { this.leaving = true; this.vx = copysign(0.03, this.x || 1.0); }
    this.tMode -= dt;
    const sch = this.eco.school;
    if (!this.leaving && this.tMode <= 0) {
      // ночью стая чаще отдыхает — медленно плывёт у поверхности, почти не прыгает (дельфины спят «половиной мозга»)
      this.mode = (s.daylight < 0.25 && Math.random() < 0.6) ? 'rest' : (sch && Math.random() < 0.7) ? 'hunt' : choice(['travel', 'play', 'play']);
      this.tMode = rnd(25, 60);
    }
    if (this.mode === 'hunt' && (!sch || this.leaving)) this.mode = 'travel';
    // «Common bottlenose dolphin»: акула рядом — стая сбивается плотнее и уходит от неё (нападает она на детёнышей)
    const shark = this.eco.agents.find(a => a.species === 'shark' && !a.done && a.state !== 'leave' && Math.abs(a.x - this.x) < 0.4);
    if (shark && !this.leaving && this.guardOf !== shark.uid) {
      this.guardOf = shark.uid; this.mode = 'guard'; this.tMode = rnd(20, 35); this.vx = copysign(Math.abs(this.vx) || 0.012, this.x - shark.x || 1.0);
      for (const d of this.members) d.relate(shark, 'from', this.tMode);
      this.eco._out.push({ type: 'dolphin_guard', text: 'дельфины сбились плотнее и уходят — рядом акула', intensity: 0.3, duration: 3.0,
        x: this.x, dist: this.dist, agent: 0, voice: 0, act: 'guard' });
    }
    if (this.mode === 'hunt') {
      this.x += Math.max(-0.02, Math.min(0.02, (sch.x - this.x) * 0.05)) * dt;
      if (Math.random() < 0.3 * dt) this.eco.disturb(this.x, 0.8);
      for (const d of this.members) if (d.rel !== sch.uid) d.relate(sch, 'to', 8);
      // догнали косяк — сгоняют его в плотный шар у поверхности: рыба выпрыгивает, слетаются птицы («Shoaling and schooling»)
      if (Math.abs(sch.x - this.x) < 0.2 && sch.ball <= 0) {
        sch.ball = rnd(20, 35); this.eco.feedAt(sch, sch.ball);
        this.eco._out.push({ type: 'dolphin_herd', text: 'дельфины сбили косяк в шар и по очереди врезаются в него', intensity: 0.4, duration: 3.0,
          x: this.x, dist: this.dist, agent: 0, voice: 0, act: 'herd' });
      }
    } else {
      this.x += this.vx * dt * (this.mode === 'play' ? 0.3 : this.mode === 'rest' ? 0.15 : this.mode === 'guard' ? 1.6 : 1.0);
    }
    this.dist = Math.max(0.2, Math.min(0.8, this.dist + gauss(0, 0.01) * Math.sqrt(dt)));
    if (this.leaving && Math.abs(this.x) > 1.35) this.done = true;
  }
}

class Dolphin extends Agent {
  constructor(eco, pod) {
    super(eco, 'dolphin', 'дельфин', pod.x, pod.dist);
    this.pod = pod;
    this.ox = rnd(-0.12, 0.12); this.od = rnd(-0.06, 0.06);
    this.tWhistle = rnd(60, 150) * this.talk; this.tJump = this._jumpGap();
  }
  _jumpGap() {
    const r = { travel: [60, 140], play: [12, 30], hunt: [18, 40], rest: [150, 320], guard: [120, 240] }[this.pod.mode];
    return rnd(r[0], r[1]);
  }
  step(dt) {
    let out = this._runPending(dt);
    const pod = this.pod;
    this.x = pod.x + this.ox; this.dist = Math.max(0.1, Math.min(1.0, pod.dist + this.od));
    if (pod.done) { this.done = true; return out; }
    this.tWhistle -= dt * (pod.mode === 'rest' ? 0.4 : 1.0); this.tJump -= dt;
    if (this.tWhistle <= 0) { out = out.concat(this.callEvent(`${this.label} свистит`, 'whistle')); this.tWhistle = rnd(60, 150) * this.talk; }
    if (this.tJump <= 0) { out = out.concat(this._jump()); this.tJump = this._jumpGap(); }
    return out;
  }
  _jump() {
    const out = [this.ev('jump_splash', `${this.label} выпрыгнул из воды`, 0.6, 1.5, 'jump')];
    if (this.pod.mode === 'play')
      for (const d of this.pod.members) if (d !== this && !d.done && Math.random() < 0.5)
        d.later(rnd(0.3, 1.5), 'jump_splash', `${d.label} прыгнул следом`, 'follow');
    if (Math.random() < 0.15) this.later(rnd(0.6, 1.2), 'dolphin', `${this.label} свистит после прыжка`, 'whistle');
    return out;
  }
}

// ---------------------------------------------------------------- киты, морские львы, косяк рыб
class Whale extends Agent {
  constructor(eco, instant = false) {
    super(eco, 'whale', 'кит', rnd(-0.7, 0.7), rnd(0.6, 0.9));
    this.vx = rnd(-0.004, 0.004); this.cycles = randint(2, 4);
    this.state = 'surface'; this.tState = rnd(40, 90); this.tSong = rnd(8, 20);
    this.announced = instant;
    // «Humpback whale» (Википедия): поёт самец и под водой; на поверхности — серия выдохов-фонтанов, изредка прыжок
    // во весь рост или шлепок хвостом
    this.male = Math.random() < 0.6; this.tBlow = rnd(6, 14); this.tShow = rnd(60, 160);
    // охота «пузырьковой сетью» на косяк, отдых у поверхности, шлепок грудным плавником, отгоняет косаток
    this.tFeed = rnd(20, 60); this.tMob = 0; this.rested = false;
  }
  leave() {
    if (this.state === 'leave') return [];
    this.state = 'leave';
    return [this.ev('whale_leave', `${this.label} ушёл в открытое море`, 0.2, 3.0, 'leave')];
  }
  step(dt, s) {
    let out = this._runPending(dt);
    this.x = Math.max(-0.9, Math.min(0.9, this.x + this.vx * dt * (this.state === 'rest' ? 0 : 1)));
    if (this.state !== 'leave') {   // песня: самец — и на поверхности, и в глубине; не певец изредка зовёт, только наверху
      this.tSong -= dt;
      if (this.tSong <= 0 && (this.male || this.state === 'surface')) {
        out = out.concat(this.callEvent(this.male ? `${this.label} ${this.state === 'dive' ? 'поёт в глубине' : 'поёт'}` : `${this.label} издаёт низкий зов`, 'song'));
        this.tSong = rnd(25, 50) * this.talk * (this.male ? 1 : 1.6);
      }
    }
    if (this.state === 'rest') {   // лежит у поверхности почти неподвижно, изредка выдыхает
      this.tState -= dt; this.tBlow -= dt;
      if (this.tBlow <= 0) { this.tBlow = rnd(30, 50); out.push(this.ev('whale_blow', `${this.label} тихо выдохнул, лёжа на воде`, 0.3, 3.0, 'blow')); }
      if (this.tState <= 0) { this.state = 'surface'; this.tState = rnd(20, 40); out.push(this.ev('whale_surface', `${this.label} очнулся и поплыл`, 0.3, 3.0, 'surface')); }
    } else if (this.state === 'surface') {
      if (!this.announced) { this.announced = true; out.push(this.ev('whale_arrive', `${this.label} показался и выпустил фонтан`, 0.7, 5.0, 'arrive')); }
      this.tState -= dt; this.tBlow -= dt; this.tShow -= dt; this.tFeed -= dt; this.tMob -= dt;
      if (this.tBlow <= 0) { this.tBlow = rnd(15, 30); out.push(this.ev('whale_blow', `${this.label} шумно выдохнул фонтаном`, 0.4, 3.0, 'blow')); }
      // косатки рядом: бьёт хвостом и плавниками, отгоняя их («Humpback whale»: горбачи прогоняют косаток, даже от чужих)
      const orca = this.eco.agents.find(a => a.species === 'orca' && !a.done && a.state !== 'leave' && Math.abs(a.x - this.x) < 0.6);
      if (orca && this.tMob <= 0) {
        this.tMob = rnd(20, 40); this.relate(orca, 'to', 20); orca.pod.life -= 25;
        out.push(this.ev('dive_splash', `${this.label} бьёт хвостом по воде, отгоняя косаток`, 0.7, 2.0, 'tailslap'));
      }
      const sch = this.eco.school;
      if (sch && !sch.done && Math.abs(sch.x - this.x) < 0.5 && this.tFeed <= 0) {
        this.tFeed = rnd(90, 200); this.relate(sch, 'to', 60); sch.ball = rnd(15, 25); sch.alert = Math.max(sch.alert, 12); this.eco.feedAt(this, 25);
        out.push(this.ev('whale_lunge', `${this.label} окружил косяк кольцом пузырей и вынырнул с раскрытой пастью`, 0.7, 3.0, 'lunge'));
      }
      if (this.tShow <= 0) {
        this.tShow = rnd(120, 260); const r = Math.random();
        out.push(r < 0.3 ? this.ev('jump_splash', `${this.label} выпрыгнул из воды во весь рост и рухнул обратно`, 0.9, 3.0, 'breach')
               : r < 0.65 ? this.ev('dive_splash', `${this.label} хлопнул хвостом по воде`, 0.7, 2.0, 'tailslap')
               : this.ev('dive_splash', `${this.label} перевернулся на бок и хлопает длинным плавником по воде`, 0.6, 2.0, 'pecslap'));
      }
      if (this.tState <= 0) {
        if (!this.rested && Math.random() < 0.25 + _night(s) * 0.4) {   // отдых у поверхности (чаще ночью), раз за визит
          this.rested = true; this.state = 'rest'; this.tState = rnd(40, 90);
          out.push(this.ev('whale_rest', `${this.label} замер у поверхности и отдыхает`, 0.2, 3.0, 'rest'));
        } else {
          this.state = 'dive'; this.tState = rnd(50, 140);
          out.push(this.ev('whale_dive', `${this.label} поднял хвост и ушёл на глубину`, 0.5, 4.0, 'dive'));
        }
      }
    } else if (this.state === 'dive') {
      this.tState -= dt;
      if (this.tState <= 0) {
        this.cycles -= 1;
        if (this.cycles <= 0) out = out.concat(this.leave());
        else { this.state = 'surface'; this.tState = rnd(40, 90); this.tBlow = rnd(15, 30);
          out.push(this.ev('whale_surface', `${this.label} снова всплыл подышать`, 0.4, 4.0, 'surface')); }
      }
    } else {
      this.dist = Math.min(1.0, this.dist + dt * 0.01);
      if (this.dist >= 1.0) this.done = true;
    }
    return out;
  }
}

// морские львы — по одному-двое на разных берегах (site: 0 — главный остров, 1..7 — островки), приходят из моря
// и уходят; x — место вдоль берега
class SeaLion extends Agent {
  constructor(eco, site, x, instant = false) {
    super(eco, 'sea_lion', 'морской лев', x, 0.5);
    this.site = site; this.announced = instant;
    this.tBark = rnd(40, 140) * this.talk; this.tSwim = rnd(120, 300); this.away = 0.0;
    this.raft = false; this.rafty = 0;
    this.life = rnd(240, 600);
  }
  leave() {
    if (this.state === 'leave') return [];
    this.state = 'leave'; this.tGone = 20.0;
    return [this.ev('sea_lion_leave', `${this.label} соскользнул в воду и уплыл`, 0.2, 3.0, 'leave')];
  }
  step(dt, s) {
    let out = this._runPending(dt);
    if (this.state === 'leave') { this.tGone -= dt; if (this.tGone <= 0) this.done = true; return out; }
    if (!this.announced) {
      this.announced = true;
      out.push(this.ev('sea_lion_arrive', `${this.label} выбрался на берег ${this.site ? 'островка' : 'острова'}`, 0.2, 3.0, 'arrive'));
    }
    this.life -= dt;
    if (this.life <= 0 && this.away <= 0) return out.concat(this.leave());
    // косатки рядом: лев в воде спешит на берег, лев на берегу купаться не идёт; и акула рядом
    // («California sea lion»: боится косаток и белых акул)
    const orca = this.eco.agents.some(a => a.species === 'orca' && !a.done && a.state !== 'leave' && Math.abs(a.x - this.x) < 0.5);
    const shark = this.eco.agents.find(a => a.species === 'shark' && !a.done && a.state !== 'leave' && Math.abs(a.x - this.x) < 0.4);
    if (this.away > 0) {
      if (orca || shark) {
        this.away = 0; this.raft = false; this.relate(null);
        out.push(this.ev('sea_lion_back', `${this.label} выскочил на берег, спасаясь от ${orca ? 'косаток' : 'акулы'}`, 0.3, 3.0, 'back')); return out;
      }
      this.away -= dt;
      // отдыхает на воде «плотиком», подняв ласты над водой
      if (!this.raft && this.rafty && this.away < this.rafty) {
        this.raft = true; out.push(this.ev('sea_lion_raft', `${this.label} лёг на воду «плотиком», подняв ласты`, 0.2, 3.0, 'raft'));
      }
      if (this.away <= 0) { this.raft = false; this.relate(null); out.push(this.ev('sea_lion_back', `${this.label} выбрался на камни`, 0.2, 3.0, 'back')); }
      return out;
    }
    const active = (s.daylight > 0.2 && _calm(s) > 0.3) ? 1.0 : 0.25;
    this.tBark -= dt * active; if (!orca && !shark) this.tSwim -= dt * (1 + _warm(s));   // в жару купается чаще
    if (this.tBark <= 0) { out = out.concat(this.callEvent(`${this.label} громко пролаял`, 'bark')); this.tBark = rnd(90, 240) * this.talk; }
    // дельфины охотятся на косяк — лев плывёт кормиться рядом («California sea lion»: кормится с дельфинами и птицами)
    const pod = this.eco.pods.find(p => p.mode === 'hunt' && !p.leaving);
    const sch = this.eco.school;
    if (pod && sch && !orca && !shark && active > 0.5 && Math.random() < 0.015 * dt) {
      this.relate(sch, 'to', 60); this.away = rnd(40, 70); this.rafty = 0; this.tSwim = rnd(120, 300);
      out.push(this.ev('dive_splash', `${this.label} плюхнулся в воду и поплыл к охоте дельфинов`, 0.4, 1.5, 'splash'));
      return out;
    }
    if (this.tSwim <= 0) {
      out.push(this.ev('dive_splash', `${this.label} плюхнулся в воду`, 0.4, 1.5, 'splash'));
      this.away = rnd(25, 60); this.tSwim = rnd(120, 300);
      this.rafty = Math.random() < 0.5 ? this.away * rnd(0.3, 0.7) : 0;
    }
    return out;
  }
}

class FishSchool extends Agent {
  constructor(eco) {
    super(eco, 'fish_school', 'косяк рыб', rnd(-0.6, 0.6), rnd(0.4, 0.7));
    this.fem = false; this.life = rnd(80, 200); this.alert = 0.0; this.vx = rnd(-0.006, 0.006); this.tJump = rnd(30, 70);
    this.fleeVx = 0.0;
    this.ball = 0.0;   // сбит охотниками в плотный шар у поверхности (с)
  }
  // хищник рядом: косяк шарахается в сторону от него (быстро, пока не пройдёт испуг)
  flee(fromX) { this.alert = Math.max(this.alert, 15.0); this.fleeVx = copysign(0.05, this.x - fromX || 1.0); }
  step(dt, s) {
    const out = [];
    this.alert = Math.max(0.0, this.alert - dt); this.ball = Math.max(0.0, this.ball - dt);
    // «Shoaling and schooling»: днём косяк держится стаей, ночью рассыпается и почти не шарахается;
    // в шаре не уходит — его держат охотники
    const night = s.daylight < 0.2;
    this.state = this.ball > 0 ? 'ball' : this.alert > 0 ? 'alert' : night ? 'shoal' : 'stay';
    const v = this.ball > 0 ? 0 : this.alert > 0 ? this.fleeVx * (night ? 0.4 : 1) : this.vx;
    this.x = Math.max(-0.85, Math.min(0.85, this.x + v * dt));
    this.life -= dt;
    if (this.life <= 0 || _calm(s) < 0.2) { this.done = true; return [this.ev('fish_school_gone', 'косяк рыб ушёл на глубину', 0.2, 3.0, 'leave')]; }
    this.tJump -= dt;
    if ((this.alert > 0 && Math.random() < (this.ball > 0 ? 0.35 : 0.25) * dt) || this.tJump <= 0) {
      const d = this.ev('flying_fish', 'летучая рыба выпрыгнула из воды', 0.5, 1.5, 'jump');
      d.x = Math.max(-1.0, Math.min(1.0, this.x + gauss(0, 0.08)));
      out.push(d); this.tJump = rnd(30, 70);
      this.eco.onFlyingFish(d.x);
    }
    return out;
  }
}

// ---------------------------------------------------------------- мелкие обитатели
// Каждый — агент со своей жизнью: приходит, живёт, что-то делает, реагирует на соседей, уходит.
// zone — где живёт (картинка ставит по ней): water — вокруг острова, reef — риф/отмели островков, shallow —
// отмель главного острова, shore — берег (site: 0 — главный остров, 1..7 — островки).
// max(s) — сколько их сейчас уместно, life/act — сколько живёт и как часто что-то делает (с).
const CRITTERS = {
  jellyfish: { name: 'медуза', fem: true, zone: 'water', drift: 0.012, life: [90, 240], act: [50, 110],
    max: s => _calm(s) * (1.2 + _night(s) * 1.8),
    says: [['мерно пульсирует у поверхности', 'rise'], ['дрейфует по течению', 'drift'], ['медленно опускается в глубину', 'sink'], ['светится в толще воды', 'glow']],
    arrive: 'всплыла из глубины', gone: 'опустилась в глубину' },
  shrimp_swarm: { name: 'рой креветок', fem: false, zone: 'reef', drift: 0.004, life: [80, 200], act: [50, 110],
    max: s => _calm(s) * 2.0,
    says: [['закипел у подводной скалы', 'boil'], ['вспыхивает в лучах у дна', 'flash'], ['щёлкает клешнями у рифа', 'snap']],
    arrive: 'собрался у рифа', gone: 'рассеялся у дна' },
  octopus: { name: 'осьминог', fem: false, zone: 'reef', drift: 0.003, life: [70, 180], act: [30, 80],
    max: s => _calm(s) * (0.4 + _night(s) * 0.9),
    says: [['сменил цвет и растворился среди камней', 'camo'], ['просунул щупальце в расщелину', 'reach'], ['ползёт по дну, перебирая щупальцами', 'crawl']],
    arrive: 'выбрался из расщелины', gone: 'спрятался в расщелину' },
  stingray: { name: 'скат', fem: false, zone: 'shallow', drift: 0.02, life: [60, 160], act: [30, 70],
    max: s => _calm(s) * (0.4 + _warm(s) * 1.0),
    says: [['бесшумно скользнул над дном', 'glide'], ['взмахнул крыльями у дна', 'flap'], ['зарылся в песок', 'bury'], ['роется в песке, за ним вьются рыбки', 'feed']],
    arrive: 'приплыл на отмель', gone: 'ушёл на глубину' },
  sea_turtle: { name: 'морская черепаха', fem: true, zone: 'water', drift: 0.01, life: [90, 220], act: [40, 90],
    max: s => _calm(s) * (0.3 + s.daylight * 0.8),
    says: [['медленно плывёт, глядя вверх', 'swim'], ['грузно опустилась на дно', 'rest'], ['щиплет водоросли на камнях', 'graze']],
    arrive: 'приплыла к острову', gone: 'уплыла в открытое море' },
  starfish: { name: 'морская звезда', fem: true, zone: 'shore', drift: 0.0, life: [240, 600], act: [150, 320],
    max: s => 2.0 + _calm(s) * 2.0,
    says: [['медленно ползёт по камню', 'crawl'], ['копошится в прибрежной луже', 'pool'], ['обхватила мидию и медленно её ест', 'feed']],
    arrive: 'показалась на мелководье', gone: 'уползла под камень' },
  crab: { name: 'краб', fem: false, zone: 'shore', drift: 0.006, life: [120, 300], act: [60, 150],
    max: s => 1.0 + _calm(s) * (1.0 + _night(s) * 1.5),
    says: [['бочком пробежал по песку', 'scuttle'], ['поднял клешни и замер', 'claws'], ['щёлкает клешнями у воды', 'snap'], ['стучит клешнёй по песку', 'drum']],
    arrive: 'выбрался из норки', gone: 'юркнул в норку' },
};

// мелкие обитатели чаще действуют в своё время: креветки, звезда, осьминог, краб — ночью (суточная миграция, «Octopus»,
// «Ghost crab»)
const NIGHT_ACT = { shrimp_swarm: 0.6, starfish: 0.5, octopus: 0.6, crab: 0.5 };
const alive = a => a && !a.done && a.state !== 'leave';

class Critter extends Agent {
  constructor(eco, species, instant = false, stranded = false) {
    const c = CRITTERS[species];
    super(eco, species, c.name, rnd(-0.9, 0.9), c.zone === 'water' ? rnd(0.15, 0.7) : c.zone === 'shallow' ? rnd(0.0, 0.25) : 0.0);
    this.c = c; this.fem = c.fem;
    this.site = c.zone === 'shore' ? pickSite() : c.zone === 'reef' ? randint(0, SITES - 1) : 0;   // у рифовых 0 — сам риф
    this.life = rnd(c.life[0], c.life[1]); this.tAct = rnd(c.act[0], c.act[1]) * (instant ? rnd(0.2, 1) : 1);
    this.hide = 0.0; this.announced = instant;
    // «Jellyfish»: после шторма медуз выносит на берег — лежит на песке, пока не смоет волной; к ней идут крабы
    this.stranded = stranded;
    if (stranded) { this.site = pickSite(); this.dist = 0.0; this.life = rnd(120, 240); this.state = 'stranded'; }
    this.tBreath = rnd(30, 80); this.mode = ''; this.modeT = 0.0;   // черепаха: всплытия; режим: sleep / bask
    this.tFear = 0.0;
  }
  leave(text = null) {
    if (this.state === 'leave') return [];
    this.state = 'leave'; this.tGone = 8.0;   // пара секунд — картинке уплыть/спрятаться
    return [this.ev(`${this.species}_leave`, `${this.label} ${text || (this.stranded ? 'смыло волной обратно в море' : this.c.gone)}`, 0.2, 2.0, 'leave')];
  }
  // крупный хищник рядом (акула, косатка; с pods — и охотящиеся дельфины)
  _pred(r, pods = false) {
    return this.eco.agents.find(a => alive(a) && Math.abs(a.x - this.x) < r &&
      (a.species === 'shark' || a.species === 'orca' || (pods && a.species === 'dolphin' && a.pod.mode === 'hunt')));
  }
  step(dt, s) {
    let out = this._runPending(dt);
    const c = this.c;
    if (this.state === 'leave') { this.tGone -= dt; if (this.tGone <= 0) this.done = true; return out; }
    if (!this.announced) { this.announced = true; out.push(this.ev(this.species, `${this.label} ${this.stranded ? 'выброшена штормом на песок' : c.arrive}`, 0.3, 3.0, 'arrive')); }
    this.life -= dt;
    if (this.stranded) return this.life <= 0 ? out.concat(this.leave()) : out;
    if (c.drift && !this.mode) this.x = Math.max(-0.95, Math.min(0.95, this.x + gauss(0, c.drift) * Math.sqrt(dt)));
    if (this.life <= 0 || (c.zone !== 'shore' && _calm(s) < 0.2)) return out.concat(this.leave());
    if (this.hide > 0) {   // краб в норке после испуга (или в жару)
      this.hide -= dt;
      if (this.hide <= 0) { this.state = 'stay'; out.push(this.ev(this.species, `${this.label} снова выбрался из норки`, 0.2, 2.0, 'back')); }
      return out;
    }
    this.tFear -= dt;
    // осьминог боится крупных хищников и охотящихся дельфинов: чернила, рывок — и в расщелину
    if (this.species === 'octopus') {
      const pred = this._pred(0.4, true);
      if (pred) return out.concat(this.leave(`выпустил чернила и рывком скрылся от ${{ shark: 'акулы', orca: 'косатки', dolphin: 'дельфинов' }[pred.species]}`));
    }
    // скат при хищнике зарывается в песок («Stingray»)
    if (this.species === 'stingray' && this.tFear <= 0) {
      const pred = this._pred(0.4, true);
      if (pred) {
        this.tFear = 60;
        out.push(this.ev(this.species, `${this.label} зарылся в песок, почуяв ${{ shark: 'акулу', orca: 'косаток', dolphin: 'дельфинов' }[pred.species]}`, 0.3, 2.0, 'bury'));
      }
    }
    if (this.species === 'sea_turtle') { out = out.concat(this._turtle(dt, s)); if (this.mode) return out; }
    // креветки прыскают врассыпную, когда над рифом идёт косяк рыб
    const sch = this.eco.school;
    if (this.species === 'shrimp_swarm' && sch && !sch.done && Math.abs(sch.x - this.x) < 0.35 && Math.random() < 0.03 * dt) {
      this.x = Math.max(-0.95, Math.min(0.95, this.x + copysign(0.15, this.x - sch.x || 1)));
      out.push(this.ev(this.species, `${this.label} метнулся врассыпную от рыб`, 0.3, 2.0, 'flee'));
    }
    if (this.species === 'crab') {
      // в дневную жару краб сидит в норке («Ghost crab»)
      if (s.daylight > 0.7 && _warm(s) > 0.6 && Math.random() < 0.004 * dt) {
        this.hide = rnd(30, 60); this.state = 'hide';
        out.push(this.ev(this.species, `${this.label} спрятался от жары в норку`, 0.2, 2.0, 'hide')); return out;
      }
      // медуза на песке того же берега — подбирается к ней
      const jelly = this.eco.agents.find(a => a.stranded && alive(a) && a.site === this.site);
      if (jelly && this.rel !== jelly.uid && Math.random() < 0.05 * dt) {
        this.relate(jelly, 'to', 40); out.push(this.ev(this.species, `${this.label} подбирает то, что выбросило штормом`, 0.2, 2.0, 'scavenge'));
      }
    }
    // осьминог ночью охотится на краба у кромки своего островка
    if (this.species === 'octopus' && this.site > 0 && s.daylight < 0.25 && Math.random() < 0.01 * dt) {
      const crab = this.eco.agents.find(a => a.species === 'crab' && a.state === 'stay' && !a.done && a.site === this.site);
      if (crab) {
        this.relate(crab, 'to', 10); crab.state = 'leave'; crab.tGone = 8.0;   // уйдёт из мира, когда картинка покажет поимку
        crab.later(3.0, 'crab_leave', `${crab.label} исчез в щупальцах осьминога`, 'leave');
        out.push(this.ev(this.species, `${this.label} подкрался к кромке и схватил краба`, 0.3, 2.0, 'eat'));
      }
    }
    this.tAct -= dt * (1 + (NIGHT_ACT[this.species] || 0) * _night(s));
    if (this.tAct <= 0) {
      this.tAct = rnd(c.act[0], c.act[1]);
      // черепаха иногда ловит медузу рядом (настоящая её еда)
      const jelly = this.species === 'sea_turtle' && this.eco.agents.find(a => a.species === 'jellyfish' && !a.stranded && alive(a) && Math.abs(a.x - this.x) < 0.3);
      if (jelly && Math.random() < 0.4) {
        this.relate(jelly, 'to', 6);
        out = out.concat(jelly.leave('исчезла в пасти черепахи'));
        out.push(this.ev(this.species, `${this.label} схватила медузу`, 0.3, 2.0, 'eat'));
      } else { const [txt, code] = choice(c.says); out.push(this.ev(this.species, `${this.label} ${txt}`, 0.3, 2.0, code)); }
    }
    return out;
  }
  // черепаха («Green sea turtle»): всплывает подышать каждую минуту-полторы; ночью спит, забившись под уступ рифа;
  // днём в тепло изредка выползает погреться на пляж; от акулы уходит
  _turtle(dt, s) {
    const out = [];
    const shark = this.eco.agents.find(a => a.species === 'shark' && alive(a) && Math.abs(a.x - this.x) < 0.4);
    if (shark && this.tFear <= 0 && this.mode !== 'bask') {
      this.tFear = 40; this.mode = ''; this.state = 'stay'; this.relate(shark, 'from', 25);
      out.push(this.ev(this.species, `${this.label} уходит к рифу подальше от акулы`, 0.3, 2.0, 'flee'));
      return out;
    }
    if (this.mode === 'sleep') {
      if (s.daylight > 0.3) { this.mode = ''; this.state = 'stay'; out.push(this.ev(this.species, `${this.label} проснулась и выплыла из-под уступа`, 0.2, 2.0, 'wake')); }
      return out;
    }
    if (this.mode === 'bask') {
      this.modeT -= dt;
      if (this.modeT <= 0 || _calm(s) < 0.4) { this.mode = ''; this.state = 'stay'; out.push(this.ev(this.species, `${this.label} сползла с пляжа обратно в воду`, 0.2, 2.0, 'swim')); }
      return out;
    }
    if (s.daylight < 0.15 && Math.random() < 0.02 * dt) {
      this.mode = 'sleep'; this.state = 'sleep';
      out.push(this.ev(this.species, `${this.label} уснула, забившись под уступ рифа`, 0.2, 2.0, 'sleep')); return out;
    }
    if (s.daylight > 0.6 && _warm(s) > 0.4 && _calm(s) > 0.6 && Math.random() < 0.0015 * dt) {
      this.mode = 'bask'; this.state = 'bask'; this.modeT = rnd(60, 120);
      out.push(this.ev(this.species, `${this.label} выползла на пляж погреться на солнце`, 0.2, 2.0, 'bask')); return out;
    }
    this.tBreath -= dt;
    if (this.tBreath <= 0) { this.tBreath = rnd(50, 90); out.push(this.ev(this.species, `${this.label} всплыла глотнуть воздуха`, 0.2, 2.0, 'breathe')); }
    return out;
  }
}

// ---------------------------------------------------------------- хищники: акула и косатки
// Акула держится у косяка рыб и иногда бросается на него (косяк шарахается, летучие рыбы выпрыгивают);
// кита и косаток боится — уходит на глубину. Косатки (стая 2–4) перекликаются, выпрыгивают, распугивают
// акулу, дельфинов и рыбу. Обе — редкие гостьи.
class Shark extends Agent {
  constructor(eco) {
    super(eco, 'shark', 'акула', rnd(-0.8, 0.8), rnd(0.35, 0.7));
    this.fem = true; this.life = rnd(90, 220); this.tHunt = rnd(15, 40); this.vx = rnd(-0.01, 0.01);
    this.state = 'cruise'; this.announced = false; this.tStalk = rnd(10, 30);
  }
  leave(flee = false) {
    if (this.state === 'leave') return [];
    this.state = 'leave';
    return [flee ? this.ev('shark_flee', `${this.label} испугалась и ушла на глубину`, 0.3, 3.0, 'flee')
                 : this.ev('shark_leave', `${this.label} ушла в открытое море`, 0.2, 3.0, 'leave')];
  }
  step(dt, s) {
    let out = this._runPending(dt);
    if (!this.announced) { this.announced = true; out.push(this.ev('shark', `${this.label}: спинной плавник режет воду`, 0.5, 4.0, 'arrive')); }
    if (this.state === 'leave') { this.dist = Math.min(1.0, this.dist + dt * 0.02); if (this.dist >= 1.0) this.done = true; return out; }
    this.life -= dt;
    const big = this.eco.agents.find(a => !a.done && a.state !== 'leave' && ((a.species === 'whale' && a.state === 'surface') || a.species === 'orca') && Math.abs(a.x - this.x) < 0.6);
    if (big) return out.concat(this.leave(true));
    if (this.life <= 0) return out.concat(this.leave());
    // «Great white shark»: караулит у берега, где морской лев ушёл купаться, — лев замечает и выскакивает на берег
    this.tStalk -= dt;
    const lion = this.tStalk <= 0 && this.eco.agents.find(a => a.species === 'sea_lion' && a.away > 0 && !a.done && Math.abs(a.x - this.x) < 0.7);
    if (lion) {
      this.tStalk = rnd(60, 120); this.relate(lion, 'to', 20); this.x += (lion.x - this.x) * 0.7;
      out.push(this.ev('shark_stalk', `${this.label} кружит у берега под плывущим морским львом`, 0.3, 3.0, 'stalk'));
    }
    const sch = this.eco.school;
    if (sch && !sch.done) this.x += Math.max(-0.015, Math.min(0.015, (sch.x - this.x) * 0.05)) * dt;
    else this.x = Math.max(-0.9, Math.min(0.9, this.x + this.vx * dt));
    // охотится из засады, чаще в сумерки и ночью
    this.tHunt -= dt * (1 + _dusk(s) + _night(s) * 0.5);
    if (sch && !sch.done && Math.abs(sch.x - this.x) < 0.25 && this.tHunt <= 0) {
      this.tHunt = rnd(25, 60); sch.flee(this.x); this.eco.disturb(this.x, 1.0); this.relate(sch, 'to', 10);
      out.push(this.ev('shark_hunt', `${this.label} бросилась на косяк рыб`, 0.7, 2.0, 'hunt'));
    }
    return out;
  }
}

// «Killer whale»: охотники на зверей подкрадываются молча — пока рядом морской лев в воде или дельфины, стая не
// перекликается; потом (добыча ушла) шумно перекликается. Выглядывают из воды (spyhop); на косяк — «карусель»: сбивают
// рыбу в шар и глушат ударами хвоста
class OrcaPod {
  constructor(eco) { this.eco = eco; this.side = choice([-1, 1]); this.x = this.side * 1.2; this.dist = rnd(0.45, 0.75);
    this.vx = -this.side * rnd(0.008, 0.014); this.life = rnd(120, 260); this.leaving = false; this.done = false; this.members = [];
    this.silent = false; this.tCarousel = rnd(30, 80); }
  step(dt) {
    this.life -= dt;
    if (!this.leaving && this.life <= 0) { this.leaving = true; this.vx = copysign(0.03, this.x || 1.0); }
    const prey = !this.leaving && this.eco.agents.find(a => !a.done && a.state !== 'leave' && Math.abs(a.x - this.x) < 0.6 &&
      ((a.species === 'sea_lion' && a.away > 0) || a.species === 'dolphin'));
    if (prey && !this.silent) {
      this.silent = true;
      for (const o of this.members) o.relate(prey, 'to', 45);
      this.eco._out.push({ type: 'orca_stalk', text: `косатки затихли и подкрадываются к ${prey.species === 'sea_lion' ? 'морскому льву' : 'дельфинам'}`,
        intensity: 0.3, duration: 3.0, x: this.x, dist: this.dist, agent: 0, voice: 0, act: 'stalk' });
    } else if (!prey && this.silent) {   // добыча ушла — снова голоса
      this.silent = false;
      for (const o of this.members) o.tCall = Math.min(o.tCall, rnd(1, 4));
    }
    const sch = this.eco.school;
    this.tCarousel -= dt;
    if (!this.leaving && !this.silent && sch && !sch.done && Math.abs(sch.x - this.x) < 0.4 && this.tCarousel <= 0) {
      this.tCarousel = rnd(90, 180); sch.ball = rnd(15, 25); sch.flee(this.x); this.eco.feedAt(sch, 20);
      const o = choice(this.members.filter(m => !m.done));
      if (o) { for (const m of this.members) m.relate(sch, 'to', 45);
        this.eco._out.push(o.ev('dive_splash', 'косатки сбили рыбу в шар и глушат её ударами хвоста', 0.6, 2.0, 'carousel')); }
    }
    this.x += this.vx * dt * (this.leaving ? 1 : (Math.abs(this.x) > 0.7 ? 1 : 0.3));
    if (this.leaving && Math.abs(this.x) > 1.35) this.done = true;
  }
}
class Orca extends Agent {
  constructor(eco, pod) {
    super(eco, 'orca', 'косатка', pod.x, pod.dist);
    this.fem = true; this.pod = pod; this.ox = rnd(-0.1, 0.1); this.od = rnd(-0.05, 0.05);
    this.tCall = rnd(20, 60) * this.talk; this.tBreach = rnd(60, 160); this.tSpy = rnd(40, 120);
  }
  step(dt) {
    let out = this._runPending(dt);
    const pod = this.pod;
    this.x = pod.x + this.ox; this.dist = Math.max(0.1, Math.min(1.0, pod.dist + this.od));
    if (pod.done) { this.done = true; return out; }
    this.state = pod.leaving ? 'leave' : pod.silent ? 'stalk' : 'stay';
    if (pod.leaving) return out;
    if (!pod.silent) this.tCall -= dt;
    this.tBreach -= dt; this.tSpy -= dt;
    if (this.tCall <= 0) { out = out.concat(this.callEvent(`${this.label} перекликается со стаей`, 'call')); this.tCall = rnd(45, 110) * this.talk; }
    if (this.tBreach <= 0 && !pod.silent) { out.push(this.ev('jump_splash', `${this.label} выпрыгнула из воды`, 0.8, 2.0, 'breach')); this.tBreach = rnd(80, 200); }
    if (this.tSpy <= 0) { this.tSpy = rnd(90, 200); out.push(this.ev('orca_spyhop', `${this.label} высунула голову из воды и огляделась`, 0.2, 3.0, 'spyhop')); }
    this.eco.disturb(this.x, 0.6);   // рыба рядом с косатками всё время настороже
    return out;
  }
}

// ---------------------------------------------------------------- пароход на горизонте
// Очень редкое событие: в случайной точке горизонта показывается пароход, несколько минут идёт вдоль него, 1–3 раза
// даёт далёкий гудок и скрывается. К острову не подходит: картинка ведёт его дугой ~1400 м, мимо дальнего острова
class Ship extends Agent {
  constructor(eco) {
    super(eco, 'ship', 'пароход', rnd(-0.9, 0.9), 1.0);
    this.life = rnd(150, 260); this.tHorn = rnd(15, 45); this.horns = randint(1, 3); this.announced = false;
  }
  leave() {
    if (this.state === 'leave') return [];
    this.state = 'leave'; this.tGone = 30.0;
    return [this.ev('ship_leave', `${this.label} скрылся за горизонтом`, 0.1, 3.0, 'leave')];
  }
  step(dt) {
    let out = this._runPending(dt);
    if (!this.announced) { this.announced = true; out.push(this.ev('ship', `на горизонте показался ${this.label}`, 0.2, 4.0, 'arrive')); }
    if (this.state === 'leave') { this.tGone -= dt; if (this.tGone <= 0) this.done = true; return out; }
    this.life -= dt; this.tHorn -= dt;
    if (this.tHorn <= 0 && this.horns > 0) { this.horns -= 1; this.tHorn = rnd(40, 90); out.push(this.ev('ship_horn', `${this.label} дал далёкий гудок`, 0.4, 6.0, 'horn')); }
    if (this.life <= 0) out = out.concat(this.leave());
    return out;
  }
}

// ---------------------------------------------------------------- вылупление черепашат
// Супер-редкое ночное событие: из песка на пляже главного острова выбирается выводок черепашат и ползёт к воде.
// Чтобы весь остальной мир считался точно так же, как без него: свой генератор случайных чисел (Ecosystem.hatchRng —
// от номера мира, Math.random не трогает) и вне списка агентов (никто другой его не видит — ни перебор агентов, ни
// счётчики, ни номера-uid других зверей). Картинке — в снимке, журналу — события 'hatching*'.
// Окно — глубокая ночь (time_of_day 0.85..0.15, ~9.6 мин из 32-минутных суток); раз за ночь бросаем жребий HATCH_P
// (в среднем раз в 6 ночей ≈ раз в 3 часа просмотра), в шторм — не в эту ночь
const HATCH = { crawl: 35, sea: 110, end: 150 };   // с какой секунды ползут к воде, добрались до моря, всё
class Hatching {
  constructor(eco, rng) {
    this.species = 'hatchling'; this.num = eco.hatchN = (eco.hatchN || 0) + 1; this.uid = 1e6 + this.num;
    this.site = 0; this.x = rng() * 1.6 - 0.8; this.dist = 0; this.cnt = 10 + Math.floor(rng() * 9);
    this.state = 'emerge'; this.t = 0; this.done = false; this.rel = 0; this.rk = '';
  }
  ev(type_, text, act) { return { type: type_, text, intensity: 0.3, duration: 3.0, x: this.x, dist: this.dist, agent: this.uid, voice: 0, act }; }
  step(dt) {
    const t0 = this.t; this.t += dt; const at = k => t0 < k && this.t >= k, out = [];
    if (!this.told) { this.told = true; out.push(this.ev('hatching', `на пляже из песка выбираются черепашата — ${this.cnt} малышей`, 'emerge')); }
    if (at(HATCH.crawl)) { this.state = 'crawl'; out.push(this.ev('hatching_crawl', 'черепашата наперегонки ползут к воде', 'crawl')); }
    if (at(HATCH.sea)) { this.state = 'sea'; out.push(this.ev('hatching_sea', 'черепашата добрались до моря и уплывают', 'sea')); }
    if (this.t >= HATCH.end) this.done = true;
    return out;
  }
}
const mulberry = seed => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; };

// ---------------------------------------------------------------- экосистема
export class Ecosystem {
  constructor(s, seed = 0) {
    this.hatchRng = mulberry((seed ^ 0x5EED7A11) >>> 0); this.hatch = null; this.hatchAt = null; this.hatchWin = false;
    this.agents = []; this.pods = []; this.orcaPods = []; this.school = null;
    this._uid = 0; this._nums = {}; this.tEval = 0.0; this._out = [];
    this.feed = null;   // где сейчас кормёжка (охотник или косяк) — туда слетаются птицы: {a, t}
    this.wasStorm = false;
    // морские львы на старте: 0–1 группа
    for (let g = 0, ng = randint(0, 1); g < ng; g++) this._lionGroup(true);
    for (let i = 0; i < 4; i++) this._manage(s, true);
    this._out = [];
  }
  nextUid() { this._uid += 1; return this._uid; }
  nextNum(species) { this._nums[species] = (this._nums[species] || 0) + 1; return this._nums[species]; }
  count(species) { return this.agents.filter(a => a.species === species && a.state !== 'leave' && !a.done && !a.stranded).length; }
  // охотник сбил рыбу к поверхности — здесь кормёжка на t секунд
  feedAt(a, t) { this.feed = { a, t }; }
  // птица поймала рыбу — чайка рядом пытается её отнять («Gull», «Brown pelican»: клептопаразитизм)
  onCatch(bird, delay) {
    const g = choice(this.agents.filter(a => a.species === 'seagull' && a.state === 'stay' && !a.done));
    if (!g || Math.random() >= 0.4) return;
    g.relate(bird, 'to', delay + 8);
    g.later(delay + rnd(0.5, 1.5), 'seagull', `${g.label} налетела на ${bird.name}а №${bird.num} и пытается отнять рыбу`, 'steal');
  }
  // летучая рыба в воздухе — крачка или чайка рядом иногда хватает её на лету («Flying fish»)
  onFlyingFish(x) {
    const b = this.agents.find(a => (a.species === 'tern' || a.species === 'seagull') && a.state === 'stay' && !a.done && Math.abs(a.x - x) < 0.3);
    if (b && Math.random() < 0.12) b.later(rnd(0.6, 1.2), b.species, `${b.label} подхватила летучую рыбу на лету`, 'catch');
  }

  // птица нырнула у берега: крабы рядом прячутся в норки
  startleShore(x) {
    for (const a of this.agents)
      if (a.species === 'crab' && a.state === 'stay' && a.hide <= 0 && Math.abs(a.x - x) < 0.2 && Math.random() < 0.3) {
        a.hide = rnd(12, 30); a.state = 'hide';
        this._out.push(a.ev('crab', `${a.label} юркнул в норку от птицы`, 0.2, 2.0, 'hide'));
      }
  }
  // группа морских львов (чаще один, иногда двое) выбирается на один берег
  _lionGroup(instant = false) {
    const site = pickSite(), x0 = rnd(-0.8, 0.8);
    for (let i = 0, n = Math.random() < 0.7 ? 1 : 2; i < n; i++) this.agents.push(new SeaLion(this, site, Math.max(-0.95, Math.min(0.95, x0 + i * 0.12)), instant));
  }
  disturb(x, strength) {
    const sch = this.school;
    if (sch && strength > 0 && Math.abs(sch.x - x) < 0.45) sch.alert = Math.max(sch.alert, 12.0 * strength);
  }
  scare() {
    if (this.school) this.school.alert = 15.0;
    for (const p of this.pods) { p.leaving = true; p.vx = copysign(0.03, p.x || 1.0); }
  }
  onCall(src, budget) {
    const [prob, , delay] = REPLY[src.species] || [0, 0, [1, 2]];
    if (budget <= 0 || prob <= 0) return;
    for (const o of this.agents) {
      if (o === src || o.done || o.species !== src.species || o.state === 'leave') continue;
      if (src.species === 'whale' && o.state !== 'surface') continue;
      if (src.species === 'sea_lion' && o.site !== src.site && Math.random() < 0.7) continue;   // соседи по берегу отвечают охотнее
      if (Math.abs(o.x - src.x) < 0.9 && Math.random() < prob && !o.pending.some(p => p[3] === 'reply'))
        o.later(rnd(delay[0], delay[1]), o.species, `${o.label} отвечает ${src.label}`, 'reply', budget - 1);
    }
  }
  _spawnBird(species, instant) {
    const b = new Bird(this, species, instant); this.agents.push(b);
    if (species === 'pelican') for (let i = 0, n = randint(0, 2); i < n; i++) this.agents.push(new Bird(this, species, instant, b));
  }

  _manage(s, instant = false) {
    const day = s.daylight, c = _calm(s), dk = _dusk(s);
    const schoolOn = this.school && !this.school.done;
    const targets = {
      seagull: c < 0.15 ? 0 : Math.round(Math.pow(day, 0.6) * c * 5.0 + (schoolOn && day > 0.3 ? 1.5 : 0)),
      tern: c < 0.15 ? 0 : Math.round(Math.pow(day, 0.6) * c * 2.2),
      cormorant: (day > 0.35 && c > 0.3) ? 1 : 0,
      pelican: (day > 0.5 && c > 0.5) ? 1 : 0,
    };
    for (const sp of Object.keys(targets)) {
      const tgt = targets[sp];
      let n = this.count(sp);
      while (n < tgt && (instant || Math.random() < 0.5)) { this._spawnBird(sp, instant); n += 1; if (!instant) break; }
      if (n > tgt && Math.random() < 0.5) {
        const cand = this.agents.filter(a => a.species === sp && a.state !== 'leave' && !a.done);
        if (cand.length) this._out = this._out.concat(choice(cand).leave());
      }
    }
    if (this.count('albatross') === 0 && day > 0.4 && c > 0.3 && Math.random() < 0.01) this._spawnBird('albatross', instant);

    if (!this.pods.length && c > 0.4 && (day * c > 0.3 || dk > 0.3) && ((instant && Math.random() < 0.4) || Math.random() < 0.012)) {
      const pod = new Pod(this, instant), memberCount = randint(3, 5);
      for (let i = 0; i < memberCount; i++) { const d = new Dolphin(this, pod); pod.members.push(d); this.agents.push(d); }
      this.pods.push(pod);
      this._out.push({ type: 'dolphin_pod', text: `стая из ${pod.members.length} дельфинов идёт вдоль берега`,
        intensity: 0.4, duration: 4.0, x: pod.x, dist: pod.dist, agent: 0, voice: 0, act: 'arrive' });
    }
    const w = 0.4 + dk * 0.8 + (1 - day) * 0.5;
    if (this.count('whale') === 0 && c > 0.3 && Math.random() < 0.010 * w) this.agents.push(new Whale(this, instant));

    if ((!this.school || this.school.done) && c > 0.4 && Math.random() < 0.02) {
      this.school = new FishSchool(this); this.agents.push(this.school);
      this._out.push({ type: 'fish_school', text: 'косяк рыб подошёл к берегу', intensity: 0.3, duration: 4.0,
        x: this.school.x, dist: this.school.dist, agent: this.school.uid, voice: 0, act: 'arrive' });
    }
    // акула: редко, чаще в сумерки/ночью и когда у острова есть косяк рыб
    const sw = (0.3 + (1 - day) * 0.6 + dk * 0.5) * (schoolOn ? 2.0 : 0.6);
    if (!instant && this.count('shark') === 0 && c > 0.3 && Math.random() < 0.0035 * sw) this.agents.push(new Shark(this));
    // морские львы: днём до 2, ночью никого нового; приходят по одному-двое, уходят по одному
    const lions = this.count('sea_lion'), lionTgt = Math.round(1.5 * day * c);
    if (!instant && lions < lionTgt && Math.random() < 0.01) this._lionGroup();
    if (!instant && lions > lionTgt && Math.random() < 0.05) {
      const cand = this.agents.filter(a => a.species === 'sea_lion' && a.state !== 'leave' && a.away <= 0);
      if (cand.length) this._out = this._out.concat(choice(cand).leave());
    }
    // мелкие обитатели: по одному, пока их меньше, чем уместно по погоде/времени суток
    for (const sp of Object.keys(CRITTERS)) {
      const tgt = Math.round(CRITTERS[sp].max(s));
      let n = this.count(sp);
      while (n < tgt && (instant || Math.random() < 0.08)) { this.agents.push(new Critter(this, sp, instant)); n += 1; if (!instant) break; }
    }
    // косатки: очень редко, стаей 2–3; дельфины при них уходят
    if (!instant && !this.orcaPods.length && c > 0.35 && Math.random() < 0.0005) {
      const pod = new OrcaPod(this), n = randint(2, 3);
      for (let i = 0; i < n; i++) { const o = new Orca(this, pod); pod.members.push(o); this.agents.push(o); }
      this.orcaPods.push(pod);
      for (const p of this.pods) { p.leaving = true; p.vx = copysign(0.03, p.x || 1.0); }
      this._out.push({ type: 'orca_arrive', text: `стая из ${n} косаток подошла к острову`, intensity: 0.5, duration: 4.0,
        x: pod.x, dist: pod.dist, agent: 0, voice: 0, act: 'arrive' });
    }
    // шторм кончился — на берег выброшено 1–2 медузы
    if (!instant && this.wasStorm && !s.storm_active) for (let i = 0, n = randint(1, 2); i < n; i++) this.agents.push(new Critter(this, 'jellyfish', false, true));
    this.wasStorm = s.storm_active;
    // пароход: очень редко (в среднем раз в ~35 мин), только один
    if (!instant && this.count('ship') === 0 && Math.random() < 0.0015) this.agents.push(new Ship(this));
    if (c < 0.15) for (const a of this.agents) if ((a instanceof Whale || a instanceof Bird || a instanceof Shark) && a.state !== 'leave') this._out = this._out.concat(a.leave());
  }

  // для проверки картинки: вызвать редкого гостя сейчас (main.js, ?spawn=shark,orca) — на логику не влияет
  debugSpawn(kind) {
    if (kind === 'shark') this.agents.push(new Shark(this));
    else if (CRITTERS[kind]) this.agents.push(new Critter(this, kind));
    else if (kind === 'sea_lion') this._lionGroup();
    else if (kind === 'ship') this.agents.push(new Ship(this));
    else if (kind === 'stranded') this.agents.push(new Critter(this, 'jellyfish', false, true));
    else if (BIRDS[kind]) this._spawnBird(kind, false);
    else if (kind === 'whale') this.agents.push(new Whale(this));
    else if (kind === 'fish_school') { if (!this.school) { this.school = new FishSchool(this); this.agents.push(this.school); } }
    else if (kind === 'dolphin') {
      if (!this.pods.length) { const pod = new Pod(this); for (let i = 0, n = randint(3, 5); i < n; i++) { const d = new Dolphin(this, pod); pod.members.push(d); this.agents.push(d); } this.pods.push(pod); }
    }
    else if (kind === 'orca') {
      const pod = new OrcaPod(this), n = randint(2, 3);
      for (let i = 0; i < n; i++) { const o = new Orca(this, pod); pod.members.push(o); this.agents.push(o); }
      this.orcaPods.push(pod);
    }
    else if (kind === 'hatching' && !this.hatch) this.hatch = new Hatching(this, this.hatchRng);   // ?spawn=hatching
  }

  // вылупление черепашат — жребий раз за ночь, своим генератором (см. Hatching)
  _hatchStep(dt, s) {
    const tod = s.time_of_day, win = tod > 0.85 || tod < 0.15;
    if (win && !this.hatchWin) this.hatchAt = this.hatchRng() < Ecosystem.HATCH_P ? s.t + this.hatchRng() * 200 : null;   // новая ночь (или перемотка в ночь)
    this.hatchWin = win;
    if (this.hatchAt !== null && s.t >= this.hatchAt && !this.hatch) { this.hatchAt = null; if (win && !s.storm_active) this.hatch = new Hatching(this, this.hatchRng); }
    if (!this.hatch) return [];
    const out = this.hatch.step(dt);
    if (this.hatch.done) this.hatch = null;
    return out;
  }

  // снимок для картинки: [{id, sp, n, x, dist, st, site}] (site — берег/риф у львов и мелких обитателей, иначе -1)
  snapshot() {
    return this.agents.map(a => {
      let st = a.state;
      if (a instanceof Dolphin) st = a.pod.mode;
      else if (a instanceof SeaLion && a.away > 0 && st !== 'leave') st = a.raft ? 'raft' : 'away';
      return { id: a.uid, sp: a.species, n: a.num, x: +a.x.toFixed(3), dist: +a.dist.toFixed(3), st, site: a.site ?? -1, rel: a.rel, rk: a.rk };
    }).concat(this.hatch ? [{ id: this.hatch.uid, sp: 'hatchling', n: this.hatch.num, x: +this.hatch.x.toFixed(3), dist: 0, st: this.hatch.state, site: 0, rel: 0, rk: '', cnt: this.hatch.cnt }] : []);
  }

  update(dt, s) {
    let events = this._out; this._out = [];
    this.tEval -= dt;
    if (this.tEval <= 0) { this.tEval = 3.0; this._manage(s); events = events.concat(this._out); this._out = []; }
    for (const p of this.pods) p.step(dt, s);
    for (const p of this.orcaPods) p.step(dt);
    for (const a of this.agents) events = events.concat(a.step(dt, s));
    if (this._out.length) { events = events.concat(this._out); this._out = []; }
    this.agents = this.agents.filter(a => !a.done);
    // связи: истекают по времени или когда партнёр ушёл
    const ids = new Set(this.agents.filter(a => a.state !== 'leave').map(a => a.uid));
    for (const a of this.agents) if (a.rel && ((a.relT -= dt) <= 0 || !ids.has(a.rel))) a.relate(null);
    if (this.feed && ((this.feed.t -= dt) <= 0 || this.feed.a.done || this.feed.a.state === 'leave')) this.feed = null;
    this.pods = this.pods.filter(p => !p.done); this.orcaPods = this.orcaPods.filter(p => !p.done);
    if (this.school && this.school.done) this.school = null;
    return events.concat(this._hatchStep(dt, s));   // последним — порядок остальных событий не меняется
  }
}
Ecosystem.HATCH_P = 1 / 6;   // вероятность вылупления за ночь (для проверок можно поднять до 1)
