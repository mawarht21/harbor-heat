// Vehicles: parked cars waiting to be stolen, traffic that cruises the road grid,
// and the driving model for whichever car the player is sitting in.

import { CAR, CRIMES } from './config.js';
import { ROAD_XS, ROAD_YS, collideCarWithBuildings } from './city.js';
import { angleLerp, clamp, createRandom, pick, randRange } from './random.js';
import { addCrime } from './wanted.js';

export const CAR_MODELS = [
  { name: 'Solana Coupe', color: '#ef476f', topSpeed: 335, accel: 1.15 },
  { name: 'Palm Sedan', color: '#4cc9f0', topSpeed: 285, accel: 1.0 },
  { name: 'Cargo Van', color: '#e9e4d8', topSpeed: 235, accel: 0.82 },
  { name: 'Dune Pickup', color: '#f4a261', topSpeed: 265, accel: 0.95 },
  { name: 'Neon Hatch', color: '#9b5de5', topSpeed: 300, accel: 1.05 },
  { name: 'Harbor Taxi', color: '#ffd23f', topSpeed: 275, accel: 0.98 },
  { name: 'Coral Convertible', color: '#06d6a0', topSpeed: 320, accel: 1.1 },
];

function makeCar(rng, x, y, angle, kind) {
  const model = pick(rng, CAR_MODELS);
  return {
    x, y, angle, speed: 0, steer: 0,
    color: model.color, name: model.name, topSpeed: model.topSpeed, accelMul: model.accel,
    kind, health: CAR.health, bump: 0, honk: 0,
    laneDir: 1, axis: 'x', targetSpeed: randRange(rng, 120, 185),
    occupied: false, dead: false,
  };
}

