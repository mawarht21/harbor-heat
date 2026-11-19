// Solana Bay PD: patrol units spawn at the city edge in proportion to the wanted
// stars, chase with real steering, box the player in, and send foot cops for the
// final arrest when the player is on foot and cornered.

import { WORLD } from './config.js';
import { collideCarWithBuildings } from './city.js';
import { steerCarToward } from './vehicles.js';
import { randRange } from './random.js';

function makePoliceCar(state, i) {
  // Spawn off-screen at a city edge near-ish the player, never on top of them.
  const p = state.player;
  const side = i % 4;
  let x = p.x; let y = p.y;
  if (side === 0) { x = p.x - 520; y = p.y + randRange(state.rng, -260, 260); }
  if (side === 1) { x = p.x + 520; y = p.y + randRange(state.rng, -260, 260); }
  if (side === 2) { y = p.y - 450; x = p.x + randRange(state.rng, -260, 260); }
  if (side === 3) { y = p.y + 450; x = p.x + randRange(state.rng, -260, 260); }
  x = Math.max(50, Math.min(WORLD.width - 50, x));
  y = Math.max(50, Math.min(2380, y));
  return {
    x, y, angle: Math.atan2(p.y - y, p.x - x), speed: 0, steer: 0,
    color: '#eef1f5', name: 'SBPD Interceptor', topSpeed: 330, accelMul: 1.1,
    kind: 'police', health: 130, bump: 0, honk: 0, occupied: true, dead: false,
    lightPhase: randRange(state.rng, 0, 6), ram: 0,
  };
}

export function desiredPoliceCount(stars) {
  return [0, 2, 3, 5, 7, 9][Math.max(0, Math.min(5, stars))] || 0;
}

export function updatePolice(state, dt) {
  const stars = state.wanted.stars;
  const want = desiredPoliceCount(stars);
  state.spawnTimer -= dt;
  if (state.policeCars.length < want && state.spawnTimer <= 0) {
    state.spawnTimer = 1.4;
    state.policeCars.push(makePoliceCar(state, state.policeCars.length));
  }
  // When the heat is gone, units peel away and despawn at a distance.
  if (stars === 0) {
    state.policeCars = state.policeCars.filter((cop) => Math.hypot(cop.x - state.player.x, cop.y - state.player.y) < 900);
    for (const cop of state.policeCars) steerCarToward(cop, cop.x + Math.cos(cop.angle) * 300, cop.y + Math.sin(cop.angle) * 300, dt, 200, 1.5);
  }
  const p = state.player;
  const aggression = 1.6 + stars * 0.55;
  const topSpeed = 238 + stars * 24;
  for (const cop of state.policeCars) {
    if (cop.dead) continue;
    cop.lightPhase += dt * 9;
    // Aim at where the player will be in half a second, not where they were.
    const lead = p.inCar ? 0.45 : 0.2;
    const tx = p.x + (p.inCar ? Math.cos(p.inCar.angle) * p.inCar.speed * lead : 0);
    const ty = p.y + (p.inCar ? Math.sin(p.inCar.angle) * p.inCar.speed * lead : 0);
    if (stars > 0) steerCarToward(cop, tx, ty, dt, topSpeed, aggression);
    collideCarWithBuildings(state.city, cop);
    // Ramming: contact shoves the player's car and damages both.
    if (p.inCar && Math.hypot(cop.x - p.inCar.x, cop.y - p.inCar.y) < 44) {
      const a = Math.atan2(p.inCar.y - cop.y, p.inCar.x - cop.x);
      p.inCar.x += Math.cos(a) * 3.2; p.inCar.y += Math.sin(a) * 3.2;
      p.inCar.speed *= 0.94; cop.speed *= 0.9;
      cop.health -= dt * 9; p.inCar.health -= dt * 6;
      state.cameraShake = Math.max(state.cameraShake, 0.10);
    }
    if (cop.health <= 0) cop.dead = true;
  }
  state.policeCars = state.policeCars.filter((cop) => !cop.dead || Math.hypot(cop.x - p.x, cop.y - p.y) < 700);
  if (state.audio) state.audio.setSiren(stars > 0 && state.mode === 'play');

  // Foot cops: only at 3+ stars, only when the player is on foot.
  const wantFoot = !p.inCar && stars >= 3 ? Math.min(3, stars - 1) : 0;
  while (state.footCops.length < wantFoot) {
    const a = randRange(state.rng, 0, Math.PI * 2);
    state.footCops.push({
      x: p.x + Math.cos(a) * 330, y: p.y + Math.sin(a) * 330, angle: 0,
      speed: 138, walkPhase: 0, color: '#2b50c8', skin: '#e0ac69',
      state: 'chase', panic: 0, health: 100, dead: false, enforcer: false,
      targetX: p.x, targetY: p.y, retarget: 0, axis: 'x', attackCd: 0,
    });
  }
  if (wantFoot === 0 && state.footCops.length) {
    state.footCops = state.footCops.filter((cop) => Math.hypot(cop.x - p.x, cop.y - p.y) > 500);
  }
  for (const cop of state.footCops) {
    if (cop.dead) continue;
    cop.walkPhase += dt * 10;
    const d = Math.hypot(p.x - cop.x, p.y - cop.y);
    const toward = Math.atan2(p.y - cop.y, p.x - cop.x);
    cop.angle = toward;
    if (d > 30) { cop.x += Math.cos(toward) * cop.speed * dt; cop.y += Math.sin(toward) * cop.speed * dt; }
  }
}
