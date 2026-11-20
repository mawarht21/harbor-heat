// Cars are box assemblies with deliberately forgiving arcade physics.
// One Car class serves the player, traffic, parked stock and police; the
// differences are control source, paint and how much trouble they cause.

import { clamp, lerp, mat4Compose } from './engine.js';

export const CAR_COLORS = [
  [0.85, 0.22, 0.18], [0.15, 0.48, 0.72], [0.95, 0.62, 0.16],
  [0.25, 0.68, 0.48], [0.72, 0.74, 0.78], [0.42, 0.3, 0.66],
  [0.9, 0.88, 0.82], [0.2, 0.22, 0.26], [0.95, 0.36, 0.52],
];

export function forwardFromHeading(heading) {
  return { x: Math.sin(heading), z: -Math.cos(heading) };
}

export function angleDifference(a, b) {
  let difference = (a - b) % (Math.PI * 2);
  if (difference > Math.PI) difference -= Math.PI * 2;
  if (difference < -Math.PI) difference += Math.PI * 2;
  return difference;
}

export function turnToward(current, target, maximumStep) {
  const difference = angleDifference(target, current);
  return current + clamp(difference, -maximumStep, maximumStep);
}

export class Car {
  constructor(kind, x, z, heading, color, role = 'parked') {
    this.kind = kind;
    this.pos = { x, z };
    this.heading = heading;
    this.travelHeading = heading;
    this.speed = 0;
    this.steer = 0;
    this.color = color;
    this.role = role;
    this.health = 100;
    this.stolen = false;
    this.everPlayerDriven = false;
    this.wheelSpin = 0;
    this.impactCooldown = 0;
    this.lastImpact = 0;
    this.dead = false;
    const stats = {
      coupe: { top: 39, acceleration: 17, grip: 2.15, label: 'Sol Coupe' },
      sedan: { top: 34, acceleration: 14, grip: 1.95, label: 'Bay Sedan' },
      hatch: { top: 31, acceleration: 13, grip: 2.0, label: 'Palmetto Hatch' },
      pickup: { top: 32, acceleration: 12.5, grip: 1.75, label: 'Dockhand Pickup' },
      taxi: { top: 34, acceleration: 14, grip: 1.95, label: 'Solana Taxi' },
      police: { top: 41, acceleration: 18, grip: 2.2, label: 'SBPD Cruiser' },
    };
    Object.assign(this, stats[kind] || stats.sedan);
    this.topSpeedKmh = Math.round(this.top * 3.6);
  }

  get speedKmh() {
    return Math.abs(this.speed) * 3.6;
  }

  get forward() {
    return forwardFromHeading(this.heading);
  }

  repair() {
    this.health = 100;
  }

  updatePlayer(dt, control, city) {
    this.impactCooldown = Math.max(0, this.impactCooldown - dt);
    const disabled = this.health <= 0;
    const throttle = disabled ? 0 : control.throttle;
    const handbrake = !disabled && control.handbrake;
    if (throttle > 0) {
      this.speed += this.acceleration * throttle * dt * (1 - Math.max(this.speed, 0) / (this.top + 9));
    } else if (throttle < 0) {
      if (this.speed > 0.5) this.speed -= 30 * dt;
      else this.speed += 9 * throttle * dt;
    }
    if (handbrake) this.speed -= this.speed * 1.45 * dt;
    const drag = handbrake ? 0.35 : 0.12;
    this.speed -= this.speed * drag * dt;
    if (!throttle && Math.abs(this.speed) < 0.08) this.speed = 0;
    this.speed = clamp(this.speed, -11, this.top);

    const speedRatio = clamp(Math.abs(this.speed) / 13, 0, 1);
    const steerTarget = disabled ? 0 : control.steer;
    this.steer = lerp(this.steer, steerTarget, 1 - Math.pow(0.0001, dt));
    const turnRate = this.steer * this.grip * speedRatio * (this.speed < 0 ? -1 : 1);
    this.heading += turnRate * dt * (handbrake ? 1.35 : 1);
    const alignment = handbrake ? 2.1 : 9;
    this.travelHeading = turnToward(this.travelHeading, this.heading, alignment * dt);
    return this.integrate(dt, city);
  }

