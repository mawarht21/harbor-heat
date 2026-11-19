// HARBOR HEAT 3D — boot, the game loop, the chase camera, the day/night sky,
// and every system wired together: driving, the SBPD, missions, side jobs.

import { Renderer, buildAtlas, clamp, lerp, dist2d, angleLerp, m4compose } from './engine.js';
import { buildCity, LOCATIONS, HIDING_SPOTS, lightPhase, collideCircle } from './city.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { Hud } from './hud.js';
import { spawnParkedCars, spawnTraffic, updateTraffic, driveCar, drawCar } from './vehicles.js';
import { spawnPeds, updatePeds, drawPeds, drawPickups, drawHumanoid, playerAttack, updatePickups, hurtPlayer } from './peds.js';
import { createWanted, addCrime, updateWanted, CRIMES } from './wanted.js';
import { updatePolice, drawHeli } from './police.js';
import {
  createMissionState, createSideState, startStoryMission, updateMissions,
  currentObjective, startTaxi, startRace, chopValue, showDialog,
} from './missions.js';
import { loadSave, storeSave, clearSave } from './save.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const R = new Renderer(canvas);
const atlas = buildAtlas(R.gl, Math.random);
R.atlas = atlas;
R.discUV = atlas.discUV;
const city = buildCity(R.gl, atlas, 7);
R.resize();
addEventListener('resize', () => R.resize());

const input = new Input();
const sfx = new Sfx();
const hud = new Hud();

function freshStats() {
  return { carsStolen: 0, missionsDone: 0, taxiFares: 0, racesWon: 0, chops: 0, enforcersDown: 0, cashPicked: 0, busts: 0, deaths: 0 };
}

function createState(save) {
  const state = {
    mode: 'title', frozen: false, started: false,
    time: 0, timeHours: 17.17, radioT: 0,
    rng: Math.random,
    city, cars: [], peds: [], police: [], heli: null, pickups: [],
    player: {
      x: LOCATIONS.start.x, z: LOCATIONS.start.z, heading: 0.49,
      health: 100, armour: 0, inCar: false, speedMag: 0, walkPhase: 0, punchT: 0, dead: false,
    },
    playerCar: null, missionCar: null,
    money: 120, respect: 0, hasPistol: false, weapon: 1, ammo: 0,
    wanted: createWanted(), lastSeenPos: { x: 0, z: 0 },
    mission: createMissionState(), side: createSideState(),
    storyDone: false, stats: freshStats(),
    damageFlash: 0, lastHurtCause: '', danger: null, muzzle: null,
    crimeCd: 0, attackCd: 0, spawnT: 0, roadblockCd: 0,
    nearTaxiStart: false, nearRaceStart: false,
    sfx, hud,
    onCrime: (pts, label) => addCrime(state, pts, label),
    onPedHit: () => addCrime(state, CRIMES.hitPed, 'Pedestrian down'),
    onWasted: (cause) => endRun(state, 'wasted', cause),
    onBusted: () => endRun(state, 'busted'),
  };
  if (save) {
    state.money = save.money ?? state.money;
    state.respect = save.respect ?? 0;
    state.mission.index = save.missionIndex ?? 0;
    state.storyDone = !!save.storyDone;
    state.hasPistol = !!save.hasPistol;
    if (state.hasPistol) { state.ammo = 48; }
    if (save.stats) Object.assign(state.stats, save.stats);
    if (save.timeHours) state.timeHours = save.timeHours;
  }
  spawnParkedCars(state);
  spawnTraffic(state, 16);
  spawnPeds(state, 26);
  return state;
}

function endRun(state, kind, cause) {
  if (state.mode !== 'playing') return;
  state.mode = kind;
  const fee = kind === 'busted' ? 200 : 150;
  state.stats[kind === 'busted' ? 'busts' : 'deaths']++;
  state.endFee = Math.min(state.money, fee);
  state.endCause = cause || (kind === 'busted' ? 'The SBPD finally boxed you in.' : 'You were wasted on the streets of Solana Bay.');
  const el = document.getElementById('endScreen');
  document.getElementById('endTitle').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  document.getElementById('endTitle').className = 'bad';
  document.getElementById('endText').textContent =
    `${state.endCause}\nThe city takes $${state.endFee}. You wake up outside Solana General.`;
  el.classList.remove('hidden');
  if (kind === 'busted') sfx.bustedJingle(); else sfx.fail();
  sfx.setSiren(false); sfx.setEngine(false);
}

