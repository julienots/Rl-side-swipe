// Prédiction de trajectoire de la balle seule (sans voitures), utilisée par l'IA et les statistiques.
import { PHYS } from './constants.js';
import { applyBallForces, collideBallStatic, clampBallSpeed } from './physics.js';

/**
 * Simule la balle à partir de l'état `src` pendant `horizon` secondes.
 * Retourne un tableau d'échantillons {t,x,y,vx,vy} espacés de `sample` secondes.
 */
export function predictBall(src, arena, horizon = 2, sample = 0.05, dt = PHYS.dt) {
  const b = { x: src.x, y: src.y, vx: src.vx, vy: src.vy, w: src.w, r: src.r, m: src.m, px: src.x, py: src.y };
  const out = [{ t: 0, x: b.x, y: b.y, vx: b.vx, vy: b.vy }];
  const steps = Math.ceil(horizon / dt);
  const every = Math.max(1, Math.round(sample / dt));
  const segs = arena.segments;
  for (let i = 1; i <= steps; i++) {
    applyBallForces(b, arena.gravity, dt);
    const sp = Math.hypot(b.vx, b.vy);
    const n = Math.min(PHYS.maxSubsteps, Math.max(1, Math.ceil((sp * dt) / PHYS.maxSubstepTravel)));
    const h = dt / n;
    for (let s = 0; s < n; s++) {
      b.px = b.x; b.py = b.y;
      b.x += b.vx * h; b.y += b.vy * h;
      collideBallStatic(b, segs);
    }
    clampBallSpeed(b);
    if (i % every === 0) out.push({ t: i * dt, x: b.x, y: b.y, vx: b.vx, vy: b.vy });
  }
  return out;
}

/** Équipe qui marquerait si la trajectoire prédite entre dans une cage (ou -1). */
export function predictedGoal(samples, arena) {
  for (const s of samples) {
    for (const g of arena.goals) {
      if (s.y < g.top && (g.side > 0 ? s.x - 1.1 > g.lineX : s.x + 1.1 < g.lineX)) return { team: 1 - g.team, t: s.t };
    }
  }
  return null;
}
