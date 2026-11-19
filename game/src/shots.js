// Screenshot scenes behind ?shot=city|drive|chase|mission.
// Each scene arranges the REAL game state — same city, cars, police, HUD and
// mission code as play — so a screenshot is the game itself, never a mock-up.

import { LOCATIONS } from './city.js';
import { startStoryMission, showDialog } from './missions.js';

export function stageShot(state, kind) {
  state.mode = 'play';
  if (kind === 'city') {
    // On foot downtown at golden hour: city, traffic, pedestrians, minimap, HUD,
    // and the first mission beacon waiting.
    state.dayTime = 0.68;
    state.player.x = 880; state.player.y = 800;
    state.player.angle = 0.6;
    startStoryMission(state);
    state.camera.x = state.player.x - 640;
    state.camera.y = state.player.y - 360;
  } else if (kind === 'drive') {
    // Driving a stolen coupe through traffic on Neon Row's avenue.
    state.dayTime = 0.74;
    startStoryMission(state);
    state.mission.index = 1;
    startStoryMission(state);
    const car = state.cars.find((c) => c.kind === 'parked') || state.cars[0];
    car.x = 1900; car.y = 1188; car.angle = 0; car.speed = 205; car.kind = 'player';
    car.color = '#ef476f'; car.name = 'Solana Coupe';
    state.player.inCar = car;
    state.player.x = car.x; state.player.y = car.y;
    // Traffic around the player: two cars far ahead in-lane, two oncoming.
    let n = 0;
    for (const other of state.cars) {
      if (other === car || other.kind !== 'traffic') continue;
      if (n < 2) { other.x = car.x + 430 + n * 190; other.y = 1188; other.angle = 0; }
      else { other.x = car.x + 240 + (n - 2) * 230; other.y = 1132; other.angle = Math.PI; }
      other.speed = 130;
      if (++n >= 4) break;
    }
    state.camera.x = car.x - 560; state.camera.y = car.y - 360;
  } else if (kind === 'chase') {
    // Four-star chase at dusk: police interceptors with flashing lights ram the
    // player's van while the wanted stars and bust pressure fill the HUD.
    state.dayTime = 0.80;
    state.wanted.heat = 385;
    state.wanted.lastCrime = 'Vault job alarm';
    const car = state.cars.find((c) => c.kind === 'parked') || state.cars[0];
    car.x = 1500; car.y = 1628; car.angle = 0; car.speed = 235; car.kind = 'player';
    car.color = '#e9e4d8'; car.name = 'Cargo Van';
    state.player.inCar = car;
    state.player.x = car.x; state.player.y = car.y;
    state.mission.index = 4;
    startStoryMission(state);
    state.mission.stage = 1;
    // Pre-place two interceptors in the rear-view so the chase reads instantly;
    // the police system spawns the rest as the simulation runs.
    const copA = { x: car.x - 190, y: car.y - 30, angle: 0, speed: 210, steer: 0, color: '#eef1f5', name: 'SBPD Interceptor', topSpeed: 330, accelMul: 1.1, kind: 'police', health: 130, bump: 0, honk: 0, occupied: true, dead: false, lightPhase: 1, ram: 0 };
    const copB = { x: car.x - 120, y: car.y + 64, angle: 0, speed: 195, steer: 0, color: '#eef1f5', name: 'SBPD Interceptor', topSpeed: 330, accelMul: 1.1, kind: 'police', health: 130, bump: 0, honk: 0, occupied: true, dead: false, lightPhase: 4, ram: 0 };
    state.policeCars.push(copA, copB);
    state.camera.x = car.x - 580; state.camera.y = car.y - 360;
  } else if (kind === 'mission') {
    // The Old Market debt call: enforcers, dialog, fight objective on the HUD.
    state.dayTime = 0.60;
    state.player.x = LOCATIONS.market.x - 90; state.player.y = LOCATIONS.market.y + 60;
    state.player.weapon = 'pistol';
    state.mission.index = 2;
    startStoryMission(state);
    state.mission.stage = 1;
    // Trigger the enforcer spawn for this step, then pose the scene.
    state.mission.enforcersSpawned = false;
    const stepSetup = state.peds.length;
    void stepSetup;
    // Spawn is handled by setupStep on advance; force it here via a fresh start:
    showDialog(state, 'Rico Ferran', 'Rico: "Three of Vasco\'s enforcers, right there. Put them down — fists or iron."', 30);
    state.camera.x = state.player.x - 640;
    state.camera.y = state.player.y - 360;
  }
  // Let one frame of systems settle so police exist for the chase scene.
  state._shotKind = kind;
}
