// Caméra 2D : cadre balle + joueur, anticipation douce, zoom progressif, limites de l'arène.
import { clamp, damp } from '../core/math.js';

export class Camera {
  constructor() {
    this.x = 0; this.y = 8; this.viewH = 20;
    this.shakeAmp = 0; this.shakeT = 0;
    this.sx = 0; this.sy = 0;
    this.lookahead = 0;
  }

  shake(amount) { this.shakeAmp = Math.min(1.2, Math.max(this.shakeAmp, amount)); }

  target(session, aspect) {
    const arena = session.arena;
    const ball = session.ball;
    const player = session.player;
    const px = player.x, py = player.y;
    if (arena.type === 'course') {
      const viewH = Math.max(15, 22 / Math.max(aspect, 0.4));
      const viewW = viewH * aspect;
      const look = clamp(player.vx * 0.3, -6, 6);
      let x = px + look;
      x = clamp(x, viewW / 2 - 1, Math.max(viewW / 2 - 1, arena.def.L - viewW / 2 + 1));
      const y = clamp(py + 2, viewH / 2 - 1.5, Math.max(viewH / 2 - 1.5, arena.H - viewH / 2 + 1));
      return { x, y, viewH, look };
    }
    const H = arena.H;
    const totalW = 2 * (arena.W + arena.D) + 2;
    // marge sous le sol (~16 % de l'écran) pour que les voitures restent au-dessus des pouces
    const top = H + 1.3;
    const baseH = top / 0.84;
    let viewH = Math.max(baseH, 24 / Math.max(aspect, 0.3));
    const ballVisible = !ball.hidden;
    const look = ballVisible ? clamp(ball.vx * 0.16, -5, 5) : 0;
    let fx;
    if (session.state === 'goal' && session.goalFocus && session.stateTime < 1.4) fx = session.goalFocus.x;
    else if (ballVisible) fx = ball.x * 0.62 + px * 0.38 + look;
    else fx = px;
    // garder balle et joueur dans le cadre en dézoomant si besoin
    if (ballVisible) {
      const spread = Math.abs(ball.x - px) + 9;
      viewH = Math.max(viewH, Math.min(spread / aspect, totalW / aspect));
    }
    viewH = Math.min(viewH, Math.max(baseH, totalW / aspect, 24 / Math.max(aspect, 0.3)));
    const viewW = viewH * aspect;
    const halfSpan = totalW / 2;
    const x = viewW >= totalW ? 0 : clamp(fx, -halfSpan + viewW / 2, halfSpan - viewW / 2);
    let y;
    // paysage : sol à ~16 % du bas ; portrait (vue très haute) : arène centrée dans la moitié haute
    if (viewH >= baseH - 0.01) y = Math.max(top - viewH / 2, top / 2 - 0.17 * viewH);
    else y = clamp((ballVisible ? ball.y : py) * 0.7 + py * 0.3, viewH / 2 - 3, top - viewH / 2);
    return { x, y, viewH, look };
  }

  snap(session, aspect) {
    const t = this.target(session, aspect);
    this.x = t.x; this.y = t.y; this.viewH = t.viewH;
  }

  update(dt, session, aspect, shakeEnabled = true) {
    const t = this.target(session, aspect);
    this.x = damp(this.x, t.x, 4.5, dt);
    this.y = damp(this.y, t.y, 4, dt);
    this.viewH = damp(this.viewH, t.viewH, 2.2, dt);
    if (this.shakeAmp > 0.001 && shakeEnabled) {
      this.shakeT += dt * 60;
      this.sx = Math.sin(this.shakeT * 1.7) * this.shakeAmp;
      this.sy = Math.cos(this.shakeT * 2.3) * this.shakeAmp;
      this.shakeAmp = damp(this.shakeAmp, 0, 7, dt);
    } else { this.sx = this.sy = 0; this.shakeAmp = 0; }
  }
}
