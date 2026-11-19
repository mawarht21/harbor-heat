// The SBPD: cruisers that spawn with the stars, steer predictively, ram, set
// roadblocks at four stars, and a helicopter with a searchlight at three.

import { angleDiff, clamp, dist2d, rgb } from './engine.js';
import { driveCar, makeCar, randomLanePoint } from './vehicles.js';
import { segmentBlocked } from './city.js';

const POLICE_TYPE = { name: 'SBPD Interceptor', color: '#f2f2f2', topSpeed: 47, accel: 16.5, price: 1 };
const UNIT_NAMES = ['CORAL', 'MARLIN', 'TARPON', 'GULL', 'HERON', 'OSPREY', 'BASTION', 'TERN', 'MAKO', 'PELICAN'];
let unitSeq = 0;

function spawnCruiser(state, x, z, heading) {
  const car = makeCar(x, z, heading, POLICE_TYPE, 'police');
  car.callsign = `${UNIT_NAMES[unitSeq % UNIT_NAMES.length]}-${(unitSeq % 9) + 1}`;
  unitSeq++;
  car.roadblock = false;
  state.cars.push(car);
  state.police.push(car);
  return car;
}

function spawnHeli(state) {
  const heli = {
    kind: 'heli', x: state.player.x + 40, z: state.player.z - 40, y: 34, heading: 0,
    callsign: 'AIR ONE', tactic: 'SPOTLIGHT', seesPlayer: false, rotor: 0, searchT: 0,
    sx: state.player.x, sz: state.player.z,
  };
  state.police.push(heli);
  state.heli = heli;
  return heli;
}

const CRUISERS_BY_STARS = [0, 2, 3, 4, 5, 6];

export function updatePolice(state, dt) {
  const w = state.wanted;
  const P = state.player;
  const cruisers = state.police.filter((u) => u.kind !== 'heli');
  const wantCruisers = CRUISERS_BY_STARS[w.stars] || 0;

  if (w.stars === 0) {
    // stand down: units leave, heli departs
    for (const c of cruisers) removeUnit(state, c);
    if (state.heli) { state.police = state.police.filter((u) => u !== state.heli); state.heli = null; }
    state.roadblockCd = 0;
    return;
  }
  // top up the fleet from off-screen road points
  state.spawnT = (state.spawnT || 0) - dt;
  if (cruisers.length < wantCruisers && state.spawnT <= 0) {
    state.spawnT = 1.6;
    const p = randomLanePoint(state, P.x, P.z, 105);
    spawnCruiser(state, p.x, p.z, p.heading);
  }
  if (w.stars >= 3 && !state.heli) spawnHeli(state);
  if (w.stars < 3 && state.heli) { state.police = state.police.filter((u) => u !== state.heli); state.heli = null; }

  // roadblocks at 4+ stars: plant two cruisers across the player's road ahead
  state.roadblockCd = (state.roadblockCd || 0) - dt;
  const activeBlock = cruisers.some((c) => c.roadblock);
  if (w.stars >= 4 && !activeBlock && state.roadblockCd <= 0 && P.inCar && Math.abs(state.playerCar.speed) > 8) {
    const fx = Math.sin(P.heading), fz = Math.cos(P.heading);
    const bx = P.x + fx * 85, bz = P.z + fz * 85;
    const free = cruisers.filter((c) => !c.roadblock).slice(-2);
    if (free.length === 2) {
      const px = fz, pz = -fx;
      free[0].x = bx - px * 2.2; free[0].z = bz - pz * 2.2; free[0].heading = P.heading + Math.PI / 2 + 0.35; free[0].speed = 0;
      free[1].x = bx + px * 2.2; free[1].z = bz + pz * 2.2; free[1].heading = P.heading + Math.PI / 2 - 0.35; free[1].speed = 0;
      free.forEach((c) => { c.roadblock = true; c.tactic = 'ROADBLOCK'; c.blockT = 7; });
      state.roadblockCd = 16;
    }
  }

  // drive every cruiser
  for (const car of cruisers) {
    if (car.roadblock) {
      car.blockT -= dt;
      car.tactic = 'ROADBLOCK';
      car.speed = 0;
      const d = dist2d(car.x, car.z, P.x, P.z);
      if (car.blockT <= 0 || d < 9) { car.roadblock = false; car.tactic = 'PURSUIT'; }
      continue;
    }
    // predict where the player is going
    const pvx = P.inCar ? Math.sin(state.playerCar.heading) * state.playerCar.speed : 0;
    const pvz = P.inCar ? Math.cos(state.playerCar.heading) * state.playerCar.speed : 0;
    const d = dist2d(car.x, car.z, P.x, P.z);
    const lead = clamp(d / 55, 0, 0.9);
    let tx = P.x + pvx * lead, tz = P.z + pvz * lead;
    if (!w.seen && w.lastSeenT > 1.2) {
      // searching: head to the last place they saw you, then sweep
      tx = state.lastSeenPos.x; tz = state.lastSeenPos.z;
      car.tactic = d > 26 ? 'RESPONDING' : 'PURSUIT';
      if (d < 8) { tx = car.x + Math.sin(car.heading) * 20; tz = car.z + Math.cos(car.heading) * 20; }
    } else {
      car.tactic = d > 55 ? 'RESPONDING' : (Math.abs(car.speed) > 20 && d < 22 ? 'RAMMING' : 'PURSUIT');
    }
    const wantHeading = Math.atan2(tx - car.x, tz - car.z);
    const steer = clamp(angleDiff(car.heading, wantHeading) * 2.2, -1, 1);
    let throttle = 1;
    if (Math.abs(angleDiff(car.heading, wantHeading)) > 2.4 && d < 14) throttle = -1; // reverse out of a jam
    if (d < 6 && !P.inCar) throttle = 0.25;
    const impact = driveCar(state, car, dt, { throttle, steer, handbrake: false });
    if (impact > 13) car.health = Math.max(0, car.health - 4);
    if (car.health <= 4) { // wrecked unit bows out
      state.onCrimeSilent && state.onCrimeSilent();
      removeUnit(state, car);
      state.hud.toast('SBPD unit wrecked', '#9fd8ff');
    }
  }
  // record last seen position
  if (w.seen) { state.lastSeenPos.x = P.x; state.lastSeenPos.z = P.z; }

  // helicopter: shadow the player from above, spotlight locked on
  if (state.heli) {
    const h = state.heli;
    h.rotor += dt * 28;
    const tx = P.x - Math.sin(P.heading) * 6, tz = P.z - Math.cos(P.heading) * 6;
    h.x += clamp(tx - h.x, -dt * 30, dt * 30);
    h.z += clamp(tz - h.z, -dt * 30, dt * 30);
    h.y += clamp(33 - h.y, -dt * 8, dt * 8);
    h.heading = Math.atan2(P.x - h.x, P.z - h.z);
    h.tactic = w.seen ? 'SPOTLIGHT' : 'SEARCHING';
  }
}

