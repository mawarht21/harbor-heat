// HARBOR HEAT — boot and game loop.
// This module owns state transitions (menu, driving, on foot, paused,
// busted) and wires the specialist modules together.  Rules that belong
// to a system stay in that system: wanted heat in wanted.js, police
// steering in police.js, story stages in missions.js.

import { Batch, Renderer, environmentForMinutes, mat4Compose, mat4LookAt, mat4Perspective } from './engine.js';
import { createCity, mulberry32 } from './city.js';
import { Car, collideCars, createParkedCars, createTrafficFleet, drawCar, forwardFromHeading, turnToward } from './vehicles.js';
import { PlayerPed, createPedestrians, drawHumanoid } from './peds.js';
import { WantedSystem } from './wanted.js';
import { PoliceSystem } from './police.js';
import { MissionManager, SideJobs } from './missions.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { SoundEngine } from './audio.js';
import { clearSave, defaultSave, hasSave, loadSave, storeSave } from './save.js';
import { applyShotScene, readShotRequest, shotIsReady } from './shots.js';

const canvas = document.getElementById('game-canvas');
const fatal = document.getElementById('fatal');
window.__shotReady = false;
window.__harborState = {
  mode: 'boot', speedKmh: 0, wanted: 0, money: 0,
  missionIndex: 0, inCar: false, playerPos: { x: 0, z: 0 },
};

let renderer;
let city;
let dynamicBatch;
let glowBatch;
let hud;
let input;
let sound;
let missions;
let sideJobs;
let wanted;
let police;
let playerPed;
let startCar;
let currentCar = null;
let trafficCars = [];
let parkedCars = [];
let allCars = [];
let pedestrians = [];
let taxiPassenger = null;
let saveData = defaultSave();
let cash = saveData.cash;
let mode = 'menu';
let paused = false;
let minutes = 18 * 60 + 40;
let elapsed = 0;
let frameCount = 0;
let lastTimestamp = performance.now();
let cameraHeading = Math.PI / 2;
let cameraPosition = { x: -80, y: 35, z: 80 };
let bustedTimer = 0;
let crimeCooldown = 0;
let saveTimer = 0;
let shotRequest = null;
let shotStartedAt = 0;

function missionCallbacks(silent = false) {
  return {
    dialog(name, text) {
      if (!silent) hud.dialog(name, text);
    },
    toast(message) {
      if (!silent) hud.toast(message);
    },
    addCash(amount, label) {
      cash += amount;
      if (!silent) hud.toast(`+$${amount} — ${label}`);
      persist();
    },
    setWanted(stars) {
      wanted.setStars(stars);
    },
    reportWanted(amount, label) {
      wanted.report(amount, label);
    },
    pickupSound() {
      sound.pickup();
    },
    missionComplete(mission, reward) {
      saveData.stats.missionsCompleted++;
      sound.success();
      if (!silent) hud.toast(`Mission complete: ${mission.title} — $${reward}`);
      persist();
    },
    storyComplete() {
      if (!silent) hud.toast('Story complete — Solana Bay is yours. Free roam continues.');
    },
  };
}

function persist() {
  saveData.cash = Math.round(cash);
  saveData.missionIndex = missions ? missions.index : saveData.missionIndex;
  saveData.muted = sound ? sound.muted : saveData.muted;
  storeSave(saveData);
}

function playerPos() {
  return currentCar ? currentCar.pos : playerPed.pos;
}

function playerSpeed() {
  return currentCar ? currentCar.speed : playerPed.speed;
}

function playerHeading() {
  return currentCar ? currentCar.heading : playerPed.heading;
}

function scareNearby(x, z, radius = 17) {
  for (const ped of pedestrians) {
    if (!ped.boarded && Math.hypot(ped.pos.x - x, ped.pos.z - z) < radius) ped.scareFrom(x, z);
  }
}

function reportCrime(amount, label) {
  if (crimeCooldown > 0) return;
  crimeCooldown = 0.8;
  const raised = wanted.report(amount, label);
  if (raised) hud.toast(`SBPD response: ${wanted.stars} star${wanted.stars > 1 ? 's' : ''}`);
}

function nearestCar(maxDistance = 3.6) {
  let best = null;
  let bestDistance = maxDistance;
  for (const car of allCars) {
    const distance = Math.hypot(car.pos.x - playerPed.pos.x, car.pos.z - playerPed.pos.z);
    if (distance < bestDistance) {
      best = car;
      bestDistance = distance;
    }
  }
  return best;
}

