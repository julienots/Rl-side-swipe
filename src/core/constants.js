// Réglages physiques centralisés. Unités : 1 unité ≈ 1 mètre, temps en secondes.
// La simulation tourne à pas fixe (PHYS.dt) : elle ne dépend donc pas des FPS d'affichage.

export const PHYS = {
  dt: 1 / 120,
  maxSubstepTravel: 0.22, // déplacement max par sous-étape (anti-traversée)
  maxSubsteps: 8,

  ball: {
    radius: 1.1,
    mass: 1,
    restitution: 0.72,
    restitutionLowSpeed: 1.4, // sous cette vitesse normale, pas de rebond (mise au repos)
    friction: 0.32,
    inertiaK: 0.4, // I = k·m·r²
    airDrag: 0.035,
    rollDamp: 0.35,
    maxSpeed: 52,
  },

  car: {
    halfLen: 0.78, // demi-longueur de l'axe de la capsule
    radius: 0.46,
    mass: 3.2,
    inertia: 1.9,
    maxSpeed: 15.5,
    reverseMaxSpeed: 9,
    boostMaxSpeed: 25,
    absMaxSpeed: 27,
    driveAccel: 30,
    brakeAccel: 52,
    coastDecel: 6,
    boostAccel: 40, // > gravité : le boost permet de voler
    boostUsePerSec: 33,
    jumpSpeed: 10.2,
    jumpHoldAccel: 24,
    jumpHoldTime: 0.18,
    doubleJumpSpeed: 8.6,
    secondJumpWindow: 1.35,
    flipImpulse: 10.5,
    flipTime: 0.5,
    flipHitBonus: 0.45,
    airRotAccel: 34,
    airRotMax: 6.4,
    airDamp: 3.2,
    stickAccel: 34,
    floorStickAccel: 9,
    wallMinSpeed: 6.5,
    suspension: 0.4,
    alignKp: 320,
    alignKd: 32,
    groundLockAfterJump: 0.14,
    autoTurnDelay: 0.22,
    turnAnimTime: 0.24,
    recoverDelay: 0.7,
    wallStallTime: 0.45,
    restitution: 0.12,
    hitKick: 0.32,
  },

  carBall: { restitution: 0.55, maxKickSpeed: 32 },
  carCar: { restitution: 0.35 },
};

export const TEAM_COLORS = [
  { main: '#2bb5ff', light: '#9fe2ff', dark: '#0a4f7a', name: 'Azur' },
  { main: '#ff7a1a', light: '#ffc58a', dark: '#7a3000', name: 'Braise' },
];
