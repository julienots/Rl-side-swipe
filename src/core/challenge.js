// Modes solo : défis de précision (séries de tirs) et parcours d'obstacles chronométré.
import { PHYS } from './constants.js';
import { buildArena, getArenaDef, buildCourse, getCourseDef } from './arena.js';
import { World } from './world.js';
import { createCar, placeCar } from './car.js';
import { resetBall } from './physics.js';

// ---------------------------------------------------------------------------
// Défis de précision

export const PRECISION_PACKS = [
  {
    id: 'bases', name: 'Fondamentaux', desc: 'Tirs au sol et volées simples.',
    arenaId: 'horizon',
    scenarios: [
      { name: 'Bout portant', hint: 'Fonce et pousse la balle dans la cage.', car: { x: 4, facing: 1 }, ball: { x: 10, y: 1.1 }, kind: 'goal', time: 7 },
      { name: 'Ballon roulant', hint: 'Prends la balle de face au bon moment.', car: { x: -6, facing: 1 }, ball: { x: 8, y: 1.1, vx: -6 }, kind: 'goal', time: 7 },
      { name: 'Reprise', hint: 'Saute pour frapper la balle qui retombe.', car: { x: 2, facing: 1 }, ball: { x: 12, y: 9, vx: -3.5, vy: 2 }, kind: 'goal', time: 7 },
      { name: 'Lucarne', hint: 'Marque dans la moitié haute de la cage.', car: { x: 0, facing: 1 }, ball: { x: 9, y: 1.1 }, kind: 'goalHigh', time: 8 },
      { name: 'Contre-pied', hint: 'La balle part vers ton camp : fais demi-tour !', car: { x: 6, facing: 1 }, ball: { x: 10, y: 3, vx: -7, vy: 6 }, kind: 'goal', time: 9 },
    ],
  },
  {
    id: 'airs', name: 'Haute voltige', desc: 'Frappes aériennes, plafond et cible.',
    arenaId: 'orbitale',
    scenarios: [
      { name: 'Montée', hint: 'Saute, boost vers le haut, frappe !', car: { x: 4, facing: 1 }, ball: { x: 13, y: 6, vy: 9 }, kind: 'goal', time: 8 },
      { name: 'Chandelle', hint: 'Attends que la balle redescende.', car: { x: -2, facing: 1 }, ball: { x: 6, y: 3, vx: 1, vy: 16 }, kind: 'goal', time: 9 },
      { name: 'Cible murale', hint: 'Touche la cible lumineuse avec la balle.', car: { x: 0, facing: 1 }, ball: { x: 7, y: 1.1 }, kind: 'target', target: { x: 19, y: 12, r: 2.6 }, time: 9 },
      { name: 'Ricochet', hint: 'Utilise le plafond pour retomber dans la cage.', car: { x: -8, facing: 1 }, ball: { x: -1, y: 1.1, vy: 14, vx: 2 }, kind: 'goal', time: 9 },
      { name: 'Smash', hint: 'Frappe forte : plus de 25 de vitesse.', car: { x: -6, facing: 1 }, ball: { x: 6, y: 1.1 }, kind: 'goalFast', minSpeed: 25, time: 8 },
    ],
  },
];

export function getPack(id) { return PRECISION_PACKS.find((p) => p.id === id) || PRECISION_PACKS[0]; }

export function starsFor(successes, total) {
  if (successes >= total) return 3;
  if (successes >= Math.ceil(total * 0.6)) return 2;
  if (successes >= 1) return 1;
  return 0;
}

export class PrecisionSession {
  constructor(cfg = {}) {
    this.mode = 'precision';
    this.pack = getPack(cfg.packId);
    this.arenaDef = getArenaDef(this.pack.arenaId);
    this.arena = buildArena(this.arenaDef);
    this.world = new World(this.arena, { unlimitedBoost: false, boostRegen: 0 });
    const p = cfg.player || {};
    this.world.addCar(createCar({ id: 0, team: 0, name: p.name || 'Vous', isHuman: true, cosmetics: p.cosmetics, controls: p.controls }));
    this.index = 0;
    this.results = [];
    this.events = [];
    this.state = 'prep';
    this.stateTime = 0;
    this.timeLeft = 0;
    this.result = null;
    this.lastOutcome = null;
    this.setupScenario();
  }

