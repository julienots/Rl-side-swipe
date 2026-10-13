// Définitions et construction géométrique des arènes (vue de côté, y vers le haut).
// La géométrie de collision est une liste de segments ; les collisions sont bilatérales
// (point le plus proche), donc l'ordre des sommets n'importe que pour l'affichage.

export const ARENA_DEFS = [
  {
    id: 'horizon', name: 'Stade Horizon', desc: 'Arène standard équilibrée.',
    W: 22, H: 16, R: 4.5, G: 6.4, D: 4.2, gravity: 30, theme: 'horizon',
    pads: [-15, -6, 6, 15],
  },
  {
    id: 'boite', name: 'La Boîte', desc: 'Compacte : action non-stop.',
    W: 17, H: 13, R: 3.5, G: 5.8, D: 4, gravity: 30, theme: 'boite',
    pads: [-10, 10],
  },
  {
    id: 'fonderie', name: 'Fonderie', desc: 'Industrielle, angles plus vifs.',
    W: 23, H: 15, R: 2.6, G: 6.2, D: 4.2, gravity: 30, theme: 'fonderie',
    pads: [-16, -7, 7, 16],
  },
  {
    id: 'orbitale', name: 'Station Orbitale', desc: 'Futuriste, grand volume aérien.',
    W: 24, H: 18, R: 6, G: 6.6, D: 4.4, gravity: 30, theme: 'orbitale',
    pads: [-17, -7, 7, 17],
  },
  {
    id: 'neon', name: 'Dôme Néon', desc: 'Courbes larges, parfait pour les murs.',
    W: 20.5, H: 17, R: 7.5, G: 6.2, D: 4.2, gravity: 30, theme: 'neon',
    pads: [-12, 0, 12],
  },
  {
    id: 'cratere', name: 'Cratère Lunaire', desc: 'Événement : gravité réduite !',
    W: 22, H: 20, R: 5, G: 6.4, D: 4.2, gravity: 18, theme: 'cratere', event: true,
    pads: [-15, -6, 6, 15],
  },
];

export function getArenaDef(id) {
  return ARENA_DEFS.find((a) => a.id === id) || ARENA_DEFS[0];
}

function arc(pts, cx, cy, r, a0, a1, steps) {
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
}

function pushPolygon(segments, pts, closed, kindFn) {
  const n = pts.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % n];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    // normale gauche (intérieur pour un polygone anti-horaire)
    const nx = -dy / len, ny = dx / len;
    segments.push({ ax, ay, bx, by, nx, ny, len, kind: kindFn ? kindFn(ax, ay, bx, by, nx, ny) : 'solid' });
  }
}

function finalize(arena) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of arena.segments) {
    minX = Math.min(minX, s.ax, s.bx); maxX = Math.max(maxX, s.ax, s.bx);
    minY = Math.min(minY, s.ay, s.by); maxY = Math.max(maxY, s.ay, s.by);
  }
  arena.bounds = { minX, maxX, minY, maxY };
  return arena;
}

/** Construit une arène de football : sol, murs, plafond arrondi, deux cages au ras du sol. */
export function buildArena(def) {
  const { W, H, R, G, D } = def;
  const outline = [];
  outline.push([-W - D, 0], [W + D, 0], [W + D, G], [W, G]);
  arc(outline, W - R, H - R, R, 0, Math.PI / 2, 10);
  arc(outline, -W + R, H - R, R, Math.PI / 2, Math.PI, 10);
  outline.push([-W, G], [-W - D, G]);

  const segments = [];
  pushPolygon(segments, outline, true, (ax, ay, bx, by, nx, ny) => {
    if (Math.min(ax, bx) >= W - 1e-6 || Math.max(ax, bx) <= -W + 1e-6) return 'goal';
    if (ny > 0.7) return 'floor';
    if (ny < -0.7) return 'ceiling';
    return 'wall';
  });

  const arena = {
    type: 'soccer',
    def,
    W, H, G, D, R,
    gravity: def.gravity,
    outline,
    segments,
    solids: [],
    goals: [
      // team = équipe qui DÉFEND la cage ; side = côté (-1 gauche, +1 droite)
      { team: 0, side: -1, lineX: -W, top: G, backX: -W - D },
      { team: 1, side: 1, lineX: W, top: G, backX: W + D },
    ],
    pads: (def.pads || []).map((x, i) => ({ id: i, x, y: 0.15, amount: 34, respawn: 6, timer: 0 })),
    posts: [{ x: -W, y: G }, { x: W, y: G }],
  };
  return finalize(arena);
}