  updateCruiser(dt, city, target, desiredSpeed) {
    this.impactCooldown = Math.max(0, this.impactCooldown - dt);
    const predicted = {
      x: target.x + (target.vx || 0) * 0.55,
      z: target.z + (target.vz || 0) * 0.55,
    };
    const dx = predicted.x - this.pos.x;
    const dz = predicted.z - this.pos.z;
    const targetHeading = Math.atan2(dx, -dz);
    this.heading = turnToward(this.heading, targetHeading, 1.85 * dt);
    const distance = Math.hypot(dx, dz);
    const speedGoal = clamp(desiredSpeed, 0, this.top) * (distance < 5 ? 0.45 : 1);
    if (this.speed < speedGoal) this.speed += this.acceleration * dt * 0.88;
    else this.speed -= 22 * dt;
    this.travelHeading = turnToward(this.travelHeading, this.heading, 7 * dt);
    return this.integrate(dt, city);
  }

  integrate(dt, city) {
    const beforeX = this.pos.x;
    const beforeZ = this.pos.z;
    const travel = forwardFromHeading(this.travelHeading);
    this.pos.x += travel.x * this.speed * dt;
    this.pos.z += travel.z * this.speed * dt;
    this.wheelSpin += this.speed * dt * 1.7;
    let impact = 0;
    if (city && city.collideCircle(this.pos, 2.05)) {
      const travelled = Math.hypot(this.pos.x - beforeX, this.pos.z - beforeZ);
      if (Math.abs(this.speed) > 5 && this.impactCooldown <= 0) {
        impact = Math.abs(this.speed);
        this.lastImpact = impact;
        this.impactCooldown = 0.45;
        this.health = Math.max(0, this.health - impact * 0.55);
      }
      this.speed *= travelled < 0.01 ? -0.18 : 0.42;
      this.travelHeading = this.heading;
    }
    return impact;
  }
}

export function collideCars(a, b) {
  const dx = b.pos.x - a.pos.x;
  const dz = b.pos.z - a.pos.z;
  const distance = Math.hypot(dx, dz);
  const minimum = 3.65;
  if (distance >= minimum || distance === 0) return 0;
  const nx = dx / distance;
  const nz = dz / distance;
  const push = (minimum - distance) / 2;
  a.pos.x -= nx * push;
  a.pos.z -= nz * push;
  b.pos.x += nx * push;
  b.pos.z += nz * push;
  const relative = Math.abs(a.speed - b.speed) + Math.min(Math.abs(a.speed), Math.abs(b.speed)) * 0.25;
  if (relative > 4) {
    a.health = Math.max(0, a.health - relative * 0.35);
    b.health = Math.max(0, b.health - relative * 0.35);
    a.speed *= 0.55;
    b.speed *= 0.55;
    return relative;
  }
  return 0;
}

class TrafficBrain {
  constructor(car, city, rng) {
    this.car = car;
    this.city = city;
    this.rng = rng;
    this.cruise = 9 + rng() * 4.5;
    this.chooseInitialRoute();
  }

  chooseInitialRoute() {
    const car = this.car;
    const nearestX = this.city.verticalRoads.reduce((best, x) =>
      Math.abs(x - car.pos.x) < Math.abs(best - car.pos.x) ? x : best, this.city.verticalRoads[0]);
    const nearestZ = this.city.horizontalRoads.reduce((best, z) =>
      Math.abs(z - car.pos.z) < Math.abs(best - car.pos.z) ? z : best, this.city.horizontalRoads[0]);
    if (Math.abs(nearestX - car.pos.x) < Math.abs(nearestZ - car.pos.z)) {
      this.axis = 'z';
      this.fixed = nearestX;
      this.direction = car.heading > Math.PI / 2 && car.heading < Math.PI * 1.5 ? 1 : -1;
      if (Math.cos(car.heading) > 0) this.direction = 1;
      if (Math.cos(car.heading) < 0) this.direction = -1;
    } else {
      this.axis = 'x';
      this.fixed = nearestZ;
      this.direction = Math.sin(car.heading) >= 0 ? 1 : -1;
    }
    this.setLane();
    this.target = this.nextTarget();
  }

  setLane() {
    const car = this.car;
    if (this.axis === 'z') {
      const laneOffset = this.direction < 0 ? 3.1 : -3.1;
      car.pos.x = this.fixed + laneOffset;
      this.laneCoordinate = car.pos.x;
    } else {
      const laneOffset = this.direction > 0 ? 3.1 : -3.1;
      car.pos.z = this.fixed + laneOffset;
      this.laneCoordinate = car.pos.z;
    }
  }

  nextTarget() {
    const car = this.car;
    if (this.axis === 'z') {
      const choices = this.city.horizontalRoads.filter((z) =>
        this.direction < 0 ? z < car.pos.z - 4 : z > car.pos.z + 4);
      const z = this.direction < 0 ? Math.max(...choices, -106) : Math.min(...choices, 106);
      return { x: this.laneCoordinate, z };
    }
    const choices = this.city.verticalRoads.filter((x) =>
      this.direction < 0 ? x < car.pos.x - 4 : x > car.pos.x + 4);
    const x = this.direction < 0 ? Math.max(...choices, -142) : Math.min(...choices, 142);
    return { x, z: this.laneCoordinate };
  }