function respawn(state) {
  const P = state.player;
  state.money -= state.endFee || 0;
  if (state.playerCar) { state.playerCar.kind = 'parked'; state.playerCar.speed = 0; state.playerCar = null; }
  P.inCar = false; P.dead = false; P.health = 100; P.armour = 0;
  P.x = LOCATIONS.hospital.x; P.z = LOCATIONS.hospital.z; P.heading = Math.PI / 2;
  state.wanted.heat = 0; state.wanted.stars = 0; state.wanted.bust = 0;
  for (const u of [...state.police]) {
    state.cars = state.cars.filter((c) => c !== u);
  }
  state.police = []; state.heli = null;
  if (state.mission.active && state.mission.index < 6) { /* keep the job; its timer may restart below */ }
  state.mode = 'playing';
  document.getElementById('endScreen').classList.add('hidden');
  storeSave(state);
}

function winGame(state) {
  state.mode = 'win';
  const el = document.getElementById('endScreen');
  document.getElementById('endTitle').textContent = 'HARBOR LEGEND';
  document.getElementById('endTitle').className = 'good';
  document.getElementById('endText').textContent =
    `All six jobs done. $${state.money.toLocaleString('en-US')} in your pocket, ${state.stats.carsStolen} cars stolen, ${state.stats.taxiFares} fares run.\nSolana Bay is yours — free roam, taxi fares and the Harbor Run still pay.`;
  el.classList.remove('hidden');
  sfx.success();
}

// ---------------------------------------------------------------- sky
const SKY_STOPS = [
  // hour, fog rgb, sun multiplier, ambient multiplier, night factor
  [0.0, [0.05, 0.07, 0.13], 0.25, 0.36, 1.0],
  [5.0, [0.05, 0.07, 0.13], 0.25, 0.36, 1.0],
  [6.5, [0.35, 0.27, 0.38], 0.6, 0.44, 0.5],
  [8.0, [0.62, 0.73, 0.85], 1.05, 0.58, 0.0],
  [16.5, [0.64, 0.74, 0.84], 1.05, 0.58, 0.0],
  [18.0, [0.93, 0.62, 0.38], 1.12, 0.52, 0.05],
  [19.3, [0.40, 0.27, 0.42], 0.6, 0.42, 0.5],
  [20.6, [0.06, 0.08, 0.15], 0.25, 0.36, 1.0],
  [24.0, [0.05, 0.07, 0.13], 0.25, 0.36, 1.0],
];
function skyAt(hours) {
  let a = SKY_STOPS[0], b = SKY_STOPS[SKY_STOPS.length - 1];
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    if (hours >= SKY_STOPS[i][0] && hours <= SKY_STOPS[i + 1][0]) { a = SKY_STOPS[i]; b = SKY_STOPS[i + 1]; break; }
  }
  const t = b[0] === a[0] ? 0 : (hours - a[0]) / (b[0] - a[0]);
  const fog = [lerp(a[1][0], b[1][0], t), lerp(a[1][1], b[1][1], t), lerp(a[1][2], b[1][2], t)];
  const sunMul = lerp(a[2], b[2], t), ambMul = lerp(a[3], b[3], t), night = lerp(a[4], b[4], t);
  const sunA = ((hours - 6) / 12) * Math.PI;
  const el = Math.sin(sunA);
  let dir = [Math.cos(sunA) * 0.9, Math.max(el, 0.06), 0.38];
  const moon = [-0.45, 0.75, 0.3];
  dir = [lerp(dir[0], moon[0], night), lerp(dir[1], moon[1], night), lerp(dir[2], moon[2], night)];
  const dl = Math.hypot(...dir); dir = dir.map((v) => v / dl);
  const warm = clamp(1 - Math.abs(el) * 2.4, 0, 1) * (1 - night);
  const sunCol = [
    (1.0 * sunMul),
    ((0.93 - warm * 0.3) * sunMul),
    ((0.82 - warm * 0.45) * sunMul),
  ].map((v) => v * (1 - night * 0.55));
  return {
    fog, night, sunDir: dir, sunCol,
    amb: [0.62 * ambMul, 0.66 * ambMul, 0.74 * ambMul],
    fogNear: lerp(135, 78, night), fogFar: lerp(560, 335, night),
  };
}

