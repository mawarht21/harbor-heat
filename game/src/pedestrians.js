// Pedestrians: Solana Bay citizens who stroll the sidewalks, chat in pairs, run
// from danger, and — in the Old Market mission — a few enforcers who fight back.

import { PLAYER } from './config.js';
import { ROAD_XS, ROAD_YS, collideCircleWithBuildings } from './city.js';
import { createRandom, pick, randRange } from './random.js';
import { addCrime } from './wanted.js';
import { CRIMES } from './config.js';
import { dropCashPickup } from './combat.js';

const SHIRTS = ['#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#ffc6ff', '#ffadad', '#e9e4d8', '#06d6a0'];

export function spawnPedestrians(seed, count) {
  const rng = createRandom(seed * 104729 + 3);
  const peds = [];
  for (let i = 0; i < (count || 42); i++) {
    const vertical = rng() < 0.5;
    const ped = {
      x: 0, y: 0, angle: randRange(rng, 0, Math.PI * 2),
      speed: randRange(rng, 34, 62), walkPhase: randRange(rng, 0, 6),
      color: pick(rng, SHIRTS), skin: pick(rng, ['#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#ffdbac']),
      state: 'walk', panic: 0, health: 100, dead: false, enforcer: false,
      targetX: 0, targetY: 0, retarget: randRange(rng, 0, 3), axis: vertical ? 'y' : 'x',
    };
    if (vertical) {
      const rx = pick(rng, ROAD_XS);
      ped.x = rx + (rng() < 0.5 ? -72 : 72); ped.y = randRange(rng, 120, 2280);
    } else {
      const ry = pick(rng, ROAD_YS);
      ped.y = ry + (rng() < 0.5 ? -72 : 72); ped.x = randRange(rng, 120, 3480);
    }
    ped.targetX = ped.x; ped.targetY = ped.y;
    peds.push(ped);
  }
  return peds;
}

export function makeEnforcer(x, y, name) {
  return {
    x, y, angle: 0, speed: 92, walkPhase: 0, color: '#22223a', skin: '#c68642',
    state: 'guard', panic: 0, health: 100, dead: false, enforcer: true, name,
    targetX: x, targetY: y, retarget: 0, axis: 'x', attackCd: 0,
  };
}

export function updatePedestrians(state, dt) {
  const p = state.player;
  for (const ped of state.peds) {
    if (ped.dead) continue;
    ped.walkPhase += dt * (ped.state === 'flee' ? 13 : 7);
    const distPlayer = Math.hypot(p.x - ped.x, p.y - ped.y);
    const dangerCar = p.inCar && Math.abs(p.inCar.speed) > 130 && distPlayer < 130;
    if (dangerCar || ped.panic > 0) ped.state = 'flee';
    else if (ped.enforcer && distPlayer < 240 && state.mission.index === 2 && state.mission.stage >= 1) ped.state = 'fight';
    else if (ped.state !== 'fight') ped.state = 'walk';
    if (ped.panic > 0) ped.panic -= dt;

    if (ped.state === 'flee') {
      const away = Math.atan2(ped.y - p.y, ped.x - p.x);
      ped.angle = away;
      ped.x += Math.cos(away) * 148 * dt;
      ped.y += Math.sin(away) * 148 * dt;
      if (distPlayer > 240) ped.state = 'walk';
    } else if (ped.state === 'fight') {
      const toward = Math.atan2(p.y - ped.y, p.x - ped.x);
      ped.angle = toward;
      if (distPlayer > 34) { ped.x += Math.cos(toward) * ped.speed * dt; ped.y += Math.sin(toward) * ped.speed * dt; }
      ped.attackCd -= dt;
      if (distPlayer < 40 && ped.attackCd <= 0) {
        ped.attackCd = 0.9;
        p.health -= 6;
        state.hurtFlash = 0.35;
        state.cameraShake = Math.max(state.cameraShake, 0.12);
        if (state.audio) state.audio.hit();
        if (p.health <= 0) { p.health = 0; state.mode = 'gameover'; }
      }
    } else {
      ped.retarget -= dt;
      if (ped.retarget <= 0 || Math.hypot(ped.targetX - ped.x, ped.targetY - ped.y) < 12) {
        ped.retarget = randRange(state.rng, 2.5, 6);
        // Stroll along the sidewalk: keep one axis, wander the other.
        if (ped.axis === 'y') { ped.targetY = Math.max(90, Math.min(2320, ped.y + randRange(state.rng, -420, 420))); ped.targetX = ped.x + randRange(state.rng, -14, 14); }
        else { ped.targetX = Math.max(90, Math.min(3510, ped.x + randRange(state.rng, -420, 420))); ped.targetY = ped.y + randRange(state.rng, -14, 14); }
      }
      const toward = Math.atan2(ped.targetY - ped.y, ped.targetX - ped.x);
      ped.angle = toward;
      ped.x += Math.cos(toward) * ped.speed * dt;
      ped.y += Math.sin(toward) * ped.speed * dt;
    }
    collideCircleWithBuildings(state.city, ped, 11);
    // A fast car meeting a pedestrian is the city's worst crime scene.
    if (p.inCar && Math.abs(p.inCar.speed) > 60 && Math.hypot(p.inCar.x - ped.x, p.inCar.y - ped.y) < 30 && !ped.dead) {
      ped.health -= Math.abs(p.inCar.speed) * 0.45;
      ped.panic = 4;
      if (ped.health <= 0) {
        ped.dead = true; state.stats.pedsDown++;
        if (ped.enforcer) dropCashPickup(state, ped.x, ped.y);
      }
      addCrime(state, CRIMES.hitPedestrian, 'Pedestrian hit');
      p.inCar.speed *= 0.55;
      state.cameraShake = Math.max(state.cameraShake, 0.25);
    }
  }
  // Foot cops are pedestrians with a badge, updated by police.js through this list too.
  void PLAYER;
}
