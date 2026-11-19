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

export function stageShot(state, name) {
  state.mode = 'playing';
  state.frozen = true;
  const P = state.player;
  if (name === 'city') {
    // golden-hour downtown drive: avenue 220 heading south through Downtown
    state.timeHours = 17.35;
    const car = putPlayerInCar(state, 0, 217, 168, 0, 15);
    car.name = 'Coral Convertible';
    state.mission.active = true; state.mission.index = 0; state.mission.stage = 1;
    showDialog(state, 'Mara Voss', 'You walk everywhere, kid? Steal that teal coupe by Palm Heights and bring it to Harbor Garage. Quietly.', 999);
  } else if (name === 'night') {
    // Neon Row at night: package run eastbound on street 220 under a spotlight
    state.timeHours = 23.4;
    putPlayerInCar(state, 4, 372, 223.3, Math.PI / 2, 13);
    state.wanted.heat = 260; state.wanted.stars = 3; state.wanted.seen = true;
    state.mission.active = true; state.mission.index = 1; state.mission.stage = 1;
    addCruiser(state, 344, 222.2, Math.PI / 2, 'PURSUIT');
    addCruiser(state, 334, 226.6, Math.PI / 2 + 0.15, 'RAMMING');
    addHeli(state, 388, 204);
    showDialog(state, 'Mara Voss', 'Warehouse 9 at the Docks has a package with my name on it. Take it to Club Coral. The SBPD disagrees — lose them or outrun them.', 999);
  } else if (name === 'chase') {
    // dusk, five stars: roadblock ahead, cruisers behind, heli overhead
    state.timeHours = 18.65;
    putPlayerInCar(state, 5, 330, 300, 0, 21);
    state.wanted.heat = 480; state.wanted.stars = 5; state.wanted.seen = true;
    state.mission.active = true; state.mission.index = 5; state.mission.stage = 0; state.mission.timer = 41;
    const b1 = addCruiser(state, 324.5, 372, Math.PI / 2 + 0.35, 'ROADBLOCK');
    const b2 = addCruiser(state, 335.5, 372, -Math.PI / 2 - 0.35, 'ROADBLOCK');
    b1.roadblock = b2.roadblock = true; b1.speed = b2.speed = 0;
    addCruiser(state, 326, 268, 0, 'RAMMING');
    addCruiser(state, 338, 258, 0.1, 'PURSUIT');
    addCruiser(state, 318, 244, -0.1, 'RESPONDING');
    addHeli(state, 338, 282);
    showDialog(state, 'Mara Voss', 'Vasco\'s crew torched our dock and the SBPD blames us. Survive their heat, then bring everyone home to the Pier.', 999);
  } else if (name === 'mission') {
    // Debt Call on foot at the Old Market: enforcers up, one cash drop spinning
    state.timeHours = 16.8;
    const m = LOCATIONS.market;
    P.x = m.x - 3; P.z = m.z + 9; P.heading = Math.PI + 0.5; P.inCar = false;
    state.mission.active = true; state.mission.index = 2; state.mission.stage = 1;
    state.mission.enforcersSpawned = true;
    const spots = [[-8, -3], [6, 4], [0, -10]];
    for (const [dx, dz] of spots) {
      const e = makePed(m.x + dx, m.z + dz, 'enforcer');
      e.homeX = m.x + dx; e.homeZ = m.z + dz;
      e.shirt = [0.1, 0.1, 0.12]; e.pants = [0.08, 0.08, 0.1];
      e.heading = Math.atan2(P.x - e.x, P.z - e.z);
      state.peds.push(e);
    }
    state.pickups.push({ x: m.x + 3.5, z: m.z - 5, amount: 65, t: 1.2, kind: 'cash' });
    state.hasPistol = true; state.weapon = 2; state.ammo = 31;
    showDialog(state, 'Rico Ferran', 'Three of Vasco\'s enforcers are shaking down the Old Market. Put all three on the pavement. Fists or iron, your call.', 999);
  }
  state.wanted.stars = state.wanted.stars || 0;
  // let a few frames render so the staged frame is fully lit, then signal
  let frames = 0;
  state.shotTick = () => { if (++frames >= 6) window.__shotReady = true; };
}
