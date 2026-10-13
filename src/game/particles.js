// Système de particules léger (pool) : traînées de boost, impacts, poussière, explosions de but.
import { TEAM_COLORS } from '../core/constants.js';

const RAINBOW = ['#ff4d4d', '#ffa53b', '#ffe94d', '#4dff88', '#4dc3ff', '#9b6bff'];

export class Particles {
  constructor(max = 900) {
    this.max = max;
    this.list = [];
    this.rngState = 1;
  }

  rand() { this.rngState = (this.rngState * 16807) % 2147483647; return (this.rngState - 1) / 2147483646; }

  setBudget(max) { this.max = max; if (this.list.length > max) this.list.length = max; }

  add(p) {
    if (this.list.length >= this.max) this.list.shift();
    p.age = 0;
    p.drag ??= 1.5; p.grav ??= 0; p.rot ??= 0; p.vr ??= 0; p.shape ??= 'circle'; p.alpha ??= 1; p.grow ??= 0;
    this.list.push(p);
  }

  clear() { this.list.length = 0; }

  update(dt) {
    const L = this.list;
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k; p.vy *= k;
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.size += p.grow * dt;
      L[w++] = p;
    }
    L.length = w;
  }

  draw(ctx) {
    for (const p of this.list) {
      const t = p.age / p.life;
      const a = p.alpha * (p.fadeIn ? Math.min(1, t * 6) : 1) * (1 - t);
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      if (p.shape === 'ring') {
        ctx.strokeStyle = p.color; ctx.lineWidth = p.width || 0.25;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.01, p.size), 0, Math.PI * 2); ctx.stroke();
      } else if (p.shape === 'square') {
        ctx.fillStyle = p.color;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      } else if (p.shape === 'confetti') {
        ctx.fillStyle = p.color;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.size, -p.size * 0.35, p.size * 2, p.size * 0.7);
        ctx.restore();
      } else if (p.shape === 'bubble') {
        ctx.strokeStyle = p.color; ctx.lineWidth = 0.05;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.stroke();
      } else if (p.shape === 'line') {
        ctx.strokeStyle = p.color; ctx.lineWidth = p.size;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.01, p.size), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---- émetteurs -------------------------------------------------------

  boost(x, y, dirX, dirY, style, team, speed = 1) {
    const r = () => this.rand();
    const back = -6 - r() * 4;
    const spread = () => (r() - 0.5) * 2.4;
    const base = { x, y, vx: dirX * back + spread(), vy: dirY * back + spread(), drag: 3 };
    const tc = TEAM_COLORS[team] || TEAM_COLORS[0];
    switch (style) {
      case 't_plasma':
        this.add({ ...base, life: 0.45, size: 0.32, grow: -0.5, color: r() < 0.5 ? tc.light : '#ffffff' });
        break;
      case 't_etincelles':
        this.add({ ...base, vx: base.vx * 1.4, vy: base.vy * 1.4, life: 0.4, size: 0.06, shape: 'line', color: r() < 0.5 ? '#fff3a0' : '#ffb03a' });
        break;
      case 't_bulles':
        this.add({ ...base, vy: base.vy + 2, life: 0.8, size: 0.12 + r() * 0.18, grow: 0.15, shape: 'bubble', color: '#bfefff', drag: 2.5 });
        break;
      case 't_pixels':
        this.add({ ...base, life: 0.55, size: 0.24, shape: 'square', color: r() < 0.5 ? tc.main : tc.light, vr: 0 });
        break;
      case 't_arcenciel':
        this.add({ ...base, life: 0.6, size: 0.3, grow: -0.3, color: RAINBOW[(Math.floor(performance.now() / 60)) % RAINBOW.length] });
        break;
      default: // flamme
        this.add({ ...base, life: 0.35 + r() * 0.15, size: 0.3, grow: -0.55, color: r() < 0.35 ? '#fff0a6' : r() < 0.7 ? '#ff9a2e' : '#ff4b2b' });
        if (r() < 0.25 * speed) this.add({ ...base, life: 0.7, size: 0.22, grow: 0.5, color: 'rgba(90,90,100,0.6)', alpha: 0.5 });
    }
  }

  sparks(x, y, n, color = '#ffe9a8', power = 10) {
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2, s = power * (0.3 + this.rand());
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.25 + this.rand() * 0.25, size: 0.07, shape: 'line', color, drag: 4, grav: 8 });
    }
  }

  dust(x, y, n = 6) {
    for (let i = 0; i < n; i++) {
      const s = (this.rand() - 0.5) * 6;
      this.add({ x: x + s * 0.1, y, vx: s, vy: this.rand() * 1.5, life: 0.5 + this.rand() * 0.3, size: 0.25, grow: 0.6, color: 'rgba(220,220,230,0.5)', alpha: 0.6, drag: 3 });
    }
  }

  ring(x, y, color, size = 0.5, grow = 14, life = 0.45, width = 0.25) {
    this.add({ x, y, vx: 0, vy: 0, life, size, grow, shape: 'ring', color, width, drag: 0 });
  }

  goal(x, y, style, team) {
    const tc = TEAM_COLORS[team] || TEAM_COLORS[0];
    const r = () => this.rand();
    switch (style) {
      case 'e_confettis':
        for (let i = 0; i < 90; i++) {
          const a = r() * Math.PI * 2, s = 6 + r() * 18;
          this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + 6, life: 2 + r(), size: 0.18, shape: 'confetti', color: RAINBOW[i % 6], grav: 9, drag: 1.6, vr: (r() - 0.5) * 12 });
        }
        this.ring(x, y, '#ffffff', 0.5, 18, 0.5);
        break;
      case 'e_feu':
        for (let k = 0; k < 4; k++) {
          const cx = x + (r() - 0.5) * 8, cy = y + 3 + r() * 6;
          const col = RAINBOW[Math.floor(r() * 6)];
          for (let i = 0; i < 26; i++) {
            const a = (i / 26) * Math.PI * 2, s = 7 + r() * 3;
            this.add({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1.1, size: 0.12, color: col, grav: 4, drag: 2, fadeIn: true });
          }
        }
        this.ring(x, y, tc.light, 0.5, 16, 0.5);
        break;
      case 'e_pixels':
        for (let i = 0; i < 80; i++) {
          this.add({ x: x + (r() - 0.5) * 6, y: y + r() * 6, vx: (r() - 0.5) * 6, vy: 4 + r() * 8, life: 1.6, size: 0.35, shape: 'square', color: r() < 0.5 ? tc.main : tc.light, grav: 14, drag: 0.5 });
        }
        break;
      case 'e_vortex':
        for (let i = 0; i < 70; i++) {
          const a = (i / 70) * Math.PI * 6, rad = 0.5 + i * 0.08;
          this.add({ x: x + Math.cos(a) * rad, y: y + Math.sin(a) * rad, vx: -Math.sin(a) * 9, vy: Math.cos(a) * 9, life: 1.3, size: 0.2, grow: -0.1, color: i % 2 ? tc.main : '#ffffff', drag: 1 });
        }
        this.ring(x, y, tc.main, 6, -4, 0.9, 0.35);
        break;
      default: // onde de choc
        this.ring(x, y, '#ffffff', 0.5, 22, 0.55, 0.4);
        this.ring(x, y, tc.main, 0.3, 14, 0.8, 0.6);
        for (let i = 0; i < 40; i++) {
          const a = r() * Math.PI * 2, s = 8 + r() * 16;
          this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.8 + r() * 0.4, size: 0.2, grow: -0.15, color: r() < 0.5 ? tc.main : tc.light, drag: 2.2 });
        }
    }
  }
}