function enterCar(car, silent = false) {
  currentCar = car;
  car.everPlayerDriven = true;
  playerPed.pos.x = car.pos.x;
  playerPed.pos.z = car.pos.z;
  playerPed.heading = car.heading;
  cameraHeading = car.heading;
  if (car.role === 'traffic' || car.role === 'parked') {
    car.role = 'player';
    car.stolen = true;
    if (!car.crimeCounted) {
      car.crimeCounted = true;
      if (!silent) {
        reportCrime(18, 'car theft');
        scareNearby(car.pos.x, car.pos.z, 15);
        hud.toast(`Stole the ${car.label}`);
      }
    }
  }
  if (!silent) sound.click();
}

function exitCar() {
  if (!currentCar) return;
  const car = currentCar;
  const right = {
    x: Math.cos(car.heading),
    z: Math.sin(car.heading),
  };
  playerPed.pos.x = car.pos.x + right.x * 2.7;
  playerPed.pos.z = car.pos.z + right.z * 2.7;
  playerPed.heading = car.heading;
  city.collideCircle(playerPed.pos, 0.5);
  currentCar = null;
  sound.click();
}

function removeCar(car) {
  allCars = allCars.filter((candidate) => candidate !== car);
  trafficCars = trafficCars.filter((candidate) => candidate !== car);
  parkedCars = parkedCars.filter((candidate) => candidate !== car);
}

function startGame(useSave, silent = false) {
  sound.unlock();
  if (useSave) {
    saveData = loadSave() || defaultSave();
  } else {
    saveData = defaultSave();
    clearSave();
  }
  cash = saveData.cash;
  sound.setMuted(saveData.muted);
  wanted.clear();
  police.reset();
  currentCar = null;
  playerPed.pos.x = city.locations.playerStart.x;
  playerPed.pos.z = city.locations.playerStart.z;
  playerPed.heading = Math.PI / 2;
  missions.startAt(saveData.missionIndex || 0, missionCallbacks(silent));
  mode = 'playing';
  paused = false;
  hud.showGame();
  persist();
  if (!silent) sound.click();
}

function respawnAfterBust() {
  currentCar = null;
  playerPed.pos.x = city.locations.garageZone.x - 7;
  playerPed.pos.z = city.locations.garageZone.z + 5;
  playerPed.heading = -Math.PI / 2;
  mode = 'playing';
  hud.showGame();
}

function handleBusted() {
  mode = 'busted';
  bustedTimer = 2.7;
  const penalty = Math.min(cash, Math.max(25, Math.round(cash * 0.12)));
  cash -= penalty;
  saveData.stats.busts++;
  wanted.clear();
  police.reset();
  sound.fail();
  hud.showBusted(true);
  const bustedText = document.getElementById('busted-text');
  if (bustedText) bustedText.textContent = `The SBPD took $${penalty}. You wake up by Harbor Garage with your story intact.`;
  persist();
}

function activeDisplay() {
  const sideObjective = sideJobs.objective;
  if (sideJobs.taxi) {
    return {
      title: 'Taxi Fare',
      objective: sideObjective,
      marker: sideJobs.activeMarker,
      timer: null,
    };
  }
  if (sideJobs.race) {
    return {
      title: 'Harbor Run',
      objective: sideObjective,
      marker: sideJobs.activeMarker,
      timer: null,
    };
  }
  return {
    title: missions.mission ? missions.mission.title : 'Free Roam',
    objective: missions.objective,
    marker: missions.marker,
    timer: missions.timer,
  };
}

