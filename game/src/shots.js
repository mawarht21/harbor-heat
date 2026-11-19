// Screenshot staging behind ?shot=city|night|chase|mission. Each scene arranges
// the REAL game state — same city, cars, police, HUD and mission code as play —
// so a screenshot is the game itself, never a mock-up. Scenes freeze the world
// (state.frozen) once arranged, then set window.__shotReady.

import { LOCATIONS } from './city.js';
import { makeCar, CAR_TYPES } from './vehicles.js';
import { makePed } from './peds.js';
import { showDialog } from './missions.js';

function putPlayerInCar(state, carTypeIdx, x, z, heading, speed) {
  const car = makeCar(x, z, heading, CAR_TYPES[carTypeIdx], 'player');
  car.speed = speed;
  car.velA = heading;
  state.cars.push(car);
  state.playerCar = car;
  state.player.inCar = true;
  state.player.x = x; state.player.z = z; state.player.heading = heading;
  return car;
}

function addCruiser(state, x, z, heading, tactic) {
  const type = { name: 'SBPD Interceptor', color: '#f2f2f2', topSpeed: 47, accel: 16.5, price: 1 };
  const car = makeCar(x, z, heading, type, 'police');
  car.callsign = ['CORAL-4', 'MARLIN-2', 'TARPON-7', 'GULL-1', 'HERON-5'][state.police.length % 5];
  car.tactic = tactic || 'PURSUIT';
  car.speed = 16;
  state.cars.push(car);
  state.police.push(car);
  return car;
}

function addHeli(state, x, z) {
  const heli = {
    kind: 'heli', x, z, y: 31, heading: 2.6, callsign: 'AIR ONE',
    tactic: 'SPOTLIGHT', seesPlayer: true, rotor: 2, searchT: 0,
    sx: state.player.x, sz: state.player.z,
  };
  state.police.push(heli);
  state.heli = heli;
  return heli;
}

function addTrafficCar(state, typeIdx, x, z, heading, speed) {
  const car = makeCar(x, z, heading, CAR_TYPES[typeIdx], 'traffic');
  car.speed = speed;
  car.velA = heading;
  state.cars.push(car);
  return car;
}

function addParkedCar(state, typeIdx, x, z, heading) {
  const car = makeCar(x, z, heading, CAR_TYPES[typeIdx], 'parked');
  state.cars.push(car);
  return car;
}

/** Keep the staged frame clean: remove ambient cars crowding the set. */
function clearCarsNear(state, x, z, radius, kinds) {
  state.cars = state.cars.filter((c) => {
    if (kinds && !kinds.includes(c.kind)) return true;
    return Math.hypot(c.x - x, c.z - z) > radius;
  });
}

