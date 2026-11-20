// The SBPD's memory of the player: a 0-100 heat value behind the stars.
// Heat only cools when nobody can see the player.  Hiding spots do not
// erase crimes; they simply make the search lose its thread faster.

export class WantedSystem {
  constructor() {
    this.heat = 0;
    this.visible = false;
    this.inHiding = false;
    this.lastCrime = '';
    this.lastCrimeAt = -99;
    this.time = 0;
  }

  get stars() {
    if (this.heat <= 0) return 0;
    return Math.min(5, Math.floor((this.heat - 0.01) / 20) + 1);
  }

  setStars(stars) {
    this.heat = stars <= 0 ? 0 : (stars - 0.5) * 20;
  }

  report(amount, label = 'crime') {
    const before = this.stars;
    this.heat = Math.min(100, this.heat + amount);
    this.lastCrime = label;
    this.lastCrimeAt = this.time;
    return this.stars > before;
  }

  update(dt, visible, inHiding) {
    this.time += dt;
    this.visible = visible;
    this.inHiding = inHiding;
    if (this.heat <= 0) return;
    if (visible) {
      // Being watched holds the search together and can push a borderline
      // response one star higher during a long chase.
      this.heat = Math.min(100, this.heat + dt * 0.42);
    } else {
      const decay = inHiding ? 4.6 : 1.55;
      this.heat = Math.max(0, this.heat - decay * dt);
    }
  }

  clear() {
    this.heat = 0;
    this.visible = false;
    this.inHiding = false;
  }

  get statusLabel() {
    if (this.stars === 0) return 'CLEAR';
    return this.visible ? 'IN SIGHT' : 'SEARCHING';
  }

  get tacticLabel() {
    if (this.stars === 0) return 'PATROL';
    if (this.stars === 1) return 'RESPONDING';
    if (this.stars === 2) return 'PURSUIT';
    if (this.stars === 3) return 'AIR UNIT';
    return 'ROADBLOCK';
  }
}