function handleKeys() {
  if (mode === 'menu') {
    if (input.consume('Enter')) startGame(false);
    return;
  }
  if (input.consume('Escape', 'KeyP')) {
    if (mode === 'playing') {
      paused = !paused;
      hud.showPause(paused);
      sound.click();
    }
  }
  if (paused || mode !== 'playing') return;

  if (input.consume('KeyM')) {
    sound.unlock();
    sound.setMuted(!sound.muted);
    hud.toast(sound.muted ? 'Sound muted' : 'Sound on');
    persist();
  }

  if (input.consume('KeyE')) {
    if (currentCar) exitCar();
    else {
      const car = nearestCar();
      if (car) enterCar(car);
    }
  }

  const pos = playerPos();
  if (input.consume('KeyR') && currentCar) {
    const garageDistance = Math.hypot(pos.x - city.locations.garageZone.x, pos.z - city.locations.garageZone.z);
    if (garageDistance < 11) {
      if (currentCar.health >= 99) hud.toast('This car is already clean.');
      else if (cash < 50) hud.toast('Repair costs $50 — cash is short.');
      else {
        cash -= 50;
        currentCar.repair();
        sound.success();
        hud.toast('Harbor Garage repair complete — $50');
        persist();
      }
    }
  }

  if (input.consume('KeyF') && currentCar) {
    const chopDistance = Math.hypot(pos.x - city.locations.chopShop.x, pos.z - city.locations.chopShop.z);
    if (chopDistance < 13 && currentCar !== startCar) {
      const value = sideJobs.sellAtChopShop(currentCar);
      if (value <= 0) hud.toast('Chop Shop is cooling down — bring another car later.');
      else {
        const sold = currentCar;
        cash += value;
        saveData.stats.carsChopped++;
        removeCar(sold);
        currentCar = null;
        playerPed.pos.x = city.locations.chopShop.x - 8;
        playerPed.pos.z = city.locations.chopShop.z;
        wanted.report(6, 'chop shop delivery');
        sound.success();
        hud.toast(`Chop Shop paid $${value} for the ${sold.label}`);
        persist();
      }
    }
  }

  if (input.consume('KeyT')) {
    if (!sideJobs.taxi && !sideJobs.race && !currentCar && taxiPassenger &&
        Math.hypot(pos.x - taxiPassenger.pos.x, pos.z - taxiPassenger.pos.z) < 4.5) {
      const job = sideJobs.startTaxi(taxiPassenger);
      taxiPassenger.waiting = true;
      hud.toast(`Taxi fare: drive back here in a car, then take them to ${job.destinationName}`);
      sound.click();
    } else if (!sideJobs.taxi && !sideJobs.race && currentCar) {
      const start = city.locations.raceStart;
      if (Math.hypot(pos.x - start.x, pos.z - start.z) < 11) {
        sideJobs.startRace();
        hud.toast('Harbor Run started — beat 105 seconds for the full prize');
        sound.success();
      }
    }
  }
}

function currentPrompt() {
  if (mode !== 'playing' || paused) return '';
  const pos = playerPos();
  if (!currentCar) {
    const car = nearestCar();
    if (car) return `Press E to ${car === startCar ? 'enter' : 'steal'} the ${car.label}`;
    if (taxiPassenger && !sideJobs.taxi && Math.hypot(pos.x - taxiPassenger.pos.x, pos.z - taxiPassenger.pos.z) < 4.5) {
      return 'Press T to take this taxi fare';
    }
    return '';
  }
  const chopDistance = Math.hypot(pos.x - city.locations.chopShop.x, pos.z - city.locations.chopShop.z);
  if (chopDistance < 13 && currentCar !== startCar) return 'Press F to sell this car at the Chop Shop';
  const garageDistance = Math.hypot(pos.x - city.locations.garageZone.x, pos.z - city.locations.garageZone.z);
  if (garageDistance < 11 && currentCar.health < 99) return 'Press R to repair for $50 at Harbor Garage';
  const raceStart = city.locations.raceStart;
  if (!sideJobs.race && !sideJobs.taxi && Math.hypot(pos.x - raceStart.x, pos.z - raceStart.z) < 11) {
    return 'Press T to start the Harbor Run checkpoint race';
  }
  return '';
}