// ---------------------------------------------------------------- camera
const cam = { x: 0, y: 30, z: -40, lx: 0, ly: 0, lz: 0, init: false };
function updateCamera(state, dt) {
  const P = state.player;
  if (state.debugCam) {
    const d = state.debugCam;
    R.setCamera([d.x, d.y, d.z], [d.lx, d.ly, d.lz]);
    cam.x = d.x; cam.y = d.y; cam.z = d.z; cam.lx = d.lx; cam.ly = d.ly; cam.lz = d.lz; cam.init = true;
    return;
  }
  let tx, ty, tz, lx, ly, lz;
  if (state.mode === 'title') {
    const t = performance.now() / 1000;
    tx = 275 + Math.sin(t * 0.045) * 118; tz = 235 + Math.cos(t * 0.045) * 118; ty = 57;
    lx = 275; ly = 2; lz = 235;
    cam.x = tx; cam.y = ty; cam.z = tz; cam.lx = lx; cam.ly = ly; cam.lz = lz; cam.init = true;
  } else if (P.inCar && state.playerCar) {
    const c = state.playerCar;
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    const back = 11.5 + Math.abs(c.speed) * 0.05;
    tx = c.x - fx * back; tz = c.z - fz * back; ty = 4.4 + Math.abs(c.speed) * 0.012;
    lx = c.x + fx * 9; ly = 1.3; lz = c.z + fz * 9;
    const k = cam.init ? 1 - Math.exp(-dt * 6) : 1;
    const kl = cam.init ? 1 - Math.exp(-dt * 10) : 1;
    cam.x = lerp(cam.x, tx, k); cam.y = lerp(cam.y, ty, k); cam.z = lerp(cam.z, tz, k);
    cam.lx = lerp(cam.lx, lx, kl); cam.ly = ly; cam.lz = lerp(cam.lz, lz, kl);
    cam.init = true;
  } else {
    const fx = Math.sin(P.heading), fz = Math.cos(P.heading);
    tx = P.x - fx * 6.8; tz = P.z - fz * 6.8; ty = 2.7;
    lx = P.x + fx * 3.4; ly = 1.45; lz = P.z + fz * 3.4;
    const k = cam.init ? 1 - Math.exp(-dt * 8) : 1;
    const kl = cam.init ? 1 - Math.exp(-dt * 12) : 1;
    cam.x = lerp(cam.x, tx, k); cam.y = lerp(cam.y, ty, k); cam.z = lerp(cam.z, tz, k);
    cam.lx = lerp(cam.lx, lx, kl); cam.ly = ly; cam.lz = lerp(cam.lz, lz, kl);
    cam.init = true;
  }
  R.setCamera([cam.x, cam.y, cam.z], [cam.lx, cam.ly, cam.lz]);
}

// ---------------------------------------------------------------- update
function enterExitCar(state) {
  const P = state.player;
  if (P.inCar) {
    const car = state.playerCar;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    P.x = car.x + fz * 2.3; P.z = car.z - fx * 2.3;
    P.heading = car.heading;
    car.kind = 'parked'; car.speed = 0;
    state.playerCar = null; P.inCar = false;
    sfx.door();
    return;
  }
  let best = null, bd = 4.4;
  for (const car of state.cars) {
    if (car.kind === 'player') continue;
    const d = dist2d(P.x, P.z, car.x, car.z);
    if (d < bd) { bd = d; best = car; }
  }
  if (!best) return;
  if (best.kind === 'police') {
    state.police = state.police.filter((u) => u !== best);
  }
  if (!best.stolenFlag && best.kind !== 'player') {
    best.stolenFlag = true;
    state.stats.carsStolen++;
    addCrime(state, CRIMES.steal, best.kind === 'police' ? 'Police cruiser stolen' : 'Car stolen');
  }
  best.kind = 'player';
  best.roadblock = false;
  state.playerCar = best;
  P.inCar = true;
  P.x = best.x; P.z = best.z; P.heading = best.heading;
  sfx.door();
}

