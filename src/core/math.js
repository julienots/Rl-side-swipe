// Petites fonctions mathématiques partagées par la simulation (sans dépendance DOM).

export const TAU = Math.PI * 2;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sgn = (v) => (v < 0 ? -1 : 1);

export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Lissage exponentiel indépendant du pas de temps. */
export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** Paramètre t ∈ [0,1] du point de [AB] le plus proche de P. */
export function closestT(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-12) return 0;
  return clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
}

/**
 * Points les plus proches entre deux segments [P1Q1] et [P2Q2] (Ericson, RTCD 5.1.9).
 * Écrit c1x,c1y,c2x,c2y,d2 dans `out`.
 */
export function segSeg(p1x, p1y, q1x, q1y, p2x, p2y, q2x, q2y, out) {
  const d1x = q1x - p1x, d1y = q1y - p1y;
  const d2x = q2x - p2x, d2y = q2y - p2y;
  const rx = p1x - p2x, ry = p1y - p2y;
  const a = d1x * d1x + d1y * d1y;
  const e = d2x * d2x + d2y * d2y;
  const f = d2x * rx + d2y * ry;
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) { s = 0; t = 0; }
  else if (a <= 1e-9) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = d1x * rx + d1y * ry;
    if (e <= 1e-9) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = d1x * d2x + d1y * d2y;
      const denom = a * e - b * b;
      s = denom > 1e-9 ? clamp((b * f - c * e) / denom, 0, 1) : 0.5;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  out.c1x = p1x + d1x * s; out.c1y = p1y + d1y * s;
  out.c2x = p2x + d2x * t; out.c2y = p2y + d2y * t;
  const dx = out.c1x - out.c2x, dy = out.c1y - out.c2y;
  out.d2 = dx * dx + dy * dy;
  return out;
}

/** Rayon (origine o, direction unitaire d) contre segment [AB]. Retourne la distance ou -1. */
export function raySeg(ox, oy, dx, dy, ax, ay, bx, by, maxLen) {
  const ex = bx - ax, ey = by - ay;
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-9) return -1;
  const wx = ax - ox, wy = ay - oy;
  const t = (wx * ey - wy * ex) / den;
  const u = (wx * dy - wy * dx) / den;
  if (t >= 0 && t <= maxLen && u >= 0 && u <= 1) return t;
  return -1;
}

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
export function makeRng(seed = 1) {
  let s = seed >>> 0;
  const rng = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (a, b) => a + (b - a) * rng();
  rng.gauss = () => {
    const u = Math.max(1e-9, rng()), v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  };
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length) % arr.length];
  return rng;
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