function updateGame(dt) {
  elapsed += dt;
  minutes = (minutes + dt * 3) % (24 * 60);
  crimeCooldown = Math.max(0, crimeCooldown - dt);
  saveTimer += dt;
  if (saveTimer > 5) {
    saveTimer = 0;
    persist();
  }

  if (mode === 'busted') {
    bustedTimer -= dt;
    if (bustedTimer <= 0) respawnAfterBust();
    return;
  }
  if (mode !== 'playing' || paused) return;

  const posBefore = { ...playerPos() };
  if (currentCar) {
    const impact = currentCar.updatePlayer(dt, {
      throttle: input.throttle,
      steer: input.steer,
      handbrake: input.handbrake,
    }, city);
    playerPed.pos.x = currentCar.pos.x;
    playerPed.pos.z = currentCar.pos.z;
    playerPed.heading = currentCar.heading;
    if (impact > 6) {
      sound.crash(impact);
      hud.flashDamage();
      reportCrime(6, 'collision');
    }
  } else {
    playerPed.update(dt, input.moveVector(), cameraHeading, input.running, city);
  }

  // Traffic keeps its lanes and brakes for whatever is in front of it.
  const obstacles = [...allCars, ...police.cruisers];
  if (!currentCar) obstacles.push(playerPed);
  for (const car of trafficCars) {
    if (car === currentCar || car.role !== 'traffic') continue;
    car.brain.update(dt, obstacles);
  }

  // Car-to-car contact is resolved as circles; it is enough to shove a
  // cruiser off line or end a traffic car's day without a physics engine.
  const colliders = [...allCars, ...police.cruisers];
  for (let i = 0; i < colliders.length; i++) {
    for (let j = i + 1; j < colliders.length; j++) {
      const impact = collideCars(colliders[i], colliders[j]);
      if (impact > 5 && (colliders[i] === currentCar || colliders[j] === currentCar)) {
        sound.crash(impact);
        hud.flashDamage();
        reportCrime(8, 'vehicle collision');
      }
    }
  }

  for (const ped of pedestrians) {
    if (ped.boarded) continue;
    ped.update(dt);
    if (currentCar && Math.abs(currentCar.speed) > 5) {
      const distance = Math.hypot(ped.pos.x - currentCar.pos.x, ped.pos.z - currentCar.pos.z);
      if (distance < 2.1 && !ped.hitCooldown) {
        ped.hitCooldown = 2;
        ped.scareFrom(currentCar.pos.x, currentCar.pos.z);
        currentCar.speed *= 0.45;
        sound.crash(8);
        hud.flashDamage();
        reportCrime(17, 'pedestrian struck');
      }
    }
    ped.hitCooldown = Math.max(0, (ped.hitCooldown || 0) - dt);
  }

  const pos = playerPos();
  const forward = forwardFromHeading(playerHeading());
  const policeResult = police.update(dt, {
    pos,
    heading: playerHeading(),
    speed: playerSpeed(),
    vx: forward.x * playerSpeed(),
    vz: forward.z * playerSpeed(),
  }, wanted);
  const inHiding = city.hidingSpots.some((spot) => Math.hypot(pos.x - spot.x, pos.z - spot.z) < 4.2);
  wanted.update(dt, policeResult.visible, inHiding);
  if (policeResult.busted) {
    handleBusted();
    return;
  }

  sideJobs.update(dt);
  if (sideJobs.taxi) {
    const event = sideJobs.updateTaxi(pos, Boolean(currentCar));
    if (event && event.type === 'boarded') {
      taxiPassenger.boarded = true;
      taxiPassenger.waiting = false;
      hud.toast(`Passenger aboard — destination: ${event.job.destinationName}`);
      sound.pickup();
    } else if (event && event.type === 'fare') {
      cash += event.fare;
      saveData.stats.taxiFares++;
      if (taxiPassenger) {
        taxiPassenger.boarded = false;
        taxiPassenger.pos.x = event.job.destination.x + 3;
        taxiPassenger.pos.z = event.job.destination.z + 3;
        taxiPassenger.waiting = false;
      }
      hud.toast(`Taxi fare paid $${event.fare}`);
      sound.success();
      persist();
    }
  } else if (sideJobs.race) {
    const event = sideJobs.updateRace(pos);
    if (event && event.type === 'checkpoint') {
      hud.toast(`Harbor Run checkpoint ${event.index}/${event.total}`);
      sound.pickup();
    } else if (event && event.type === 'finish') {
      cash += event.reward;
      if (event.time <= 105) saveData.stats.racesWon++;
      hud.toast(`Harbor Run finished in ${event.time.toFixed(1)}s — $${event.reward}`);
      sound.success();
      persist();
    } else if (event && event.type === 'timeout') {
      hud.toast('Harbor Run timed out.');
      sound.fail();
    }
  } else {
    missions.update(dt, {
      pos,
      inCar: Boolean(currentCar),
      speed: playerSpeed(),
      ...missionCallbacks(false),
      setPrompt() {},
    });
  }

  if (!currentCar && taxiPassenger && !sideJobs.taxi) taxiPassenger.waiting = true;
  if (posBefore.x !== pos.x || posBefore.z !== pos.z) {
    // Nothing else keys off distance travelled yet; the hook is here so
    // future wear systems do not need another movement path.
  }
}

