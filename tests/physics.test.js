import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArena, ARENA_DEFS, getArenaDef } from '../src/core/arena.js';
import { World } from '../src/core/world.js';
import { createCar, placeCar } from '../src/core/car.js';
import { resetBall } from '../src/core/physics.js';
import { PHYS } from '../src/core/constants.js';
import { FixedStepper } from '../src/core/stepper.js';

const DT = PHYS.dt;

function insideArena(arena, b, tol = 0.05) {
  const minX = -arena.W - arena.D - tol, maxX = arena.W + arena.D + tol;
  if (b.x < minX || b.x > maxX || b.y < -tol || b.y > arena.H + tol) return false;
  // au-dessus de la barre, la balle ne peut pas être derrière la ligne de but
  if (b.y > arena.G + b.r + tol && Math.abs(b.x) > arena.W + tol) return false;
  return true;
}

test('la balle rebondit avec des hauteurs décroissantes puis se pose au sol', () => {
  const w = new World(buildArena(getArenaDef('horizon')));
  resetBall(w.ball, 0, 10);
  const peaks = [];
  let prevVy = 0;
  for (let i = 0; i < 120 * 12; i++) {
    w.step(DT);
    if (prevVy > 0 && w.ball.vy <= 0) peaks.push(w.ball.y);
    prevVy = w.ball.vy;
    assert.ok(w.ball.y >= w.ball.r - 0.02, `balle sous le sol : ${w.ball.y}`);
  }
  assert.ok(peaks.length >= 3, 'au moins trois rebonds');
  for (let i = 1; i < peaks.length; i++) assert.ok(peaks[i] < peaks[i - 1] + 1e-6, 'rebonds décroissants');
  assert.ok(Math.abs(w.ball.vy) < 0.05 && Math.abs(w.ball.y - w.ball.r) < 0.02, 'balle au repos');
});

test('aucune traversée : tirs à vitesse max dans toutes les directions et toutes les arènes', () => {
  for (const def of ARENA_DEFS) {
    const arena = buildArena(def);
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * Math.PI * 2;
      const w = new World(arena);
      resetBall(w.ball, (k % 5 - 2) * 3, 3 + (k % 4) * 2.5, Math.cos(a) * PHYS.ball.maxSpeed, Math.sin(a) * PHYS.ball.maxSpeed);
      for (let i = 0; i < 120 * 3; i++) {
        w.step(DT);
        assert.ok(insideArena(arena, w.ball), `${def.id} angle ${k}: balle hors arène (${w.ball.x.toFixed(2)}, ${w.ball.y.toFixed(2)})`);
        assert.ok(Number.isFinite(w.ball.x) && Number.isFinite(w.ball.vy));
      }
    }
  }
});

test('tirs puissants vers les poteaux et les coins supérieurs : la balle ne traverse pas', () => {
  const arena = buildArena(getArenaDef('horizon'));
  const targets = [[arena.W, arena.G], [-arena.W, arena.G], [arena.W - 1, arena.H - 1], [-arena.W + 1, arena.H - 1], [arena.W + arena.D, 0.5]];
  for (const [tx, ty] of targets) {
    for (const ox of [-5, 0, 5]) {
      const w = new World(arena);
      const sx = ox, sy = 4;
      const d = Math.hypot(tx - sx, ty - sy);
      resetBall(w.ball, sx, sy, ((tx - sx) / d) * PHYS.ball.maxSpeed, ((ty - sy) / d) * PHYS.ball.maxSpeed);
      for (let i = 0; i < 120 * 2; i++) { w.step(DT); assert.ok(insideArena(arena, w.ball), `cible ${tx},${ty}`); }
    }
  }
});

test('la balle rebondit sur la barre transversale par-dessus (pas de but fantôme)', () => {
  const arena = buildArena(getArenaDef('horizon'));
  const w = new World(arena);
  resetBall(w.ball, arena.W - 0.3, arena.G + 6, 0, 0);
  for (let i = 0; i < 120 * 2; i++) w.step(DT);
  assert.ok(w.ball.x < arena.W, 'la balle retombe dans le terrain');
});

test('collisions simultanées : balle coincée entre deux voitures et le sol reste stable', () => {
  const arena = buildArena(getArenaDef('horizon'));
  const w = new World(arena);
  const a = w.addCar(createCar({ id: 0 })); placeCar(a, -2, 1);
  const b = w.addCar(createCar({ id: 1, team: 1 })); placeCar(b, 2, -1);
  resetBall(w.ball, 0, PHYS.ball.radius);
  for (let i = 0; i < 120 * 3; i++) {
    w.step(DT, [{ mx: 1, boost: true }, { mx: -1, boost: true }]);
    for (const c of w.cars) assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y));
    assert.ok(insideArena(arena, w.ball, 0.2));
  }
});

test('la physique ne dépend pas de la fréquence d\'affichage (pas fixe)', () => {
  const run = (frames) => {
    const w = new World(buildArena(getArenaDef('horizon')));
    const c = w.addCar(createCar({ id: 0 })); placeCar(c, -8, 1);
    resetBall(w.ball, 0, 6, -3, 4);
    const st = new FixedStepper(DT, 1000);
    let t = 0;
    for (const f of frames) {
      st.advance(f, (dt) => { t += dt; w.step(dt, [{ mx: 1, boost: t > 0.5, jump: t > 1 && t < 1.1 }]); });
    }
    return { x: c.x, y: c.y, bx: w.ball.x, by: w.ball.y, t };
  };
  const total = 3;
  const mk = (fps, jitter = 0) => { const out = []; let acc = 0, i = 0; while (acc < total - 1e-9) { const f = Math.min(total - acc, 1 / fps + (jitter ? ((i++ * 7919) % 13) / 1000 * jitter : 0)); out.push(f); acc += f; } return out; };
  const a = run(mk(60)), b = run(mk(30)), c = run(mk(144)), d = run(mk(50, 1));
  for (const r of [b, c, d]) {
    assert.equal(Math.round(r.t * 120), Math.round(a.t * 120));
    assert.ok(Math.abs(r.x - a.x) < 1e-9 && Math.abs(r.bx - a.bx) < 1e-9 && Math.abs(r.by - a.by) < 1e-9, 'mêmes résultats quel que soit le FPS');
  }
});

test('pastilles de boost : ramassage et réapparition', () => {
  const arena = buildArena(getArenaDef('horizon'));
  const w = new World(arena, { boostRegen: 0 });
  const c = w.addCar(createCar({ id: 0 })); placeCar(c, arena.pads[0].x - 3, 1);
  c.boost = 0;
  for (let i = 0; i < 120; i++) w.step(DT, [{ mx: 1 }]);
  assert.ok(c.boost >= 30, `boost ramassé (${c.boost})`);
  assert.ok(w.pads[0].timer > 0, 'pastille désactivée');
  for (let i = 0; i < 120 * 7; i++) w.step(DT);
  assert.equal(w.pads[0].timer, 0, 'pastille réapparue');
});
