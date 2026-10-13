// Session de jeu : boucle de match complète (préparation → compte à rebours → jeu → but → remise en jeu
// → fin / prolongation), mode entraînement, statistiques et pilotage des bots.
import { PHYS } from './constants.js';
import { buildArena, getArenaDef } from './arena.js';
import { World } from './world.js';
import { createCar, placeCar } from './car.js';
import { resetBall } from './physics.js';
import { predictBall, predictedGoal } from './predict.js';
import { BotBrain, assignRoles, DIFFICULTIES } from './ai.js';
import { makeRng } from './math.js';

export const STATE = {
  PREP: 'prep',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  GOAL: 'goal',
  OVERTIME_INTRO: 'overtime_intro',
  ENDED: 'ended',
};

export const TIMING = { prep: 0.8, countdown: 3, goal: 3, goalTraining: 1.4, overtimeIntro: 2 };

const BOT_NAMES = ['Piston', 'Turbo', 'Gravier', 'Comète', 'Rouille', 'Volt', 'Bielle', 'Nitrox', 'Durite', 'Jante', 'Fusée', 'Pneu'];

export function kickoffSlots(teamSize, W) {
  const k = W / 22;
  const table = { 1: [-12], 2: [-11, -18.5], 3: [-8.5, -14, -19.5] };
  return (table[teamSize] || table[1]).map((x) => x * k);
}

function emptyStats() {
  return { goals: 0, assists: 0, saves: 0, shots: 0, touches: 0, aerialHits: 0, flips: 0, ownGoals: 0, points: 0 };
}

export class MatchSession {
  /**
   * cfg = { mode: 'match'|'training', arenaId, teamSize, difficulty, duration (s), seed,
   *         player: { name, cosmetics, controls }, botCosmetics(fn), unlimitedBoost, withBots }
   */
  constructor(cfg = {}) {
    this.cfg = cfg;
    this.mode = cfg.mode || 'match';
    this.isTraining = this.mode === 'training';
    this.rng = makeRng(cfg.seed ?? 12345);
    this.arenaDef = getArenaDef(cfg.arenaId);
    this.arena = buildArena(this.arenaDef);
    this.world = new World(this.arena, {
      unlimitedBoost: cfg.unlimitedBoost ?? this.isTraining,
      boostRegen: cfg.boostRegen ?? 5,
    });
    this.teamSize = this.isTraining ? 1 : Math.max(1, Math.min(3, cfg.teamSize || 1));
    this.difficulty = DIFFICULTIES[cfg.difficulty] ? cfg.difficulty : 'normal';
    this.duration = this.isTraining ? 0 : (cfg.duration ?? 180);
    this.clock = this.duration;
    this.elapsed = 0;
    this.score = [0, 0];
    this.overtime = false;
    this.state = STATE.PREP;
    this.stateTime = 0;
    this.events = [];
    this.goalLog = [];
    this.result = null;
    this.playerId = 0;
    this.brains = [];
    this.stats = new Map();
    this.ballHistory = [];
    this.percCache = new Map();
    this.prediction = null;
    this.predTimer = 0;
    this.kickoffTime = 0;
    this.touchedSinceKickoff = false;
    this.trainingGoals = 0;
    this._lastCountdown = -1;
    this.paused = false;

    const p = cfg.player || {};
    const human = createCar({ id: 0, team: 0, name: p.name || 'Vous', isHuman: true, cosmetics: p.cosmetics, controls: p.controls });
    this.world.addCar(human);
    this.stats.set(0, emptyStats());
    // Pilote automatique (démo du menu, tests) : la voiture 0 est confiée à l'IA
    if (cfg.autopilot) this.brains.push(new BotBrain(human, cfg.autopilotDifficulty || this.difficulty, this.rng));
    if (!this.isTraining) {
      let id = 1;
      const names = [...BOT_NAMES];
      const pickName = () => names.splice(Math.floor(this.rng() * names.length), 1)[0] || `Bot ${id}`;
      for (let team = 0; team < 2; team++) {
        const count = team === 0 ? this.teamSize - 1 : this.teamSize;
        for (let i = 0; i < count; i++) {
          const car = createCar({
            id, team, name: pickName(), isBot: true,
            cosmetics: cfg.botCosmetics ? cfg.botCosmetics(this.rng, team) : null,
          });
          this.world.addCar(car);
          this.stats.set(id, emptyStats());
          this.brains.push(new BotBrain(car, this.difficulty, this.rng));
          id++;
        }
      }
    }
    this.resetPositions();
  }