function updateCamera(dt) {
  if (mode === 'menu') {
    const angle = elapsed * 0.055;
    cameraPosition = {
      x: Math.cos(angle) * 92,
      y: 34 + Math.sin(elapsed * 0.17) * 4,
      z: 28 + Math.sin(angle) * 92,
    };
    return { position: cameraPosition, target: { x: 0, y: 5, z: 12 } };
  }
  const pos = playerPos();
  const heading = playerHeading();
  cameraHeading = turnToward(cameraHeading, heading, Math.max(0.8, dt * 4.5));
  const forward = forwardFromHeading(cameraHeading);
  const distance = currentCar ? 11.5 + Math.abs(currentCar.speed) * 0.045 : 7.4;
  const height = currentCar ? 5.1 : 3.7;
  const desired = {
    x: pos.x - forward.x * distance,
    y: height,
    z: pos.z - forward.z * distance,
  };
  const blend = 1 - Math.pow(0.000001, dt);
  cameraPosition.x += (desired.x - cameraPosition.x) * blend;
  cameraPosition.y += (desired.y - cameraPosition.y) * blend;
  cameraPosition.z += (desired.z - cameraPosition.z) * blend;
  return {
    position: cameraPosition,
    target: {
      x: pos.x + forward.x * 8,
      y: currentCar ? 1.5 : 1.35,
      z: pos.z + forward.z * 8,
    },
  };
}

function drawMarker(marker) {
  if (!marker) return;
  const pulse = 0.75 + Math.sin(elapsed * 3.4) * 0.2;
  glowBatch.addBox(
    // A light pillar: visible across rooftops without a 3D text sprite.
    markerMatrix(marker.x, marker.z),
    1.15, 19, 1.15, [1, 0.78, 0.12, 0.16 + pulse * 0.08]);
  dynamicBatch.addCylinder(markerMatrix(marker.x, marker.z, 0.16), 3.4, 3.4, 0.18, 20,
    [1, 0.8, 0.15, 0.85]);
}

function markerMatrix(x, z, y = 9.5) {
  // Slow rotation keeps the pillar feeling alive rather than painted on.
  return mat4Compose(x, y, z, 0, elapsed * 0.7, 0, 1, 1, 1);
}

function render(dt) {
  const environment = environmentForMinutes(minutes);
  renderer.setEnvironment(environment);
  const camera = updateCamera(dt);
  const view = mat4LookAt(camera.position, camera.target, { x: 0, y: 1, z: 0 });
  const projection = mat4Perspective(1.13, renderer.aspect || 16 / 9, 0.1, 520);
  renderer.begin(camera.position, view, projection);

  dynamicBatch.clear();
  glowBatch.clear();
  city.drawDynamic(dynamicBatch, glowBatch, elapsed, environment.night);
  const display = activeDisplay();
  drawMarker(display.marker);
  for (const pickup of missions.pickups) {
    if (pickup.taken) continue;
    dynamicBatch.addBox(
      mat4Compose(pickup.pos.x, 1 + Math.sin(elapsed * 3 + pickup.pos.x) * 0.18, pickup.pos.z,
        0, elapsed * 1.8, 0, 1, 1, 1),
      0.85, 0.85, 0.85, [0.25, 0.95, 0.38, 1]);
  }
  for (const car of allCars) drawCar(dynamicBatch, car, elapsed);
  police.draw(dynamicBatch, glowBatch, elapsed);
  for (const ped of pedestrians) {
    if (!ped.boarded) drawHumanoid(dynamicBatch, ped, elapsed);
  }
  if (!currentCar && mode !== 'menu') drawHumanoid(dynamicBatch, playerPed, elapsed);

  renderer.draw(city.batch);
  renderer.draw(dynamicBatch);
  renderer.draw(glowBatch);

  const pos = playerPos();
  window.__harborState = {
    mode: currentCar ? 'car' : (mode === 'menu' ? 'menu' : 'foot'),
    speedKmh: currentCar ? currentCar.speedKmh : 0,
    wanted: wanted.stars,
    money: Math.round(cash),
    missionIndex: missions.index,
    inCar: Boolean(currentCar),
    frameCount,
    playerHeading: playerHeading(),
    playerPos: { x: pos.x, z: pos.z },
  };

  if (mode !== 'menu') {
    hud.setPrompt(currentPrompt());
    hud.update({
      title: display.title,
      objective: display.objective,
      marker: display.marker,
      timer: display.timer,
      playerPos: pos,
      playerHeading: playerHeading(),
      wanted,
      police,
      cash,
      minutes,
      speedKmh: currentCar ? currentCar.speedKmh : 0,
      inCar: Boolean(currentCar),
      car: currentCar,
      district: city.districtAt(pos.x, pos.z),
      elapsed,
      city,
      storyIndex: missions.index,
    });
  }
  sound.update(dt, currentCar ? currentCar.speedKmh : 0, wanted.stars, Boolean(currentCar));
}

