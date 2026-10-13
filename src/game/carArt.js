// Dessin vectoriel des voitures (carrosseries, roues, autocollants), partagé par le jeu et le garage.
// Repère local : x vers l'avant, y vers le haut, unités du monde. Le centre (0,0) est le centre de la capsule.
import { TEAM_COLORS } from '../core/constants.js';

export const BODY_SHAPES = {
  rapace: { body: [[-1.2, -0.2], [1.25, -0.2], [1.22, 0.05], [0.45, 0.24], [-0.15, 0.52], [-0.95, 0.48], [-1.2, 0.25]], win: [[0.3, 0.26], [-0.12, 0.47], [-0.62, 0.45], [-0.55, 0.26]] },
  bloc: { body: [[-1.2, -0.22], [1.2, -0.22], [1.22, 0.2], [0.6, 0.26], [0.38, 0.6], [-1.05, 0.6], [-1.2, 0.32]], win: [[0.45, 0.28], [0.3, 0.53], [-0.3, 0.53], [-0.3, 0.28]] },
  fuseau: { body: [[-1.25, -0.18], [1.32, -0.18], [1.26, 0.0], [0.3, 0.18], [-0.3, 0.4], [-1.1, 0.32], [-1.25, 0.12]], win: [[0.15, 0.2], [-0.3, 0.35], [-0.75, 0.32], [-0.6, 0.2]] },
  bulle: { body: [[-1.1, -0.22], [1.1, -0.22], [1.2, 0.05], [0.95, 0.36], [0.35, 0.62], [-0.45, 0.62], [-1.0, 0.36], [-1.15, 0.1]], win: [[0.75, 0.36], [0.3, 0.55], [-0.3, 0.55], [-0.6, 0.36]] },
  comete: { body: [[-1.2, -0.2], [1.3, -0.2], [1.12, 0.08], [0.5, 0.18], [0.0, 0.45], [-0.8, 0.45], [-1.05, 0.38], [-1.28, 0.62], [-1.32, 0.5], [-1.18, 0.15]], win: [[0.35, 0.2], [-0.02, 0.4], [-0.5, 0.4], [-0.45, 0.2]] },
  scarabee: { body: [[-1.15, -0.22], [1.15, -0.22], [1.22, 0.14], [0.75, 0.44], [-0.6, 0.52], [-1.12, 0.32]], win: [[0.6, 0.4], [0.2, 0.47], [-0.25, 0.47], [-0.25, 0.32], [0.55, 0.32]] },
  mantis: { body: [[-1.25, -0.18], [1.38, -0.14], [0.92, 0.06], [0.22, 0.2], [-0.2, 0.42], [-0.9, 0.4], [-1.3, 0.58], [-1.36, 0.46], [-1.2, 0.1]], win: [[0.1, 0.22], [-0.2, 0.37], [-0.6, 0.36], [-0.5, 0.22]] },
};

export const WHEEL_X = 0.74;
export const WHEEL_Y = -0.2;
export const WHEEL_R = 0.27;

function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
export { shade };

