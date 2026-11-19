// The wanted system: crimes add heat, heat becomes stars, stars decide how many
// police come and how hard they push. Stay out of sight and the heat cools off.

import { CRIMES, WANTED } from './config.js';
import { HIDING_SPOTS } from './city.js';

export function createWanted() {
  return { heat: 0, stars: 0, lastCrime: '', seenByPolice: false, bustMeter: 0, escapeTimer: 0 };
}

// Is the straight line between two points blocked by any building?
function lineBlockedByBuildings(state, x1, y1, x2, y2) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.floor(dist / 18));
  for (let i = 1; i < steps; i++) {
    const x = x1 + (x2 - x1) * (i / steps);
    const y = y1 + (y2 - y1) * (i / steps);
    for (const b of state.city.buildings) {
      if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
    }
  }
  return false;
}

// The player is hidden when standing in a hiding spot with no police unit
// holding a clear line of sight to them from within 260 px.
export function computePlayerHidden(state) {
  const p = state.player;
  let inSpot = false;
  for (const spot of HIDING_SPOTS) {
    if (Math.hypot(p.x - spot.x, p.y - spot.y) < 50) { inSpot = true; break; }
  }
  if (!inSpot) return false;
  const units = [...state.policeCars, ...state.footCops];
  for (const cop of units) {
    if (cop.dead) continue;
    const d = Math.hypot(cop.x - p.x, cop.y - p.y);
    if (d < 260 && !lineBlockedByBuildings(state, cop.x, cop.y, p.x, p.y)) return false;
  }
  return true;
}

export function addCrime(state, points, label) {
  const w = state.wanted;
  // Crimes only count fully when a witness is near: a pedestrian, traffic or a cop.
  let witnessed = false;
  for (const ped of state.peds) if (Math.hypot(ped.x - state.player.x, ped.y - state.player.y) < 300) { witnessed = true; break; }
  if (!witnessed) for (const car of state.cars) if (Math.hypot(car.x - state.player.x, car.y - state.player.y) < 320) { witnessed = true; break; }
  const gained = witnessed ? points : Math.round(points * 0.35);
  w.heat = Math.min(WANTED.perStar * WANTED.maxStars, w.heat + gained);
  w.lastCrime = label;
  w.escapeTimer = 0;
  state.crimeFlash = 1.6;
  state.crimeText = label;
}

export function starsForHeat(heat) {
  return Math.min(WANTED.maxStars, Math.floor(heat / WANTED.perStar) + (heat > 4 ? 1 : 0));
}

export function updateWanted(state, dt) {
  const w = state.wanted;
  w.stars = starsForHeat(w.heat);
  // Police see the player when a police unit is close with a clear-ish line.
  w.seenByPolice = false;
  for (const cop of state.policeCars) {
    if (Math.hypot(cop.x - state.player.x, cop.y - state.player.y) < 430) { w.seenByPolice = true; break; }
  }
  // Hidden in a marked spot, heat bleeds off three times as fast; merely
  // unseen, it cools at the usual rate (faster the longer you stay unseen).
  const hidden = computePlayerHidden(state);
  state.playerHidden = hidden;
  let coolMul = 0;
  if (w.stars > 0 && hidden) coolMul = 3;
  else if (w.stars > 0 && !w.seenByPolice) coolMul = w.escapeTimer > 2 ? 2.2 : 1;
  if (coolMul > 0) {
    w.escapeTimer += dt;
    w.heat = Math.max(0, w.heat - WANTED.coolRate * coolMul * dt);
    if (w.heat <= 0.5 && w.stars > 0) {
      w.heat = 0;
      state.toast = 'You lost the cops. Lay low, Harbor style.';
      state.toastTime = 2.6;
    }
  } else if (w.seenByPolice) {
    w.escapeTimer = 0;
  }
  // Busted: a cop close by while the player is slow fills the bust meter.
  const p = state.player;
  const playerSpeed = p.inCar ? Math.abs(p.inCar.speed) : (p.moving ? 150 : 0);
  let copClose = false;
  for (const cop of state.policeCars) if (Math.hypot(cop.x - p.x, cop.y - p.y) < 92) copClose = true;
  for (const cop of state.footCops) if (Math.hypot(cop.x - p.x, cop.y - p.y) < 54) copClose = true;
  if (copClose && playerSpeed < 55 && w.stars > 0) {
    w.bustMeter += dt / WANTED.bustFillSeconds;
  } else {
    w.bustMeter = Math.max(0, w.bustMeter - dt / WANTED.bustDrainSeconds);
  }
  if (w.bustMeter >= 1) {
    state.mode = 'busted';
    if (state.audio) state.audio.busted();
    if (state.audio) state.audio.setSiren(false);
  }
  if (state.crimeFlash > 0) state.crimeFlash -= dt;
}

export { CRIMES };