export function stageShot(state, name) {
  state.mode = 'playing';
  state.frozen = true;
  const P = state.player;
  if (name === 'city') {
    // cover: golden-hour drive west down the palm boulevard of street 330,
    // sun ahead, the CLUB CORAL sign on the right, traffic all around
    state.timeHours = 17.35;
    clearCarsNear(state, 430, 330, 65, ['traffic', 'parked']);
    const car = putPlayerInCar(state, 0, 430, 326.7, -Math.PI / 2, 15);
    car.name = 'Coral Convertible';
    addTrafficCar(state, 2, 386, 326.7, -Math.PI / 2, 12);
    addTrafficCar(state, 6, 354, 326.7, -Math.PI / 2, 11);
    addTrafficCar(state, 1, 402, 333.3, Math.PI / 2, 12);
    addTrafficCar(state, 7, 364, 333.3, Math.PI / 2, 10);
    addParkedCar(state, 5, 354, 320.6, -Math.PI / 2);
    addParkedCar(state, 3, 460, 339.4, Math.PI / 2);
    state.mission.active = true; state.mission.index = 0; state.mission.stage = 1;
    showDialog(state, 'Mara Voss', 'You walk everywhere, kid? Steal that teal coupe by Palm Heights and bring it to Harbor Garage. Quietly.', 999);
  } else if (name === 'night') {
    // Neon Row at night: westbound on street 330 under the lamps, one cruiser
    // riding the far lane beside you, AIR ONE's spotlight sweeping the road
    state.timeHours = 23.35;
    clearCarsNear(state, 448, 330, 60, ['traffic', 'parked']);
    putPlayerInCar(state, 4, 448, 326.7, -Math.PI / 2, 13);
    state.wanted.heat = 260; state.wanted.stars = 3; state.wanted.seen = true;
    state.mission.active = true; state.mission.index = 1; state.mission.stage = 1;
    const beside = addCruiser(state, 440, 333.4, -Math.PI / 2, 'PURSUIT');
    beside.speed = 13;
    addCruiser(state, 480, 326.7, -Math.PI / 2, 'RESPONDING');
    const heli = addHeli(state, 408, 316);
    heli.y = 19;
    showDialog(state, 'Mara Voss', 'Warehouse 9 at the Docks has a package with my name on it. Take it to Club Coral. The SBPD disagrees — lose them or outrun them.', 999);
  } else if (name === 'chase') {
    // dusk, five stars: flankers alongside, a roadblock pair across the
    // avenue ahead, AIR ONE high in the frame with its spotlight down
    state.timeHours = 18.65;
    clearCarsNear(state, 330, 300, 60, ['traffic', 'parked']);
    putPlayerInCar(state, 5, 326.7, 296, 0, 21);
    state.wanted.heat = 480; state.wanted.stars = 5; state.wanted.seen = true;
    state.mission.active = true; state.mission.index = 5; state.mission.stage = 0; state.mission.timer = 41;
    const b1 = addCruiser(state, 324.1, 332, Math.PI / 2 + 0.35, 'ROADBLOCK');
    const b2 = addCruiser(state, 329.3, 332, -Math.PI / 2 - 0.35, 'ROADBLOCK');
    b1.roadblock = b2.roadblock = true; b1.speed = b2.speed = 0;
    const f1 = addCruiser(state, 333.3, 294, 0, 'RAMMING'); f1.speed = 20;
    const f2 = addCruiser(state, 333.3, 304, 0, 'PURSUIT'); f2.speed = 21;
    addCruiser(state, 326.7, 270, 0, 'RESPONDING');
    const heli = addHeli(state, 320, 330);
    heli.y = 20;
    addTrafficCar(state, 3, 333.3, 348, 0, 0);
    showDialog(state, 'Mara Voss', 'Vasco\'s crew torched our dock and the SBPD blames us. Survive their heat, then bring everyone home to the Pier.', 999);
  } else if (name === 'mission') {
    // Debt Call on foot in the dressed Old Market at golden hour: Vasco's
    // crew in loud shirts, one cash drop glowing on the pavement
    state.timeHours = 17.4;
    const m = LOCATIONS.market;
    P.x = m.x - 2; P.z = m.z + 4; P.heading = Math.PI + 0.3; P.inCar = false;
    state.mission.active = true; state.mission.index = 2; state.mission.stage = 1;
    state.mission.enforcersSpawned = true;
    const spots = [[-7, -5], [5, -1], [-1, -11]];
    const shirts = [[0.72, 0.16, 0.2], [0.08, 0.45, 0.5], [0.85, 0.58, 0.14]];
    spots.forEach(([dx, dz], i) => {
      const e = makePed(m.x + dx, m.z + dz, 'enforcer');
      e.homeX = m.x + dx; e.homeZ = m.z + dz;
      e.shirt = shirts[i % shirts.length]; e.pants = [0.13, 0.13, 0.18];
      e.heading = Math.atan2(P.x - e.x, P.z - e.z);
      state.peds.push(e);
    });
    state.pickups.push({ x: m.x + 1, z: m.z + 1, amount: 65, t: 1.2, kind: 'cash' });
    state.hasPistol = true; state.weapon = 2; state.ammo = 31;
    showDialog(state, 'Rico Ferran', 'Three of Vasco\'s enforcers are shaking down the Old Market. Put all three on the pavement. Fists or iron, your call.', 999);
  }
  state.wanted.stars = state.wanted.stars || 0;
  // let a few frames render so the staged frame is fully lit, then signal
  let frames = 0;
  state.shotTick = () => { if (++frames >= 6) window.__shotReady = true; };
}