  get cars() { return this.world.cars; }
  get ball() { return this.world.ball; }
  get player() { return this.world.cars[0]; }

  emit(type, data = {}) { this.events.push({ type, t: this.world.time, ...data }); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  setState(s) {
    this.state = s;
    this.stateTime = 0;
    this._lastCountdown = -1;
    this.emit('state', { state: s });
  }

  resetPositions() {
    const W = this.arena.W;
    const slots = kickoffSlots(this.teamSize, W);
    const perTeam = [0, 0];
    for (const car of this.cars) {
      const idx = perTeam[car.team]++;
      const x = this.isTraining ? -10 : slots[Math.min(idx, slots.length - 1)] * (car.team === 0 ? 1 : -1);
      placeCar(car, x, car.team === 0 ? 1 : -1);
      car.boost = 34;
      car.frozen = !this.isTraining;
    }
    resetBall(this.ball, 0, PHYS.ball.radius);
    this.ball.frozen = !this.isTraining;
    this.world.pads.forEach((p) => (p.timer = 0));
    this.world.lastTouch = null;
    this.world.touchHistory.length = 0;
    this.ballHistory.length = 0;
    this.touchedSinceKickoff = false;
  }

  /** Commande d'entraînement : remet la balle au centre. */
  trainingResetBall() {
    if (!this.isTraining) return;
    resetBall(this.ball, 0, 4);
    this.ballHistory.length = 0;
    this.setState(STATE.PLAYING);
  }

  /** Commande d'entraînement : lance la balle vers le joueur (pour travailler les frappes aériennes). */
  trainingLaunchBall() {
    if (!this.isTraining) return;
    const car = this.player;
    const fromX = car.x + (car.facing > 0 ? 12 : -12);
    const x = Math.max(-this.arena.W + 2, Math.min(this.arena.W - 2, fromX));
    const vx = (car.x - x) * 0.55 + this.rng.range(-1.5, 1.5);
    resetBall(this.ball, x, 3, vx, 15 + this.rng.range(0, 4));
    this.ballHistory.length = 0;
    this.setState(STATE.PLAYING);
  }

  trainingResetCar() {
    if (!this.isTraining) return;
    placeCar(this.player, -10, 1);
  }

  /** Avance la session d'un pas fixe. humanInputs[carId] = commandes. */
  step(dt, humanInputs = {}) {
    if (this.state === STATE.ENDED) return;
    this.stateTime += dt;
    const inputs = [];
    for (const car of this.cars) inputs[car.id] = humanInputs[car.id];

    switch (this.state) {
      case STATE.PREP:
        if (this.stateTime >= TIMING.prep) {
          if (this.isTraining) this.setState(STATE.PLAYING);
          else this.setState(STATE.COUNTDOWN);
        }
        break;
      case STATE.COUNTDOWN: {
        const remaining = Math.ceil(TIMING.countdown - this.stateTime);
        if (remaining !== this._lastCountdown && remaining > 0) {
          this._lastCountdown = remaining;
          this.emit('countdown', { n: remaining });
        }
        if (this.stateTime >= TIMING.countdown) {
          for (const c of this.cars) c.frozen = false;
          this.ball.frozen = false;
          this.kickoffTime = this.world.time;
          this.setState(STATE.PLAYING);
          this.emit('kickoff');
        }
        break;
      }
      case STATE.GOAL: {
        const wait = this.isTraining ? TIMING.goalTraining : TIMING.goal;
        if (this.stateTime >= wait) {
          if (this.isTraining) {
            resetBall(this.ball, 0, 4);
            this.ballHistory.length = 0;
            this.setState(STATE.PLAYING);
          } else if (this.overtime) {
            this.finish();
            return;
          } else {
            this.resetPositions();
            this.setState(STATE.COUNTDOWN);
          }
        }
        break;
      }
      case STATE.OVERTIME_INTRO:
        if (this.stateTime >= TIMING.overtimeIntro) {
          this.resetPositions();
          this.setState(STATE.COUNTDOWN);
        }
        break;
      default:
        break;
    }

    // Bots
    if (this.brains.length) this.updateBots(dt, inputs);

    this.world.step(dt, inputs);
    this.recordBall();
    this.processWorldEvents();

    if (this.state === STATE.PLAYING) {
      this.elapsed += dt;
      this.checkGoal();
      if (!this.isTraining && this.state === STATE.PLAYING) {
        if (this.overtime) this.clock += dt;
        else {
          this.clock = Math.max(0, this.clock - dt);
          if (this.clock <= 0) this.onTimeUp();
        }
      }
    }
  }

  recordBall() {
    const b = this.ball;
    this.ballHistory.push({ t: this.world.time, x: b.x, y: b.y, vx: b.vx, vy: b.vy, w: b.w, r: b.r, m: b.m });
    if (this.ballHistory.length > 90) this.ballHistory.shift();
  }

  /** Perception d'un bot : état de la balle vu avec retard puis extrapolé. Mis en cache par délai. */
  perceivedFor(reaction, horizon) {
    const key = `${reaction}|${horizon}`;
    const cached = this.percCache.get(key);
    if (cached && this.world.time - cached.time < 0.05) return cached;
    const hist = this.ballHistory;
    let src = this.ball;
    if (hist.length) {
      const target = this.world.time - reaction;
      src = hist[0];
      for (let i = hist.length - 1; i >= 0; i--) if (hist[i].t <= target) { src = hist[i]; break; }
    }
    const lag = Math.max(0, this.world.time - (src.t ?? this.world.time));
    const raw = predictBall(src, this.arena, lag + horizon, 0.05);
    const samples = raw.filter((s) => s.t >= lag - 1e-6).map((s) => ({ ...s, t: Math.max(0, s.t - lag) }));
    const entry = { time: this.world.time, samples, goal: predictedGoal(samples, this.arena) };
    this.percCache.set(key, entry);
    return entry;
  }

  updateBots(dt, inputs) {
    const playing = this.state === STATE.PLAYING || this.state === STATE.GOAL;
    const kickoff = this.state === STATE.PLAYING && !this.touchedSinceKickoff && !this.isTraining;
    for (let team = 0; team < 2; team++) {
      const attackDir = team === 0 ? 1 : -1;
      const teamCars = this.cars.filter((c) => c.team === team);
      const teamBrains = this.brains.filter((b) => b.car.team === team);
      if (!teamBrains.length) continue;
      const opponents = this.cars.filter((c) => c.team !== team);
      if (!this._roleTimer || this._roleTimer <= 0 || kickoff) {
        // les humains comptent dans la répartition (les bots ne leur volent pas la balle)
        const d0 = teamBrains[0].d;
        assignRoles(teamCars, teamBrains, this.perceivedFor(d0.reaction, d0.horizon).samples[0], attackDir, this.arena);
      }
      for (const brain of teamBrains) {
        // chaque bot perçoit la balle avec SON temps de réaction et SON horizon d'anticipation
        const perc = this.perceivedFor(brain.d.reaction, brain.d.horizon);
        const threat = perc.goal && perc.goal.team !== team ? perc.goal : null;
        const ctx = {
          arena: this.arena, attackDir, perceived: perc.samples, threat, kickoff,
          teammates: teamCars, opponents, time: this.world.time,
        };
        const inp = brain.update(ctx, dt);
        inputs[brain.car.id] = playing ? inp : { mx: 0, my: 0, jump: false, boost: false };
      }
    }
    this._roleTimer = (this._roleTimer || 0) - dt;
    if (this._roleTimer <= 0) this._roleTimer = 0.25;
  }

  processWorldEvents() {
    for (const ev of this.world.drainEvents()) {
      if (ev.type === 'touch' && this.state === STATE.PLAYING) this.onTouch(ev);
      if (ev.type === 'flip') { const st = this.stats.get(ev.carId); if (st) st.flips++; }
      this.events.push(ev);
    }
  }

  onTouch(ev) {
    const st = this.stats.get(ev.carId);
    if (!st) return;
    this.touchedSinceKickoff = true;
    st.touches++;
    st.points += 2;
    if (ev.aerial) { st.aerialHits++; st.points += 10; }
    // Tir / arrêt : comparer la trajectoire prédite avant et après la touche
    const before = this.prediction;
    const after = predictBall(this.ball, this.arena, 2.2, 0.05);
    const goalAfter = predictedGoal(after, this.arena);
    const now = this.world.time;
    if (goalAfter && goalAfter.team === ev.team) {
      if (!st._lastShot || now - st._lastShot > 1.5) { st.shots++; st.points += 20; st._lastShot = now; this.emit('shot', { carId: ev.carId }); }
    }
    if (before && before.goal && before.goal.team !== ev.team && now - before.time < 0.25 && !(goalAfter && goalAfter.team !== ev.team)) {
      st.saves++; st.points += 50;
      this.emit('save', { carId: ev.carId, team: ev.team });
    }
    this.prediction = { time: now, goal: goalAfter };
  }

  checkGoal() {
    const b = this.ball;
    if (b.frozen || b.hidden) return;
    // Mise à jour périodique de la menace (pour les arrêts)
    this.predTimer -= PHYS.dt;
    if (this.predTimer <= 0) {
      this.predTimer = 0.1;
      const s = predictBall(b, this.arena, 1.6, 0.05);
      this.prediction = { time: this.world.time, goal: predictedGoal(s, this.arena) };
    }
    for (const g of this.arena.goals) {
      const crossed = g.side > 0 ? b.x - b.r > g.lineX : b.x + b.r < g.lineX;
      if (crossed && b.y < g.top) {
        this.onGoal(1 - g.team, g);
        return;
      }
    }
  }

  onGoal(team, goal) {
    // Garde-fou : un seul but par phase de jeu
    if (this.state !== STATE.PLAYING) return;
    const b = this.ball;
    const speed = Math.hypot(b.vx, b.vy);
    const touches = this.world.touchHistory;
    let scorer = null, assist = null, ownGoal = false;
    for (let i = touches.length - 1; i >= 0; i--) {
      if (touches[i].team === team) { scorer = touches[i]; break; }
    }
    const last = touches[touches.length - 1];
    if (last && last.team !== team) ownGoal = true;
    if (scorer) {
      for (let i = touches.length - 1; i >= 0; i--) {
        const t = touches[i];
        if (t.team === team && t.carId !== scorer.carId && scorer.time - t.time < 5 && t.time <= scorer.time) { assist = t; break; }
      }
    }
    if (this.isTraining) {
      this.trainingGoals++;
      if (scorer) { const st = this.stats.get(scorer.carId); st.goals++; }
    } else {
      this.score[team]++;
      if (scorer) { const st = this.stats.get(scorer.carId); st.goals++; st.points += 100; }
      if (assist) { const st = this.stats.get(assist.carId); st.assists++; st.points += 50; }
      if (ownGoal && last) { const st = this.stats.get(last.carId); if (st) st.ownGoals++; }
    }
    const entry = {
      team, scorerId: scorer ? scorer.carId : null, assistId: assist ? assist.carId : null,
      ownGoal, speed, time: this.duration - this.clock, overtime: this.overtime, x: b.x, y: b.y,
    };
    this.goalLog.push(entry);
    b.frozen = true; b.hidden = true;
    this.setState(STATE.GOAL);
    this.emit('goal', { ...entry, side: goal.side, score: [...this.score] });
  }

  onTimeUp() {
    this.emit('timeup');
    if (this.score[0] === this.score[1]) {
      this.overtime = true;
      this.clock = 0;
      for (const c of this.cars) c.frozen = true;
      this.ball.frozen = true;
      this.setState(STATE.OVERTIME_INTRO);
      this.emit('overtime');
    } else this.finish();
  }

  finish() {
    const winner = this.score[0] > this.score[1] ? 0 : this.score[1] > this.score[0] ? 1 : -1;
    const players = this.cars.map((c) => ({ id: c.id, name: c.name, team: c.team, isHuman: c.isHuman, ...this.stats.get(c.id) }));
    let mvp = null;
    for (const p of players) if (p.team === winner && (!mvp || p.points > mvp.points)) mvp = p;
    this.result = {
      mode: this.mode, arenaId: this.arenaDef.id, difficulty: this.difficulty, teamSize: this.teamSize,
      score: [...this.score], winner, overtime: this.overtime, playerTeam: 0,
      playerWon: winner === 0, players, mvpId: mvp ? mvp.id : null, duration: this.elapsed, goals: this.goalLog,
    };
    for (const c of this.cars) c.frozen = true;
    this.ball.frozen = true;
    this.setState(STATE.ENDED);
    this.emit('end', { result: this.result });
  }

  /** Données pour l'interface. */
  hud() {
    return {
      mode: this.mode, state: this.state, stateTime: this.stateTime, score: this.score, clock: this.clock,
      overtime: this.overtime, training: this.isTraining, trainingGoals: this.trainingGoals,
      countdown: this.state === STATE.COUNTDOWN ? Math.ceil(TIMING.countdown - this.stateTime) : 0,
      boost: this.player.boost, unlimitedBoost: this.world.unlimitedBoost,
    };
  }
}
