import test from 'node:test';
import assert from 'node:assert/strict';
import { PrecisionSession, CourseSession, PRECISION_PACKS, starsFor, medalFor } from '../src/core/challenge.js';
import { COURSE_DEFS } from '../src/core/arena.js';
import { resetBall } from '../src/core/physics.js';
import { PHYS } from '../src/core/constants.js';
import { makePilot } from './helpers/pilot.js';

const DT = PHYS.dt;
const stepFor = (s, sec, inp = {}) => { const ev = []; for (let i = 0; i < Math.round(sec * 120); i++) { s.step(DT, { 0: inp }); ev.push(...s.drainEvents()); } return ev; };

test('défi de précision : réussite sur but, échec sur temps écoulé, résultat en étoiles', () => {
  const s = new PrecisionSession({ packId: 'bases' });
  stepFor(s, 1.25);
  assert.equal(s.state, 'playing');
  resetBall(s.ball, s.arena.W - 3, 2, 30, 0);
  let ev = stepFor(s, 0.4);
  assert.ok(ev.some((e) => e.type === 'challengeSuccess'));
  assert.equal(s.results[0], true);
  stepFor(s, 1.7);
  assert.equal(s.index, 1);
  stepFor(s, 1.25 + s.scenario.time + 0.1); // aucun input → temps écoulé ou balle ailleurs
  assert.equal(s.results[1], false);
  // terminer rapidement les essais restants
  while (s.state !== 'ended') { stepFor(s, 0.1); if (s.state === 'playing') { s.timeLeft = 0; } }
  assert.ok(s.result && s.result.total === PRECISION_PACKS[0].scenarios.length);
  assert.equal(s.result.stars, starsFor(s.result.successes, s.result.total));
});

test('défi de précision : la mauvaise cage et un tir trop bas comptent comme échecs', () => {
  const s = new PrecisionSession({ packId: 'bases' });
  stepFor(s, 1.25);
  resetBall(s.ball, -s.arena.W + 3, 2, -30, 0);
  const ev = stepFor(s, 0.4);
  assert.ok(ev.some((e) => e.type === 'challengeFail' && /Mauvaise/.test(e.reason)));
  // essai « Lucarne » (index 3) : but bas refusé
  const l = new PrecisionSession({ packId: 'bases' });
  l.index = 3; l.setupScenario();
  stepFor(l, 1.25);
  resetBall(l.ball, l.arena.W - 3, 1.1, 30, 0);
  const ev2 = stepFor(l, 0.4);
  assert.ok(ev2.some((e) => e.type === 'challengeFail'));
});

test('défi de précision : chaque scénario est réalisable (balle poussée vers la cible)', () => {
  for (const pack of PRECISION_PACKS) {
    pack.scenarios.forEach((sc, i) => {
      const s = new PrecisionSession({ packId: pack.id });
      s.index = i; s.setupScenario();
      stepFor(s, 1.25);
      if (sc.kind === 'target') resetBall(s.ball, sc.target.x - 3, sc.target.y, 20, 0);
      else resetBall(s.ball, s.arena.W - 4, sc.kind === 'goalHigh' ? s.arena.G * 0.75 : 2, 30, 0);
      const ev = stepFor(s, 0.6);
      assert.ok(ev.some((e) => e.type === 'challengeSuccess'), `${pack.id} #${i} ${sc.name}`);
    });
  }
});

test('parcours : points de passage dans l\'ordre, arrivée et médaille', () => {
  const s = new CourseSession({ courseId: 'ferraille' });
  stepFor(s, 2.05);
  assert.equal(s.state, 'playing');
  const car = s.player;
  // passer le point 2 avant le 1 ne compte pas
  car.x = s.checkpoints[1].x; car.y = s.checkpoints[1].y; car.vx = car.vy = 0;
  stepFor(s, 0.02);
  assert.equal(s.next, 0);
  for (let i = 0; i < s.checkpoints.length; i++) {
    const cp = s.checkpoints[i];
    car.x = cp.x; car.y = cp.y; car.vx = car.vy = 0;
    stepFor(s, 0.02);
  }
  assert.equal(s.state, 'ended');
  assert.ok(s.result.time > 0);
  assert.equal(medalFor(10, COURSE_DEFS[0].medals), 'or');
  assert.equal(medalFor(999, COURSE_DEFS[0].medals), null);
});

test('parcours : replacement au dernier point et redémarrage', () => {
  const s = new CourseSession({ courseId: 'voltige' });
  stepFor(s, 2.05);
  const cp = s.checkpoints[0];
  s.player.x = cp.x; s.player.y = cp.y;
  stepFor(s, 0.02);
  s.player.x = 60; s.player.y = 3;
  s.respawn();
  assert.equal(s.player.x, cp.x);
  assert.equal(s.respawns, 1);
  s.restart();
  assert.equal(s.state, 'countdown');
  assert.equal(s.next, 0);
});

test('parcours : chaque segment est réalisable par un pilote scripté (replacement au point précédent)', () => {
  for (const def of COURSE_DEFS) {
    for (let i = 0; i < def.checkpoints.length; i++) {
      let ok = false;
      for (const lead of [0.25, 0.35, 0.45]) {
        for (const base of [0.5, 1.5, 3]) {
          const s = new CourseSession({ courseId: def.id });
          stepFor(s, 2.1);
          s.next = i;
          if (i > 0) {
            const p = def.checkpoints[i - 1];
            s.lastSafe = p.respawn ? { ...p.respawn } : { x: p.x, y: Math.max(PHYS.car.radius, p.y) };
            s.respawn();
          }
          const pilot = makePilot(s, lead, base);
          for (let k = 0; k < 120 * 10 && s.next === i; k++) { s.step(DT, { 0: pilot(DT) }); s.drainEvents(); }
          if (s.next > i) { ok = true; break; }
        }
        if (ok) break;
      }
      assert.ok(ok, `${def.id} : segment ${i} infranchissable`);
    }
  }
});