  chooseTurn() {
    const car = this.car;
    const roll = this.rng();
    if (roll < 0.52) {
      this.target = this.nextTarget();
      return;
    }
    if (this.axis === 'z') {
      const intersectionZ = this.city.horizontalRoads.reduce((best, z) =>
        Math.abs(z - car.pos.z) < Math.abs(best - car.pos.z) ? z : best, this.city.horizontalRoads[0]);
      this.axis = 'x';
      this.fixed = intersectionZ;
      this.direction = roll < 0.76 ? 1 : -1;
      this.setLane();
      car.pos.z = intersectionZ + (this.direction > 0 ? 3.1 : -3.1);
      this.target = this.nextTarget();
    } else {
      const intersectionX = this.city.verticalRoads.reduce((best, x) =>
        Math.abs(x - car.pos.x) < Math.abs(best - car.pos.x) ? x : best, this.city.verticalRoads[0]);
      this.axis = 'z';
      this.fixed = intersectionX;
      this.direction = roll < 0.76 ? -1 : 1;
      this.setLane();
      car.pos.x = intersectionX + (this.direction < 0 ? 3.1 : -3.1);
      this.target = this.nextTarget();
    }
  }

  update(dt, obstacles) {
    const car = this.car;
    const dx = this.target.x - car.pos.x;
    const dz = this.target.z - car.pos.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 4.2) this.chooseTurn();
    const desiredHeading = Math.atan2(dx, -dz);
    car.heading = turnToward(car.heading, desiredHeading, 2.3 * dt);
    car.travelHeading = turnToward(car.travelHeading, car.heading, 8 * dt);

    let goal = this.cruise;
    const forward = forwardFromHeading(car.heading);
    for (const obstacle of obstacles) {
      if (obstacle === car) continue;
      const ox = obstacle.pos.x - car.pos.x;
      const oz = obstacle.pos.z - car.pos.z;
      const ahead = ox * forward.x + oz * forward.z;
      const side = Math.abs(ox * -forward.z + oz * forward.x);
      if (ahead > 0 && ahead < 11 && side < 3.2) goal = Math.min(goal, ahead < 5 ? 0 : 4);
    }
    if (car.speed < goal) car.speed += car.acceleration * 0.55 * dt;
    else car.speed -= 24 * dt;
    car.speed = clamp(car.speed, 0, car.top);
    car.pos.x += forward.x * car.speed * dt;
    car.pos.z += forward.z * car.speed * dt;
    car.wheelSpin += car.speed * dt * 1.7;
  }
}

export function createTrafficFleet(city, rng, count = 13) {
  const kinds = ['sedan', 'hatch', 'coupe', 'pickup', 'taxi'];
  const fleet = [];
  for (let i = 0; i < count; i++) {
    const vertical = i % 2 === 0;
    const road = vertical
      ? city.verticalRoads[Math.floor(rng() * city.verticalRoads.length)]
      : city.horizontalRoads[Math.floor(rng() * city.horizontalRoads.length)];
    const along = -95 + rng() * 190;
    const heading = vertical ? (rng() > 0.5 ? 0 : Math.PI) : (rng() > 0.5 ? Math.PI / 2 : -Math.PI / 2);
    const x = vertical ? road : clamp(along, -140, 140);
    const z = vertical ? clamp(along, -100, 100) : road;
    const kind = kinds[Math.floor(rng() * kinds.length)];
    const color = kind === 'taxi' ? [0.98, 0.72, 0.08] : CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
    const car = new Car(kind, x, z, heading, color, 'traffic');
    car.brain = new TrafficBrain(car, city, rng);
    fleet.push(car);
  }
  return fleet;
}

export function createParkedCars(city, rng, count = 24) {
  const kinds = ['sedan', 'hatch', 'coupe', 'pickup'];
  const spots = [...city.parkedSpots];
  const cars = [];
  for (let i = 0; i < Math.min(count, spots.length); i++) {
    const index = Math.floor(rng() * spots.length);
    const spot = spots.splice(index, 1)[0];
    const kind = kinds[Math.floor(rng() * kinds.length)];
    cars.push(new Car(kind, spot.x, spot.z, spot.heading,
      CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)], 'parked'));
  }
  return cars;
}