function updatePlayer(state, dt) {
  const P = state.player;
  if (P.punchT > 0) P.punchT -= dt;
  if (state.attackCd > 0) state.attackCd -= dt;
  if (P.inCar) {
    const car = state.playerCar;
    const inp = {
      throttle: input.forward ? 1 : input.back ? -1 : 0,
      steer: (input.left ? 1 : 0) - (input.right ? 1 : 0),
      handbrake: input.handbrake,
    };
    const impact = driveCar(state, car, dt, inp);
    if (impact > 8) {
      sfx.crash(impact > 18);
      if (impact > 13 && state.crimeCd <= 0) { addCrime(state, CRIMES.hitCar, 'Hit and run'); state.crimeCd = 1.4; }
      if (impact > 22) hurtPlayer(state, (impact - 18) * 0.35, 'The crash rattled you apart');
    }
    P.x = car.x; P.z = car.z; P.heading = car.heading;
    P.speedMag = Math.abs(car.speed);
    if (state.started) sfx.setEngine(true, Math.abs(car.speed) / car.topSpeed);
    return;
  }
  if (state.started) sfx.setEngine(false);
  // on-foot movement, camera-relative
  const camYaw = Math.atan2(cam.lx - cam.x, cam.lz - cam.z);
  let mx = 0, mz = 0;
  if (input.forward) { mx += Math.sin(camYaw); mz += Math.cos(camYaw); }
  if (input.back) { mx -= Math.sin(camYaw); mz -= Math.cos(camYaw); }
  if (input.left) { mx += Math.sin(camYaw - Math.PI / 2); mz += Math.cos(camYaw - Math.PI / 2); }
  if (input.right) { mx += Math.sin(camYaw + Math.PI / 2); mz += Math.cos(camYaw + Math.PI / 2); }
  const moving = (mx !== 0 || mz !== 0);
  if (moving) {
    const want = Math.atan2(mx, mz);
    P.heading = angleLerp(P.heading, want, clamp(dt * 11, 0, 1));
    P.speedMag = input.sprint ? 5.8 : 3.3;
  } else P.speedMag = 0;
  P.x += Math.sin(P.heading) * P.speedMag * dt * (moving ? 1 : 0);
  P.z += Math.cos(P.heading) * P.speedMag * dt * (moving ? 1 : 0);
  P.walkPhase += dt * (P.speedMag * 1.9);
  collideCircle(state.city, P, 0.5);
  // attack
  if ((input.hit('f') || input.clicked) && state.attackCd <= 0 && state.mode === 'playing') {
    playerAttack(state);
    state.attackCd = state.weapon === 2 ? 0.26 : 0.34;
  }
  if (input.hit('1')) state.weapon = 1;
  if (input.hit('2') && state.hasPistol) state.weapon = 2;
}
function update(state, dt) {
  state.time += dt;
  state.radioT += dt;
  state.timeHours = (state.timeHours + (dt * 24) / 420) % 24;
  if (state.damageFlash > 0) state.damageFlash = Math.max(0, state.damageFlash - dt * 1.4);
  if (state.crimeCd > 0) state.crimeCd -= dt;
  if (state.danger) { state.danger.t -= dt; if (state.danger.t <= 0) state.danger = null; }
  if (state.muzzle) { state.muzzle.t -= dt; if (state.muzzle.t <= 0) state.muzzle = null; }

  if (state.mode === 'title') {
    updateTraffic(state, dt);
    updatePeds(state, dt);
    return;
  }
  if (state.mode !== 'playing') return;

  // context flags for HUD hints
  const P = state.player;
  state.nearTaxiStart = !P.inCar && !state.side.taxi && dist2d(P.x, P.z, LOCATIONS.taxiSpot.x, LOCATIONS.taxiSpot.z) < 10;
  state.nearRaceStart = P.inCar && !state.side.race && dist2d(P.x, P.z, LOCATIONS.raceStart.x, LOCATIONS.raceStart.z) < 16;

  if (input.hit('e')) enterExitCar(state);
  if (input.hit('enter')) {
    if (P.inCar) {
      // chop shop at Harbor Garage
      const g = LOCATIONS.garage;
      if (dist2d(P.x, P.z, g.x, g.z + 6) < 13 && state.side.chopCooldown <= 0 && state.playerCar) {
        const val = chopValue(state.playerCar);
        state.money += val;
        state.stats.chops++;
        state.side.chopCooldown = 60;
        const car = state.playerCar;
        state.cars = state.cars.filter((c) => c !== car);
        state.playerCar = null; P.inCar = false;
        P.x = g.x - 6; P.z = g.z + 8;
        hud.toast(`Chopped for +$${val}`, '#7dff9a');
        sfx.cash();
        storeSave(state);
      }
    } else if (!state.mission.active && !state.storyDone && !state.side.taxi && !state.side.race) {
      startStoryMission(state);
    }
  }
  if (P.inCar && input.hit('r')) {
    const g = LOCATIONS.garage;
    if (dist2d(P.x, P.z, g.x, g.z + 6) < 13 && state.playerCar && state.playerCar.health < 100) {
      if (state.money >= 50) {
        state.money -= 50; state.playerCar.health = 100;
        hud.toast('Repaired — good as new', '#7dff9a'); sfx.pickup();
      } else hud.toast('Repair costs $50 — you are short', '#ffb3b3');
    }
  }
  if (input.hit('t')) {
    if (state.nearTaxiStart) startTaxi(state);
    else if (state.nearRaceStart) startRace(state);
  }

  updatePlayer(state, dt);
  updateTraffic(state, dt);
  updatePeds(state, dt);
  updatePickups(state, dt);
  updateWanted(state, dt);
  updatePolice(state, dt);
  updateMissions(state, dt);
  if (state.storyDone && state.mode === 'playing' && state._winShown !== true) {
    state._winShown = true;
    winGame(state);
  }
  if (state.started) sfx.setSiren(state.wanted.stars >= 2 && state.mode === 'playing');
}

