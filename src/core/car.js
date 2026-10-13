// Voiture : pilotage au sol (y compris murs/plafond), sauts, saltos, rotation aérienne, boost.
import { PHYS } from './constants.js';
import { clamp, sgn, wrapAngle, TAU } from './math.js';
import { raycast, capsuleContacts } from './physics.js';

const P = PHYS.car;
export const NEUTRAL_INPUT = Object.freeze({ mx: 0, my: 0, jump: false, boost: false });

export function createCar(opts = {}) {
  const car = {
    id: opts.id ?? 0,
    team: opts.team ?? 0,
    name: opts.name ?? 'Pilote',
    isBot: !!opts.isBot,
    isHuman: !!opts.isHuman,
    cosmetics: opts.cosmetics || null,
    controls: { airMode: 'rotate', autoTurn: true, invertAir: false, ...(opts.controls || {}) },
    x: 0, y: 0, vx: 0, vy: 0, ang: 0, w: 0, facing: 1,
    px: 0, py: 0, pang: 0, pfacing: 1,
    boost: 34,
    boosting: false,
    frozen: false,
    grounded: false, wasGrounded: false,
    groundN: { x: 0, y: 1 },
    groundLock: 0,
    airTime: 0,
    jumped: false,
    secondAvailable: false,
    secondTimer: 0,
    jumpHoldTimer: 0,
    flipTimer: 0, flipW: 0,
    prevJump: false,
    thrRef: null,
    reverseTimer: 0,
    turnAnim: 0,
    recoverTimer: 0,
    wallStall: 0,
    contactNX: 0, contactNY: 0, contactCount: 0,
    throttle: 0,
    wheelSpin: 0,
    suspension: 0,
  };
  return car;
}

export function carAxes(car) {
  const fx = Math.cos(car.ang), fy = Math.sin(car.ang);
  return { fx, fy, ux: -fy * car.facing, uy: fx * car.facing };
}

/** Place la voiture posée au sol, nez vers `facing` (+1 droite, -1 gauche). */
export function placeCar(car, x, facing, y = P.radius) {
  car.x = car.px = x; car.y = car.py = y;
  car.vx = car.vy = 0; car.w = 0;
  car.facing = car.pfacing = facing;
  car.ang = car.pang = facing > 0 ? 0 : Math.PI;
  car.grounded = true; car.wasGrounded = true;
  car.groundN.x = 0; car.groundN.y = 1;
  car.jumped = false; car.secondAvailable = false; car.flipTimer = 0; car.jumpHoldTimer = 0;
  car.groundLock = 0; car.airTime = 0; car.thrRef = null; car.reverseTimer = 0; car.turnAnim = 0;
  car.recoverTimer = 0; car.wallStall = 0; car.boosting = false; car.prevJump = false;
}

const rayHit = { dist: 0, nx: 0, ny: 0, seg: null };

/** Détecte le contact des roues avec une surface (deux rayons sous la voiture). */
export function probeGround(car, segments) {
  if (car.groundLock > 0) { car.grounded = false; return; }
  const { fx, fy, ux, uy } = carAxes(car);
  const len = P.radius + P.suspension;
  let hits = 0, nx = 0, ny = 0, dist = 0;
  for (const s of [1, -1]) {
    const ox = car.x + fx * P.halfLen * 0.85 * s, oy = car.y + fy * P.halfLen * 0.85 * s;
    const h = raycast(ox, oy, -ux, -uy, len, segments, rayHit);
    if (h && h.nx * ux + h.ny * uy > 0.5) { hits++; nx += h.nx; ny += h.ny; dist += h.dist; }
  }
  if (hits > 0) {
    const l = Math.hypot(nx, ny) || 1;
    car.groundN.x = nx / l; car.groundN.y = ny / l;
    car.grounded = true;
    car.suspension = clamp(dist / hits - P.radius, 0, P.suspension);
  } else {
    car.grounded = false;
    car.suspension = P.suspension;
  }
}

function turnAround(car) {
  car.ang = wrapAngle(car.ang + Math.PI);
  car.facing = -car.facing;
  car.turnAnim = P.turnAnimTime;
  if (car.thrRef) car.thrRef.sign = -car.thrRef.sign;
  car.reverseTimer = 0;
}

