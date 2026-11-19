// Keyboard state for Harbor Heat 3D. `keys` is the held set, `pressed` the
// one-frame edge set the game polls each tick.

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.clicked = false;
    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('mousedown', () => { this.clicked = true; });
    addEventListener('blur', () => this.keys.clear());
  }
  down(...names) { return names.some((n) => this.keys.has(n)); }
  hit(...names) { return names.some((n) => this.pressed.has(n)); }
  endFrame() { this.pressed.clear(); this.clicked = false; }
  get forward() { return this.down('w', 'arrowup'); }
  get back() { return this.down('s', 'arrowdown'); }
  get left() { return this.down('a', 'arrowleft'); }
  get right() { return this.down('d', 'arrowright'); }
  get sprint() { return this.down('shift'); }
  get handbrake() { return this.down(' '); }
}
