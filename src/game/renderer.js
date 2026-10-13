// Rendu Canvas 2D : décor parallaxe, arène, cages et filets, voitures, balle, effets, repères à l'écran.
import { TEAM_COLORS, PHYS } from '../core/constants.js';
import { wrapAngle, makeRng } from '../core/math.js';
import { getTheme } from './themes.js';
import { drawCarLocal } from './carArt.js';
import { resolveLoadout } from '../meta/cosmetics.js';

const DEFAULT_COS = resolveLoadout();

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.quality = 'haute';
    this.dpr = 1;
    this.netRipple = { '-1': { t: 99, amp: 0 }, '1': { t: 99, amp: 0 } };
    this.decoCache = new Map();
    this.time = 0;
    this.resize();
  }

  setQuality(q) { this.quality = q; this.resize(); }

  resize() {
    const maxDpr = this.quality === 'basse' ? 1 : 2;
    this.dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * this.dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }

  get aspect() { return this.canvas.width / Math.max(1, this.canvas.height); }

  rippleNet(side, power) { this.netRipple[String(side)] = { t: 0, amp: Math.min(1.2, 0.3 + power / 30) }; }

  deco(themeId) {
    if (this.decoCache.has(themeId)) return this.decoCache.get(themeId);
    const rng = makeRng(themeId.length * 977 + 13);
    const d = { stars: [], crowd: [], blocks: [], towers: [] };
    for (let i = 0; i < 140; i++) d.stars.push([rng(), rng() * 0.75, rng() * 1.5 + 0.3, rng()]);
    for (let i = 0; i < 260; i++) d.crowd.push([rng(), rng(), rng()]);
    for (let i = 0; i < 24; i++) d.blocks.push([rng(), 0.15 + rng() * 0.45, 0.02 + rng() * 0.05]);
    this.decoCache.set(themeId, d);
    return d;
  }

  /**
   * Rendu principal.
   * opts: { playerId, showTags, highlight, extra: { checkpoints, next, target } }
   */
  render(session, alpha, cam, particles, opts = {}) {
    this.resize();
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const arena = session.arena;
    const theme = getTheme(session.arenaDef.theme);
    const scale = H / cam.viewH;
    const cx = cam.x + cam.sx * 0.3, cy = cam.y + cam.sy * 0.3;
    const low = this.quality === 'basse';
    this.time += 1 / 60;

    // --- Fond (espace écran)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, theme.skyTop); sky.addColorStop(1, theme.skyBottom);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    this.drawDeco(ctx, theme, session.arenaDef.theme, W, H, cx * scale);

    // --- Monde
    const ox = W / 2 - cx * scale, oy = H / 2 + cy * scale;
    ctx.setTransform(scale, 0, 0, -scale, ox, oy);
    const lw = 1 / scale; // une unité pixel en monde

    this.drawArena(ctx, arena, theme, lw, session, low);
    if (opts.extra?.checkpoints) this.drawCheckpoints(ctx, opts.extra.checkpoints, opts.extra.next, theme);
    if (opts.extra?.target) this.drawTarget(ctx, opts.extra.target);
    this.drawPads(ctx, session.world.pads, theme, low);

    const ball = session.ball;
    const bx = ball.px + (ball.x - ball.px) * alpha, by = ball.py + (ball.y - ball.py) * alpha;
    if (!ball.hidden && arena.type !== 'course') this.drawBallShadow(ctx, bx, by, ball.r, arena);

    if (particles) particles.draw(ctx);
    for (const car of session.cars) this.drawCar(ctx, car, alpha, low);
    if (!ball.hidden && arena.type !== 'course') this.drawBall(ctx, ball, bx, by, alpha, low);

    // --- Superpositions écran
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const toScreen = (x, y) => [ox + x * scale, oy - y * scale];
    this.drawTags(ctx, session, alpha, toScreen, opts.playerId ?? 0, scale);
    if (!ball.hidden && arena.type !== 'course') this.drawOffscreenBall(ctx, toScreen(bx, by), W, H);
  }

  drawDeco(ctx, theme, id, W, H, camPx) {
    const d = this.deco(id);
    const par = (f, wrap = W * 1.6) => (((-camPx * f) % wrap) + wrap) % wrap;
    switch (theme.deco) {
      case 'space':
      case 'moon': {
        ctx.fillStyle = '#ffffff';
        for (const [x, y, s, tw] of d.stars) {
          const px = (x * W * 1.6 + par(0.05)) % (W * 1.6) - W * 0.3;
          ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(this.time * 0.8 + tw * 6));
          ctx.fillRect(px, y * H, s * this.dpr, s * this.dpr);
        }
        ctx.globalAlpha = 1;
        const px = W * 0.78 - camPx * 0.03, py = H * 0.22, r = H * 0.11;
        const g = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, r * 0.1, px, py, r);
        if (theme.deco === 'moon') { g.addColorStop(0, '#7fb6ff'); g.addColorStop(1, '#1d3d7a'); }
        else { g.addColorStop(0, '#d38cff'); g.addColorStop(1, '#3d1a6b'); }
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
        if (theme.deco === 'space') {
          ctx.strokeStyle = 'rgba(230,200,255,0.5)'; ctx.lineWidth = r * 0.08;
          ctx.beginPath(); ctx.ellipse(px, py, r * 1.7, r * 0.35, -0.3, 0, Math.PI * 2); ctx.stroke();
        }
        break;
      }
      case 'grid': {
        const hy = H * 0.55;
        const sun = ctx.createLinearGradient(0, hy - H * 0.3, 0, hy);
        sun.addColorStop(0, '#ffd23f'); sun.addColorStop(1, '#ff2fa0');
        ctx.fillStyle = sun;
        ctx.beginPath(); ctx.arc(W / 2 - camPx * 0.04, hy, H * 0.25, Math.PI, 0); ctx.fill();
        ctx.fillStyle = theme.skyBottom;
        for (let i = 0; i < 6; i++) ctx.fillRect(0, hy - H * 0.04 * (i + 1) + i * 2, W, H * 0.008 * (i + 1));
        ctx.strokeStyle = 'rgba(255,63,216,0.45)'; ctx.lineWidth = 1.5 * this.dpr;
        for (let i = -12; i <= 12; i++) {
          ctx.beginPath(); ctx.moveTo(W / 2 + i * W * 0.04 - camPx * 0.1, hy); ctx.lineTo(W / 2 + i * W * 0.3 - camPx * 0.4, H); ctx.stroke();
        }
        for (let j = 1; j < 8; j++) { const y = hy + (H - hy) * Math.pow(j / 8, 1.8); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
        break;
      }
      case 'factory': {
        ctx.fillStyle = 'rgba(20,12,8,0.85)';
        for (const [x, h, w] of d.blocks) {
          const px = (x * W * 1.6 + par(0.15)) % (W * 1.6) - W * 0.3;
          ctx.fillRect(px, H * (1 - h), w * W, H * h);
          ctx.fillRect(px + w * W * 0.3, H * (1 - h) - H * 0.12, w * W * 0.25, H * 0.12);
        }
        ctx.fillStyle = 'rgba(255,150,60,0.25)';
        for (let i = 0; i < 18; i++) ctx.fillRect((i * 137 + par(0.15)) % W, H * 0.62 + (i % 3) * 14, 6 * this.dpr, 4 * this.dpr);
        break;
      }
      case 'lamps': {
        for (let i = 0; i < 8; i++) {
          const px = (i * W * 0.22 + par(0.12)) % (W * 1.6) - W * 0.3;
          ctx.strokeStyle = 'rgba(160,255,230,0.25)'; ctx.lineWidth = 2 * this.dpr;
          ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H * 0.12); ctx.stroke();
          ctx.fillStyle = 'rgba(160,255,230,0.5)';
          ctx.beginPath(); ctx.arc(px, H * 0.13, 10 * this.dpr, 0, Math.PI); ctx.fill();
        }
        break;
      }
      default: { // stade
        for (const [x, y, c] of d.crowd) {
          const px = (x * W * 1.6 + par(0.2)) % (W * 1.6) - W * 0.3;
          ctx.fillStyle = c < 0.33 ? 'rgba(43,181,255,0.35)' : c < 0.66 ? 'rgba(255,122,26,0.35)' : 'rgba(255,255,255,0.18)';
          ctx.fillRect(px, H * (0.5 + y * 0.35), 3 * this.dpr, 4 * this.dpr);
        }
        for (let i = 0; i < 4; i++) {
          const px = (i * W * 0.45 + par(0.1)) % (W * 1.6) - W * 0.3;
          ctx.fillStyle = 'rgba(15,18,40,0.8)'; ctx.fillRect(px, H * 0.1, 5 * this.dpr, H * 0.5);
          const g = ctx.createRadialGradient(px, H * 0.1, 0, px, H * 0.1, H * 0.12);
          g.addColorStop(0, 'rgba(255,240,200,0.7)'); g.addColorStop(1, 'rgba(255,240,200,0)');
          ctx.fillStyle = g; ctx.fillRect(px - H * 0.12, 0, H * 0.24, H * 0.24);
        }
      }
    }
  }

  outlinePath(ctx, outline) {
    ctx.moveTo(outline[0][0], outline[0][1]);
    for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i][0], outline[i][1]);
    ctx.closePath();
  }

  drawArena(ctx, arena, theme, lw, session, low) {
    const b = arena.bounds;
    // Intérieur
    const grad = ctx.createLinearGradient(0, b.maxY, 0, 0);
    grad.addColorStop(0, theme.interiorTop); grad.addColorStop(1, theme.interiorBottom);
    ctx.beginPath(); this.outlinePath(ctx, arena.outline);
    ctx.fillStyle = grad; ctx.fill();

    if (arena.type === 'soccer') this.drawFieldMarks(ctx, arena, theme, lw);

    // Structure extérieure (pleine) : grand rectangle moins l'intérieur
    ctx.beginPath();
    ctx.rect(b.minX - 400, b.minY - 400, b.maxX - b.minX + 800, b.maxY - b.minY + 800);
    this.outlinePath(ctx, arena.outline);
    ctx.fillStyle = theme.structure;
    ctx.fill('evenodd');

    // Solides (parcours)
    for (const poly of arena.solids) {
      ctx.beginPath(); this.outlinePath(ctx, poly);
      ctx.fillStyle = theme.structure; ctx.fill();
      ctx.strokeStyle = theme.accent; ctx.lineWidth = 0.12; ctx.stroke();
      if (theme.hazard) this.hazard(ctx, poly);
    }

    // Bord lumineux
    ctx.beginPath(); this.outlinePath(ctx, arena.outline);
    ctx.lineJoin = 'round';
    if (!low && theme.neonEdge) {
      ctx.strokeStyle = theme.structureEdge; ctx.globalAlpha = 0.35; ctx.lineWidth = 0.6; ctx.stroke(); ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = theme.structureEdge; ctx.lineWidth = 0.3; ctx.stroke();
    ctx.strokeStyle = theme.line; ctx.lineWidth = 0.08; ctx.stroke();

    if (arena.type === 'soccer') this.drawGoals(ctx, arena, theme, session, low);
  }

  hazard(ctx, poly) {
    ctx.save();
    ctx.beginPath(); this.outlinePath(ctx, poly); ctx.clip();
    ctx.fillStyle = 'rgba(255,190,40,0.18)';
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let x = minX - (maxY - minY); x < maxX; x += 1.2) {
      ctx.beginPath(); ctx.moveTo(x, minY); ctx.lineTo(x + 0.6, minY); ctx.lineTo(x + 0.6 + (maxY - minY), maxY); ctx.lineTo(x + (maxY - minY), maxY); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  drawFieldMarks(ctx, arena, theme, lw) {
    const { W, H, G } = arena;
    // halos d'équipe près des cages
    for (const side of [-1, 1]) {
      const tc = TEAM_COLORS[side < 0 ? 0 : 1];
      const g = ctx.createLinearGradient(side * W, 0, side * (W - 9), 0);
      g.addColorStop(0, tc.main + '33'); g.addColorStop(1, tc.main + '00');
      ctx.fillStyle = g;
      ctx.fillRect(Math.min(side * W, side * (W - 9)), 0, 9, H);
    }
    ctx.strokeStyle = theme.line; ctx.globalAlpha = 0.25; ctx.lineWidth = 0.08;
    ctx.setLineDash([0.6, 0.6]);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, H); ctx.stroke();
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * W, 0); ctx.lineTo(side * W, G); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, Math.PI); ctx.stroke();
    ctx.globalAlpha = 1;
    // sol coloré par moitié
    for (const side of [-1, 1]) {
      ctx.fillStyle = TEAM_COLORS[side < 0 ? 0 : 1].main;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(side < 0 ? -W : 0, -0.02, W, 0.1);
    }
    ctx.globalAlpha = 1;
  }

  drawGoals(ctx, arena, theme, session, low) {
    const dt = 1 / 60;
    for (const g of arena.goals) {
      const tc = TEAM_COLORS[g.team];
      const x0 = g.lineX, x1 = g.backX, top = g.top;
      const rp = this.netRipple[String(g.side)];
      rp.t += dt;
      const amp = rp.amp * Math.exp(-rp.t * 2.5);
      // fond de cage
      ctx.fillStyle = tc.main + '22';
      ctx.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), top);
      // filet (déformé par l'onde)
      ctx.strokeStyle = tc.light; ctx.globalAlpha = 0.45; ctx.lineWidth = 0.05;
      const step = 0.55;
      ctx.beginPath();
      for (let y = step; y < top; y += step) {
        for (let i = 0; i <= 8; i++) {
          const x = x0 + (x1 - x0) * (i / 8);
          const off = amp * Math.sin(i * 0.9 + rp.t * 16) * (i / 8) * Math.sign(x1 - x0);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x + off, y + amp * 0.2 * Math.sin(y + rp.t * 14));
        }
      }
      for (let i = 1; i <= 7; i++) {
        const x = x0 + (x1 - x0) * (i / 7);
        const off = amp * Math.sin(i * 0.9 + rp.t * 16) * (i / 7) * Math.sign(x1 - x0);
        ctx.moveTo(x + off, 0); ctx.lineTo(x + off, top);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      // barre transversale et poteau
      ctx.strokeStyle = tc.main; ctx.lineWidth = 0.32; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x1, top); ctx.lineTo(x0, top); ctx.lineTo(x0, top + 0.01); ctx.stroke();
      ctx.lineCap = 'butt';
      if (!low) {
        ctx.fillStyle = tc.light;
        ctx.beginPath(); ctx.arc(x0, top, 0.24, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  drawPads(ctx, pads, theme, low) {
    for (const p of pads) {
      const active = p.timer <= 0;
      ctx.fillStyle = active ? '#ffcf3a' : 'rgba(255,207,58,0.2)';
      ctx.beginPath(); ctx.ellipse(p.x, 0.06, 0.75, 0.12, 0, 0, Math.PI * 2); ctx.fill();
      if (active && !low) {
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 5 + p.x);
        ctx.fillStyle = `rgba(255,220,90,${0.15 + pulse * 0.2})`;
        ctx.beginPath(); ctx.moveTo(-0.6 + p.x, 0.1); ctx.lineTo(0.6 + p.x, 0.1); ctx.lineTo(0.3 + p.x, 1.1 + pulse * 0.3); ctx.lineTo(-0.3 + p.x, 1.1 + pulse * 0.3); ctx.closePath(); ctx.fill();
      } else if (!active) {
        ctx.strokeStyle = 'rgba(255,207,58,0.6)'; ctx.lineWidth = 0.08;
        ctx.beginPath(); ctx.arc(p.x, 0.45, 0.3, Math.PI / 2, Math.PI / 2 - (p.timer / p.respawn) * Math.PI * 2, true); ctx.stroke();
      }
    }
  }

  drawCheckpoints(ctx, cps, next, theme) {
    cps.forEach((cp, i) => {
      const done = i < next, current = i === next;
      ctx.lineWidth = current ? 0.28 : 0.15;
      ctx.strokeStyle = done ? 'rgba(120,255,160,0.35)' : current ? theme.accent : 'rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.arc(cp.x, cp.y, cp.r, 0, Math.PI * 2); ctx.stroke();
      if (current) {
        ctx.globalAlpha = 0.15 + 0.1 * Math.sin(this.time * 6);
        ctx.fillStyle = theme.accent; ctx.beginPath(); ctx.arc(cp.x, cp.y, cp.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (cp.finish) {
        const s = 0.45;
        for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
          ctx.fillStyle = (a + b) % 2 ? '#111' : '#fff';
          ctx.fillRect(cp.x - 2 * s + a * s, cp.y + cp.r + 0.3 + b * s, s, s);
        }
      }
    });
  }

  drawTarget(ctx, t) {
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 5);
    for (let i = 3; i >= 1; i--) {
      ctx.fillStyle = i % 2 ? `rgba(255,80,120,${0.25 + pulse * 0.2})` : 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.arc(t.x, t.y, (t.r * i) / 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawBallShadow(ctx, x, y, r, arena) {
    const h = Math.max(0, y - r);
    const a = Math.max(0, 0.45 - h * 0.03);
    if (a <= 0) return;
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.beginPath(); ctx.ellipse(x, 0.04, r * (1 + h * 0.05), 0.16, 0, 0, Math.PI * 2); ctx.fill();
  }

  drawBall(ctx, ball, x, y, alpha, low) {
    const a = ball.pa + wrapAngle(ball.a - ball.pa) * alpha;
    const r = ball.r;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (!low && speed > 18) {
      const k = Math.min(1, (speed - 18) / 25);
      ctx.fillStyle = `rgba(255,${200 - k * 120},${120 - k * 100},${0.25 * k})`;
      ctx.beginPath(); ctx.arc(x, y, r * (1.35 + k * 0.2), 0, Math.PI * 2); ctx.fill();
    }
    ctx.save();
    ctx.translate(x, y);
    const g = ctx.createRadialGradient(-r * 0.35, r * 0.4, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#b9c6d8');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(a);
    // motif original : trois arcs + noyau
    ctx.strokeStyle = '#3c4d6b'; ctx.lineWidth = 0.09;
    for (let i = 0; i < 3; i++) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.beginPath(); ctx.arc(r * 0.95, 0, r * 0.62, Math.PI * 0.62, Math.PI * 1.38); ctx.stroke();
    }
    ctx.fillStyle = '#ff5a7a';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(20,30,50,0.6)'; ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  }

  drawCar(ctx, car, alpha, low) {
    const x = car.px + (car.x - car.px) * alpha, y = car.py + (car.y - car.py) * alpha;
    const ang = car.pfacing === car.facing ? car.pang + wrapAngle(car.ang - car.pang) * alpha : car.ang;
    let sx = 1;
    if (car.turnAnim > 0) {
      const p = 1 - car.turnAnim / PHYS.car.turnAnimTime;
      sx = -Math.cos(p * Math.PI);
      if (Math.abs(sx) < 0.15) sx = 0.15 * Math.sign(sx || 1);
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.scale(sx, car.facing);
    drawCarLocal(ctx, {
      cos: car.cosmetics || DEFAULT_COS, team: car.team, wheelSpin: car.wheelSpin,
      suspension: car.grounded ? car.suspension : PHYS.car.suspension * 0.8, quality: this.quality,
      flash: car.hitFlash > 0 ? car.hitFlash : 0,
    });
    if (car.boosting) {
      const f = 0.5 + Math.random() * 0.4;
      ctx.fillStyle = '#fff3b0';
      ctx.beginPath(); ctx.moveTo(-1.22, 0.12); ctx.lineTo(-1.22 - f, 0.04); ctx.lineTo(-1.22, -0.06); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  drawTags(ctx, session, alpha, toScreen, playerId, scale) {
    const fs = Math.max(11, Math.min(15, scale * 0.42)) * (this.dpr > 1 ? this.dpr * 0.8 : 1);
    ctx.font = `700 ${fs}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    for (const car of session.cars) {
      const x = car.px + (car.x - car.px) * alpha, y = car.py + (car.y - car.py) * alpha;
      const [sx, sy] = toScreen(x, y + 1.5);
      const tc = TEAM_COLORS[car.team];
      if (car.id === playerId) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(sx - fs * 0.45, sy - fs * 0.6); ctx.lineTo(sx + fs * 0.45, sy - fs * 0.6); ctx.lineTo(sx, sy); ctx.closePath(); ctx.fill();
        continue;
      }
      if (session.cars.length <= 1) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      const w = ctx.measureText(car.name).width + fs * 0.8;
      ctx.fillRect(sx - w / 2, sy - fs * 1.2, w, fs * 1.35);
      ctx.fillStyle = tc.light;
      ctx.fillText(car.name, sx, sy - fs * 0.15);
    }
  }

  drawOffscreenBall(ctx, [sx, sy], W, H) {
    const m = 26 * this.dpr;
    if (sx >= -m * 0.2 && sx <= W + m * 0.2 && sy >= -m * 0.2 && sy <= H + m * 0.2) return;
    const cx = Math.min(W - m, Math.max(m, sx)), cy = Math.min(H - m, Math.max(m, sy));
    const a = Math.atan2(sy - cy, sx - cx);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.moveTo(m * 0.6, 0); ctx.lineTo(-m * 0.3, m * 0.4); ctx.lineTo(-m * 0.3, -m * 0.4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

/** Rendu d'une voiture seule (garage, aperçus). */
export function drawCarPreview(canvas, cos, team = 0, t = 0) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const s = Math.min(W / 3.4, H / 1.9);
  ctx.setTransform(s, 0, 0, -s, W / 2, H * 0.62);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(0, -0.5, 1.4, 0.08, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(0, Math.sin(t * 2) * 0.02);
  drawCarLocal(ctx, { cos, team, wheelSpin: t * 3, suspension: 0.1, quality: 'haute' });
}
