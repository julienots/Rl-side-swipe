// Monde physique : intègre voitures + balle à pas fixe avec sous-étapes anti-traversée.
import { PHYS } from './constants.js';
import { clamp, segSeg, closestT } from './math.js';
import { createBall, applyBallForces, collideBallStatic, clampBallSpeed } from './physics.js';
import { stepCarControl, collideCarStatic, NEUTRAL_INPUT } from './car.js';

const CP = PHYS.car;
const BP = PHYS.ball;

export class World {
  constructor(arena, opts = {}) {
    this.arena = arena;
    this.gravity = arena.gravity;
    this.ball = createBall(0, BP.radius);
    this.ballEnabled = opts.ball !== false;
    if (!this.ballEnabled) this.ball.hidden = this.ball.frozen = true;
    this.cars = [];
    this.events = [];
    this.time = 0;
    this.boostRegen = opts.boostRegen ?? 5;
    this.unlimitedBoost = !!opts.unlimitedBoost;
    this.pads = arena.pads.map((p) => ({ ...p }));
    this.lastTouch = null; // { carId, team, time }
    this.touchHistory = []; // derniers contacts (pour passes décisives)
    this._lastBounceTime = -1;
    this._touchCooldown = new Map();
  }

  addCar(car) { this.cars.push(car); return car; }

  emit(type, data = {}) { this.events.push({ type, t: this.time, ...data }); }

  drainEvents() { const e = this.events; this.events = []; return e; }

  savePrevious() {
    const b = this.ball;
    b.px = b.x; b.py = b.y; b.pa = b.a;
    for (const c of this.cars) { c.px = c.x; c.py = c.y; c.pang = c.ang; c.pfacing = c.facing; }
  }

  /** Avance la simulation de dt (pas fixe). inputs[i] = commandes de la voiture i. */
  step(dt, inputs = []) {
    this.savePrevious();
    const cars = this.cars, ball = this.ball;
    for (let i = 0; i < cars.length; i++) stepCarControl(cars[i], inputs[i] || NEUTRAL_INPUT, this, dt);
    const ballActive = this.ballEnabled && !ball.frozen;
    if (ballActive) applyBallForces(ball, this.gravity, dt);

    // Nombre de sous-étapes selon la vitesse max (détection continue approchée)
    let maxV = ballActive ? Math.hypot(ball.vx, ball.vy) : 0;
    for (const c of cars) if (!c.frozen) maxV = Math.max(maxV, Math.hypot(c.vx, c.vy) + Math.abs(c.w) * CP.halfLen);
    const n = clamp(Math.ceil((maxV * dt) / PHYS.maxSubstepTravel), 1, PHYS.maxSubsteps);
    const h = dt / n;
    const segs = this.arena.segments;

    for (let s = 0; s < n; s++) {
      for (const c of cars) {
        if (c.frozen) continue;
        c.x += c.vx * h; c.y += c.vy * h; c.ang += c.w * h;
        collideCarStatic(c, segs, this);
      }
      if (ballActive) {
        ball.x += ball.vx * h; ball.y += ball.vy * h;
        const impact = collideBallStatic(ball, segs);
        if (impact > 3 && this.time - this._lastBounceTime > 0.06) {
          this._lastBounceTime = this.time;
          this.emit('bounce', { speed: impact, x: ball.x, y: ball.y });
        }
        for (const c of cars) if (!c.frozen) this.collideCarBall(c);
      }
      for (let i = 0; i < cars.length; i++)
        for (let j = i + 1; j < cars.length; j++)
          if (!cars[i].frozen && !cars[j].frozen) this.collideCars(cars[i], cars[j]);
      // re-sécurise la balle après les poussées des voitures
      if (ballActive) collideBallStatic(ball, segs);
    }
    if (ballActive) {
      clampBallSpeed(ball);
      ball.a += ball.w * dt;
    }
    for (const c of cars) if (Math.abs(c.ang) > 1e4) c.ang %= Math.PI * 2;
    this.updatePads(dt);
    this.time += dt;
  }

  collideCarBall(car) {
    const ball = this.ball;
    const fx = Math.cos(car.ang), fy = Math.sin(car.ang);
    const ax = car.x + fx * CP.halfLen, ay = car.y + fy * CP.halfLen;
    const bx = car.x - fx * CP.halfLen, by = car.y - fy * CP.halfLen;
    const t = closestT(ball.x, ball.y, ax, ay, bx, by);
    const cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t;
    let dx = ball.x - cx, dy = ball.y - cy;
    const minD = CP.radius + ball.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= minD * minD) return;
    const d = Math.sqrt(d2);
    let nx, ny;
    if (d > 1e-6) { nx = dx / d; ny = dy / d; } else { nx = -fy * car.facing; ny = fx * car.facing; }
    const pen = minD - d;
    ball.x += nx * pen * 0.85; ball.y += ny * pen * 0.85;
    car.x -= nx * pen * 0.15; car.y -= ny * pen * 0.15;