function drawWheel(ctx, x, y, style, spin, team) {
  const r = WHEEL_R;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#15171c';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(-spin);
  const tc = TEAM_COLORS[team] || TEAM_COLORS[0];
  const rim = r * 0.62;
  ctx.lineWidth = 0.05;
  switch (style) {
    case 'w_etoile':
      ctx.fillStyle = '#d7dde8';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2, rr = i % 2 ? rim * 0.45 : rim;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill();
      break;
    case 'w_turbine':
      ctx.fillStyle = '#9aa6b8';
      ctx.beginPath(); ctx.arc(0, 0, rim, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2b313c';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(Math.cos(a + 0.6) * rim * 0.7, Math.sin(a + 0.6) * rim * 0.7, Math.cos(a) * rim, Math.sin(a) * rim);
        ctx.stroke();
      }
      break;
    case 'w_disque':
      ctx.fillStyle = '#e8ecf2';
      ctx.beginPath(); ctx.arc(0, 0, rim, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = tc.main;
      ctx.beginPath(); ctx.arc(0, 0, rim * 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#15171c';
      ctx.fillRect(rim * 0.45, -0.025, rim * 0.4, 0.05);
      break;
    case 'w_neon':
      ctx.strokeStyle = tc.light; ctx.lineWidth = 0.07;
      ctx.beginPath(); ctx.arc(0, 0, rim * 0.85, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-rim * 0.8, 0); ctx.lineTo(rim * 0.8, 0); ctx.stroke();
      break;
    default:
      ctx.fillStyle = '#aab3c2';
      ctx.beginPath(); ctx.arc(0, 0, rim, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#3a404b';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * rim, Math.sin(a) * rim); ctx.stroke();
      }
  }
  ctx.restore();
}

function drawDecal(ctx, decal, team, paint) {
  const tc = TEAM_COLORS[team] || TEAM_COLORS[0];
  ctx.fillStyle = tc.main;
  ctx.strokeStyle = tc.main;
  switch (decal) {
    case 'd_bandes':
      ctx.fillRect(-1.4, -0.02, 2.8, 0.09);
      ctx.fillRect(-1.4, 0.11, 2.8, 0.04);
      break;
    case 'd_eclair':
      ctx.beginPath();
      ctx.moveTo(-0.9, 0.2); ctx.lineTo(-0.2, 0.0); ctx.lineTo(-0.3, 0.12); ctx.lineTo(0.7, -0.1);
      ctx.lineTo(0.0, 0.12); ctx.lineTo(0.1, 0.0); ctx.closePath(); ctx.fill();
      break;
    case 'd_damier':
      for (let i = -6; i < 6; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2 === 0) ctx.fillRect(i * 0.18, -0.15 + j * 0.15, 0.18, 0.15);
      break;
    case 'd_pois':
      for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.arc(i * 0.34, (i % 2) * 0.16 - 0.04, 0.075, 0, Math.PI * 2); ctx.fill(); }
      break;
    case 'd_vague':
      ctx.lineWidth = 0.09;
      ctx.beginPath();
      for (let x = -1.3; x <= 1.3; x += 0.05) ctx.lineTo(x, Math.sin(x * 5) * 0.08 + 0.02);
      ctx.stroke();
      break;
    case 'd_numero':
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath(); ctx.arc(-0.35, 0.1, 0.19, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = shade(paint, -0.6); ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.moveTo(-0.45, 0.2); ctx.lineTo(-0.25, 0.2); ctx.lineTo(-0.38, -0.02); ctx.stroke();
      break;
    default: break;
  }
}

/**
 * Dessine une voiture dans le repère courant (déjà positionné/orienté).
 * opts: { cos (cosmétiques résolus), team, wheelSpin, suspension, boosting, quality, flash }
 */
export function drawCarLocal(ctx, opts) {
  const cos = opts.cos;
  const shape = BODY_SHAPES[cos.body] || BODY_SHAPES.rapace;
  const team = opts.team ?? 0;
  const tc = TEAM_COLORS[team] || TEAM_COLORS[0];
  const paint = cos.paint || '#e9eef5';
  const susp = opts.suspension ?? 0;

  // Lueur d'équipe sous la voiture
  if (opts.quality !== 'basse') {
    ctx.fillStyle = tc.main + '55';
    ctx.beginPath(); ctx.ellipse(0, -0.42, 1.15, 0.12, 0, 0, Math.PI * 2); ctx.fill();
  }

  const spin = opts.wheelSpin || 0;
  const wy = WHEEL_Y - susp * 0.5;
  drawWheel(ctx, -WHEEL_X, wy, cos.wheels, spin, team);
  drawWheel(ctx, WHEEL_X, wy, cos.wheels, spin, team);

  // Carrosserie
  const grad = ctx.createLinearGradient(0, 0.6, 0, -0.25);
  if (cos.metallic) {
    grad.addColorStop(0, shade(paint, 0.55)); grad.addColorStop(0.45, paint); grad.addColorStop(0.55, shade(paint, -0.35)); grad.addColorStop(1, shade(paint, 0.1));
  } else {
    grad.addColorStop(0, shade(paint, 0.25)); grad.addColorStop(1, shade(paint, -0.3));
  }
  poly(ctx, shape.body);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.save();
  poly(ctx, shape.body);
  ctx.clip();
  drawDecal(ctx, cos.decal, team, paint);
  // bas de caisse aux couleurs de l'équipe
  ctx.fillStyle = tc.dark;
  ctx.fillRect(-1.5, -0.3, 3, 0.12);
  ctx.restore();

  // Vitres
  poly(ctx, shape.win);
  ctx.fillStyle = 'rgba(25,35,55,0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(180,220,255,0.35)'; ctx.lineWidth = 0.03;
  ctx.beginPath(); ctx.moveTo(shape.win[0][0] - 0.05, shape.win[0][1] + 0.04); ctx.lineTo(shape.win[1][0] - 0.05, shape.win[1][1] - 0.02); ctx.stroke();

  // Contour d'équipe (lisibilité)
  poly(ctx, shape.body);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 0.06;
  ctx.strokeStyle = tc.main;
  ctx.stroke();

  // Phares / feux
  ctx.fillStyle = '#fff6c8';
  ctx.fillRect(1.05, -0.08, 0.14, 0.08);
  ctx.fillStyle = '#ff4057';
  ctx.fillRect(-1.24, 0.0, 0.08, 0.1);

  if (opts.flash) {
    poly(ctx, shape.body);
    ctx.fillStyle = `rgba(255,255,255,${opts.flash})`;
    ctx.fill();
  }
}