// ---------------------------------------------------------------------------
// Parcours d'obstacles

export const COURSE_DEFS = [
  {
    id: 'ferraille', name: 'Circuit Ferraille', desc: 'Bosses, plate-forme, tunnel et montée au mur.',
    L: 150, H: 24, R: 6, gravity: 30, theme: 'fonderie',
    start: { x: 6, y: 0.5 },
    medals: { gold: 12, silver: 17, bronze: 25 },
    solids: [
      [[18, 0], [24, 2.4], [29, 2.4], [35, 0]], // bosse
      [[45, 0], [47.4, 0], [47.4, 3.2], [45, 3.2]], // muret à sauter
      [[54, 0], [64, 0], [64, 6]], // rampe
      [[64, 5], [80, 5], [80, 6], [64, 6]], // plate-forme
      [[98, 3.6], [116, 3.6], [116, 24], [98, 24]], // plafond bas (tunnel)
    ],
    checkpoints: [
      { x: 26.5, y: 5.6, r: 2.4 },
      { x: 46.2, y: 6.2, r: 2.6 },
      { x: 72, y: 8.4, r: 2.4 },
      { x: 86, y: 8, r: 2.6 },
      { x: 107, y: 1.8, r: 2.2 },
      { x: 147.5, y: 13, r: 2.6, finish: true },
    ],
  },
  {
    id: 'voltige', name: 'Voltige Néon', desc: 'Sauts enchaînés, plate-forme et tremplin.',
    L: 130, H: 20, R: 7, gravity: 30, theme: 'neon',
    start: { x: 6, y: 0.5 },
    medals: { gold: 12, silver: 17, bronze: 25 },
    solids: [
      [[20, 0], [23, 0], [23, 2.8], [20, 2.8]],
      [[46, 0], [49, 0], [49, 3], [46, 3]],
      [[55, 0], [62, 0], [62, 4.4]], // rampe d'accès
      [[62, 3.6], [74, 3.6], [74, 4.4], [62, 4.4]],
      [[82, 0], [92, 4.5], [92, 0]],
      [[104, 0], [107, 0], [107, 4.5], [104, 4.5]],
    ],
    checkpoints: [
      { x: 21.5, y: 5.4, r: 2.4 },
      { x: 47.5, y: 5.8, r: 2.6 },
      { x: 68, y: 7, r: 2.6 },
      { x: 97, y: 7.5, r: 2.8, respawn: { x: 66, y: 0.5 } },
      { x: 105.5, y: 7.8, r: 2.8 },
      { x: 127.5, y: 12, r: 2.6, finish: true },
    ],
  },
];

export function getCourseDef(id) {
  return COURSE_DEFS.find((c) => c.id === id) || COURSE_DEFS[0];
}

export function buildCourse(def) {
  const { L, H, R } = def;
  const outline = [];
  arc(outline, L - R, R, R, -Math.PI / 2, 0, 10);
  arc(outline, L - R, H - R, R, 0, Math.PI / 2, 10);
  arc(outline, R, H - R, R, Math.PI / 2, Math.PI, 10);
  arc(outline, R, R, R, Math.PI, Math.PI * 1.5, 10);
  const segments = [];
  const kind = (ax, ay, bx, by, nx, ny) => (ny > 0.7 ? 'floor' : ny < -0.7 ? 'ceiling' : 'wall');
  pushPolygon(segments, outline, true, kind);
  const solids = def.solids.map((p) => p.map(([x, y]) => [x, y]));
  for (const poly of solids) pushPolygon(segments, poly, true, () => 'solid');
  return finalize({
    type: 'course', def, W: L / 2, H, G: 0, D: 0, R, gravity: def.gravity,
    outline, segments, solids, goals: [], pads: [], posts: [],
  });
}
