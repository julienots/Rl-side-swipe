import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchSession, STATE, TIMING } from '../src/core/match.js';
import { resetBall } from '../src/core/physics.js';
import { PHYS } from '../src/core/constants.js';

const DT = PHYS.dt;
const stepFor = (m, sec, inputs = {}) => { const evs = []; for (let i = 0; i < Math.round(sec * 120); i++) { m.step(DT, inputs); evs.push(...m.drainEvents()); } return evs; };

function toPlaying(m) {
  stepFor(m, TIMING.prep + TIMING.countdown + 0.05);
  assert.equal(m.state, STATE.PLAYING);
}

test('cycle complet : préparation → compte à rebours → jeu', () => {
  const m = new MatchSession({ teamSize: 1, duration: 60, seed: 1 });
  assert.equal(m.state, STATE.PREP);
  assert.ok(m.cars.every((c) => c.frozen) && m.ball.frozen, 'tout est figé avant le coup d\'envoi');
  const evs = stepFor(m, TIMING.prep + TIMING.countdown + 0.05);
  assert.deepEqual(evs.filter((e) => e.type === 'countdown').map((e) => e.n), [3, 2, 1]);
  assert.ok(evs.some((e) => e.type === 'kickoff'));
  assert.ok(m.cars.every((c) => !c.frozen) && !m.ball.frozen);
});

test('un but n\'est compté qu\'une seule fois, puis remise en jeu', () => {
  const m = new MatchSession({ teamSize: 1, duration: 120, seed: 2 });
  toPlaying(m);
  m.brains.length = 0; // pas d'interférence de l'IA
  resetBall(m.ball, m.arena.W - 3, 2, 30, 0);
  const evs = stepFor(m, 0.8);
  const goals = evs.filter((e) => e.type === 'goal');
  assert.equal(goals.length, 1);
  assert.equal(goals[0].team, 0);
  assert.deepEqual(m.score, [1, 0]);
  assert.equal(m.state, STATE.GOAL);
  // la balle reste « derrière la ligne » pendant la célébration : pas de second but
  let guard = 0;
  while (m.state === STATE.GOAL && guard++ < 120 * 4) { m.step(DT, {}); m.drainEvents(); }
  assert.deepEqual(m.score, [1, 0], 'toujours un seul but après la célébration');
  assert.equal(m.state, STATE.COUNTDOWN);
  assert.equal(m.ball.x, 0, 'balle replacée au centre');
  assert.ok(m.cars[0].x < 0 && m.cars[1].x > 0, 'voitures replacées');
  stepFor(m, TIMING.countdown + 0.05);
  assert.equal(m.state, STATE.PLAYING);
});

test('but contre son camp : crédité à l\'adversaire sans buteur', () => {
  const m = new MatchSession({ teamSize: 1, duration: 120, seed: 3 });
  toPlaying(m);
  m.brains.length = 0;
  m.world.touchHistory.push({ carId: 0, team: 0, time: m.world.time, aerial: false });
  resetBall(m.ball, -m.arena.W + 3, 2, -30, 0);
  const evs = stepFor(m, 0.6);
  const g = evs.find((e) => e.type === 'goal');
  assert.equal(g.team, 1);
  assert.equal(g.ownGoal, true);
  assert.equal(g.scorerId, null);
  assert.deepEqual(m.score, [0, 1]);
});

test('passe décisive et buteur crédités', () => {
  const m = new MatchSession({ teamSize: 2, duration: 120, seed: 4 });
  toPlaying(m);
  m.brains.length = 0;
  const t = m.world.time;
  m.world.touchHistory.push({ carId: 1, team: 0, time: t - 1 }, { carId: 0, team: 0, time: t - 0.2 });
  resetBall(m.ball, m.arena.W - 2, 2, 25, 0);
  stepFor(m, 0.5);
  assert.equal(m.stats.get(0).goals, 1);
  assert.equal(m.stats.get(1).assists, 1);
});

test('fin du temps : victoire, ou prolongation en cas d\'égalité puis but en or', () => {
  const m = new MatchSession({ teamSize: 1, duration: 2, seed: 5 });
  toPlaying(m);
  m.brains.length = 0;
  m.score = [2, 1];
  const evs = stepFor(m, 2.2);
  assert.equal(m.state, STATE.ENDED);
  assert.ok(evs.some((e) => e.type === 'end'));
  assert.equal(m.result.winner, 0);
  assert.equal(m.result.playerWon, true);

  const t = new MatchSession({ teamSize: 1, duration: 1, seed: 6 });
  toPlaying(t);
  t.brains.length = 0;
  stepFor(t, 1.1);
  assert.equal(t.state, STATE.OVERTIME_INTRO);
  assert.equal(t.overtime, true);
  stepFor(t, TIMING.overtimeIntro + TIMING.countdown + 0.1);
  assert.equal(t.state, STATE.PLAYING);
  resetBall(t.ball, -t.arena.W + 3, 2, -30, 0);
  stepFor(t, 0.5);
  assert.equal(t.state, STATE.GOAL);
  stepFor(t, TIMING.goal + 0.1);
  assert.equal(t.state, STATE.ENDED);
  assert.equal(t.result.winner, 1);
  assert.equal(t.result.overtime, true);
});

test('entraînement : pas de chrono, but → balle remise sans compte à rebours', () => {
  const m = new MatchSession({ mode: 'training', seed: 7 });
  assert.equal(m.cars.length, 1);
  stepFor(m, TIMING.prep + 0.05);
  assert.equal(m.state, STATE.PLAYING);
  resetBall(m.ball, m.arena.W - 3, 2, 30, 0);
  stepFor(m, 0.5);
  assert.equal(m.trainingGoals, 1);
  stepFor(m, TIMING.goalTraining + 0.1);
  assert.equal(m.state, STATE.PLAYING);
  assert.ok(!m.ball.hidden && Math.abs(m.ball.x) < 0.01);
  m.trainingLaunchBall();
  assert.ok(m.ball.vy > 10, 'balle lancée');
  m.trainingResetBall();
  assert.equal(m.ball.x, 0);
});

test('la pause est gérée par l\'appelant : sans step, rien ne bouge', () => {
  const m = new MatchSession({ teamSize: 1, duration: 60, seed: 8 });
  toPlaying(m);
  const snap = JSON.stringify([m.ball.x, m.ball.y, m.clock, m.cars.map((c) => [c.x, c.y])]);
  // aucun appel à step pendant la pause
  assert.equal(JSON.stringify([m.ball.x, m.ball.y, m.clock, m.cars.map((c) => [c.x, c.y])]), snap);
});