function loop(timestamp) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, Math.max(0, (timestamp - lastTimestamp) / 1000));
  lastTimestamp = timestamp;
  frameCount++;
  try {
    handleKeys();
    if (!paused && mode === 'playing') {
      const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
      const stepDt = dt / steps;
      for (let i = 0; i < steps; i++) updateGame(stepDt);
    } else if (mode === 'busted') {
      updateGame(dt);
    } else {
      elapsed += dt;
    }
    render(dt);
    if (shotRequest && shotIsReady(frameCount, shotStartedAt)) window.__shotReady = true;
  } catch (error) {
    showFatal(error);
  } finally {
    input.endFrame();
  }
}

function showFatal(error) {
  console.error(error);
  if (fatal) {
    fatal.textContent = `HARBOR HEAT could not start: ${error.message}`;
    fatal.classList.remove('hidden');
  }
}

function boot() {
  shotRequest = readShotRequest();
  const seed = shotRequest ? shotRequest.seed : 7;
  const rng = mulberry32(seed);
  renderer = new Renderer(canvas);
  city = createCity(renderer, seed);
  dynamicBatch = new Batch(renderer, { dynamic: true });
  glowBatch = new Batch(renderer, { dynamic: true, transparent: true, unlit: true });
  hud = new Hud();
  input = new Input();
  const existingSave = loadSave();
  sound = new SoundEngine(existingSave ? existingSave.muted : false);
  wanted = new WantedSystem();
  police = new PoliceSystem(city, rng);
  missions = new MissionManager(city.locations);
  sideJobs = new SideJobs(city.locations, rng);
  trafficCars = createTrafficFleet(city, rng, 13);
  parkedCars = createParkedCars(city, rng, 24);
  startCar = new Car('coupe', city.locations.startCar.x, city.locations.startCar.z,
    city.locations.startCar.heading, [0.02, 0.72, 0.7], 'playerStart');
  allCars = [startCar, ...trafficCars, ...parkedCars];
  playerPed = new PlayerPed(city.locations.playerStart.x, city.locations.playerStart.z);
  pedestrians = createPedestrians(city, rng, 22);
  taxiPassenger = pedestrians.reduce((best, ped) =>
    Math.hypot(ped.pos.x + 112, ped.pos.z - 101) < Math.hypot(best.pos.x + 112, best.pos.z - 101) ? ped : best,
    pedestrians[0]);
  taxiPassenger.pos.x = -112;
  taxiPassenger.pos.z = 101;
  taxiPassenger.waiting = true;
  taxiPassenger.role = 'fare';

  document.getElementById('new-game').addEventListener('click', () => startGame(false));
  document.getElementById('continue-game').addEventListener('click', () => startGame(true));
  hud.showMenu(hasSave());

  if (shotRequest) {
    startGame(false, true);
    const applied = applyShotScene(shotRequest.name, {
      locations: city.locations,
      startCar,
      setTime(value) { minutes = value; },
      placeCar(car, x, z, heading) {
        car.pos.x = x;
        car.pos.z = z;
        car.heading = heading;
        car.travelHeading = heading;
        car.speed = 0;
      },
      enterCar(car) { enterCar(car, true); },
      setWanted(stars) { wanted.setStars(stars); },
      setMission(index) { missions.startAt(index, {}); },
      spawnPoliceAt(x, z, heading) {
        const car = police.spawnCruiser({ x, z }, false);
        car.pos.x = x;
        car.pos.z = z;
        car.heading = heading;
        car.travelHeading = heading;
        car.speed = 18;
        return car;
      },
    });
    if (!applied) throw new Error(`Unknown shot scene: ${shotRequest.name}`);
    shotStartedAt = performance.now();
  }
  requestAnimationFrame(loop);
}

try {
  boot();
} catch (error) {
  showFatal(error);
}
