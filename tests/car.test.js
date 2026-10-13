import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArena, getArenaDef, buildCourse, getCourseDef } from '../src/core/arena.js';
import { World } from '../src/core/world.js';
import { createCar, placeCar } from '../src/core/car.js';
import { resetBall } from '../src/core/physics.js';
import { PHYS } from '../src/core/constants.js';

const DT = PHYS.dt;
const P = PHYS.car;

function setup(opts = {}) {
  const w = new World(buildArena(getArenaDef('horizon')), { ball: false, ...opts });
  const c = w.addCar(createCar({ id: 0 }));
  placeCar(c, -10, 1);
  return { w, c };
}

const run = (w, sec, input) => { for (let i = 0; i < Math.round(sec * 120); i++) w.step(DT, [typeof input === 'function' ? input(i * DT) : input]); };

test('accélère jusqu\'à la vitesse max sans la dépasser, freine et recule', () => {
  const { w, c } = setup({ boostRegen: 0 });
  run(w, 2.5, { mx: 1 });
  assert.ok(c.vx > P.maxSpeed * 0.95 && c.vx <= P.maxSpeed + 0.6, `vitesse ${c.vx}`);
  run(w, 0.35, { mx: -1 });
  assert.ok(c.vx < P.maxSpeed * 0.3, 'freinage efficace');
  const { w: w2, c: c2 } = setup();
  c2.controls.autoTurn = false;
  run(w2, 1, { mx: -1 });
  assert.ok(c2.vx < -3 && c2.facing === 1, 'marche arrière sans demi-tour');
  assert.ok(Math.abs(c2.vx) <= P.reverseMaxSpeed + 0.5);
});

test('demi-tour automatique quand on tire le stick en arrière à l\'arrêt', () => {
  const { w, c } = setup();
  run(w, 0.6, { mx: -1 });
  assert.equal(c.facing, -1);
  assert.ok(c.vx < 0);
});

test('le boost augmente la vitesse et consomme la jauge', () => {
  const { w, c } = setup({ boostRegen: 0 });
  w.pads.length = 0; // pas de pastille sur le trajet
  c.boost = 100;
  run(w, 1.2, { mx: 1, boost: true });
  assert.ok(c.vx > P.maxSpeed + 4, `vitesse boostée ${c.vx}`);
  assert.ok(c.vx <= P.boostMaxSpeed + 0.6, 'plafond de vitesse en boost');
  assert.ok(Math.abs(c.boost - (100 - P.boostUsePerSec * 1.2)) < 1, `boost consommé ${c.boost}`);
  // à jauge vide, aucun gain par rapport à la conduite normale
  const a = setup({ boostRegen: 0 }), b = setup({ boostRegen: 0 });
  a.c.boost = 0; b.c.boost = 0;
  a.w.pads.length = 0; b.w.pads.length = 0;
  run(a.w, 0.8, { mx: 1, boost: true });
  run(b.w, 0.8, { mx: 1 });
  assert.ok(Math.abs(a.c.vx - b.c.vx) < 1e-9, 'pas d\'accélération de boost à jauge vide');
});

test('le boost permet de monter en l\'air (vol)', () => {
  const { w, c } = setup({ boostRegen: 0 });
  c.boost = 100;
  c.controls.airMode = 'aim';
  run(w, 0.05, { jump: true });
  run(w, 1, { mx: 0, my: 1, boost: true });
  assert.ok(c.y > 8 && c.vy > 0, `vol vertical (${c.y.toFixed(1)})`);
});

test('saut simple, double saut et retour au sol', () => {
  const { w, c } = setup();
  run(w, 0.05, { jump: true });
  run(w, 0.2, {});
  assert.ok(!c.grounded && c.y > 1, 'en l\'air');
  const y1 = c.y;
  run(w, 0.05, { jump: true });
  run(w, 0.3, {});
  assert.ok(c.y > y1 + 1, 'double saut plus haut');
  run(w, 3, {});
  assert.ok(c.grounded && Math.abs(c.y - P.radius) < 0.05, 'reposée au sol');
  assert.ok(Math.abs(Math.sin(c.ang)) < 0.05, 'roues à plat');
});

test('salto : impulsion horizontale et rotation complète', () => {
  const { w, c } = setup();
  run(w, 0.05, { jump: true });
  run(w, 0.15, {});
  const a0 = c.ang;
  run(w, 0.05, { jump: true, mx: 1 });
  assert.ok(c.vx > P.flipImpulse * 0.9, 'élan du salto');
  run(w, P.flipTime, { mx: 0 });
  assert.ok(a0 - c.ang > Math.PI * 1.6, `rotation horaire ~360° (${(a0 - c.ang).toFixed(2)})`);
});

