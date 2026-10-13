// Point d'entrée : orchestre sessions de jeu, rendu, audio, entrées, interface et sauvegarde.
import { PHYS, TEAM_COLORS } from './core/constants.js';
import { FixedStepper } from './core/stepper.js';
import { MatchSession } from './core/match.js';
import { PrecisionSession, CourseSession } from './core/challenge.js';
import { ARENA_DEFS } from './core/arena.js';
import { makeRng } from './core/math.js';
import { Renderer } from './game/renderer.js';
import { Camera } from './game/camera.js';
import { Particles } from './game/particles.js';
import { InputManager } from './game/input.js';
import { AudioEngine } from './game/audio.js';
import { SaveStore } from './meta/save.js';
import { resolveLoadout, randomLoadout } from './meta/cosmetics.js';
import {
  applyMatchResult, applyPrecisionResult, applyCourseResult, applyTrainingProgress, TRAINING_OBJECTIVES,
} from './meta/progression.js';
import { UI, formatTime } from './ui/ui.js';

const $ = (s) => document.querySelector(s);

class App {
  constructor() {
    this.store = new SaveStore();
    this.audio = new AudioEngine();
    this.renderer = new Renderer($('#game'));
    this.camera = new Camera();
    this.particles = new Particles(900);
    this.stepper = new FixedStepper(PHYS.dt, 10);
    this.input = new InputManager({
      root: $('#controls'), stickZone: $('#stick-zone'), stickBase: $('#stick-base'), stickKnob: $('#stick-knob'),
      jump: $('#btn-jump'), boost: $('#btn-boost'),
    }, this.store.data.settings);
    this.input.onAction = (a) => this.keyAction(a);
    this.ui = new UI(this);
    this.session = null;
    this.demo = false;
    this.paused = false;
    this.lastConfig = null;
    this.resultShown = false;
    this.frameTimes = [];
    this.autoQualityChecked = false;
    this.lastFrame = performance.now();
    this.trainingStats = null;
    this.hasTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

    this.applySettings();
    this.bindGlobal();
    this.toMenu();
    if (this.store.recovered) this.ui.toast('Sauvegarde restaurée depuis la copie de secours');
    requestAnimationFrame((t) => this.frame(t));
    // Accès de débogage/tests (aucun effet en jeu normal)
    window.__bolid = this;
  }

  get save() { return this.store.data; }

