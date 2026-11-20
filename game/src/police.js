// SBPD response: predictive cruisers, static roadblocks at four stars,
// and AIR ONE at three.  Police use the same car physics as the player but
// a simpler steering goal: where the player will be half a second from now.

import { clamp, mat4Compose } from './engine.js';
import { Car, drawCar, forwardFromHeading } from './vehicles.js';

function pointInsideCollider(city, x, z) {
  for (const collider of city.colliders) {
    if (collider.height < 4) continue;
    if (x >= collider.minX - 0.2 && x <= collider.maxX + 0.2 &&
        z >= collider.minZ - 0.2 && z <= collider.maxZ + 0.2) return true;
  }
  return false;
}

export function hasLineOfSight(city, from, to) {
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  const steps = Math.max(1, Math.ceil(distance / 2.5));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = from.x + (to.x - from.x) * t;
    const z = from.z + (to.z - from.z) * t;
    if (pointInsideCollider(city, x, z)) return false;
  }
  return true;
}

export class PoliceSystem {
  constructor(city, rng) {
    this.city = city;
    this.rng = rng;
    this.cruisers = [];
    this.bust = 0;
    this.spawnTimer = 0;
    this.roadblockTimer = 0;
    this.heli = {
      active: false,
      pos: { x: 0, y: 34, z: 0 },
      heading: 0,
      orbit: 0,
    };
    this.nearestDistance = Infinity;
    this.visible = false;
  }

  reset() {
    this.cruisers.length = 0;
    this.bust = 0;
    this.heli.active = false;
    this.visible = false;
    this.nearestDistance = Infinity;
  }

  desiredCruisers(stars) {
    return [0, 2, 2, 3, 4, 6][stars] || 0;
  }

  spawnCruiser(playerPos, roadblock = false) {
    const city = this.city;
    const edges = [];
    for (const x of city.verticalRoads) {
      edges.push({ x, z: -104, heading: Math.PI });
      edges.push({ x, z: 104, heading: 0 });
    }
    for (const z of city.horizontalRoads) {
      edges.push({ x: -146, z, heading: Math.PI / 2 });
      edges.push({ x: 146, z, heading: -Math.PI / 2 });
    }
    edges.sort((a, b) =>
      Math.hypot(a.x - playerPos.x, a.z - playerPos.z) -
      Math.hypot(b.x - playerPos.x, b.z - playerPos.z));
    const spot = roadblock
      ? edges[Math.floor(this.rng() * Math.min(6, edges.length))]
      : edges[Math.floor(this.rng() * Math.min(8, edges.length))] || edges[0];
    const car = new Car('police', spot.x, spot.z, spot.heading, [0.92, 0.93, 0.95], 'police');
    car.mode = roadblock ? 'block' : 'chase';
    car.blockTimer = 0;
    this.cruisers.push(car);
    return car;
  }

  placeRoadblock(player) {
    const forward = forwardFromHeading(player.heading || 0);
    const ahead = {
      x: player.pos.x + forward.x * 48,
      z: player.pos.z + forward.z * 48,
    };
    const roadPoint = this.city.nearestRoadPoint(ahead.x, ahead.z);
    const blockers = this.cruisers.filter((car) => car.mode === 'block');
    while (blockers.length < 2) blockers.push(this.spawnCruiser(player.pos, true));
    blockers.forEach((car, index) => {
      const side = index === 0 ? -2.6 : 2.6;
      car.pos.x = roadPoint.x + (Math.abs(forward.x) > 0.5 ? 0 : side);
      car.pos.z = roadPoint.z + (Math.abs(forward.z) > 0.5 ? 0 : side);
      car.heading = (player.heading || 0) + Math.PI / 2;
      car.speed = 0;
      car.blockTimer = 16;
    });
    this.roadblockTimer = 17;
  }

  update(dt, player, wanted) {
    const stars = wanted.stars;
    this.spawnTimer -= dt;
    this.roadblockTimer -= dt;
    const desired = this.desiredCruisers(stars);
    if (stars > 0 && this.cruisers.filter((car) => car.mode === 'chase').length < desired && this.spawnTimer <= 0) {
      this.spawnCruiser(player.pos, false);
      this.spawnTimer = 1.4;
    }
    if (stars === 0 && this.cruisers.length) this.reset();

    if (stars >= 4 && this.roadblockTimer <= 0) this.placeRoadblock(player);

    this.visible = false;
    this.nearestDistance = Infinity;
    let closeAndSlow = false;
    const playerSpeed = Math.abs(player.speed || 0);
    for (const car of this.cruisers) {
      const distance = Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z);
      this.nearestDistance = Math.min(this.nearestDistance, distance);
      if (car.mode === 'block') {
        car.blockTimer -= dt;
        if (distance < 5.5 && playerSpeed < 1.4) closeAndSlow = true;
        continue;
      }
      if (distance > 155) {
        car.pos.x = player.pos.x + (this.rng() > 0.5 ? 120 : -120);
        car.pos.z = this.city.nearestRoadPoint(car.pos.x, player.pos.z).z;
      }
      const impact = car.updateCruiser(dt, this.city, {
        x: player.pos.x,
        z: player.pos.z,
        vx: (player.vx || 0),
        vz: (player.vz || 0),
      }, stars >= 4 ? 37 : 34);
      if (impact > 8) car.health = Math.max(35, car.health - 2);
      if (distance < 48 && hasLineOfSight(this.city, car.pos, player.pos)) this.visible = true;
      if (distance < 8.5 && playerSpeed < 1.35) closeAndSlow = true;
    }

