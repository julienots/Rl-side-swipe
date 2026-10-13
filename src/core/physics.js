// Physique de la balle et des collisions statiques (pure, testable sous Node).
import { PHYS } from './constants.js';
import { closestT, segSeg, raySeg, clamp } from './math.js';

const BP = PHYS.ball;

export function createBall(x = 0, y = BP.radius) {
  return { x, y, vx: 0, vy: 0, w: 0, a: 0, r: BP.radius, m: BP.mass, px: x, py: y, pa: 0, frozen: false, hidden: false };
}

export function resetBall(ball, x, y, vx = 0, vy = 0) {
  ball.x = ball.px = x; ball.y = ball.py = y;
  ball.vx = vx; ball.vy = vy; ball.w = 0;
  ball.frozen = false; ball.hidden = false;
}

/** Forces continues sur la balle pour un pas dt (gravité, traînée, roulement). */
export function applyBallForces(ball, gravity, dt) {
  ball.vy -= gravity * dt;
  const drag = Math.max(0, 1 - BP.airDrag * dt);
  ball.vx *= drag; ball.vy *= drag;
  ball.w *= Math.max(0, 1 - BP.rollDamp * dt);
}

export function clampBallSpeed(ball) {
  const sp = Math.hypot(ball.vx, ball.vy);
  if (sp > BP.maxSpeed) { const k = BP.maxSpeed / sp; ball.vx *= k; ball.vy *= k; }
}

/**
 * Collision cercle/segments, résolue par impulsions avec frottement et effet (spin).
 * Retourne la plus grande vitesse d'impact normale (pour sons/effets).
 */
export function collideBallStatic(ball, segments) {
  let maxImpact = 0;
  const r = ball.r;
  for (let iter = 0; iter < 2; iter++) {
    let any = false;
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      // élimination rapide par boîte englobante
      if (ball.x + r < Math.min(s.ax, s.bx) || ball.x - r > Math.max(s.ax, s.bx) ||
          ball.y + r < Math.min(s.ay, s.by) || ball.y - r > Math.max(s.ay, s.by)) continue;
      const t = closestT(ball.x, ball.y, s.ax, s.ay, s.bx, s.by);
      const cx = s.ax + (s.bx - s.ax) * t, cy = s.ay + (s.by - s.ay) * t;
      const dx = ball.x - cx, dy = ball.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      const d = Math.sqrt(d2);
      let nx, ny;
      if (d > 1e-6) { nx = dx / d; ny = dy / d; }
      else {
        nx = s.nx; ny = s.ny;
        if ((ball.px - cx) * nx + (ball.py - cy) * ny < 0) { nx = -nx; ny = -ny; }
      }
      const pen = r - d;
      ball.x += nx * pen; ball.y += ny * pen;
      any = true;
      const impact = resolveBallSurface(ball, nx, ny, BP.restitution, BP.friction);
      if (impact > maxImpact) maxImpact = impact;
    }
    if (!any) break;
  }
  return maxImpact;
}

/** Impulsion balle/surface immobile de normale n. Retourne la vitesse normale d'impact. */
export function resolveBallSurface(ball, nx, ny, restitution, friction) {
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn >= 0) return 0;
  const e = -vn < BP.restitutionLowSpeed ? 0 : restitution;
  const jn = -(1 + e) * vn * ball.m;
  ball.vx += (jn / ball.m) * nx; ball.vy += (jn / ball.m) * ny;
  // frottement tangentiel couplé au spin
  const tx = -ny, ty = nx;
  const I = BP.inertiaK * ball.m * ball.r * ball.r;
  const slip = ball.vx * tx + ball.vy * ty - ball.w * ball.r;
  const effMass = 1 / (1 / ball.m + (ball.r * ball.r) / I);
  let jt = slip * effMass;
  const maxJt = friction * jn;
  jt = clamp(jt, -maxJt, maxJt);
  ball.vx -= (jt / ball.m) * tx; ball.vy -= (jt / ball.m) * ty;
  ball.w += (jt * ball.r) / I;
  return -vn;
}

/** Contact capsule (axe P-Q, rayon r) avec les segments statiques. Appelle onContact(nx,ny,pen,cx,cy). */
const ss = { c1x: 0, c1y: 0, c2x: 0, c2y: 0, d2: 0 };
export function capsuleContacts(px, py, qx, qy, r, segments, onContact) {
  const minX = Math.min(px, qx) - r, maxX = Math.max(px, qx) + r;
  const minY = Math.min(py, qy) - r, maxY = Math.max(py, qy) + r;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (maxX < Math.min(s.ax, s.bx) || minX > Math.max(s.ax, s.bx) ||
        maxY < Math.min(s.ay, s.by) || minY > Math.max(s.ay, s.by)) continue;
    segSeg(px, py, qx, qy, s.ax, s.ay, s.bx, s.by, ss);
    if (ss.d2 >= r * r) continue;
    const d = Math.sqrt(ss.d2);
    let nx, ny;
    if (d > 1e-6) { nx = (ss.c1x - ss.c2x) / d; ny = (ss.c1y - ss.c2y) / d; }
    else { nx = s.nx; ny = s.ny; }
    onContact(nx, ny, r - d, ss.c2x, ss.c2y, s);
  }
}

/** Lancer de rayon contre les segments ; retourne {dist,nx,ny,seg} (normale tournée vers l'origine) ou null. */
export function raycast(ox, oy, dx, dy, maxLen, segments, out) {
  let best = maxLen + 1, hit = null;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const t = raySeg(ox, oy, dx, dy, s.ax, s.ay, s.bx, s.by, maxLen);
    if (t >= 0 && t < best) { best = t; hit = s; }
  }
  if (!hit) return null;
  let nx = hit.nx, ny = hit.ny;
  if (nx * dx + ny * dy > 0) { nx = -nx; ny = -ny; }
  out.dist = best; out.nx = nx; out.ny = ny; out.seg = hit;
  return out;
}

/** Point le plus proche d'un point sur l'axe d'une capsule. */
export function closestOnAxis(px, py, ax, ay, bx, by, out) {
  const t = closestT(px, py, ax, ay, bx, by);
  out.x = ax + (bx - ax) * t; out.y = ay + (by - ay) * t;
  return out;
}
