// IA des bots : perception retardée + estimation de trajectoire, rôles d'équipe, contrôleur bas niveau.
// Les bots ne lisent jamais l'avenir réel : ils voient la balle avec un temps de réaction,
// l'extrapolent avec la physique de la balle seule (sans connaître les commandes des autres)
// et ajoutent une erreur de visée dépendant de la difficulté.
import { PHYS } from './constants.js';
import { clamp, sgn, wrapAngle } from './math.js';
import { carAxes } from './car.js';

export const DIFFICULTIES = {
  easy: {
    id: 'easy', name: 'Débutant', reaction: 0.34, aimNoise: 1.8, horizon: 1.4, boostUse: 0.25,
    flipChance: 0.25, aerials: false, speedScale: 0.8, decision: 0.26, hopSkill: 0.4,
  },
  normal: {
    id: 'normal', name: 'Pro', reaction: 0.24, aimNoise: 1.1, horizon: 2.2, boostUse: 0.55,
    flipChance: 0.55, aerials: false, speedScale: 0.9, decision: 0.17, hopSkill: 0.7,
  },
  hard: {
    id: 'hard', name: 'Champion', reaction: 0.1, aimNoise: 0.35, horizon: 2.6, boostUse: 0.55,
    flipChance: 0.6, aerials: false, speedScale: 0.92, decision: 0.1, hopSkill: 0.95,
  },
};

const CP = PHYS.car;
const BALL_R = PHYS.ball.radius;

/** Temps estimé pour qu'une voiture atteigne l'abscisse x (au sol). */
export function estimateETA(car, x) {
  const dx = x - car.x;
  const dir = sgn(dx);
  const vAlong = car.vx * dir;
  let t = Math.abs(dx) / 19;
  if (vAlong < 0) t += -vAlong / CP.brakeAccel + 0.15;
  else t -= Math.min(0.3, vAlong / 60);
  if (car.facing !== dir && car.grounded) t += 0.25;
  if (!car.grounded) t += Math.max(0, car.y - 1) * 0.06;
  return Math.max(0, t);
}

export class BotBrain {
  constructor(car, difficultyId = 'normal', rng = Math.random) {
    this.car = car;
    this.d = DIFFICULTIES[difficultyId] || DIFFICULTIES.normal;
    this.rng = rng;
    this.role = 'attacker';
    this.decTimer = 0;
    this.noise = 0;
    this.targetX = car.x;
    this.mode = 'position'; // position | charge | hop
    this.charge = false;
    this.plan = null; // séquence de saut en cours
    this.aerialTarget = null;
    this.stuckTimer = 0;
    this.input = { mx: 0, my: 0, jump: false, boost: false };
  }

  /**
   * ctx = { arena, attackDir, perceived: samples estimés (t=0 ≈ maintenant), threat, kickoff,
   *         teammates, opponents, time }
   */
  update(ctx, dt) {
    const car = this.car;
    const inp = this.input;
    inp.jump = false; inp.boost = false; inp.mx = 0; inp.my = 0;
    if (car.frozen) { this.plan = null; return inp; }
    const P = ctx.perceived;
    if (!P || P.length === 0) return inp;

    this.decTimer -= dt;
    if (this.decTimer <= 0) {
      this.decTimer = this.d.decision * (0.8 + 0.4 * this.rng());
      this.noise = (this.rng() * 2 - 1) * this.d.aimNoise;
      this.decide(ctx);
    }

    if (this.plan) this.runPlan(ctx, dt, inp);
    else this.control(ctx, dt, inp);

    // Anti-blocage : immobile trop longtemps alors qu'on veut bouger
    const moving = Math.hypot(car.vx, car.vy) > 1.5;
    if (!moving && Math.abs(this.targetX - car.x) > 3 && !this.plan) this.stuckTimer += dt;
    else this.stuckTimer = 0;
    if (this.stuckTimer > 1.4) { this.stuckTimer = 0; this.startPlan('hop', ctx); }
    return inp;
  }

