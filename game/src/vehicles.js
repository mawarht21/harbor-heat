// Vehicles for Harbor Heat 3D: low-poly box cars (civilian, taxi, SBPD), an
// arcade driving model, lane-following traffic AI and parked cars to steal.

import { angleDiff, angleLerp, clamp, dist2d, pick, randRange, rgb } from './engine.js';
import { AVENUES_X, STREETS_Z, COAST_Z, collideCircle, lightPhase } from './city.js';

export const CAR_TYPES = [
  { name: 'Coral Convertible', color: '#e4572e', topSpeed: 46, accel: 15, price: 1.0 },
  { name: 'Neon Hatch', color: '#17bebb', topSpeed: 38, accel: 13, price: 0.7 },
  { name: 'Dune Buggy', color: '#ffc914', topSpeed: 42, accel: 17, price: 0.8 },
  { name: 'Palmetto Sedan', color: '#76b041', topSpeed: 40, accel: 12, price: 0.75 },
  { name: 'Vesper Coupe', color: '#9b5de5', topSpeed: 50, accel: 16, price: 1.15 },
  { name: 'Harbor Pickup', color: '#4cc9f0', topSpeed: 37, accel: 12, price: 0.7 },
  { name: 'Solana Wagon', color: '#ef476f', topSpeed: 39, accel: 12, price: 0.72 },
  { name: 'Taxi Cab', color: '#ffd23f', topSpeed: 41, accel: 13, price: 0.8, taxi: true },
];
let carSeq = 0;

export function makeCar(x, z, heading, type, kind) {
  return {
    id: ++carSeq, x, z, heading, speed: 0, steer: 0,
    type, kind, // 'parked' | 'traffic' | 'police' | 'player'
    color: rgb(type.color), health: 100, smoke: 0,
    name: type.name, topSpeed: type.topSpeed, accel: type.accel,
    lane: null, targetSpeed: 0, waitAt: null, wheelSpin: 0, bumpT: 0,
    callsign: null, tactic: 'PURSUIT', roadblock: false, sirenPhase: Math.random() * 6,
  };
}

export function spawnParkedCars(state) {
  const rng = state.rng;
  const spots = [];
  // along avenue curbs
  for (const ax of AVENUES_X) for (let z = -24; z < 470; z += 34) {
    if (rng() < 0.62) spots.push({ x: ax - 5.4, z: z + randRange(rng, -4, 4), heading: Math.PI });
    if (rng() < 0.62) spots.push({ x: ax + 5.4, z: z + 17 + randRange(rng, -4, 4), heading: 0 });
  }
  for (const s of spots) {
    if (dist2d(s.x, s.z, state.player.x, state.player.z) < 9) continue;
    state.cars.push(makeCar(s.x, s.z, s.heading, pick(rng, CAR_TYPES), 'parked'));
  }
  // the marked teal coupe for mission 1, parked across the avenue from spawn
  const coupe = makeCar(115.4, 82, 0, CAR_TYPES[4], 'parked');
  coupe.color = rgb('#17bebb'); // Mara's mark is a TEAL coupe
  coupe.marked = true;
  state.cars.push(coupe);
  state.missionCar = coupe;
}

export function spawnTraffic(state, count) {
  const rng = state.rng;
  for (let i = 0; i < count; i++) {
    const p = randomLanePoint(state);
    const car = makeCar(p.x, p.z, p.heading, pick(rng, CAR_TYPES), 'traffic');
    car.lane = p.lane;
    car.targetSpeed = randRange(rng, 9, 13.5);
    state.cars.push(car);
  }
}

