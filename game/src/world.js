// The whole game state in one object, plus the on-foot player update.
// Every other system module reads and writes this state; main.js runs them in order.

import { DAY, PLAYER, WORLD } from './config.js';
import { buildCity, LOCATIONS, collideCircleWithBuildings } from './city.js';
import { createRandom } from './random.js';
import { spawnVehicles } from './vehicles.js';
import { spawnPedestrians } from './pedestrians.js';
import { createWanted } from './wanted.js';
import { createMissionState } from './missions.js';

export function createGameState(seed, audio) {
  const rng = createRandom(seed * 2654435761 % 2147483647);
  const city = buildCity(seed);
  const state = {
    mode: 'title',
    time: 0,
    dayTime: DAY.start,
    seed,
    rng,
    audio: audio || null,
    city,
    cars: spawnVehicles(city, seed),
    peds: spawnPedestrians(seed, 44),
    policeCars: [],
    footCops: [],
    bullets: [],
    particles: [],
    player: {
      x: LOCATIONS.start.x, y: LOCATIONS.start.y, angle: -Math.PI / 2,
      health: PLAYER.health, money: 120, respect: 0,
      inCar: null, weapon: 'fists', attackCd: 0, punchAnim: 0, moving: false,
    },
    camera: { x: 0, y: 0 },
    wanted: createWanted(),
    mission: createMissionState(),
    side: { taxi: null, race: null, taxiDone: 0, racesWon: 0 },
    storyDone: false,
    stats: { missionsDone: 0, pedsDown: 0, enforcersDown: 0, carsStolen: 0 },
    toast: '', toastTime: 0,
    crimeText: '', crimeFlash: 0,
    hurtFlash: 0, saveFlash: 0, cameraShake: 0,
    spawnTimer: 0, crashCooldown: 0, speedKmh: 0,
    district: 'PALM HEIGHTS',
  };
  return state;
}

export function updatePlayerOnFoot(state, input, dt) {
  const p = state.player;
  if (p.inCar) { p.moving = false; return; }
  const ax = input.axisX();
  const ay = input.axisY();
  const len = Math.hypot(ax, ay);
  p.moving = len > 0;
  if (len > 0) {
    const speed = input.sprint() ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    const nx = (ax / len) * speed * dt;
    const ny = (ay / len) * speed * dt;
    p.x += nx; p.y += ny;
    p.angle = Math.atan2(ay, ax);
    p.walkPhase = (p.walkPhase || 0) + dt * (input.sprint() ? 13 : 9);
  }
  collideCircleWithBuildings(state.city, p, PLAYER.radius);
  p.x = Math.max(20, Math.min(WORLD.width - 20, p.x));
  p.y = Math.max(20, Math.min(2460, p.y));
}

export function updateCamera(state, dt) {
  const p = state.player;
  const lookX = p.inCar ? Math.cos(p.inCar.angle) * p.inCar.speed * 0.32 : 0;
  const lookY = p.inCar ? Math.sin(p.inCar.angle) * p.inCar.speed * 0.32 : 0;
  const targetX = p.x + lookX - 640;
  const targetY = p.y + lookY - 360;
  const k = Math.min(1, dt * 5.5);
  state.camera.x += (targetX - state.camera.x) * k;
  state.camera.y += (targetY - state.camera.y) * k;
  state.camera.x = Math.max(-140, Math.min(WORLD.width - 1280 + 140, state.camera.x));
  state.camera.y = Math.max(-90, Math.min(2540 - 720 + 90, state.camera.y));
  if (state.cameraShake > 0) state.cameraShake = Math.max(0, state.cameraShake - dt * 1.4);
}

export function districtAt(x, y) {
  if (y > 2280) return x < 1100 ? 'MARINA PIER' : 'THE DOCKS';
  if (x > 2300 && y > 1000 && y < 1900) return 'NEON ROW';
  if (x > 2700 && y < 700) return 'HARBOR GARAGE';
  if (x > 1650 && x < 2350 && y < 1050) return 'OLD MARKET';
  if (x < 1250 && y < 1100) return 'PALM HEIGHTS';
  return 'SOLANA BAY';
}