  decide(ctx) {
    const car = this.car, s = ctx.attackDir, arena = ctx.arena;
    const P = ctx.perceived;
    const ball = P[0];
    const W = arena.W;
    const ownGoalX = -s * W;
    this.aerialTarget = null;

    if (ctx.kickoff && this.role === 'attacker') {
      this.mode = 'charge'; this.targetX = ball.x - s * 0.6; this.charge = true; return;
    }

    const urgent = ctx.threat && ctx.threat.t < 2.2;
    if (this.role === 'attacker' || (urgent && this.role === 'defender')) {
      // Point d'interception : premier échantillon atteignable
      const reachY = this.d.aerials ? 9 : 3.3;
      let ip = P[P.length - 1];
      for (let i = 1; i < P.length; i++) {
        const p = P[i];
        if (p.y > reachY) continue;
        const eta = estimateETA(car, p.x - s * (BALL_R + 0.8)) / this.d.speedScale;
        if (eta <= p.t + 0.05) { ip = p; break; }
      }
      const wrongSide = (car.x - ball.x) * s > -0.4;
      // Défense en retrait : l'adversaire arrive clairement avant nous sur la balle
      const myEta = estimateETA(car, ball.x - s * 1.5);
      let oppEta = Infinity;
      for (const o of ctx.opponents) oppEta = Math.min(oppEta, estimateETA(o, ball.x + s * 1.5));
      const ballInOurHalf = (ball.x - ownGoalX) * s < W * 1.1;
      if (!wrongSide && !urgent && oppEta + 0.35 < myEta && ballInOurHalf && Math.abs(car.x - ball.x) > 5) {
        this.mode = 'position';
        this.charge = false;
        this.targetX = s > 0 ? Math.max(ownGoalX + 2.5, ball.x - 8) : Math.min(ownGoalX - 2.5, ball.x + 8);
        this.targetX += this.noise * 0.5;
        return;
      }
      if (wrongSide) {
        // Il faut repasser derrière la balle : en 2D on passe dessous si elle est haute,
        // sinon on saute par-dessus. Sans tentative, on freine pour ne pas marquer contre son camp.
        this.mode = 'hop';
        this.targetX = clamp(ball.x - s * 7, -W + 2, W - 2);
        this.charge = false;
        this.willHop = this.rng() < this.d.hopSkill;
      } else {
        this.mode = 'charge';
        this.targetX = ip.x - s * (BALL_R + 0.5) + this.noise * 0.6;
        this.charge = true;
        this.ip = ip;
        if (this.d.aerials && ip.y > 4.2 && ip.t < 1.6 && car.boost > 25 && car.grounded) {
          this.aerialTarget = ip;
        }
      }
    } else if (this.role === 'defender') {
      this.mode = 'position';
      const towardBall = clamp((ball.x - ownGoalX) * 0.25, 2.5, 9);
      this.targetX = ownGoalX + s * towardBall + this.noise;
      this.charge = false;
    } else {
      this.mode = 'position';
      this.targetX = clamp(ball.x - s * 11 + this.noise, -W + 3, W - 3);
      this.charge = false;
    }
    // Écart avec les coéquipiers pour ne pas se gêner
    if (this.role !== 'attacker') {
      for (const m of ctx.teammates) {
        if (m === car) continue;
        if (Math.abs(m.x - this.targetX) < 3.5) this.targetX -= s * 4;
      }
      this.targetX = clamp(this.targetX, -W - 1, W + 1);
    }
  }

