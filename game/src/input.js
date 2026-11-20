// Keyboard state with edge detection, plus simple touch pads.
// The game reads levels (is W held?) for driving and edges (was E just
// pressed?) for entering cars, so both live here side by side.

const GAME_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyM', 'KeyR', 'KeyT',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight',
  'Space', 'Escape', 'KeyP', 'Enter',
]);

export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    window.addEventListener('keydown', (event) => {
      if (GAME_CODES.has(event.code)) event.preventDefault();
      if (!event.repeat) this.pressed.add(event.code);
      this.down.add(event.code);
    });
    window.addEventListener('keyup', (event) => {
      this.down.delete(event.code);
    });
    window.addEventListener('blur', () => this.down.clear());
    this.buildTouchControls();
  }

  buildTouchControls() {
    const container = document.getElementById('touch-controls');
    if (!container || !('ontouchstart' in window)) return;
    container.classList.add('available');
    const buttons = [
      ['◀', 'ArrowLeft'], ['▲', 'ArrowUp'], ['▼', 'ArrowDown'], ['▶', 'ArrowRight'],
      ['E', 'KeyE'], ['RUN', 'ShiftLeft'],
    ];
    for (const [label, code] of buttons) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.setAttribute('aria-label', label);
      const start = (event) => {
        event.preventDefault();
        this.pressed.add(code);
        this.down.add(code);
      };
      const end = (event) => {
        event.preventDefault();
        this.down.delete(code);
      };
      button.addEventListener('pointerdown', start);
      button.addEventListener('pointerup', end);
      button.addEventListener('pointerleave', end);
      button.addEventListener('pointercancel', end);
      container.appendChild(button);
    }
  }

  isDown(...codes) {
    return codes.some((code) => this.down.has(code));
  }

  wasPressed(...codes) {
    return codes.some((code) => this.pressed.has(code));
  }

  consume(...codes) {
    const found = this.wasPressed(...codes);
    for (const code of codes) this.pressed.delete(code);
    return found;
  }

  endFrame() {
    this.pressed.clear();
  }

  get throttle() {
    let value = 0;
    if (this.isDown('KeyW', 'ArrowUp')) value += 1;
    if (this.isDown('KeyS', 'ArrowDown')) value -= 1;
    return value;
  }

  get steer() {
    let value = 0;
    if (this.isDown('KeyA', 'ArrowLeft')) value -= 1;
    if (this.isDown('KeyD', 'ArrowRight')) value += 1;
    return value;
  }

  get handbrake() {
    return this.isDown('Space', 'ShiftLeft', 'ShiftRight');
  }

  get running() {
    return this.isDown('ShiftLeft', 'ShiftRight');
  }

  moveVector() {
    return {
      x: (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0),
      z: (this.isDown('KeyW', 'ArrowUp') ? 1 : 0) - (this.isDown('KeyS', 'ArrowDown') ? 1 : 0),
    };
  }
}
