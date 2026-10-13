// Boucle à pas fixe : la simulation avance toujours par pas de `dt`, quel que soit le rythme d'affichage.
export class FixedStepper {
  constructor(dt, maxSteps = 10) {
    this.dt = dt;
    this.maxSteps = maxSteps;
    this.acc = 0;
  }

  /** Accumule le temps écoulé et appelle step(dt) autant de fois que nécessaire. Retourne le nombre de pas. */
  advance(frameDt, step) {
    this.acc += Math.min(Math.max(0, frameDt), 0.25);
    let n = 0;
    while (this.acc >= this.dt - 1e-9 && n < this.maxSteps) {
      step(this.dt);
      this.acc -= this.dt;
      n++;
    }
    if (n >= this.maxSteps) this.acc = 0; // évite la spirale de rattrapage
    return n;
  }

  /** Fraction d'interpolation pour le rendu. */
  get alpha() { return Math.min(1, Math.max(0, this.acc / this.dt)); }

  reset() { this.acc = 0; }
}