  control(ctx, dt, inp) {
    const car = this.car, s = ctx.attackDir;
    const ball = ctx.perceived[0];
    const scale = this.d.speedScale;

    if (!car.grounded) { this.airControl(ctx, inp); return; }
    const n = car.groundN;
    if (n.y < 0.6) {
      // Sur un mur ou au plafond : redescendre
      if (n.y < -0.5) { inp.jump = true; return; }
      let tx = n.y, ty = -n.x;
      if (ty > 0) { tx = -tx; ty = -ty; }
      inp.mx = tx; inp.my = ty;
      return;
    }

    const dx = this.targetX - car.x;
    let desiredV;
    if (this.charge) desiredV = sgn(dx) * Math.min(CP.boostMaxSpeed, Math.abs(dx) * 4 + 6);
    else desiredV = clamp(dx * 2.2, -CP.maxSpeed, CP.maxSpeed);
    if (!this.charge && Math.abs(dx) < 0.6) desiredV = 0;
    const dv = desiredV - car.vx;
    inp.mx = clamp(dv * 0.5, -1, 1) * scale;
    // à l'arrêt, se tourner vers la balle (le demi-tour automatique s'en charge)
    if (!this.charge && Math.abs(dx) < 0.8 && Math.abs(car.vx) < 1 && car.facing !== sgn(ball.x - car.x)) {
      inp.mx = sgn(ball.x - car.x) * 0.6;
    }

    const facingOk = car.facing === sgn(dx);
    if (this.charge && facingOk && Math.abs(dx) > 4 && car.boost > 10 && car.vx * sgn(dx) < CP.boostMaxSpeed - 1) {
      if (this.rng() < this.d.boostUse) inp.boost = true;
    }

    const bdx = ball.x - car.x, bdy = ball.y - car.y;
    const dist = Math.hypot(bdx, bdy);
    if (this.aerialTarget && Math.abs(this.aerialTarget.x - car.x) < this.aerialTarget.y * 1.2 + 2) {
      this.startPlan('aerial', ctx); return;
    }
    if (this.mode === 'hop') {
      const hdx = ball.x - car.x;
      const dir = sgn(hdx);
      const gap = Math.abs(hdx);
      const closing = (car.vx - ball.vx) * dir;
      const urgent = !!ctx.threat;
      const tReach = (gap - 2.6) / Math.max(0.1, closing);
      // hauteur estimée de la balle au moment où l'on passe à son niveau
      let yAt = ball.y;
      if (closing > 0.5) {
        const ti = clamp(tReach + 0.15, 0, 2.5);
        for (const p of ctx.perceived) if (p.t >= ti) { yAt = p.y; break; }
      }
      if (ball.y > 4.6 && yAt > 4.2) return; // la balle est haute : on passe dessous
      const hopOk = yAt < 2.1;
      if ((this.willHop || urgent) && hopOk) {
        const want = urgent ? dir * CP.boostMaxSpeed : ball.vx + dir * 9;
        inp.mx = clamp((want - car.vx) * 0.5, -1, 1);
        inp.boost = urgent && car.boost > 5 && tReach > 0.7 && car.facing === dir;
        if (closing > 2 && tReach < 0.38) this.startPlan('hop', ctx);
        else if (gap < 2.4 && closing <= 2) inp.mx = -dir; // trop lent : on recule
      } else if (urgent) {
        // on colle la balle en attendant une occasion de sauter par-dessus
        const want = ball.vx + dir * clamp(gap - 5, -4, 6);
        inp.mx = clamp((want - car.vx) * 0.5, -1, 1);
      } else if (gap < 6.5) {
        // on garde ses distances en attendant que la balle bouge
        const want = -dir * clamp(6 - gap, 0, 4);
        inp.mx = clamp((want - car.vx) * 0.5, -1, 1);
      }
      return;
    }
    if (this.mode === 'charge' && dist < 4.5 && bdx * s > -0.5) {
      if (bdy > 1.2 && bdy < 4.5 && Math.abs(bdx) < 2.6) this.startPlan('shoot', ctx);
      else if (dist < 3.4 && bdy < 1.2 && this.rng() < this.d.flipChance * 0.25 && Math.abs(car.vx) > 6)
        this.startPlan('flip', ctx);
    }
  }

  airControl(ctx, inp) {
    const car = this.car;
    const { ux, uy } = carAxes(car);
    // Atterrir roues vers le bas
    const err = Math.atan2(ux * 1 - uy * 0, ux * 0 + uy * 1); // angle de up vers (0,1)
    const wTarget = clamp(err * 7, -CP.airRotMax, CP.airRotMax);
    inp.mx = -clamp((wTarget - car.w) * 0.35, -1, 1);
  }