function localMatrix(car, lx, ly, lz, rx = 0, ry = 0, rz = 0) {
  const cos = Math.cos(car.heading);
  const sin = Math.sin(car.heading);
  const right = { x: cos, z: sin };
  const backward = { x: -sin, z: cos };
  return mat4Compose(
    car.pos.x + right.x * lx + backward.x * lz,
    ly,
    car.pos.z + right.z * lx + backward.z * lz,
    rx, -car.heading + ry, rz, 1, 1, 1);
}

function localBox(batch, car, lx, ly, lz, width, height, depth, color, rx = 0, ry = 0, rz = 0) {
  batch.addBox(localMatrix(car, lx, ly, lz, rx, ry, rz), width, height, depth, color);
}

export function drawCar(batch, car, elapsed = 0) {
  const paint = [car.color[0], car.color[1], car.color[2], 1];
  const dark = [0.05, 0.07, 0.09, 1];
  const glass = [0.08, 0.18, 0.24, 1];
  const isTruck = car.kind === 'pickup';
  const bodyHeight = isTruck ? 0.78 : 0.68;
  localBox(batch, car, 0, 0.58, 0, 1.95, bodyHeight, 4.45, paint);
  localBox(batch, car, 0, 0.32, 0, 2.02, 0.28, 4.55, [paint[0] * 0.72, paint[1] * 0.72, paint[2] * 0.72, 1]);
  if (isTruck) {
    localBox(batch, car, 0, 1.2, 1.05, 1.8, 0.72, 1.65, glass);
    localBox(batch, car, 0, 0.98, -1.25, 1.82, 0.42, 1.7, paint);
  } else {
    const cabinLength = car.kind === 'coupe' ? 2.0 : 2.3;
    localBox(batch, car, 0, 1.12, 0.18, 1.68, 0.62, cabinLength, glass);
    localBox(batch, car, 0, 1.47, 0.18, 1.5, 0.12, cabinLength * 0.82, paint);
  }
  if (car.kind === 'taxi') {
    localBox(batch, car, 0, 1.62, 0.2, 0.9, 0.28, 0.5, [1, 0.82, 0.1, 1]);
  }
  if (car.kind === 'police') {
    localBox(batch, car, 0, 0.62, 0, 2.0, 0.72, 4.5, [0.08, 0.09, 0.11, 1]);
    localBox(batch, car, 0, 1.13, 0.15, 1.7, 0.58, 2.25, [0.88, 0.9, 0.92, 1]);
    const phase = Math.floor(elapsed * 5) % 2 === 0;
    localBox(batch, car, -0.42, 1.58, 0.15, 0.72, 0.24, 0.55, phase ? [1, 0.08, 0.08, 1] : [0.35, 0.05, 0.05, 1]);
    localBox(batch, car, 0.42, 1.58, 0.15, 0.72, 0.24, 0.55, phase ? [0.05, 0.08, 0.35, 1] : [0.1, 0.3, 1, 1]);
    localBox(batch, car, 0, 0.66, 0, 2.02, 0.38, 1.05, [0.92, 0.93, 0.95, 1]);
  }
  localBox(batch, car, -0.68, 0.68, -2.26, 0.42, 0.24, 0.08, [1, 0.86, 0.45, 1]);
  localBox(batch, car, 0.68, 0.68, -2.26, 0.42, 0.24, 0.08, [1, 0.86, 0.45, 1]);
  localBox(batch, car, -0.68, 0.68, 2.26, 0.42, 0.24, 0.08, [0.9, 0.08, 0.08, 1]);
  localBox(batch, car, 0.68, 0.68, 2.26, 0.42, 0.24, 0.08, [0.9, 0.08, 0.08, 1]);
  const wheelPositions = [[-1.02, -1.45], [1.02, -1.45], [-1.02, 1.45], [1.02, 1.45]];
  for (const [lx, lz] of wheelPositions) {
    const steerAngle = lz < 0 ? car.steer * 0.42 : 0;
    localBox(batch, car, lx, 0.36, lz, 0.28, 0.68, 0.68, dark, car.wheelSpin, steerAngle, 0);
    localBox(batch, car, lx * 1.015, 0.36, lz, 0.3, 0.3, 0.3, [0.68, 0.7, 0.72, 1], car.wheelSpin, steerAngle, 0);
  }
  if (car.health < 48) {
    const puff = 0.55 + Math.sin(elapsed * 7 + car.pos.x) * 0.16;
    localBox(batch, car, 0, 1.35 + (elapsed % 1) * 0.5, -1.65, puff, puff, puff,
      [0.32, 0.32, 0.32, 0.42]);
  }
  // A soft dark contact patch grounds the model without a shadow map.
  localBox(batch, car, 0, 0.035, 0, 2.25, 0.025, 4.8, [0, 0, 0, 0.24]);
}