  get cars() { return this.world.cars; }
  get ball() { return this.world.ball; }
  get player() { return this.world.cars[0]; }
  get scenario() { return this.pack.scenarios[this.index]; }

  emit(type, data = {}) { this.events.push({ type, t: this.world.time, ...data }); }
  drainEvents() { const e = this.events; this.events = []; return e; }
  setState(s) { this.state = s; this.stateTime = 0; this.emit('state', { state: s }); }

  setupScenario() {
    const sc = this.scenario;
    const car = this.player;
    placeCar(car, sc.car.x, sc.car.facing);
    car.boost = 100;
    car.frozen = true;
    resetBall(this.ball, sc.ball.x, sc.ball.y, 0, 0);
    this.ball.frozen = true;
    this.timeLeft = sc.time;
    this.targetHit = false;
    this.setState('prep');
    this.emit('scenario', { index: this.index, name: sc.name });
  }

  step(dt, humanInputs = {}) {
    if (this.state === 'ended') return;
    this.stateTime += dt;
    const sc = this.scenario;
    if (this.state === 'prep' && this.stateTime >= 1.2) {
      this.player.frozen = false;
      this.ball.frozen = false;
      this.ball.vx = sc.ball.vx || 0; this.ball.vy = sc.ball.vy || 0;
      this.setState('playing');
      this.emit('kickoff');
    }
    this.world.step(dt, [humanInputs[0]]);
    for (const ev of this.world.drainEvents()) this.events.push(ev);

    if (this.state === 'playing') {
      this.timeLeft -= dt;
      const b = this.ball;
      if (sc.kind === 'target' && sc.target && Math.hypot(b.x - sc.target.x, b.y - sc.target.y) < sc.target.r + b.r * 0.5) {
        this.complete(true);
        return;
      }
      for (const g of this.arena.goals) {
        const crossed = g.side > 0 ? b.x - b.r > g.lineX : b.x + b.r < g.lineX;
        if (crossed && b.y < g.top) {
          const ok = g.side > 0 && this.checkGoalKind(sc, b);
          this.complete(ok, g.side < 0 ? 'Mauvaise cage !' : ok ? null : this.failReason(sc));
          return;
        }
      }
      if (this.timeLeft <= 0) this.complete(false, 'Temps écoulé');
    } else if (this.state === 'outcome' && this.stateTime >= 1.6) {
      this.index++;
      if (this.index >= this.pack.scenarios.length) this.finish();
      else this.setupScenario();
    }
  }

  checkGoalKind(sc, b) {
    if (sc.kind === 'goalHigh') return b.y > this.arena.G * 0.5;
    if (sc.kind === 'goalFast') return Math.hypot(b.vx, b.vy) >= sc.minSpeed;
    if (sc.kind === 'target') return false;
    return true;
  }

  failReason(sc) {
    if (sc.kind === 'goalHigh') return 'Trop bas !';
    if (sc.kind === 'goalFast') return 'Pas assez puissant !';
    if (sc.kind === 'target') return 'Il fallait toucher la cible';
    return 'Raté';
  }

  complete(success, reason = null) {
    this.results[this.index] = success;
    this.lastOutcome = { success, reason };
    this.ball.frozen = true;
    if (success) this.ball.hidden = true;
    this.player.frozen = true;
    this.setState('outcome');
    this.emit(success ? 'challengeSuccess' : 'challengeFail', { index: this.index, reason, x: this.ball.x, y: this.ball.y });
  }

  finish() {
    const successes = this.results.filter(Boolean).length;
    const total = this.pack.scenarios.length;
    this.result = { mode: 'precision', packId: this.pack.id, successes, total, stars: starsFor(successes, total), results: [...this.results] };
    this.setState('ended');
    this.emit('end', { result: this.result });
  }

  hud() {
    const sc = this.scenario || this.pack.scenarios[this.pack.scenarios.length - 1];
    return {
      mode: 'precision', state: this.state, stateTime: this.stateTime, timeLeft: Math.max(0, this.timeLeft),
      index: this.index, total: this.pack.scenarios.length, name: sc.name, hint: sc.hint,
      results: this.results, outcome: this.lastOutcome, boost: this.player.boost, target: sc.kind === 'target' ? sc.target : null,
    };
  }
}