export function spawnVehicles(city, seed) {
  const rng = createRandom(seed * 3313 + 7);
  const cars = [];
  // Traffic: half cruise horizontally along avenues, half vertically along streets.
  for (let i = 0; i < 26; i++) {
    const horizontal = i % 2 === 0;
    const car = makeCar(rng, 0, 0, 0, 'traffic');
    if (horizontal) {
      const ry = pick(rng, ROAD_YS);
      car.axis = 'x'; car.laneDir = rng() < 0.5 ? 1 : -1;
      car.y = ry + car.laneDir * 28;
      car.x = randRange(rng, 120, 3480);
      car.angle = car.laneDir > 0 ? 0 : Math.PI;
    } else {
      const rx = pick(rng, ROAD_XS);
      car.axis = 'y'; car.laneDir = rng() < 0.5 ? 1 : -1;
      car.x = rx + (car.laneDir > 0 ? -28 : 28);
      car.y = randRange(rng, 120, 2280);
      car.angle = car.laneDir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    car.speed = car.targetSpeed * 0.8;
    cars.push(car);
  }
  // Parked cars at the edges of blocks, ready to steal.
  for (let i = 0; i < 30; i++) {
    const horizontal = rng() < 0.5;
    const car = makeCar(rng, 0, 0, 0, 'parked');
    if (horizontal) {
      const ry = pick(rng, ROAD_YS);
      car.x = randRange(rng, 140, 3460); car.y = ry + (rng() < 0.5 ? -46 : 46);
      car.angle = rng() < 0.5 ? 0 : Math.PI;
    } else {
      const rx = pick(rng, ROAD_XS);
      car.x = rx + (rng() < 0.5 ? -46 : 46); car.y = randRange(rng, 140, 2260);
      car.angle = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    }
    cars.push(car);
  }
  return cars;
}

export function updateTraffic(state, dt) {
  for (const car of state.cars) {
    if (car.kind !== 'traffic' || car.dead) continue;
    // Slow down when the car ahead (or the player) is close in front.
    let desired = car.targetSpeed;
    const fx = car.x + Math.cos(car.angle) * 74;
    const fy = car.y + Math.sin(car.angle) * 74;
    for (const other of state.cars) {
      if (other === car || other.dead) continue;
      if (Math.hypot(other.x - fx, other.y - fy) < 42) desired = 0;
    }
    if (Math.hypot(state.player.x - fx, state.player.y - fy) < 40 && !state.player.inCar) desired = 0;
    car.speed += clamp(desired - car.speed, -260 * dt, 120 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    // Wrap around the city edge and keep cruising.
    if (car.x < -80) car.x = 3680; if (car.x > 3680) car.x = -80;
    if (car.y < -80) car.y = 2380; if (car.y > 2380) car.y = -80;
    // At an intersection, sometimes turn onto the crossing road.
    if (state.rng() < dt * 0.10) maybeTurn(state, car);
    collideCarWithBuildings(state.city, car);
    if (car.bump > 0) car.bump -= dt;
  }
}

function maybeTurn(state, car) {
  const nearX = ROAD_XS.find((rx) => Math.abs(car.x - rx) < 26);
  const nearY = ROAD_YS.find((ry) => Math.abs(car.y - ry) < 26);
  if (car.axis === 'x' && nearX !== undefined) {
    car.axis = 'y'; car.laneDir = state.rng() < 0.5 ? 1 : -1;
    car.x = nearX + (car.laneDir > 0 ? -28 : 28);
    car.angle = car.laneDir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else if (car.axis === 'y' && nearY !== undefined) {
    car.axis = 'x'; car.laneDir = state.rng() < 0.5 ? 1 : -1;
    car.y = nearY + car.laneDir * 28;
    car.angle = car.laneDir > 0 ? 0 : Math.PI;
  }
}

/** Enter the nearest car, or climb out of the one the player is driving. */
export function enterExitCar(state, audio) {
  const p = state.player;
  if (p.inCar) {
    const car = p.inCar;
    car.kind = car.wasParked ? 'parked' : car.kind;
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    p.inCar = null;
    state.cameraShake = Math.max(state.cameraShake, 0.05);
    if (audio) audio.door();
    return true;
  }
  let best = null; let bestD = 62;
  for (const car of state.cars) {
    if (car.dead || car.kind === 'police') continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) { best = car; bestD = d; }
  }
  if (!best) return false;
  best.wasParked = best.kind === 'parked';
  const stealing = best.kind !== 'player';
  best.kind = 'player';
  p.inCar = best;
  p.x = best.x; p.y = best.y;
  if (audio) audio.door();
  if (stealing) {
    addCrime(state, CRIMES.stealCar, 'Car stolen');
    state.toast = `Stole a ${best.name}! The owner called it in.`;
    state.toastTime = 2.6;
  }
  return true;
}

export function updatePlayerCar(state, input, dt) {
  const p = state.player;
  const car = p.inCar;
  if (!car) return;
  const up = input.held('ArrowUp') || input.held('KeyW');
  const down = input.held('ArrowDown') || input.held('KeyS');
  const left = input.held('ArrowLeft') || input.held('KeyA');
  const right = input.held('ArrowRight') || input.held('KeyD');
  if (up) car.speed += CAR.accel * car.accelMul * dt;
  else if (down) {
    if (car.speed > 12) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.accel * 0.6 * dt;
  }
  car.speed -= car.speed * CAR.drag * dt * 0.42;
  car.speed = clamp(car.speed, -CAR.reverseMax, car.topSpeed);
  if (Math.abs(car.speed) < 2 && !up && !down) car.speed = 0;
  const steer = (right ? 1 : 0) - (left ? 1 : 0);
  if (steer !== 0 && car.speed !== 0) {
    car.angle += steer * Math.sign(car.speed) * (2.1 - Math.min(1.15, Math.abs(car.speed) / 340)) * dt * 1.55;
  }
  const prevX = car.x; const prevY = car.y;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  collideCarWithBuildings(state.city, car);
  if (car.bump > 0) {
    car.bump -= dt;
    if (Math.abs(car.speed) > 120 && state.crashCooldown <= 0) {
      state.crashCooldown = 0.8;
      car.health -= 7;
      state.cameraShake = 0.35;
      if (state.audio) state.audio.crash();
      addCrime(state, CRIMES.hitCar, 'Hit and run');
    }
  }
  // Running into traffic damages both cars and is very much a crime.
  for (const other of state.cars) {
    if (other === car || other.dead) continue;
    const d = Math.hypot(other.x - car.x, other.y - car.y);
    if (d < 40) {
      const push = (40 - d) / 2;
      const a = Math.atan2(other.y - car.y, other.x - car.x);
      other.x += Math.cos(a) * push; other.y += Math.sin(a) * push;
      if (Math.abs(car.speed) > 90 && state.crashCooldown <= 0) {
        state.crashCooldown = 0.7;
        other.health -= 12; car.health -= 5;
        state.cameraShake = 0.3;
        if (state.audio) state.audio.crash();
        addCrime(state, CRIMES.hitCar, 'Vehicle collision');
        if (other.health <= 0) other.dead = true;
      }
      car.speed *= 0.72;
    }
  }
  if (car.health <= 0 && !car.dead) { car.dead = true; state.toast = 'Your ride is wrecked!'; state.toastTime = 2.4; }
  p.x = car.x; p.y = car.y; p.angle = car.angle;
  state.speedKmh = Math.round(Math.abs(car.speed) * 0.55);
  if (prevX === car.x && prevY === car.y) { /* parked against a wall */ }
}

/** The steering helper the police and racers share: aim at a point, with speed. */
export function steerCarToward(car, tx, ty, dt, topSpeed, aggression) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  car.angle = angleLerp(car.angle, want, clamp((aggression || 2.6) * dt, 0, 1));
  const dist = Math.hypot(tx - car.x, ty - car.y);
  const desired = dist > 60 ? topSpeed : topSpeed * 0.45;
  car.speed += clamp(desired - car.speed, -300 * dt, 240 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
}