// ---------------------------------------------------------------- render
const _waterM = new Float32Array(16);
function render(state) {
  const env = skyAt(state.timeHours);
  R.begin(env);
  updateCamera(state, state.frozen ? 0.016 : lastDt);
  R.drawLit(city.mesh, {});
  m4compose(Math.sin(state.time * 0.22) * 3 + ((state.time * 1.6) % 144), 0, 0, 0, 1, 1, 1, 0, 0, _waterM);
  R.drawLit(city.waterMesh, { model: _waterM });
  if (!params.get('nosign')) R.drawUnlit(city.signMesh, { alpha: 1 });
  if (env.night > 0.04) R.drawUnlit(city.glowMesh, { alpha: env.night * 0.5, additive: true, noDepthWrite: true });
  // traffic light heads
  const phase = lightPhase(state.time);
  for (const it of city.intersections) {
    const x = it.x + 7 + 1.4, z = it.z + 7 + 1.4;
    const nsCol = phase === 0 ? [0.2, 1, 0.35] : phase === 1 ? [1, 0.75, 0.15] : [1, 0.15, 0.15];
    const ewCol = phase === 2 ? [0.2, 1, 0.35] : phase === 3 ? [1, 0.75, 0.15] : [1, 0.15, 0.15];
    R.glowBox(x, 3.85, z, 0.2, 0.2, 0.12, nsCol, 0, 0.95);
    R.glowBox(x, 3.85, z, 0.12, 0.2, 0.2, ewCol, 0, 0.95);
  }
  // hiding spot rings
  for (const h of HIDING_SPOTS) {
    const pulse = 0.35 + Math.sin(state.time * 2.4) * 0.12;
    R.groundQuad(h.x, 0.12, h.z, 8.4, 8.4, [0.35, 1, 0.55], pulse, R.discUV);
  }
  // objective pillar
  const obj = state.mode !== 'title' ? currentObjective(state) : null;
  if (obj && obj.radius !== 0) {
    R.cone(obj.x, 0.2, obj.z, 2.4, 30, [1, 0.8, 0.25], 0.13, true);
    R.groundQuad(obj.x, 0.13, obj.z, 7, 7, [1, 0.8, 0.25], 0.4, R.discUV);
  }
  // world actors
  for (const car of state.cars) {
    if (dist2d(car.x, car.z, cam.x, cam.z) > 430) continue;
    drawCar(R, car, env);
  }
  drawPeds(R, state);
  if (!state.player.inCar && state.mode !== 'title') {
    const P = state.player;
    drawHumanoid(R, P.x, P.z, P.heading, {
      shirt: [0.85, 0.25, 0.3], pants: [0.16, 0.17, 0.24], skin: [0.94, 0.76, 0.49],
      walkPhase: P.walkPhase, swing: clamp(P.speedMag * 0.13, 0, 0.6),
      aim: state.weapon === 2 && state.hasPistol, punchT: P.punchT, hair: [0.1, 0.08, 0.06],
    });
  }
  drawPickups(R, state);
  if (state.heli) drawHeli(R, state.heli, env, state.time);
  if (state.muzzle) {
    R.glowBox(state.muzzle.x, 1.45, state.muzzle.z, 0.5, 0.5, 0.5, [1, 0.85, 0.4], state.time * 3, 0.9);
  }
}