    this.heli.active = stars >= 3;
    if (this.heli.active) {
      this.heli.orbit += dt * 0.42;
      const radius = 19;
      const targetX = player.pos.x + Math.cos(this.heli.orbit) * radius;
      const targetZ = player.pos.z + Math.sin(this.heli.orbit) * radius;
      this.heli.pos.x += (targetX - this.heli.pos.x) * Math.min(1, dt * 1.8);
      this.heli.pos.z += (targetZ - this.heli.pos.z) * Math.min(1, dt * 1.8);
      this.heli.pos.y = 32 + Math.sin(this.heli.orbit * 2.1) * 2;
      this.heli.heading = Math.atan2(player.pos.x - this.heli.pos.x, -(player.pos.z - this.heli.pos.z));
      this.spotlight = { x: player.pos.x, z: player.pos.z };
      if (Math.hypot(this.heli.pos.x - player.pos.x, this.heli.pos.z - player.pos.z) < 58) {
        this.visible = true;
      }
    }

    if (closeAndSlow && stars > 0) this.bust = Math.min(1, this.bust + dt / 3.1);
    else this.bust = Math.max(0, this.bust - dt * 0.42);
    return { visible: this.visible, busted: this.bust >= 1 };
  }

  get unitCount() {
    return this.cruisers.length + (this.heli.active ? 1 : 0);
  }

  get tacticLabel() {
    const blockers = this.cruisers.some((car) => car.mode === 'block');
    if (blockers) return 'ROADBLOCK';
    if (this.heli.active) return 'AIR UNIT';
    return this.cruisers.length ? 'PURSUIT' : 'PATROL';
  }

  draw(batch, glowBatch, elapsed) {
    for (const car of this.cruisers) {
      drawCar(batch, car, elapsed);
      if (car.mode === 'block') {
        const matrix = mat4Compose(car.pos.x, 0.55, car.pos.z, 0, -car.heading, 0, 1, 1, 1);
        batch.addBox(matrix, 5.8, 0.75, 0.42,
          Math.floor(elapsed * 2) % 2 ? [0.95, 0.42, 0.08, 1] : [0.92, 0.92, 0.9, 1]);
      }
    }
    if (!this.heli.active) return;
    const heli = this.heli;
    const matrix = mat4Compose(heli.pos.x, heli.pos.y, heli.pos.z, 0, -heli.heading, 0, 1, 1, 1);
    batch.addBox(matrix, 2.5, 1.7, 6.8, [0.08, 0.1, 0.13, 1]);
    batch.addBox(matrix, 1.6, 1.1, 2.2, [0.35, 0.65, 0.78, 1]);
    const tail = mat4Compose(heli.pos.x, heli.pos.y + 0.25, heli.pos.z, 0, -heli.heading, 0, 1, 1, 1);
    batch.addBox(tail, 0.55, 0.55, 6.5, [0.08, 0.1, 0.13, 1]);
    const rotorAngle = elapsed * 31;
    const rotor = mat4Compose(heli.pos.x, heli.pos.y + 1.15, heli.pos.z, 0, rotorAngle, 0, 1, 1, 1);
    batch.addBox(rotor, 10.5, 0.09, 0.42, [0.75, 0.78, 0.8, 0.8]);
    batch.addBox(rotor, 0.42, 0.09, 10.5, [0.75, 0.78, 0.8, 0.8]);
    // Spotlight: a translucent cone and a bright pool, both locked onto
    // the player's last known position rather than the helicopter itself.
    const spot = this.spotlight || heli.pos;
    const groundY = 0.12;
    const coneHeight = Math.max(8, heli.pos.y - groundY);
    const cone = mat4Compose(spot.x, groundY + coneHeight / 2, spot.z, 0, 0, 0, 1, 1, 1);
    glowBatch.addCylinder(cone, 7.5, 1.1, coneHeight, 14, [1, 0.9, 0.55, 0.13]);
    const pool = mat4Compose(spot.x, groundY, spot.z, 0, 0, 0, 1, 1, 1);
    glowBatch.addCylinder(pool, 7.2, 7.2, 0.12, 14, [1, 0.88, 0.5, 0.2]);
  }
}
