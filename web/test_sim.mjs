// Самопроверка симуляции (node web/test_sim.mjs): частота событий в минуту при шаге 0.1 с и при шаге кадра
// (1/60 с). Если частоты расходятся — где-то вероятность считается «за вызов», а не «за секунду», и звук
// превращается в кашу.
import { OceanSimulation } from './sim.js';

const AUDIBLE = new Set(['splash', 'wave_break', 'surf_surge', 'dive_splash', 'jump_splash', 'seagull', 'tern', 'albatross',
  'cormorant', 'whale', 'dolphin', 'flying_fish', 'thunder', 'storm_start', 'sea_lion', 'orca', 'shark_hunt',
  'whale_arrive', 'whale_surface', 'whale_blow', 'ship_horn', 'whale_lunge']);   // выдох кита с фонтаном, гудок парохода

export function run(dt, minutes = 96, seed = 1) {
  const sim = new OceanSimulation({ seed });
  const per = {}, n = Math.round(minutes * 60 / dt);
  let audible = 0, maxWin = 0, rainT = 0; const win = [];   // скользящее окно 30 с — как «активность» на панели
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    for (const e of sim.update(dt)) {
      per[e.type] = (per[e.type] || 0) + 1;
      if (AUDIBLE.has(e.type)) audible++;
      if (!['wave_break', 'splash', 'surf_surge', 'surf_calm'].includes(e.type)) win.push(t);
    }
    if (sim.state.rain_active) rainT += dt;
    while (win.length && t - win[0] > 30) win.shift();
    maxWin = Math.max(maxWin, win.length);
  }
  return { per, audible: audible / minutes, maxWin, rainFrac: rainT / (minutes * 60) };
}

if (import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const mins = +(process.argv[2] || 96);
  const a = run(.1, mins), b = run(1 / 60, mins);
  const keys = [...new Set([...Object.keys(a.per), ...Object.keys(b.per)])].sort((x, y) => (b.per[y] || 0) - (b.per[x] || 0));
  console.log(`событий/мин за ${mins} мин:        dt=0.1   dt=1/60`);
  for (const k of keys) console.log(`  ${k.padEnd(20)} ${((a.per[k] || 0) / mins).toFixed(2).padStart(7)} ${((b.per[k] || 0) / mins).toFixed(2).padStart(8)}`);
  console.log(`  ЗВУЧАЩИХ/мин          ${a.audible.toFixed(1).padStart(7)} ${b.audible.toFixed(1).padStart(8)}`);
  console.log(`  доля времени с дождём   ${(a.rainFrac * 100).toFixed(1).padStart(6)}% ${(b.rainFrac * 100).toFixed(1).padStart(7)}%   (сутки = 32 мин)`);
  console.log(`  макс. событий за 30 с ${String(a.maxWin).padStart(7)} ${String(b.maxWin).padStart(8)}   (панель: 22 = 100%)`);
}