test('rotation aérienne pilotable dans les deux sens', () => {
  for (const dir of [1, -1]) {
    const { w, c } = setup();
    run(w, 0.05, { jump: true });
    const a0 = c.ang;
    run(w, 0.4, { mx: dir });
    assert.ok((c.ang - a0) * -dir > 0.5, 'rotation dans le sens du stick');
  }
});

test('mode visée directe : le nez s\'oriente vers le stick', () => {
  const { w, c } = setup();
  c.controls.airMode = 'aim';
  run(w, 0.05, { jump: true });
  run(w, 0.6, { mx: 0, my: 1 });
  assert.ok(Math.abs(c.ang - Math.PI / 2) < 0.35, `nez vers le haut (${c.ang.toFixed(2)})`);
});

test('roule sur le mur puis le plafond en gardant la direction', () => {
  const w = new World(buildCourse({ ...getCourseDef('ferraille'), solids: [] }), { ball: false, unlimitedBoost: true });
  const c = w.addCar(createCar({ id: 0 }));
  placeCar(c, 125, 1);
  let wall = false, ceiling = false;
  run(w, 4, (t) => {
    if (c.grounded && Math.abs(c.groundN.x) > 0.95) wall = true;
    if (c.grounded && c.groundN.y < -0.95) ceiling = true;
    return { mx: 1, boost: true };
  });
  assert.ok(wall && ceiling, 'mur et plafond atteints');
});

test('récupération quand la voiture est sur le toit', () => {
  const { w, c } = setup();
  c.ang = Math.PI; c.facing = 1; c.y = 1.5; c.grounded = false;
  run(w, 2.5, {});
  assert.ok(c.grounded, 'la voiture se remet sur ses roues');
});

test('frappe : la balle part dans l\'axe du contact, plus fort avec un salto', () => {
  const hit = (flip) => {
    const w = new World(buildArena(getArenaDef('horizon')));
    const c = w.addCar(createCar({ id: 0 }));
    placeCar(c, -12, 1);
    resetBall(w.ball, 0, PHYS.ball.radius);
    // même approche ; avec salto : saut à 4 m de la balle puis salto avant
    let phase = 0, k0 = 0, speed = null;
    for (let i = 0; i < 360 && speed === null; i++) {
      let inp = { mx: 1 };
      if (flip && phase === 0 && w.ball.x - c.x < 4) { phase = 1; k0 = i; }
      if (phase === 1) {
        const k = i - k0;
        inp = { mx: 0, jump: k < 3 };
        if (k === 10) { inp = { jump: true, mx: 1 }; phase = 2; }
      }
      w.step(DT, [inp]);
      const touch = w.events.find((e) => e.type === 'touch');
      if (touch) {
        speed = Math.hypot(w.ball.vx, w.ball.vy);
        assert.ok(w.ball.vx > 0, 'balle envoyée vers l\'avant');
        assert.equal(touch.flip, flip);
      }
    }
    assert.ok(speed !== null, 'contact');
    return speed;
  };
  const plain = hit(false);
  const flip = hit(true);
  assert.ok(plain > 5, `frappe simple ${plain}`);
  assert.ok(flip > plain * 1.3, `salto plus puissant (${flip.toFixed(1)} > ${plain.toFixed(1)})`);
});

test('toit et arrière de la voiture frappent aussi la balle', () => {
  const w = new World(buildArena(getArenaDef('horizon')));
  const c = w.addCar(createCar({ id: 0 }));
  placeCar(c, 0, 1);
  resetBall(w.ball, 0, 3.5, 0, -5);
  for (let i = 0; i < 60; i++) w.step(DT);
  assert.ok(w.events.some((e) => e.type === 'touch'), 'contact sur le toit');
  assert.ok(w.ball.y > c.y + 0.9, 'la balle reste au-dessus');

  const w2 = new World(buildArena(getArenaDef('horizon')));
  const c2 = w2.addCar(createCar({ id: 0 }));
  placeCar(c2, 0, 1);
  resetBall(w2.ball, -4, PHYS.ball.radius, 8, 0);
  for (let i = 0; i < 120; i++) w2.step(DT);
  assert.ok(w2.events.some((e) => e.type === 'touch'), 'contact à l\'arrière');
  assert.ok(w2.ball.x < c2.x, 'la balle rebondit vers l\'arrière');
});
