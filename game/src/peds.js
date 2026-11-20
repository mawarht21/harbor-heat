// Pedestrians and the player character: jointed-looking box people whose
// limbs swing from timers rather than from a skeletal rig.

import { clamp, mat4Compose } from './engine.js';
import { angleDifference, turnToward } from './vehicles.js';

const SKIN = [[0.96, 0.72, 0.52], [0.62, 0.4, 0.26], [0.42, 0.27, 0.18], [0.98, 0.8, 0.64]];
const SHIRTS = [[0.9, 0.3, 0.24], [0.2, 0.55, 0.75], [0.95, 0.68, 0.2], [0.35, 0.72, 0.45], [0.72, 0.45, 0.78], [0.9, 0.88, 0.82]];
const PANTS = [[0.12, 0.18, 0.28], [0.25, 0.25, 0.28], [0.45, 0.32, 0.2], [0.15, 0.38, 0.42]];

function basis(heading) {
  return {
    right: { x: Math.cos(heading), z: Math.sin(heading) },
    backward: { x: -Math.sin(heading), z: Math.cos(heading) },
  };
}

function localMatrix(person, lx, ly, lz, rx = 0, ry = 0, rz = 0) {
  const { right, backward } = basis(person.heading);
  return mat4Compose(
    person.pos.x + right.x * lx + backward.x * lz,
    ly,
    person.pos.z + right.z * lx + backward.z * lz,
    rx, -person.heading + ry, rz, 1, 1, 1);
}

function part(batch, person, lx, ly, lz, width, height, depth, color, rx = 0, ry = 0, rz = 0) {
  batch.addBox(localMatrix(person, lx, ly, lz, rx, ry, rz), width, height, depth, color);
}

export function drawHumanoid(batch, person, elapsed = 0) {
  const speedFactor = clamp(Math.abs(person.speed || 0) / 4, 0, 1.4);
  const swing = Math.sin(person.phase || 0) * 0.42 * speedFactor;
  const bob = Math.abs(Math.cos(person.phase || 0)) * 0.055 * speedFactor;
  const skin = [...person.skin, 1];
  const shirt = [...person.shirt, 1];
  const pants = [...person.pants, 1];
  // Contact shadow.
  part(batch, person, 0, 0.03, 0, 0.95, 0.025, 0.95, [0, 0, 0, 0.22]);
  // Legs swing in opposite phase; feet stay as simple dark shoes.
  part(batch, person, -0.17, 0.48 + bob * 0.2, swing * 0.42, 0.25, 0.88, 0.28, pants, swing * 0.55);
  part(batch, person, 0.17, 0.48 + bob * 0.2, -swing * 0.42, 0.25, 0.88, 0.28, pants, -swing * 0.55);
  part(batch, person, -0.17, 0.06, swing * 0.58, 0.28, 0.12, 0.48, [0.08, 0.08, 0.09, 1], swing * 0.55);
  part(batch, person, 0.17, 0.06, -swing * 0.58, 0.28, 0.12, 0.48, [0.08, 0.08, 0.09, 1], -swing * 0.55);
  // Torso and arms.
  part(batch, person, 0, 1.22 + bob, 0, 0.72, 0.72, 0.38, shirt);
  part(batch, person, -0.49, 1.2 + bob, -swing * 0.36, 0.2, 0.78, 0.22, shirt, -swing * 0.7);
  part(batch, person, 0.49, 1.2 + bob, swing * 0.36, 0.2, 0.78, 0.22, shirt, swing * 0.7);
  part(batch, person, -0.49, 0.78 + bob, -swing * 0.48, 0.18, 0.18, 0.2, skin, -swing * 0.7);
  part(batch, person, 0.49, 0.78 + bob, swing * 0.48, 0.18, 0.18, 0.2, skin, swing * 0.7);
  // Head, hair and a simple cap brim for the player make silhouettes differ.
  part(batch, person, 0, 1.83 + bob, 0, 0.48, 0.52, 0.46, skin);
  part(batch, person, 0, 2.08 + bob, 0.02, 0.52, 0.16, 0.5, person.hair);
  if (person.isPlayer) {
    part(batch, person, 0, 2.02 + bob, -0.34, 0.54, 0.09, 0.32, [0.08, 0.55, 0.58, 1]);
    part(batch, person, 0, 1.28 + bob, 0.22, 0.56, 0.42, 0.08, [1, 0.48, 0.25, 1]);
  }
  if (person.waiting) {
    const bounce = 1.75 + Math.sin(elapsed * 3.2) * 0.12;
    part(batch, person, 0, bounce, 0, 0.18, 0.55, 0.18, [1, 0.78, 0.08, 1]);
    part(batch, person, 0, bounce + 0.38, 0, 0.42, 0.18, 0.18, [1, 0.78, 0.08, 1]);
  }
}