  bindGlobal() {
    const unlock = () => { this.audio.unlock(); this.applySettings(); };
    window.addEventListener('pointerdown', unlock, { once: false, passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.onResize(), 200));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.session && !this.demo) this.pause();
        this.store.save();
        this.audio.suspend();
      } else this.audio.resume();
    });
    window.addEventListener('pagehide', () => this.store.save());
    this.onResize();
  }

  onResize() {
    this.renderer.resize();
    const portrait = window.innerHeight > window.innerWidth;
    $('#rotate-hint').classList.toggle('hidden', !(portrait && this.session && !this.demo));
  }

  applySettings() {
    const s = this.save.settings;
    this.input.setSettings(s);
    this.audio.setVolumes(s.masterVolume, s.sfxVolume, s.musicVolume);
    const q = s.quality === 'auto' ? (this.autoQuality || 'haute') : s.quality;
    if (this.renderer.quality !== q) this.renderer.setQuality(q);
    this.particles.setBudget(q === 'basse' ? 300 : 900);
    $('#fps').classList.toggle('hidden', !s.showFps);
    if (this.session && this.session.player) Object.assign(this.session.player.controls, this.controlsFor());
  }

  controlsFor() {
    const c = this.save.settings.controls;
    return { airMode: c.airMode, invertAir: c.invertAir, autoTurn: c.autoTurn };
  }

  playerInfo() {
    return { name: this.save.profile.name, cosmetics: resolveLoadout(this.save.garage.equipped), controls: this.controlsFor() };
  }

  // ------------------------------------------------------------------ sessions
  toMenu() {
    this.ui.hideResults();
    this.ui.showPause(false);
    this.ui.hideHud();
    $('#controls').classList.add('hidden');
    this.input.setEnabled(false);
    this.paused = false;
    if (this.session && this.session.mode === 'training' && !this.demo) this.commitTraining();
    this.startDemo();
    this.ui.stack = [];
    this.ui.current = null;
    this.ui.show('menu', { replace: true });
    this.audio.updateCar(0, 0, false, false);
    this.audio.startMusic();
    this.onResize();
  }

  startDemo() {
    const rng = makeRng((Date.now() & 0xffff) + 1);
    const arena = ARENA_DEFS[Math.floor(rng() * (ARENA_DEFS.length - 1))];
    this.session = new MatchSession({
      mode: 'match', arenaId: arena.id, teamSize: 2, difficulty: 'normal', duration: 9999, autopilot: true,
      seed: Math.floor(rng() * 1e6), player: { name: 'Démo', cosmetics: randomLoadout(rng) }, botCosmetics: (r) => randomLoadout(r),
    });
    this.demo = true;
    this.particles.clear();
    this.camera.snap(this.session, this.renderer.aspect);
    this.stepper.reset();
  }

  chooseMode(mode) {
    if (mode === 'quick') {
      const rng = makeRng(Date.now() & 0xffffff);
      const arena = ARENA_DEFS[Math.floor(rng() * ARENA_DEFS.length)];
      this.startSession({ kind: 'match', teamSize: 2, difficulty: this.save.lastPlay.difficulty || 'normal', arenaId: arena.id, duration: 120, quick: true });
    } else if (mode === 'match') this.ui.show('setup');
    else if (mode === 'training') this.startSession({ kind: 'training', arenaId: this.save.lastPlay.arenaId });
    else if (mode === 'precision') this.ui.show('precision');
    else if (mode === 'course') this.ui.show('course');
  }

  startMatchFromSetup() {
    const lp = this.save.lastPlay;
    this.store.save();
    this.startSession({ kind: 'match', teamSize: lp.teamSize, difficulty: lp.difficulty, arenaId: lp.arenaId, duration: lp.duration });
  }

  startPrecision(packId) { this.startSession({ kind: 'precision', packId }); }
  startCourse(courseId) { this.startSession({ kind: 'course', courseId }); }

  startSession(cfg) {
    if (this.session && this.session.mode === 'training' && !this.demo) this.commitTraining();
    this.lastConfig = cfg;
    const seed = (Date.now() & 0x7fffffff) >>> 0;
    const player = this.playerInfo();
    if (cfg.kind === 'match') {
      this.session = new MatchSession({
        mode: 'match', arenaId: cfg.arenaId, teamSize: cfg.teamSize, difficulty: cfg.difficulty, duration: cfg.duration,
        seed, player, botCosmetics: (r) => randomLoadout(r),
      });
    } else if (cfg.kind === 'training') {
      this.session = new MatchSession({ mode: 'training', arenaId: cfg.arenaId, seed, player });
      this.trainingStats = { goals: 0, doubleJumps: 0, flipHits: 0, aerialHits: 0, wallTime: 0, goalsDelta: 0 };
    } else if (cfg.kind === 'precision') {
      this.session = new PrecisionSession({ packId: cfg.packId, player });
    } else if (cfg.kind === 'course') {
      this.session = new CourseSession({ courseId: cfg.courseId, player });
    }
    this.demo = false;
    this.paused = false;
    this.resultShown = false;
    this.particles.clear();
    this.stepper.reset();
    this.camera.snap(this.session, this.renderer.aspect);
    this.ui.hideScreens();
    this.ui.hideResults();
    this.ui.showPause(false);
    this.ui.setHudMode(this.session.mode);
    $('#controls').classList.remove('hidden');
    this.input.layout();
    this.input.setEnabled(true);
    this.audio.stopMusic();
    if (this.session.mode === 'match') {
      const names = { 1: '1c1', 2: '2c2', 3: '3c3' };
      this.ui.banner(this.session.arenaDef.name, `${names[this.session.teamSize]} · IA ${this.ui.difficultyName(this.session.difficulty)}`, null, 1400);
    } else if (this.session.mode === 'training') {
      this.ui.banner('Entraînement', 'R : remettre la balle · T : lancer la balle', null, 1800);
    }
    this.onResize();
  }

  rematch() {
    if (!this.lastConfig) return this.toMenu();
    this.startSession(this.lastConfig);
  }

  pause() {
    if (!this.session || this.demo || this.paused || this.resultShown) return;
    this.paused = true;
    this.input.setEnabled(false);
    $('#pause-controls').classList.add('hidden');
    this.ui.showPause(true);
    this.audio.updateCar(0, 0, false, false);
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.ui.showPause(false);
    this.input.reset();
    this.input.setEnabled(true);
    this.stepper.reset();
    this.lastFrame = performance.now();
  }

  pauseAction(a) {
    if (a === 'resume') this.resume();
    else if (a === 'restart') { this.paused = false; this.rematch(); }
    else if (a === 'quit') { this.paused = false; this.toMenu(); }
    else if (a === 'controls') {
      const el = $('#pause-controls');
      el.classList.toggle('hidden');
      if (!el.classList.contains('hidden')) this.ui.buildSettings(el, true);
    }
  }

  keyAction(a) {
    if (a === 'pause') {
      if (this.paused) this.resume();
      else if (this.session && !this.demo && !this.resultShown) this.pause();
      else if (!this.session || this.demo) { if (this.ui.current && this.ui.current !== 'menu') this.ui.back(); }
    } else if (!this.paused && !this.demo && this.session) {
      if (a === 'reset') this.hudAction(this.session.mode === 'course' ? 'respawn' : this.session.mode === 'precision' ? 'retry' : 'resetBall');
      if (a === 'launch') this.hudAction('launch');
    }
  }

  hudAction(a) {
    const s = this.session;
    if (!s || this.demo || this.paused) return;
    this.audio.play('click');
    if (a === 'resetBall') s.trainingResetBall?.();
    else if (a === 'launch') s.trainingLaunchBall?.();
    else if (a === 'resetCar') s.trainingResetCar?.();
    else if (a === 'respawn') s.respawn?.();
    else if (a === 'restartCourse') { s.restart?.(); this.resultShown = false; }
    else if (a === 'retry') s.retry?.();
  }

  // ------------------------------------------------------------------ boucle
  frame(now) {
    const frameDt = Math.min(0.25, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.trackPerformance(frameDt);
    const s = this.session;
    if (s && !this.paused) {
      const inp = this.input.read();
      const humanInputs = this.demo ? {} : { 0: { mx: inp.mx, my: inp.my, jump: inp.jump, boost: inp.boost } };
      this.stepper.advance(frameDt, (dt) => {
        s.step(dt, humanInputs);
        this.handleEvents(s.drainEvents());
        if (this.trainingStats) this.trackTraining(dt);
      });
      if (this.demo && s.state === 'ended') this.startDemo();
      for (const c of s.cars) if (c.hitFlash > 0) c.hitFlash = Math.max(0, c.hitFlash - frameDt * 4);
      this.emitTrails(frameDt);
      this.particles.update(frameDt);
      this.camera.update(frameDt, s, this.renderer.aspect, this.save.settings.cameraShake);
      if (!this.demo) {
        const p = s.player;
        this.audio.updateCar(Math.hypot(p.vx, p.vy), p.throttle || 0, p.boosting, !p.frozen);
        this.ui.updateHud(s.hud());
        $('#controls').classList.toggle('keyboard-mode', !this.hasTouch && this.input.lastSource !== 'touch');
      }
    }
    if (s) {
      const extra = {};
      if (s.mode === 'course') { extra.checkpoints = s.checkpoints; extra.next = s.next; }
      if (s.mode === 'precision') extra.target = s.hud().target;
      this.renderer.render(s, this.paused ? 1 : this.stepper.alpha, this.camera, this.particles, { playerId: this.demo ? -1 : 0, extra });
    }
    if (this.ui.current === 'garage') this.ui.drawGaragePreview(now / 1000);
    requestAnimationFrame((t) => this.frame(t));
  }

  trackPerformance(dt) {
    if (dt <= 0) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 120) this.frameTimes.shift();
    if (this.save.settings.showFps && this.frameTimes.length % 15 === 0) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      $('#fps').textContent = `${Math.round(1 / avg)} FPS · ${this.renderer.quality}`;
    }
    // Qualité automatique : bascule en « basse » si l'appareil peine (une seule fois)
    if (!this.autoQualityChecked && this.frameTimes.length === 120 && this.session && !this.demo) {
      this.autoQualityChecked = true;
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      if (avg > 1 / 40 && this.save.settings.quality === 'auto') { this.autoQuality = 'basse'; this.applySettings(); }
    }
  }

  emitTrails(dt) {
    const s = this.session;
    for (const car of s.cars) {
      if (!car.boosting || car.frozen) continue;
      const fx = Math.cos(car.ang), fy = Math.sin(car.ang);
      const n = this.renderer.quality === 'basse' ? 1 : 2;
      const cos = car.cosmetics || resolveLoadout();
      for (let i = 0; i < n; i++) this.particles.boost(car.x - fx * 1.25, car.y - fy * 1.25 + 0.05, fx, fy, cos.trail, car.team, 1);
    }
  }

  trackTraining(dt) {
    const p = this.session.player;
    if (p.grounded && p.groundN.y < 0.5) this.trainingStats.wallTime += dt;
    this.checkTrainingObjectives();
  }

  checkTrainingObjectives() {
    const st = this.trainingStats;
    for (const o of TRAINING_OBJECTIVES) {
      if (!this.save.training[o.id] && o.test(st)) {
        const sum = applyTrainingProgress(this.save, st);
        this.store.save();
        for (const id of sum.achievements) {
          const obj = TRAINING_OBJECTIVES.find((x) => x.id === id);
          if (obj) { this.ui.toast(`Objectif réussi : ${obj.name} (+50 XP)`); this.audio.play('success'); }
        }
        if (sum.levelUps.length) this.audio.play('levelup');
        st.goalsDelta = 0;
        break;
      }
    }
  }

  commitTraining() {
    if (!this.trainingStats) return;
    applyTrainingProgress(this.save, this.trainingStats);
    this.trainingStats = null;
    this.store.save();
  }

  // ------------------------------------------------------------------ événements
  carById(id) { return this.session.cars.find((c) => c.id === id); }

  handleEvents(events) {
    const s = this.session;
    const demo = this.demo;
    const sound = (n, k) => { if (!demo) this.audio.play(n, k); };
    for (const e of events) {
      switch (e.type) {
        case 'touch': {
          const car = this.carById(e.carId);
          if (car) car.hitFlash = Math.min(0.5, e.speed / 40);
          sound('hit', e.speed / 22);
          this.particles.sparks(e.x, e.y, Math.min(14, 3 + Math.floor(e.speed / 3)), '#ffffff', 4 + e.speed * 0.3);
          if (e.speed > 18 && !demo) this.camera.shake(Math.min(0.5, e.speed / 80));
          if (this.trainingStats && e.carId === 0) {
            if (e.aerial) this.trainingStats.aerialHits++;
            if (e.flip) this.trainingStats.flipHits++;
          }
          break;
        }
        case 'bounce':
          sound('bounce', e.speed / 20);
          if (e.speed > 12) this.particles.dust(e.x, Math.max(0, e.y - 1.1), 4);
          break;
        case 'jump': if (e.carId === 0) sound('jump'); break;
        case 'doublejump':
          if (e.carId === 0) { sound('jump'); if (this.trainingStats) this.trainingStats.doubleJumps++; }
          this.particles.ring(e.x, e.y, 'rgba(255,255,255,0.6)', 0.4, 6, 0.3, 0.12);
          break;
        case 'flip': if (e.carId === 0) sound('flip'); break;
        case 'land':
          if (e.carId === 0) sound('land', e.speed / 15);
          this.particles.dust(e.x, e.y - 0.45, 5);
          break;
        case 'pad':
          if (e.carId === 0) sound('pad');
          this.particles.sparks(e.x, 0.4, 8, '#ffd84f', 6);
          break;
        case 'bump':
          sound('bump');
          this.particles.sparks(e.x, e.y, 10, '#ffe9a8', 9);
          if (!demo && (e.a === 0 || e.b === 0)) this.camera.shake(0.3);
          break;
        case 'carImpact': if (e.carId === 0) sound('carImpact', e.speed / 15); break;
        case 'countdown': if (!demo) { this.ui.banner(String(e.n), s.overtime ? 'Prolongation' : '', null, 900); sound('countdown'); } break;
        case 'kickoff': if (!demo) { this.ui.banner('GO !', '', null, 600); sound('go'); } break;
        case 'goal': this.onGoal(e); break;
        case 'save': {
          const car = this.carById(e.carId);
          if (!demo && car) { this.ui.feed(`🧤 Arrêt de ${car.name}`); sound('save'); }
          break;
        }
        case 'timeup': sound('whistle'); break;
        case 'overtime': if (!demo) this.ui.banner('PROLONGATION', 'Le prochain but gagne !', null, 1800); break;
        case 'end': if (!demo) this.onEnd(e.result); break;
        case 'scenario': if (!demo) { const h = s.hud(); this.ui.banner(h.name, h.hint, null, 1300); } break;
        case 'challengeSuccess':
          this.ui.banner('RÉUSSI !', '', 0, 1200); sound('success');
          this.particles.goal(e.x, e.y, (s.player.cosmetics || resolveLoadout()).explosion, 0);
          break;
        case 'challengeFail': this.ui.banner('RATÉ', e.reason || '', 1, 1200); sound('fail'); break;
        case 'checkpoint':
          sound('checkpoint');
          this.particles.ring(e.x, e.y, '#7dffa8', 1, 10, 0.5, 0.3);
          if (!e.finish) this.ui.feed(`Point ${e.index + 1} ✔ ${formatTime(s.time)}`);
          break;
        default: break;
      }
    }
  }

  onGoal(e) {
    const s = this.session;
    s.goalFocus = { x: e.x, y: e.y };
    this.renderer.rippleNet(e.side, e.speed);
    const scorer = e.scorerId !== null ? this.carById(e.scorerId) : null;
    const style = scorer?.cosmetics?.explosion || 'e_onde';
    this.particles.goal(e.x, e.y, style, e.team);
    if (this.demo) return;
    this.camera.shake(0.9);
    this.audio.play('goal');
    if (s.mode === 'training') {
      this.ui.banner('BUT !', '', 0, 1000);
      if (this.trainingStats) { this.trainingStats.goals++; this.trainingStats.goalsDelta++; }
      return;
    }
    const assist = e.assistId !== null ? this.carById(e.assistId) : null;
    let sub = scorer ? `${scorer.name}${assist ? ` (passe de ${assist.name})` : ''}` : 'Contre son camp !';
    sub += ` · ${Math.round(e.speed * 3.6)} km/h`;
    this.ui.banner('BUT !', sub, e.team, 2600);
    this.ui.feed(`${scorer ? scorer.name : 'CSC'} ⚽ ${e.score[0]} - ${e.score[1]}`);
  }

  onEnd(result) {
    const s = this.session;
    this.audio.play('whistle');
    this.input.setEnabled(false);
    setTimeout(() => this.showResults(result, s), 1300);
  }

  showResults(result, s) {
    if (this.session !== s || this.resultShown) return;
    this.resultShown = true;
    this.ui.hideBanner();
    $('#controls').classList.add('hidden');
    this.audio.updateCar(0, 0, false, false);
    let summary, data;
    if (result.mode === 'match') {
      const aerialGoal = s.goalLog.some((g) => g.scorerId === 0 && s.world.touchHistory.some((t) => t.carId === 0 && t.aerial));
      summary = applyMatchResult(this.save, result, { aerialGoal });
      const title = result.winner === 0 ? 'VICTOIRE !' : result.winner === 1 ? 'DÉFAITE' : 'MATCH NUL';
      data = {
        title,
        scoreHtml: `<span class="s0">${result.score[0]}</span><span>-</span><span class="s1">${result.score[1]}</span>${result.overtime ? '<small style="font-size:14px;align-self:center">(prol.)</small>' : ''}`,
        tableHtml: this.ui.matchTable(result, 0),
        summary,
      };
    } else if (result.mode === 'precision') {
      summary = applyPrecisionResult(this.save, result);
      data = {
        title: `${result.successes}/${result.total} réussis`,
        scoreHtml: `<span class="stars">${'★'.repeat(result.stars)}<span class="off">${'★'.repeat(3 - result.stars)}</span></span>`,
        summary, rematchLabel: 'Rejouer',
      };
    } else if (result.mode === 'course') {
      summary = applyCourseResult(this.save, result);
      const medal = { or: '🥇 Or', argent: '🥈 Argent', bronze: '🥉 Bronze' }[result.medal] || 'Pas de médaille';
      data = {
        title: formatTime(result.time), scoreHtml: `<span style="font-size:24px">${medal}</span>`, summary, rematchLabel: 'Rejouer',
        extra: result.respawns ? `<div class="note">Replacements : ${result.respawns}</div>` : '',
      };
    }
    this.store.save();
    if (summary && summary.levelUps.length) this.audio.play('levelup');
    this.ui.showResults(data);
  }
}

function boot() {
  try {
    new App();
  } catch (err) {
    console.error(err);
    document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;inset:0;display:grid;place-items:center;color:#fff;background:#200;padding:20px;text-align:center">Erreur au démarrage : ${String(err && err.message || err)}</div>`);
  }
}

if ('serviceWorker' in navigator && location.protocol !== 'file:' && !location.search.includes('nosw')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();

export { App, TEAM_COLORS };