    const cpx = cx + nx * CP.radius, cpy = cy + ny * CP.radius;
    const rcx = cpx - car.x, rcy = cpy - car.y;
    const vcx = car.vx - car.w * rcy, vcy = car.vy + car.w * rcx;
    const rel = (ball.vx - vcx) * nx + (ball.vy - vcy) * ny;
    if (rel >= 0) return;
    const rcn = rcx * ny - rcy * nx;
    const invMass = 1 / ball.m + 1 / CP.mass + (rcn * rcn) / CP.inertia;
    const J = (-(1 + PHYS.carBall.restitution) * rel) / invMass;
    ball.vx += (J / ball.m) * nx; ball.vy += (J / ball.m) * ny;
    car.vx -= (J / CP.mass) * nx; car.vy -= (J / CP.mass) * ny;
    car.w -= (rcn * J) / CP.inertia;
    // Frappe : bonus proportionnel à la vitesse d'impact (et au salto), toujours dans l'axe du contact
    const flipping = car.flipTimer > 0;
    const kick = Math.min(-rel, PHYS.carBall.maxKickSpeed) * (CP.hitKick + (flipping ? CP.flipHitBonus : 0));
    ball.vx += nx * kick; ball.vy += ny * kick;
    // Effet transmis par le frottement
    const tx = -ny, ty = nx;
    const slip = (ball.vx - vcx) * tx + (ball.vy - vcy) * ty - ball.w * ball.r;
    const I = BP.inertiaK * ball.m * ball.r * ball.r;
    const jt = slip * 0.25 / (1 / ball.m + (ball.r * ball.r) / I);
    ball.vx -= (jt / ball.m) * tx; ball.vy -= (jt / ball.m) * ty;
    ball.w += (jt * ball.r) / I;
    clampBallSpeed(ball);

    const last = this._touchCooldown.get(car.id) ?? -1;
    if (this.time - last > 0.12 || -rel > 6) {
      this._touchCooldown.set(car.id, this.time);
      const touch = {
        carId: car.id, team: car.team, speed: -rel, x: cpx, y: cpy,
        aerial: !car.grounded && ball.y > 3, flip: flipping, time: this.time,
      };
      this.lastTouch = touch;
      this.touchHistory.push(touch);
      if (this.touchHistory.length > 12) this.touchHistory.shift();
      this.emit('touch', touch);
    }
  }

  collideCars(a, b) {
    const fa = { x: Math.cos(a.ang), y: Math.sin(a.ang) }, fb = { x: Math.cos(b.ang), y: Math.sin(b.ang) };
    const hl = CP.halfLen;
    const o = {};
    segSeg(a.x + fa.x * hl, a.y + fa.y * hl, a.x - fa.x * hl, a.y - fa.y * hl,
      b.x + fb.x * hl, b.y + fb.y * hl, b.x - fb.x * hl, b.y - fb.y * hl, o);
    const minD = CP.radius * 2;
    if (o.d2 >= minD * minD) return;
    const d = Math.sqrt(o.d2);
    let nx, ny;
    if (d > 1e-6) { nx = (o.c1x - o.c2x) / d; ny = (o.c1y - o.c2y) / d; }
    else { nx = a.x < b.x ? -1 : 1; ny = 0; }
    const pen = (minD - d) / 2;
    a.x += nx * pen; a.y += ny * pen; b.x -= nx * pen; b.y -= ny * pen;
    const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (rel >= 0) return;
    const J = (-(1 + PHYS.carCar.restitution) * rel) / 2;
    a.vx += J * nx; a.vy += J * ny; b.vx -= J * nx; b.vy -= J * ny;
    if (-rel > 7) this.emit('bump', { a: a.id, b: b.id, speed: -rel, x: (o.c1x + o.c2x) / 2, y: (o.c1y + o.c2y) / 2 });
  }

  updatePads(dt) {
    for (const p of this.pads) {
      if (p.timer > 0) { p.timer = Math.max(0, p.timer - dt); continue; }
      for (const c of this.cars) {
        if (c.frozen || c.boost >= 100) continue;
        if (Math.abs(c.x - p.x) < 1.3 && c.y - p.y < 1.4) {
          c.boost = Math.min(100, c.boost + p.amount);
          p.timer = p.respawn;
          this.emit('pad', { carId: c.id, x: p.x, y: p.y });
          break;
        }
      }
    }
  }
}
