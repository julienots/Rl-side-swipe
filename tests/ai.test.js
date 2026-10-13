import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchSession, STATE } from '../src/core/match.js';
import { ARENA_DEFS } from '../src/core/arena.js';
import { assignRoles, BotBrain } from '../src/core/ai.js';
import { PHYS } from '../src/core/constants.js';

const DT = PHYS.dt;

function playOut(cfg, maxSeconds = 600) {
  const m = new MatchSession({ autopilot: true, ...cfg });
  const counts = {};
  let steps = 0;
  while (m.state !== STATE.ENDED && steps < maxSeconds * 120) {
    m.step(DT, {});
    steps++;
    for (const e of m.drainEvents()) counts[e.type] = (counts[e.type] || 0) + 1;
    if (steps % 120 === 0) {
      for (const c of m.cars) assert.ok(Number.isFinite(c.x + c.y + c.vx + c.vy + c.ang), 'état voiture fini');
      assert.ok(Number.isFinite(m.ball.x + m.ball.y));
    }
  }
  return { m, counts, steps };
}

test('un bot seul marque dans une cage vide', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const m = new MatchSession({ teamSize: 1, duration: 300, seed: 11, difficulty });
    // on retire l'adversaire et on confie la voiture du joueur à l'IA
    const opp = m.brains.find((b) => b.car.team === 1);
    m.brains = [new BotBrain(m.player, difficulty, m.rng)];
    m.world.cars = m.world.cars.filter((c) => c !== opp.car);
    let goal = null;
    for (let i = 0; i < 120 * 40 && !goal; i++) {
      m.step(DT, {});
      goal = m.drainEvents().find((e) => e.type === 'goal');
    }
    assert.ok(goal, `but marqué (${difficulty})`);
    assert.equal(goal.team, 0);
  }
});

test('matchs complets bot contre bot dans chaque format sans état invalide', () => {
  for (const [teamSize, difficulty, arenaId] of [[1, 'easy', 'boite'], [2, 'normal', 'horizon'], [3, 'hard', 'orbitale'], [2, 'hard', 'cratere']]) {
    const { m, counts } = playOut({ teamSize, difficulty, arenaId, duration: 60, seed: teamSize * 31 });
    assert.equal(m.state, STATE.ENDED, `${teamSize}c${teamSize} terminé`);
    assert.ok((counts.touch || 0) > 10, 'les bots jouent la balle');
    assert.ok(m.result && m.result.players.length === teamSize * 2);
  }
});

test('répartition des rôles : un seul attaquant par équipe', () => {
  const m = new MatchSession({ teamSize: 3, duration: 60, seed: 5, autopilot: true });
  for (let i = 0; i < 120 * 8; i++) m.step(DT, {});
  for (const team of [0, 1]) {
    const brains = m.brains.filter((b) => b.car.team === team);
    const cars = m.cars.filter((c) => c.team === team);
    assignRoles(cars, brains, { x: m.ball.x, y: m.ball.y }, team === 0 ? 1 : -1, m.arena);
    const roles = brains.map((b) => b.role);
    assert.equal(roles.filter((r) => r === 'attacker').length, 1, `équipe ${team} : ${roles}`);
    assert.ok(roles.includes('defender'));
  }
});

test('les bots ne laissent pas l\'humain sans rôle : l\'humain le plus proche garde la balle', () => {
  const m = new MatchSession({ teamSize: 2, duration: 60, seed: 9 });
  const teamBrains = m.brains.filter((b) => b.car.team === 0);
  const cars = m.cars.filter((c) => c.team === 0);
  m.player.x = -1.5; // humain juste derrière la balle
  teamBrains[0].car.x = -18;
  assignRoles(cars, teamBrains, { x: 0, y: 1 }, 1, m.arena);
  assert.notEqual(teamBrains[0].role, 'attacker', 'le bot coéquipier se replace');
});

test('perception retardée : le bot voit la balle avec son temps de réaction', () => {
  const m = new MatchSession({ teamSize: 1, duration: 60, seed: 4 });
  for (let i = 0; i < 120 * 5; i++) m.step(DT, {});
  const p = m.perceivedFor(0.3, 1);
  assert.ok(p.samples.length > 5);
  assert.ok(p.samples[0].t >= 0 && p.samples[0].t < 0.06, 'premier échantillon ≈ maintenant');
  assert.ok(ARENA_DEFS.length >= 5);
});

test('les difficultés sont ordonnées : Champion bat Débutant nettement', () => {
  let hard = 0, easy = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const m = new MatchSession({ teamSize: 1, difficulty: 'easy', autopilot: true, autopilotDifficulty: 'hard', duration: 90, seed });
    while (m.state !== STATE.ENDED) { m.step(DT, {}); m.drainEvents(); }
    hard += m.score[0]; easy += m.score[1];
  }
  assert.ok(hard > easy * 1.25, `Champion ${hard} buts contre Débutant ${easy}`);
});