/** Applique les commandes et forces pour un pas dt (avant intégration et collisions). */
export function stepCarControl(car, input, world, dt) {
  if (car.frozen) { car.boosting = false; car.prevJump = !!input.jump; return; }
  const segments = world.arena.segments;
  car.groundLock = Math.max(0, car.groundLock - dt);
  car.turnAnim = Math.max(0, car.turnAnim - dt);
  car.wasGrounded = car.grounded;
  probeGround(car, segments);

  const mx = clamp(input.mx || 0, -1, 1), my = clamp(input.my || 0, -1, 1);
  const jumpPressed = !!input.jump && !car.prevJump;
  car.prevJump = !!input.jump;
  let { fx, fy, ux, uy } = carAxes(car);

  // Contacts de la frame précédente (pour la récupération sur le toit)
  const touching = car.contactCount > 0;
  const cnx = touching ? car.contactNX / car.contactCount : 0;
  const cny = touching ? car.contactNY / car.contactCount : 0;
  car.contactNX = car.contactNY = 0; car.contactCount = 0;

  if (car.grounded) {
    if (!car.wasGrounded) {
      if (car.airTime > 0.3) world.emit('land', { carId: car.id, speed: Math.hypot(car.vx, car.vy), x: car.x, y: car.y });
      car.thrRef = null;
    }
    car.airTime = 0;
    car.jumped = false; car.secondAvailable = false; car.flipTimer = 0; car.jumpHoldTimer = 0; car.recoverTimer = 0;
    const n = car.groundN;
    let tx = n.y, ty = -n.x;
    if (tx * fx + ty * fy < 0) { tx = -tx; ty = -ty; }
    const vt = car.vx * tx + car.vy * ty;

    // Accélérateur : projection du stick sur la tangente, verrouillée tant que le stick garde sa direction
    const mag = Math.hypot(mx, my);
    let throttle = 0;
    if (mag > 0.25) {
      const sdx = mx / mag, sdy = my / mag;
      const power = Math.min(1, mag * 1.25);
      if (car.thrRef && sdx * car.thrRef.x + sdy * car.thrRef.y > 0.8) throttle = car.thrRef.sign * power;
      else {
        const d = sdx * tx + sdy * ty;
        if (Math.abs(d) > 0.3) {
          throttle = sgn(d) * power * Math.min(1, Math.abs(d) * 1.6);
          car.thrRef = { x: sdx, y: sdy, sign: sgn(d) };
        }
      }
    } else car.thrRef = null;
    car.throttle = throttle;

    // Demi-tour automatique quand on veut reculer depuis l'arrêt
    if (car.controls.autoTurn && throttle < -0.3 && vt < 1.5) {
      car.reverseTimer += dt;
      if (car.reverseTimer > P.autoTurnDelay) {
        turnAround(car);
        ({ fx, fy, ux, uy } = carAxes(car));
        tx = -tx; ty = -ty; throttle = -throttle; car.throttle = throttle;
      }
    } else car.reverseTimer = 0;

    const vt2 = car.vx * tx + car.vy * ty;
    let a = 0;
    if (Math.abs(throttle) > 0.05) {
      const vmax = throttle > 0 ? P.maxSpeed : P.reverseMaxSpeed;
      if (throttle * vt2 < 0 && Math.abs(vt2) > 0.3) a = throttle * P.brakeAccel;
      else if (Math.abs(vt2) < vmax) a = throttle * P.driveAccel * (0.3 + 0.7 * (1 - Math.abs(vt2) / vmax));
    } else {
      a = -sgn(vt2) * Math.min(P.coastDecel, Math.abs(vt2) / dt);
    }
    if (!car.boosting && Math.abs(vt2) > P.maxSpeed + 0.5 && throttle * vt2 >= 0) a -= sgn(vt2) * 4;
    car.vx += tx * a * dt; car.vy += ty * a * dt;

    // Adhérence : forte sur murs/plafond si on roule assez vite
    const stick = n.y > 0.7 ? P.floorStickAccel : Math.abs(vt2) > P.wallMinSpeed ? P.stickAccel : 3;
    car.vx -= n.x * stick * dt; car.vy -= n.y * stick * dt;

    // Alignement des roues sur la surface (ressort amorti)
    const err = Math.atan2(ux * n.y - uy * n.x, ux * n.x + uy * n.y);
    car.w += (err * P.alignKp - car.w * P.alignKd) * dt;

    car.wheelSpin += (vt2 / 0.32) * dt;

    // Calée contre une paroi verticale sans vitesse ni accélérateur : la voiture se décroche
    // (évite de rester bloquée debout contre un obstacle)
    if (n.y < 0.5 && Math.abs(vt2) < 2 && Math.abs(throttle) < 0.1 && !jumpPressed) {
      car.wallStall += dt;
      if (car.wallStall > P.wallStallTime) {
        car.vx += n.x * 4; car.vy += n.y * 4 + 3;
        car.w = sgn(ux) * 6; // bascule pour retomber sur les roues
        car.groundLock = 0.25; car.grounded = false; car.wallStall = 0;
        car.secondAvailable = false; car.jumped = true;
      }
    } else car.wallStall = 0;

    if (jumpPressed) {
      car.vx += ux * P.jumpSpeed; car.vy += uy * P.jumpSpeed;
      car.grounded = false;
      car.groundLock = P.groundLockAfterJump;
      car.jumped = true; car.secondAvailable = true; car.secondTimer = 0;
      car.jumpHoldTimer = P.jumpHoldTime;
      world.emit('jump', { carId: car.id, x: car.x, y: car.y });
    }
  } else {
    car.airTime += dt;
    car.throttle = 0;
    if (car.wasGrounded && !car.jumped) {
      // quitté le sol sans sauter : un saut aérien reste disponible
      car.secondAvailable = true; car.secondTimer = 0; car.jumped = true;
    }
    car.secondTimer += dt;
    if (car.jumpHoldTimer > 0 && input.jump) {
      car.vx += ux * P.jumpHoldAccel * dt; car.vy += uy * P.jumpHoldAccel * dt;
      car.jumpHoldTimer -= dt;
    } else car.jumpHoldTimer = 0;

    // Récupération quand la voiture est coincée sur le toit / le flanc
    const stuck = touching && (cnx * ux + cny * uy) < 0.35 && Math.hypot(car.vx, car.vy) < 4;
    if (stuck) car.recoverTimer += dt; else car.recoverTimer = 0;
    if (stuck && (car.recoverTimer > P.recoverDelay || jumpPressed)) {
      car.vx += cnx * 7.5; car.vy += cny * 7.5 + 2;
      const side = sgn(ux * cny - uy * cnx);
      car.w = side * 9;
      car.recoverTimer = 0; car.secondAvailable = false;
      car.groundLock = 0.1;
      world.emit('recover', { carId: car.id });
    } else if (jumpPressed && car.secondAvailable && car.secondTimer < P.secondJumpWindow && car.flipTimer <= 0) {
      car.secondAvailable = false;
      car.jumpHoldTimer = 0;
      if (Math.abs(mx) > 0.45) {
        const dir = sgn(mx);
        car.vx += dir * P.flipImpulse;
        car.vy = car.vy * 0.35 + 1.2;
        car.flipTimer = P.flipTime;
        car.flipW = -dir * TAU / P.flipTime;
        world.emit('flip', { carId: car.id, dir, x: car.x, y: car.y });
      } else {
        car.vx += ux * P.doubleJumpSpeed; car.vy += uy * P.doubleJumpSpeed;
        world.emit('doublejump', { carId: car.id, x: car.x, y: car.y });
      }
    }

    if (car.flipTimer > 0) {
      car.flipTimer -= dt;
      car.w = car.flipW;
      if (car.flipTimer <= 0) car.w = car.flipW * 0.12;
    } else {
      const inv = car.controls.invertAir ? -1 : 1;
      if (car.controls.airMode === 'aim') {
        const mag = Math.hypot(mx, my);
        if (mag > 0.4) {
          const target = Math.atan2(my, mx);
          const err = wrapAngle(target - car.ang);
          const desired = clamp(err * 11, -P.airRotMax, P.airRotMax);
          car.w += (desired - car.w) * Math.min(1, 14 * dt);
        } else car.w *= Math.max(0, 1 - P.airDamp * dt);
      } else {
        car.w += (-mx * inv * P.airRotAccel - car.w * P.airDamp) * dt;
        car.w = clamp(car.w, -P.airRotMax, P.airRotMax);
      }
    }
  }

  // Boost
  car.boosting = false;
  if (input.boost && (world.unlimitedBoost || car.boost > 0.5)) {
    car.boosting = true;
    if (!world.unlimitedBoost) car.boost = Math.max(0, car.boost - P.boostUsePerSec * dt);
    const vf = car.vx * fx + car.vy * fy;
    if (vf < P.boostMaxSpeed) { car.vx += fx * P.boostAccel * dt; car.vy += fy * P.boostAccel * dt; }
  } else if (world.boostRegen > 0) {
    car.boost = Math.min(100, car.boost + world.boostRegen * dt);
  }

  car.vy -= world.gravity * dt;
  const sp = Math.hypot(car.vx, car.vy);
  if (sp > P.absMaxSpeed) { const k = P.absMaxSpeed / sp; car.vx *= k; car.vy *= k; }
}