// ---------------------------------------------------------------------------
// Parcours d'obstacles

export function medalFor(time, medals) {
  if (time <= medals.gold) return 'or';
  if (time <= medals.silver) return 'argent';
  if (time <= medals.bronze) return 'bronze';
  return null;
}

export class CourseSession {
  constructor(cfg = {}) {
    this.mode = 'course';
    this.courseDef = getCourseDef(cfg.courseId);
    this.arena = buildCourse(this.courseDef);
    this.arenaDef = { id: this.courseDef.id, theme: this.courseDef.theme, name: this.courseDef.name };
    this.world = new World(this.arena, { ball: false, boostRegen: 9 });
    const p = cfg.player || {};
    this.world.addCar(createCar({ id: 0, team: 0, name: p.name || 'Vous', isHuman: true, cosmetics: p.cosmetics, controls: p.controls }));
    this.checkpoints = this.courseDef.checkpoints;
    this.events = [];
    this.result = null;
    this.restart();
  }

  get cars() { return this.world.cars; }
  get ball() { return this.world.ball; }
  get player() { return this.world.cars[0]; }

  emit(type, data = {}) { this.events.push({ type, t: this.world.time, ...data }); }
  drainEvents() { const e = this.events; this.events = []; return e; }
  setState(s) { this.state = s; this.stateTime = 0; this.emit('state', { state: s }); }

  restart() {
    const st = this.courseDef.start;
    placeCar(this.player, st.x, 1);
    this.player.boost = 100;
    this.player.frozen = true;
    this.next = 0;
    this.time = 0;
    this.respawns = 0;
    this.lastSafe = { x: st.x, y: PHYS.car.radius };
    this.result = null;
    this._lastCountdown = -1;
    this.setState('countdown');
  }

  /** Replace la voiture au dernier point de passage validé. */
  respawn() {
    if (this.state !== 'playing') return;
    const car = this.player;
    placeCar(car, this.lastSafe.x, 1, this.lastSafe.y);
    car.grounded = false;
    this.respawns++;
    this.emit('respawn');
  }

  step(dt, humanInputs = {}) {
    if (this.state === 'ended') return;
    this.stateTime += dt;
    if (this.state === 'countdown') {
      const remaining = Math.ceil(2 - this.stateTime);
      if (remaining !== this._lastCountdown && remaining > 0) { this._lastCountdown = remaining; this.emit('countdown', { n: remaining }); }
      if (this.stateTime >= 2) { this.player.frozen = false; this.setState('playing'); this.emit('kickoff'); }
    }
    this.world.step(dt, [humanInputs[0]]);
    for (const ev of this.world.drainEvents()) this.events.push(ev);
    if (this.state !== 'playing') return;
    this.time += dt;
    const car = this.player;
    const cp = this.checkpoints[this.next];
    if (cp && Math.hypot(car.x - cp.x, car.y - cp.y) < cp.r) {
      this.emit('checkpoint', { index: this.next, x: cp.x, y: cp.y, finish: !!cp.finish });
      this.lastSafe = cp.respawn ? { ...cp.respawn } : { x: cp.x, y: Math.max(PHYS.car.radius, cp.y) };
      this.next++;
      if (cp.finish || this.next >= this.checkpoints.length) this.finish();
    }
  }

  finish() {
    const t = Math.round(this.time * 100) / 100;
    this.result = { mode: 'course', courseId: this.courseDef.id, time: t, medal: medalFor(t, this.courseDef.medals), respawns: this.respawns };
    this.player.frozen = true;
    this.setState('ended');
    this.emit('end', { result: this.result });
  }

  hud() {
    return {
      mode: 'course', state: this.state, stateTime: this.stateTime, time: this.time, next: this.next,
      total: this.checkpoints.length, boost: this.player.boost, medals: this.courseDef.medals,
      countdown: this.state === 'countdown' ? Math.ceil(2 - this.stateTime) : 0,
    };
  }
}