  startPlan(kind, ctx) {
    this.plan = { kind, t: 0, second: false, dir: ctx.attackDir };
  }

  runPlan(ctx, dt, inp) {
    const car = this.car, plan = this.plan;
    const ball = ctx.perceived[0];
    plan.t += dt;
    if (plan.kind === 'flip') {
      // petit saut puis salto immédiat vers la balle
      if (plan.t < 0.06) inp.jump = true;
      else if (plan.t < 0.14) inp.jump = false;
      else if (!plan.second) {
        plan.second = true;
        if ((ball.x - car.x) * ctx.attackDir > 0) { inp.jump = true; inp.mx = sgn(ball.x - car.x); }
      }
      if (plan.t > 0.9 || (car.grounded && plan.t > 0.2)) this.plan = null;
      return;
    }
    if (plan.kind === 'hop') {
      if (plan.t < 0.16) inp.jump = true;
      else if (plan.t < 0.24) inp.jump = false;
      else if (!plan.second) { plan.second = true; inp.jump = true; }
      // pendant la montée on n'accélère pas (on laisse la balle passer dessous)
      if (plan.t > 0.3) this.airControl(ctx, inp);
      if (plan.t > 1.6 || (car.grounded && plan.t > 0.3)) this.plan = null;
      return;
    }
    if (plan.kind === 'shoot') {
      if (plan.t < 0.18) inp.jump = true;
      const bdx = ball.x - car.x, bdy = ball.y - car.y;
      const d = Math.hypot(bdx, bdy);
      // on ne frappe que si la balle partira vers le but adverse
      const goodSide = bdx * ctx.attackDir > 0.2;
      if (!plan.second && plan.t > 0.2 && d < 2.8 && goodSide && this.rng() < this.d.flipChance) {
        plan.second = true; inp.jump = true; inp.mx = sgn(bdx);
      } else if (plan.t > 0.2) this.airControl(ctx, inp);
      if (plan.t > 1.4 || (car.grounded && plan.t > 0.3)) this.plan = null;
      return;
    }
    if (plan.kind === 'aerial') {
      const tgt = this.aerialTarget || ball;
      if (plan.t < 0.2) inp.jump = true;
      else {
        const desired = Math.atan2(tgt.y - car.y, tgt.x - ctx.attackDir * 0.8 - car.x);
        const err = wrapAngle(desired - car.ang);
        const wTarget = clamp(err * 8, -CP.airRotMax, CP.airRotMax);
        inp.mx = -clamp((wTarget - car.w) * 0.4, -1, 1);
        if (Math.abs(err) < 0.6 && car.boost > 0) inp.boost = true;
        if (plan.t > 0.25 && plan.t < 0.32) inp.jump = true; // double saut d'élan
      }
      if (plan.t > 2.2 || (car.grounded && plan.t > 0.4) || ball.y < car.y - 2) this.plan = null;
    }
  }
}

/** Répartit les rôles d'une équipe : le plus rapide sur la balle attaque, le plus reculé défend. */
export function assignRoles(teamCars, brains, ballSample, attackDir, arena) {
  if (teamCars.length === 0) return;
  const ownGoalX = -attackDir * arena.W;
  const scored = teamCars.map((c) => {
    let eta = estimateETA(c, ballSample.x - attackDir * 1.5);
    if ((c.x - ballSample.x) * attackDir > 0) eta += 1.2; // mauvais côté
    return { c, eta };
  });
  scored.sort((a, b) => a.eta - b.eta);
  const attacker = scored[0].c;
  const rest = scored.slice(1).map((s) => s.c).sort((a, b) => Math.abs(a.x - ownGoalX) - Math.abs(b.x - ownGoalX));
  const roles = new Map();
  roles.set(attacker, 'attacker');
  rest.forEach((c, i) => roles.set(c, i === 0 ? 'defender' : 'support'));
  if (teamCars.length === 1) roles.set(attacker, 'attacker');
  // un saut déjà lancé se termine (runPlan) même si le rôle change
  for (const b of brains) if (roles.has(b.car)) b.role = roles.get(b.car);
  return roles;
}
