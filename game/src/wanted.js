// The wanted system: crimes add heat, heat becomes stars, stars decide how
// hard the SBPD pushes. Break line of sight and the heat cools — three times
// faster inside a glowing hiding-spot ring.

import { clamp, dist2d } from './engine.js';
import { HIDING_SPOTS, segmentBlocked } from './city.js';

export const CRIMES = {
  steal: 34, hitCar: 12, hitPed: 55, assault: 18, shot: 26, missionAlarm: 120, vault: 300, manhunt: 480,
};

export function createWanted() {
  return {
    heat: 0, stars: 0, seen: false, lastSeenT: 99, bust: 0,
    lastCrime: '', inHidingSpot: false, hidingName: '',
  };
}

export function addCrime(state, points, label) {
  const w = state.wanted;
  w.heat = clamp(w.heat + points, 0, 500);
  w.lastCrime = label;
}

export function starsForHeat(heat) {
  if (heat <= 0) return 0;
  return clamp(Math.ceil(heat / 100), 1, 5);
}

/** Can any police unit (or the helicopter) see the player right now? */
export function computeSeen(state) {
  const P = state.player;
  let seen = false;
  for (const u of state.police) {
    const d = dist2d(u.x, u.z, P.x, P.z);
    const range = u.kind === 'heli' ? 95 : 62;
    if (d > range) continue;
    if (u.kind === 'heli') {
      // the chopper sees almost everything — unless you are tucked in a hiding spot
      if (!state.wanted.inHidingSpot) { seen = true; u.seesPlayer = true; continue; }
      u.seesPlayer = false; continue;
    }
    if (!segmentBlocked(state.city, u.x, u.z, P.x, P.z)) { seen = true; u.seesPlayer = true; }
    else u.seesPlayer = false;
  }
  return seen;
}

export function updateWanted(state, dt) {
  const w = state.wanted;
  const P = state.player;
  // hiding spot check
  w.inHidingSpot = false; w.hidingName = '';
  for (const h of HIDING_SPOTS) {
    if (dist2d(P.x, P.z, h.x, h.z) < 4.2) { w.inHidingSpot = true; w.hidingName = h.name; break; }
  }
  w.seen = computeSeen(state);
  if (w.seen) w.lastSeenT = 0; else w.lastSeenT += dt;
  if (!w.seen && w.heat > 0) {
    const rate = (w.inHidingSpot ? 13.5 : 4.5) * dt;
    w.heat = Math.max(0, w.heat - rate);
    if (w.heat === 0) w.lastCrime = '';
  }
  w.stars = starsForHeat(w.heat);
  // bust meter: stopped or crawling with a cruiser on top of you
  const speed = P.inCar ? Math.abs(state.playerCar.speed) : P.speedMag;
  let nearCop = false;
  for (const u of state.police) {
    if (u.kind === 'cruiser' && dist2d(u.x, u.z, P.x, P.z) < 11) { nearCop = true; break; }
  }
  if (w.stars > 0 && nearCop && speed < 1.6 && state.mode === 'playing') {
    w.bust += dt / 2.6;
    if (w.bust >= 1) { w.bust = 0; state.onBusted(); }
  } else {
    w.bust = Math.max(0, w.bust - dt * 0.7);
  }
}