/** Collisions capsule/décor avec impulsions (rotation incluse quand la voiture est en l'air). */
export function collideCarStatic(car, segments, world) {
  const fx = Math.cos(car.ang), fy = Math.sin(car.ang);
  const hl = P.halfLen;
  const px = car.x + fx * hl, py = car.y + fy * hl, qx = car.x - fx * hl, qy = car.y - fy * hl;
  capsuleContacts(px, py, qx, qy, P.radius, segments, (nx, ny, pen, cx, cy) => {
    car.x += nx * pen; car.y += ny * pen;
    car.contactNX += nx; car.contactNY += ny; car.contactCount++;
    const rcx = cx - car.x, rcy = cy - car.y;
    const vpx = car.vx - car.w * rcy, vpy = car.vy + car.w * rcx;
    const vn = vpx * nx + vpy * ny;
    if (vn >= 0) return;
    const aligned = car.grounded && nx * car.groundN.x + ny * car.groundN.y > 0.8;
    const rcn = rcx * ny - rcy * nx;
    const invM = 1 / P.mass + (aligned ? 0 : (rcn * rcn) / P.inertia);
    const j = (-(1 + P.restitution) * vn) / invM;
    car.vx += (j * nx) / P.mass; car.vy += (j * ny) / P.mass;
    if (!aligned) {
      car.w += (rcn * j) / P.inertia;
      // léger frottement en l'air
      const tx = -ny, ty = nx;
      const vt = vpx * tx + vpy * ty;
      car.vx -= tx * vt * 0.08; car.vy -= ty * vt * 0.08;
    }
    if (vn < -9 && world) world.emit('carImpact', { carId: car.id, speed: -vn, x: cx, y: cy });
  });
}