// ---------------------------------------------------------------- boot
const params = new URLSearchParams(location.search);
const save = loadSave();
const state = createState(save);
window.__harborTest = {
  teleport(x, z) { state.player.x = x; state.player.z = z; if (state.playerCar) { state.playerCar.x = x; state.playerCar.z = z; } },
  state: () => state,
  setCam(x, y, z, lx, ly, lz) { state.debugCam = { x, y, z, lx, ly, lz }; },
  atlasURL: () => atlas.canvas.toDataURL('image/png'),
  signs: () => city.signList,
  cam: () => ({ x: cam.x, y: cam.y, z: cam.z, lx: cam.lx, ly: cam.ly, lz: cam.lz }),
  moveCar: (x, z, heading) => {
    const c = state.playerCar;
    if (!c) return false;
    c.x = x; c.z = z; c.heading = heading; c.velA = heading; c.speed = 0;
    state.player.x = x; state.player.z = z; state.player.heading = heading;
    return true;
  },
  clearCam() { state.debugCam = null; },
};
Object.defineProperty(window, '__harborState', {
  get() {
    const P = state.player;
    return {
      player: { x: P.x, z: P.z, heading: P.heading, inCar: P.inCar, health: P.health },
      speedKmh: Math.round(P.speedMag * 3.6),
      money: state.money, respect: state.respect,
      wanted: { heat: state.wanted.heat, stars: state.wanted.stars, seen: state.wanted.seen },
      missionIndex: state.mission.index, missionActive: state.mission.active,
      stats: state.stats,
      cars: state.cars.map((c) => ({ x: c.x, z: c.z, kind: c.kind, name: c.name })),
      mode: state.mode,
    };
  },
});

const shotName = params.get('shot');
if (shotName) {
  document.getElementById('titleScreen').classList.add('hidden');
  stageShot(state, shotName);
} else if (save) {
  document.getElementById('continueHint').textContent =
    `Save found — ENTER continues at job ${Math.min(state.mission.index + 1, 6)} with $${state.money}. Press N for a fresh start.`;
}

function startPlaying() {
  if (state.mode === 'title') {
    state.mode = 'playing';
    state.started = true;
    document.getElementById('titleScreen').classList.add('hidden');
    sfx.ensure();
    if (!state.mission.active && !state.storyDone) {
      showDialog(state, 'Mara Voss', STORY_INTRO, 8);
    }
  } else if (state.mode === 'wasted' || state.mode === 'busted') {
    respawn(state);
  } else if (state.mode === 'win') {
    state.mode = 'playing';
    document.getElementById('endScreen').classList.add('hidden');
  }
}
const STORY_INTRO = 'Welcome to Solana Bay, kid. First job is on the board — press ENTER when you are ready to work.';

addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (state.mode === 'title' || state.mode === 'wasted' || state.mode === 'busted' || state.mode === 'win') startPlaying();
  }
  if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && (state.mode === 'playing' || state.mode === 'paused')) {
    if (state.mode === 'playing') {
      state.mode = 'paused';
      const s = state.stats;
      document.getElementById('pauseStats').textContent =
        `Money $${state.money} · Respect ${state.respect} · Job ${Math.min(state.mission.index + 1, 6)} of 6\nCars stolen ${s.carsStolen} · Missions done ${s.missionsDone} · Taxi fares ${s.taxiFares} · Races ${s.racesWon} · Chops ${s.chops}\n\nWASD walk & drive · E enter/steal · F/click attack · 1–2 weapons · Shift sprint\nSpace handbrake · T taxi fare / Harbor Run · ENTER start job / chop at garage · R repair at garage`;
      document.getElementById('pauseScreen').classList.remove('hidden');
      sfx.setEngine(false); sfx.setSiren(false);
    } else {
      state.mode = 'playing';
      document.getElementById('pauseScreen').classList.add('hidden');
    }
  }
  if ((e.key === 'n' || e.key === 'N') && state.mode === 'title' && save) {
    clearSave();
    location.reload();
  }
});
addEventListener('mousedown', () => { if (state.mode === 'title') startPlaying(); });

let lastDt = 0.016;
let prev = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min((now - prev) / 1000, 0.05);
  prev = now;
  lastDt = dt;
  if (state.frozen) {
    render(state);
    hud.update(state, 0);
    if (state.shotTick) state.shotTick();
    input.endFrame();
    return;
  }
  if (state.mode !== 'paused') {
    // fixed-ish steps for stable physics
    let steps = Math.max(1, Math.min(3, Math.round(dt / (1 / 60))));
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) update(state, sdt);
  }
  render(state);
  hud.update(state, dt);
  input.endFrame();
}
requestAnimationFrame(frame);
