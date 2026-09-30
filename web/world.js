// Ocean Murmur — источник данных: раньше был SSE-поток с колонки (Raspberry Pi считал мир на
// Python), теперь вся симуляция (sim.js/agents.js — порт ocean_sim.py/agents.py) крутится прямо
// здесь, в браузере (решение пользователя от 22.09.2026: «забудем про Raspberry, всё в браузере»).
// Колонка больше не нужна вообще — ни для расчёта мира, ни для данных. И картинка, и звук
// по-прежнему подписываются на один и тот же поток (_emit), поэтому всегда синхронны.
import { OceanSimulation } from './sim.js';

export class World {
  constructor() {
    this.stateHandlers = []; this.eventHandlers = [];
    this.sim = null;
  }
  onState(fn) { this.stateHandlers.push(fn); return this; }
  onEvent(fn) { this.eventHandlers.push(fn); return this; }
  _emit(m) { const hs = m.kind === 'state' ? this.stateHandlers : this.eventHandlers; for (const h of hs) h(m); }

  // запустить локальную симуляцию; startTod — час начала (0..1), опционально
  start({ startTod = null, seed = null } = {}) {
    this.sim = new OceanSimulation({ seed });
    if (startTod != null) this.sim.setStartTod(startTod);
    return this;
  }

  debugSpawn(kind) { this.sim?.eco?.debugSpawn(kind); }   // ?spawn=shark,orca — вызвать гостя для проверки картинки

  // настоящая перемотка — двигает часы живой симуляции (не предпросмотр)
  setTimeOfDay(frac) { this.sim?.setTimeOfDay(frac); }

  // вызывается каждый кадр из main.js: считает мир на dt вперёд и рассылает state/event тем же
  // способом, каким раньше приходили сообщения по SSE — потребители (Visual/OceanAudio) не знают
  // и не должны знать, что источник сменился
  step(dt) {
    if (!this.sim) return;
    const events = this.sim.update(dt);
    const s = this.sim.state;
    this._emit({ ...s, agents: this.sim.agentsSnapshot() });
    for (const e of events) this._emit(e);
  }
}