function removeUnit(state, car) {
  state.police = state.police.filter((u) => u !== car);
  state.cars = state.cars.filter((c) => c !== car);
}

/** Dispatch-panel rows: nearest units first, max 6. */
export function dispatchRows(state) {
  const P = state.player;
  return state.police
    .map((u) => ({ name: u.callsign || 'SBPD', dist: Math.round(dist2d(u.x, u.z, P.x, P.z)), tactic: u.tactic || 'PURSUIT', heli: u.kind === 'heli' }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 6);
}

// ---------------------------------------------------------------- drawing
export function drawHeli(R, heli, env, time) {
  const { x, z, y } = heli;
  const h = heli.heading;
  const fx = Math.sin(h), fz = Math.cos(h);
  // spotlight pool on the ground + the cone, before the body so it layers right
  R.groundQuad(x + fx * 2, 0.14, z + fz * 2, 13, 13, [1, 0.97, 0.8], 0.34, R.discUV);
  R.cone(x, 2.5, z, 6.5, y - 2.5, [1, 0.97, 0.82], 0.10 + env.night * 0.08);
  // body
  R.box(x, y, z, 2.2, 1.9, 4.6, rgb('#e8e8ea'));
  R.box(x, y + 0.1, z, 2.26, 0.8, 2.2, rgb('#2456a6'));
  R.box(x - fx * 3.6, y + 0.35, z - fz * 3.6, 0.5, 0.5, 3.4, rgb('#cfd3d8'), h);
  R.box(x - fx * 5.1, y + 0.8, z - fz * 5.1, 1.5, 0.9, 0.18, rgb('#2456a6'), h);
  // skids
  for (const s of [-0.9, 0.9]) {
    const rx2 = fz, rz2 = -fx;
    R.box(x + rx2 * s, y - 1.25, z + rz2 * s, 0.14, 0.14, 3.6, rgb('#555b63'), h);
  }
  // main rotor (spinning) + tail rotor
  R.box(x, y + 1.12, z, 9.5, 0.07, 0.5, rgb('#2c2f36'), heli.rotor);
  R.box(x, y + 1.12, z, 0.5, 0.07, 9.5, rgb('#2c2f36'), heli.rotor);
  R.box(x - fx * 5.15, y + 0.8, z - fz * 5.15, 0.08, 1.5, 0.3, rgb('#2c2f36'), h, heli.rotor * 2.2, 0);
  // searchlight housing glow
  R.glowBox(x + fx * 1.8, y - 0.9, z + fz * 1.8, 0.4, 0.3, 0.4, [1, 0.98, 0.85], h, 1);
}

export { segmentBlocked };