export class Ped {
  constructor(city, rng, index) {
    this.city = city;
    this.rng = rng;
    this.skin = SKIN[Math.floor(rng() * SKIN.length)];
    this.shirt = SHIRTS[Math.floor(rng() * SHIRTS.length)];
    this.pants = PANTS[Math.floor(rng() * PANTS.length)];
    this.hair = [0.08 + rng() * 0.2, 0.06 + rng() * 0.12, 0.05, 1];
    this.phase = rng() * Math.PI * 2;
    this.speed = 0;
    this.panic = 0;
    this.waiting = false;
    this.role = 'walker';
    this.placeOnSidewalk(index);
    this.chooseTarget();
  }

  placeOnSidewalk(index) {
    const vertical = index % 2 === 0;
    const roadX = this.city.verticalRoads[index % this.city.verticalRoads.length];
    const roadZ = this.city.horizontalRoads[index % this.city.horizontalRoads.length];
    const side = index % 4 < 2 ? -10.6 : 10.6;
    this.verticalStrip = vertical;
    this.pos = vertical
      ? { x: roadX + side, z: -95 + this.rng() * 190 }
      : { x: -140 + this.rng() * 280, z: roadZ + side };
    this.stripCoordinate = vertical ? this.pos.x : this.pos.z;
    this.heading = vertical ? 0 : Math.PI / 2;
  }

  chooseTarget() {
    if (this.verticalStrip) {
      this.target = { x: this.stripCoordinate, z: -104 + this.rng() * 208 };
    } else {
      this.target = { x: -148 + this.rng() * 296, z: this.stripCoordinate };
    }
  }

  scareFrom(x, z) {
    const distance = Math.hypot(this.pos.x - x, this.pos.z - z);
    if (distance < 17) {
      this.panic = 3.5;
      this.fleeHeading = Math.atan2(this.pos.x - x, -(this.pos.z - z));
    }
  }

  update(dt) {
    if (this.waiting) {
      this.speed = 0;
      return;
    }
    let desiredSpeed = 1.25 + (this.phase % 0.7);
    if (this.panic > 0) {
      this.panic -= dt;
      desiredSpeed = 4.6;
      this.heading = turnToward(this.heading, this.fleeHeading, 7 * dt);
    } else {
      const dx = this.target.x - this.pos.x;
      const dz = this.target.z - this.pos.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 1.2) {
        if (this.rng() > 0.45) {
          // Turn onto the crossing sidewalk at an intersection sometimes;
          // otherwise simply walk the same strip in the other direction.
          this.verticalStrip = !this.verticalStrip;
          if (this.verticalStrip) {
            const roadX = this.city.verticalRoads.reduce((best, x) =>
              Math.abs(x - this.pos.x) < Math.abs(best - this.pos.x) ? x : best, this.city.verticalRoads[0]);
            this.stripCoordinate = roadX + (this.rng() > 0.5 ? 10.6 : -10.6);
            this.pos.x = this.stripCoordinate;
          } else {
            const roadZ = this.city.horizontalRoads.reduce((best, z) =>
              Math.abs(z - this.pos.z) < Math.abs(best - this.pos.z) ? z : best, this.city.horizontalRoads[0]);
            this.stripCoordinate = roadZ + (this.rng() > 0.5 ? 10.6 : -10.6);
            this.pos.z = this.stripCoordinate;
          }
        }
        this.chooseTarget();
      } else {
        const targetHeading = Math.atan2(dx, -dz);
        this.heading = turnToward(this.heading, targetHeading, 5.5 * dt);
      }
    }
    this.speed = desiredSpeed;
    this.phase += dt * (4 + desiredSpeed * 1.25);
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += -Math.cos(this.heading) * this.speed * dt;
    this.city.collideCircle(this.pos, 0.42);
  }
}

export class PlayerPed {
  constructor(x, z) {
    this.pos = { x, z };
    this.heading = Math.PI / 2;
    this.phase = 0;
    this.speed = 0;
    this.skin = SKIN[0];
    this.shirt = [1, 0.42, 0.22];
    this.pants = [0.08, 0.42, 0.46];
    this.hair = [0.1, 0.07, 0.05, 1];
    this.isPlayer = true;
  }

  update(dt, move, cameraHeading, running, city) {
    const length = Math.hypot(move.x, move.z);
    if (length > 0.05) {
      const nx = move.x / Math.max(length, 1);
      const nz = move.z / Math.max(length, 1);
      const sin = Math.sin(cameraHeading);
      const cos = Math.cos(cameraHeading);
      // Input z is screen-forward; rotate it into the camera's ground plane.
      const worldX = nx * cos + nz * sin;
      const worldZ = nx * sin - nz * cos;
      const targetHeading = Math.atan2(worldX, -worldZ);
      this.heading = turnToward(this.heading, targetHeading, 13 * dt);
      this.speed = running ? 7.2 : 4.1;
      this.phase += dt * (running ? 11 : 8);
      this.pos.x += Math.sin(this.heading) * this.speed * dt;
      this.pos.z += -Math.cos(this.heading) * this.speed * dt;
      city.collideCircle(this.pos, 0.48);
    } else {
      this.speed = 0;
    }
  }
}

export function createPedestrians(city, rng, count = 22) {
  const peds = [];
  for (let i = 0; i < count; i++) peds.push(new Ped(city, rng, i));
  return peds;
}
