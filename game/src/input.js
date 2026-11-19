// Keyboard and mouse input for Harbor Heat.
// Held keys drive movement and driving; one-shot presses (interact, pause, confirm)
// are queued as bit flags and taken once by the loop so a press is never lost or doubled.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_ATTACK = 8;
export const ACTION_GARAGE = 16;

const HELD_CODES = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyJ', 'KeyK',
  'ShiftLeft', 'ShiftRight', 'Space',
]);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let mouseX = 640;
  let mouseY = 360;
  let mouseDown = false;

  window.addEventListener('keydown', (event) => {
    if (HELD_CODES.has(event.code)) held.add(event.code);
    if (!event.repeat) {
      if (event.code === 'Enter' || event.code === 'Space') actions |= ACTION_CONFIRM;
      if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
      if (event.code === 'KeyE') actions |= ACTION_INTERACT;
      if (event.code === 'KeyF' || event.code === 'KeyJ') actions |= ACTION_ATTACK;
      if (event.code === 'KeyR') actions |= ACTION_GARAGE;
    }
    if (HELD_CODES.has(event.code) || event.code === 'KeyE' || event.code === 'KeyP') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => { held.delete(event.code); });
  window.addEventListener('blur', () => { held.clear(); mouseDown = false; });
  target.addEventListener('pointermove', (event) => {
    const rect = target.getBoundingClientRect();
    mouseX = ((event.clientX - rect.left) / rect.width) * 1280;
    mouseY = ((event.clientY - rect.top) / rect.height) * 720;
  });
  target.addEventListener('pointerdown', () => { mouseDown = true; actions |= ACTION_ATTACK; });
  window.addEventListener('pointerup', () => { mouseDown = false; });

  return {
    held(code) { return held.has(code); },
    axisX() { return (held.has('ArrowRight') || held.has('KeyD') ? 1 : 0) - (held.has('ArrowLeft') || held.has('KeyA') ? 1 : 0); },
    axisY() { return (held.has('ArrowDown') || held.has('KeyS') ? 1 : 0) - (held.has('ArrowUp') || held.has('KeyW') ? 1 : 0); },
    sprint() { return held.has('ShiftLeft') || held.has('ShiftRight'); },
    attackHeld() { return mouseDown || held.has('KeyJ') || held.has('Space'); },
    mouse() { return { x: mouseX, y: mouseY, down: mouseDown }; },
    takeActions() { const taken = actions; actions = 0; return taken; },
    // Used by screenshot staging to press keys on the player's behalf.
    press(code) { held.add(code); },
    releaseAll() { held.clear(); },
  };
}