/** A point in a driving lane: {x, z, heading, lane:{axis:'v'|'h', road, dir}} */
export function randomLanePoint(state, nearX = null, nearZ = null, minDist = 0) {
  const rng = state.rng;
  for (let tries = 0; tries < 30; tries++) {
    let lane, x, z, heading;
    if (rng() < 0.55) {
      const road = pick(rng, AVENUES_X);
      const dir = rng() < 0.5 ? 1 : -1;
      lane = { axis: 'v', road, dir };
      x = road + (dir > 0 ? -3.3 : 3.3);
      z = randRange(rng, -35, 470);
      heading = dir > 0 ? 0 : Math.PI;
    } else {
      const road = pick(rng, [...STREETS_Z, COAST_Z]);
      const dir = rng() < 0.5 ? 1 : -1;
      lane = { axis: 'h', road, dir };
      z = road + (dir > 0 ? 3.3 : -3.3);
      x = randRange(rng, -35, 585);
      heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    if (nearX === null || dist2d(x, z, nearX, nearZ) >= minDist) return { x, z, heading, lane };
  }
  return { x: 107, z: 100, heading: 0, lane: { axis: 'v', road: 110, dir: 1 } };
}

// ---------------------------------------------------------------- driving
/**
 * Arcade car physics step. input: {throttle -1..1, steer -1..1, handbrake}.
 * Mutates car; returns impact speed if it slammed a building this frame.
 */
export function driveCar(state, car, dt, input) {
  const maxF = car.topSpeed * (car.health <= 5 ? 0.35 : 1);
  const maxR = 9;
  if (input.throttle > 0) car.speed += car.accel * input.throttle * dt * (1 - Math.max(0, car.speed) / (maxF * 1.15));
  else if (input.throttle < 0) {
    if (car.speed > 0.6) car.speed -= 26 * dt; // brake
    else car.speed += car.accel * 0.55 * input.throttle * dt * (1 - Math.max(0, -car.speed) / maxR);
  } else {
    car.speed -= car.speed * 0.35 * dt; // engine drag
    if (Math.abs(car.speed) < 0.12) car.speed = 0;
  }
  car.speed = clamp(car.speed, -maxR, maxF);
  const steerTarget = input.steer * 0.55 * (input.handbrake ? 1.35 : 1);
  car.steer = angleLerp(car.steer, steerTarget, clamp(dt * 7, 0, 1));
  const grip = input.handbrake ? 0.45 : 1;
  const yawRate = (car.speed / 4.4) * Math.tan(car.steer) * grip * 1.6;
  car.heading += yawRate * dt * (input.handbrake && Math.abs(car.speed) > 6 ? 1.5 : 1);
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  // drift: velocity direction lags heading when handbraking
  if (car.velA === undefined) car.velA = car.heading;
  const align = input.handbrake ? 2.2 : 14;
  car.velA = angleLerp(car.velA, car.heading, clamp(dt * align, 0, 1));
  const vx = Math.sin(car.velA), vz = Math.cos(car.velA);
  car.x += vx * car.speed * dt;
  car.z += vz * car.speed * dt;
  car.wheelSpin += (car.speed * dt) / 0.34;
  let impact = 0;
  const before = Math.abs(car.speed);
  const hitWall = collideCircle(state.city, car, 2.1);
  if (hitWall) {
    impact = before;
    if (before > 7) { car.health = Math.max(0, car.health - before * 0.55); car.bumpT = 0.25; }
    car.speed *= before > 12 ? -0.18 : 0.3;
    car.velA = car.heading;
  }
  // soft car-to-car bumps
  for (const other of state.cars) {
    if (other === car) continue;
    const d = dist2d(car.x, car.z, other.x, other.z);
    if (d < 3.6 && d > 0.001) {
      const push = (3.6 - d) / 2;
      const nx = (car.x - other.x) / d, nz = (car.z - other.z) / d;
      car.x += nx * push; car.z += nz * push;
      if (other.kind !== 'parked' || Math.abs(car.speed) > 5) { other.x -= nx * push; other.z -= nz * push; }
      const rel = Math.abs(car.speed - other.speed);
      if (rel > 6) {
        impact = Math.max(impact, rel);
        car.health = Math.max(0, car.health - rel * 0.4);
        other.health = Math.max(0, other.health - rel * 0.35);
        car.bumpT = other.bumpT = 0.22;
        if (other.kind === 'traffic') { other.speed = car.speed * 0.5; other.panic = 2.5; }
      }
      car.speed *= 0.72;
    }
  }
  car.smoke = car.health < 45 ? (45 - car.health) / 45 : 0;
  return impact;
}

// ---------------------------------------------------------------- traffic AI
export function updateTraffic(state, dt) {
  const phase = lightPhase(state.time);
  for (const car of state.cars) {
    if (car.kind !== 'traffic') continue;
    if (car.panic > 0) car.panic -= dt;
    const lane = car.lane;
    // find the intersection ahead on this lane
    let stopLine = null;
    const ahead = 13;
    if (lane.axis === 'v') {
      for (const sz of [...STREETS_Z, COAST_Z]) {
        const dz = (sz - car.z) * lane.dir;
        if (dz > 2 && dz < ahead + 8) {
          const greenForMe = phase <= 1;
          if (!greenForMe) stopLine = sz - lane.dir * (7 + 3.4);
        }
      }
    } else {
      for (const ax of AVENUES_X) {
        const dx = (ax - car.x) * lane.dir;
        if (dx > 2 && dx < ahead + 8) {
          const greenForMe = phase >= 2;
          if (!greenForMe) stopLine = ax - lane.dir * (7 + 3.4);
        }
      }
    }
    // slow for a car ahead in the same lane
    let want = car.panic > 0 ? car.targetSpeed * 1.5 : car.targetSpeed;
    for (const other of state.cars) {
      if (other === car || other.kind === 'player') continue;
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      const relx = other.x - car.x, relz = other.z - car.z;
      const fwd = relx * fx + relz * fz, side = Math.abs(relx * fz - relz * fx);
      if (fwd > 0 && fwd < 8 && side < 1.9) want = Math.min(want, Math.max(0, (fwd - 5)) * 1.2 + (other.speed || 0) * 0.6);
    }
    if (stopLine !== null) {
      const d = lane.axis === 'v' ? (stopLine - car.z) * lane.dir : (stopLine - car.x) * lane.dir;
      if (d < 9) want = Math.min(want, Math.max(0, d - 2.5) * 1.1);
    }
    // accelerate / brake toward want
    if (car.speed < want) car.speed = Math.min(want, car.speed + car.accel * 0.7 * dt);
    else car.speed = Math.max(want, car.speed - 22 * dt);
    // at an intersection, maybe turn onto the crossing road
    const cross = lane.axis === 'v'
      ? [...STREETS_Z, COAST_Z].find((sz) => Math.abs(sz - car.z) < 1.2)
      : AVENUES_X.find((ax) => Math.abs(ax - car.x) < 1.2);
    if (cross !== undefined && !car.turnCooldown) {
      car.turnCooldown = 2.5;
      if (state.rng() < 0.4) {
        const dir = state.rng() < 0.5 ? 1 : -1;
        if (lane.axis === 'v') {
          car.lane = { axis: 'h', road: cross, dir };
          car.turnTo = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          car.turnZ = cross + (dir > 0 ? 3.3 : -3.3);
        } else {
          car.lane = { axis: 'v', road: cross, dir };
          car.turnTo = dir > 0 ? 0 : Math.PI;
          car.turnX = cross + (dir > 0 ? -3.3 : 3.3);
        }
      }
    }
    if (car.turnCooldown > 0) car.turnCooldown -= dt;
    if (car.turnTo !== undefined) {
      car.heading = angleLerp(car.heading, car.turnTo, clamp(dt * 2.6, 0, 1));
      if (Math.abs(angleDiff(car.heading, car.turnTo)) < 0.08) {
        car.heading = car.turnTo;
        if (car.turnX !== undefined) { car.x = car.turnX; car.turnX = undefined; }
        if (car.turnZ !== undefined) { car.z = car.turnZ; car.turnZ = undefined; }
        car.turnTo = undefined;
      }
    } else {
      // hold lane center
      if (lane.axis === 'v') {
        const tx = lane.road + (lane.dir > 0 ? -3.3 : 3.3);
        car.x += clamp(tx - car.x, -dt * 3, dt * 3);
        car.heading = angleLerp(car.heading, lane.dir > 0 ? 0 : Math.PI, clamp(dt * 3, 0, 1));
      } else {
        const tz = lane.road + (lane.dir > 0 ? 3.3 : -3.3);
        car.z += clamp(tz - car.z, -dt * 3, dt * 3);
        car.heading = angleLerp(car.heading, lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2, clamp(dt * 3, 0, 1));
      }
    }
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    car.wheelSpin += (car.speed * dt) / 0.34;
    // wrap off-map traffic back onto the grid
    if (car.z > 486 || car.z < -42 || car.x > 592 || car.x < -42) {
      const p = randomLanePoint(state, state.player.x, state.player.z, 130);
      car.x = p.x; car.z = p.z; car.heading = p.heading; car.lane = p.lane; car.speed = car.targetSpeed * 0.7;
    }
    collideCircle(state.city, car, 1.9);
  }
}

// ---------------------------------------------------------------- rendering
const WHITE = rgb('#f2f2f2'), DARK = rgb('#20232a'), GLASS = rgb('#1d2b3a');

export function drawCar(R, car, env) {
  const { x, z, heading } = car;
  const y = 0.16 + (car.bumpT > 0 ? Math.sin(car.bumpT * 40) * 0.03 : 0);
  const night = env.night;
  // blob shadow
  R.groundQuad(x, 0.1, z, 4.9, 2.6, [0, 0, 0], 0.32, null, heading);
  const body = car.kind === 'police' ? WHITE : car.color;
  const L = 4.3, W = 1.9;
  R.box(x, y + 0.52, z, W, 0.62, L, body, heading);
  const cabinCol = car.kind === 'police' ? WHITE : car.color;
  const cx = x - Math.sin(heading) * 0.15, cz = z - Math.cos(heading) * 0.15;
  R.box(cx, y + 1.02, cz, W * 0.86, 0.5, L * 0.5, cabinCol, heading);
  // glass band
  R.box(cx, y + 1.04, cz, W * 0.88, 0.3, L * 0.52, GLASS, heading);
  // wheels
  const fx = Math.sin(heading), fz = Math.cos(heading);
  const rx = fz, rz = -fx;
  for (const [sx, sz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const wx = x + rx * sx + fx * sz, wz = z + rz * sx + fz * sz;
    R.box(wx, y + 0.34, wz, 0.28, 0.68, 0.68, DARK, heading, car.wheelSpin, 0);
  }
  // headlights / tail lights (emissive quads read at night)
  const hl = night > 0.25 ? [1, 0.95, 0.75] : [0.85, 0.85, 0.8];
  for (const s of [-0.6, 0.6]) {
    R.glowBox(x + rx * s + fx * (L / 2), y + 0.55, z + rz * s + fz * (L / 2), 0.34, 0.16, 0.08, hl, heading, 0.9);
    R.glowBox(x + rx * s - fx * (L / 2), y + 0.58, z + rz * s - fz * (L / 2), 0.34, 0.14, 0.08, [0.9, 0.12, 0.12], heading, 0.9);
  }
  if (car.type.taxi) {
    R.box(x, y + 1.36, z, 0.8, 0.2, 0.4, rgb('#ffd23f'), heading);
    R.glowBox(x, y + 1.36, z, 0.84, 0.1, 0.42, [1, 0.85, 0.3], heading, night > 0.3 ? 0.95 : 0.4);
  }
  if (car.kind === 'police') {
    // light bar flashing red / blue
    const phase = Math.floor((performance.now() / 280 + car.sirenPhase)) % 2;
    R.box(cx, y + 1.34, cz, 1.1, 0.14, 0.5, DARK, heading);
    R.glowBox(cx - rx * 0.3, y + 1.36, cz - rz * 0.3, 0.4, 0.18, 0.4, phase ? [1, 0.1, 0.15] : [0.45, 0.1, 0.1], heading, 1);
    R.glowBox(cx + rx * 0.3, y + 1.36, cz + rz * 0.3, 0.4, 0.18, 0.4, phase ? [0.1, 0.2, 0.5] : [0.15, 0.35, 1], heading, 1);
    // door shield stripe
    R.box(x, y + 0.52, z, W + 0.03, 0.3, 1.6, rgb('#2456a6'), heading);
  }
  if (car.marked) {
    // the mission coupe wears a soft golden ring
    R.groundQuad(x, 0.12, z, 6.4, 6.4, [1, 0.8, 0.25], 0.5 + Math.sin(performance.now() / 300) * 0.15, R.discUV);
  }
  // headlight cones at night for the player's car and police
  if (night > 0.35 && (car.kind === 'player' || car.kind === 'police')) {
    for (const s of [-0.6, 0.6]) {
      const hx = x + rx * s + fx * (L / 2 + 3.4), hz = z + rz * s + fz * (L / 2 + 3.4);
      R.groundQuad(hx, 0.13, hz, 3.4, 7.5, [1, 0.92, 0.6], 0.16 * night, R.discUV, heading);
    }
  }
  // wreck smoke
  if (car.smoke > 0.15) {
    const t = performance.now() / 400;
    for (let i = 0; i < 3; i++) {
      const ph = (t + i / 3) % 1;
      R.groundQuad(x + fx * 1.6, 1.4 + ph * 2.6, z + fz * 1.6, 1 + ph * 2.2, 1 + ph * 2.2, [0.25, 0.25, 0.27], (1 - ph) * 0.4 * car.smoke, R.discUV);
    }
  }
  if (car.bumpT > 0) car.bumpT -= 0.016;
}
