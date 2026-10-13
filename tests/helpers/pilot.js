// Pilote scripté simple pour vérifier qu'un parcours est réalisable.
export function makePilot(s, lead = 0.45, base = 2) {
  const car = s.player;
  const def = s.courseDef;
  car.controls.airMode = 'aim';
  const walls = def.solids.filter((p) => p.length === 4 && p.every(([x, y]) => p.some(([x2, y2]) => x2 === x && y2 !== y)))
    .map((p) => ({ x0: Math.min(...p.map((q) => q[0])), x1: Math.max(...p.map((q) => q[0])), top: Math.max(...p.map((q) => q[1])), bottom: Math.min(...p.map((q) => q[1])) }))
    .filter((o) => o.bottom < 0.5);
  let t = 0, jumpT = -9, retreatTo = null;
  return (dt) => {
    t += dt;
    const cp = s.checkpoints[Math.min(s.next, s.checkpoints.length - 1)];
    const finishWall = cp.x > def.L - 5;
    const dx = cp.x - car.x, dy = cp.y - car.y;
    const dir = finishWall ? 1 : Math.sign(dx) || 1;
    const inp = { mx: dir, my: 0, boost: car.boost > 15 && (Math.abs(dx) > 8 || finishWall), jump: false };
    const wall = walls.filter((o) => (dir > 0 ? o.x0 > car.x - 0.5 : o.x1 < car.x + 0.5)).sort((a, b) => Math.abs(a.x0 - car.x) - Math.abs(b.x0 - car.x))[0];
    const wallDist = wall ? (dir > 0 ? wall.x0 - car.x : car.x - wall.x1) : Infinity;
    if (retreatTo !== null) {
      inp.mx = -dir; inp.boost = false;
      if (t > retreatTo && car.grounded) retreatTo = null;
      return inp;
    }
    if (car.grounded && car.groundN.y > 0.7) {
      const speed = Math.abs(car.vx);
      const needJumpWall = wall && wallDist < base + speed * lead;
      const needJumpCp = !finishWall && dy > 2.5 && Math.abs(dx) < base + speed * lead;
      if ((needJumpWall || needJumpCp) && t - jumpT > 0.6) {
        if (needJumpWall && speed < 9) retreatTo = t + 0.9; // élan insuffisant : on recule
        else jumpT = t;
      }
    }
    const since = t - jumpT;
    if (since >= 0 && since < 0.2) inp.jump = true;
    else if (since > 0.26 && since < 0.32) inp.jump = true;
    if (!car.grounded && since > 0.34) {
      const f = car.facing;
      let a = dy > 0.3 && car.boost > 0 ? Math.atan2(dy, Math.abs(dx)) : 0;
      a = Math.max(-0.4, Math.min(1.3, a));
      inp.mx = Math.cos(a) * f; inp.my = Math.sin(a);
      inp.boost = dy > 0.3 && car.boost > 0;
    }
    return inp;
  };
}
