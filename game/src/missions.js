// The Harbor Heat story: six missions for Mara Voss and Rico Ferran, plus taxi
// fares, the Harbor Run checkpoint race and the Harbor Garage chop shop.
// Steps are data: goto / driveTo / fight / checkpoints / survive.

import { LOCATIONS } from './city.js';
import { CRIMES } from './wanted.js';
import { makePed } from './peds.js';
import { dist2d } from './engine.js';
import { storeSave } from './save.js';

export const STORY = [
  {
    title: '1 · FIRST WHEELS', giver: 'Mara Voss',
    intro: 'You walk everywhere, kid? Steal that teal coupe by Palm Heights and bring it to Harbor Garage. Quietly.',
    steps: [
      { kind: 'goto', x: 115, z: 82, label: 'Reach the marked coupe in Palm Heights', radius: 7 },
      { kind: 'driveTo', loc: 'garage', label: 'Drive the stolen car to Harbor Garage', radius: 13 },
    ],
    reward: 250, respect: 5,
    done: 'Not a scratch worth mentioning. You drive angry — I like that.',
  },
  {
    title: '2 · PACKAGE RUN', giver: 'Mara Voss',
    intro: 'Warehouse 9 at the Docks has a package with my name on it. Take it to Club Coral. The SBPD disagrees — lose them or outrun them.',
    steps: [
      { kind: 'goto', loc: 'docks', label: 'Pick up the package at Warehouse 9, The Docks', radius: 8, pickup: 'the package' },
      { kind: 'driveTo', loc: 'neonClub', label: 'Deliver the package to Club Coral, Neon Row', radius: 14, timer: 150, alarm: true },
    ],
    reward: 450, respect: 8, weapon: 'pistol',
    done: 'Here — a pistol. Solana Bay is done being polite to you.',
  },
  {
    title: '3 · DEBT CALL', giver: 'Rico Ferran',
    intro: 'Three of Vasco\'s enforcers are shaking down the Old Market. Put all three on the pavement. Fists or iron, your call.',
    steps: [
      { kind: 'goto', loc: 'market', label: 'Go to the Old Market square', radius: 14, spawnEnforcers: true },
      { kind: 'fight', loc: 'market', label: 'Drop Vasco\'s 3 enforcers', radius: 40 },
    ],
    reward: 600, respect: 12,
    done: 'The Market breathes again. Vasco will remember your face, though.',
  },
  {
    title: '4 · NIGHT COURIER', giver: 'Mara Voss',
    intro: 'Four drops, one night, no questions. Hit every beacon before the clock dies — the city lights will guide you.',
    steps: [
      { kind: 'checkpoints', label: 'Hit all 4 courier beacons before time runs out', timer: 175,
        points: [{ x: 58, z: 56 }, { x: 316, z: 196 }, { x: 498, z: 338 }, { x: 148, z: 338 }] },
    ],
    reward: 800, respect: 10,
    done: 'Four for four. You were a rumor with headlights tonight.',
  },
  {
    title: '5 · THE VAULT JOB', giver: 'Rico Ferran',
    intro: 'City Bank kept our harbor fund. Take the vault bag from the bank steps — then get to the Marina. Every badge in the bay will light up.',
    steps: [
      { kind: 'goto', loc: 'bank', label: 'Grab the vault bag at the City Bank steps', radius: 8, pickup: 'the vault bag', alarm: true, vault: true },
      { kind: 'driveTo', loc: 'pier', label: 'Escape to the getaway boat at Marina Pier', radius: 12 },
    ],
    reward: 1500, respect: 16,
    done: 'That bag just bought the whole harbor its freedom.',
  },
  {
    title: '6 · HARBOR HEAT — FINALE', giver: 'Mara Voss',
    intro: 'Vasco\'s crew torched our dock and the SBPD blames us. Survive their heat for 60 seconds, then bring everyone home to the Pier.',
    steps: [
      { kind: 'survive', label: 'Survive the citywide manhunt — 60 seconds', timer: 60, bigAlarm: true },
      { kind: 'driveTo', loc: 'pier', label: 'Reach the Marina Pier — bring it home', radius: 13 },
    ],
    reward: 2500, respect: 25,
    done: 'Solana Bay is ours tonight. Harbor Heat forever, kid.',
  },
];

export function createMissionState() {
  return {
    index: 0, stage: 0, timer: -1, checkpoint: 0, active: false,
    dialog: null, dialogTime: 0, enforcersSpawned: false, started: false,
  };
}

export function createSideState() {
  return { taxi: null, race: null, chopCooldown: 0 };
}

function stepPos(step) {
  if (step.loc) { const L = LOCATIONS[step.loc]; return { x: L.x, z: L.z }; }
  return { x: step.x, z: step.z };
}

export function currentObjective(state) {
  if (state.side.taxi) return state.side.taxi.objective;
  if (state.side.race) return state.side.race.objective;
  if (!state.mission.active || state.storyDone) return null;
  const m = STORY[state.mission.index];
  const step = m.steps[state.mission.stage];
  if (step.kind === 'checkpoints') {
    const pt = step.points[state.mission.checkpoint];
    return { x: pt.x, z: pt.z, label: `${step.label} (${state.mission.checkpoint + 1}/${step.points.length})`, radius: 9 };
  }
  if (step.kind === 'survive') return { x: state.player.x, z: state.player.z, label: step.label, radius: 0 };
  const p = stepPos(step);
  return { x: p.x, z: p.z, label: step.label, radius: step.radius };
}

export function missionPanel(state) {
  if (state.side.taxi) return { title: 'TAXI FARE', giver: 'Dispatch', frac: state.side.taxi.frac, next: state.side.taxi.next };
  if (state.side.race) return { title: 'HARBOR RUN', giver: 'Street League', frac: state.side.race.frac, next: state.side.race.next };
  if (state.storyDone) return { title: 'FREE ROAM', giver: 'Solana Bay', frac: 1, next: 'The bay is yours — taxi fares and the Harbor Run still pay.' };
  const m = STORY[state.mission.index];
  if (!state.mission.active) return { title: m.title, giver: m.giver, frac: 0, next: 'Press ENTER to start the job' };
  return {
    title: m.title, giver: m.giver,
    frac: state.mission.stage / m.steps.length,
    next: m.steps.length > state.mission.stage + 1 ? `NEXT · ${STORY[state.mission.index].steps[state.mission.stage + 1].label}` : 'NEXT · Collect your pay',
  };
}

export function startStoryMission(state) {
  const m = STORY[state.mission.index];
  if (!m) { state.storyDone = true; return; }
  state.mission.active = true;
  state.mission.stage = 0;
  state.mission.checkpoint = 0;
  state.mission.enforcersSpawned = false;
  setupStep(state);
  showDialog(state, m.giver, m.intro, 8);
  state.sfx.pickup();
}

function setupStep(state) {
  const m = STORY[state.mission.index];
  const step = m.steps[state.mission.stage];
  state.mission.timer = step.timer ? step.timer : -1;
  if (step.alarm) state.onCrime(step.vault ? CRIMES.vault : CRIMES.missionAlarm, step.vault ? 'Vault alarm' : 'Alarm tripped');
  if (step.bigAlarm) { state.wanted.heat = 480; state.wanted.lastCrime = 'Citywide manhunt'; }
  if (step.spawnEnforcers && !state.mission.enforcersSpawned) {
    state.mission.enforcersSpawned = true;
    const base = LOCATIONS.market;
    const spots = [[-9, -4], [7, 6], [1, -11]];
    for (const [dx, dz] of spots) {
      const e = makePed(base.x + dx, base.z + dz, 'enforcer');
      e.homeX = base.x + dx; e.homeZ = base.z + dz;
      e.shirt = [0.1, 0.1, 0.12]; e.pants = [0.08, 0.08, 0.1];
      state.peds.push(e);
    }
    state.stats.enforcersDown = 0;
  }
  if (step.kind === 'checkpoints') state.mission.timer = step.timer;
}

export function showDialog(state, who, text, seconds = 6) {
  state.mission.dialog = { who, text };
  state.mission.dialogTime = seconds;
}

function advanceStep(state) {
  const m = STORY[state.mission.index];
  state.mission.stage++;
  state.sfx.pickup();
  if (state.mission.stage >= m.steps.length) finishMission(state);
  else setupStep(state);
}

function finishMission(state) {
  const m = STORY[state.mission.index];
  state.money += m.reward;
  state.respect += m.respect;
  if (m.weapon === 'pistol' && !state.hasPistol) { state.hasPistol = true; state.ammo += 48; state.weapon = 2; }
  showDialog(state, m.giver, `${m.done}  (+$${m.reward})`, 7);
  state.sfx.success();
  state.mission.active = false;
  state.mission.index++;
  state.stats.missionsDone++;
  if (state.mission.index >= STORY.length) {
    state.storyDone = true; // main notices and raises the HARBOR LEGEND screen
  }
  storeSave(state);
}

export function updateMissions(state, dt) {
  const M = state.mission;
  if (M.dialogTime > 0) { M.dialogTime -= dt; if (M.dialogTime <= 0) M.dialog = null; }
  if (state.side.chopCooldown > 0) state.side.chopCooldown -= dt;
  updateTaxi(state, dt);
  updateRace(state, dt);
  if (!M.active || state.storyDone || state.mode !== 'playing') return;
  const m = STORY[M.index];
  const step = m.steps[M.stage];
  if (M.timer > 0) {
    M.timer -= dt;
    if (M.timer <= 0) {
      if (step.kind === 'survive') { advanceStep(state); return; }
      // timed step failed: restart the mission, keep your pride dented
      M.active = false;
      showDialog(state, m.giver, 'Too slow. The job resets — come back and press ENTER when you are ready.', 6);
      state.sfx.fail();
      return;
    }
  }
  const P = state.player;
  if (step.kind === 'goto' || step.kind === 'driveTo') {
    const p = stepPos(step);
    const d = dist2d(P.x, P.z, p.x, p.z);
    const needCar = step.kind === 'driveTo';
    if (d < step.radius && (!needCar || P.inCar)) {
      if (step.pickup) { state.hud.toast(`Picked up ${step.pickup}`, '#ffe27a'); state.sfx.cash(); }
      advanceStep(state);
    }
  } else if (step.kind === 'fight') {
    if (state.stats.enforcersDown >= 3) advanceStep(state);
  } else if (step.kind === 'checkpoints') {
    const pt = step.points[M.checkpoint];
    if (dist2d(P.x, P.z, pt.x, pt.z) < 10) {
      M.checkpoint++;
      state.sfx.pickup();
      state.hud.toast(`Beacon ${M.checkpoint}/${step.points.length}`, '#7ad9ff');
      if (M.checkpoint >= step.points.length) advanceStep(state);
    }
  }
}

// ---------------------------------------------------------------- taxi
export function startTaxi(state) {
  if (state.side.taxi || state.side.race) return;
  // find or spawn the fare ped
  let fare = state.peds.find((p) => p.fare);
  if (!fare) {
    const spot = LOCATIONS.taxiSpot;
    fare = makePed(spot.x, spot.z);
    fare.fare = true;
    state.peds.push(fare);
  }
  state.side.taxi = {
    phase: 'pickup', fare,
    dest: null, timer: 0,
    objective: { x: fare.x, z: fare.z, label: 'Pick up the fare (stop beside them, in a car)', radius: 6 },
    frac: 0, next: 'NEXT · Deliver them across town',
  };
  state.hud.toast('Taxi fare waiting — check the minimap', '#ffd23f');
  state.sfx.pickup();
}

export function updateTaxi(state, dt) {
  const T = state.side.taxi;
  if (!T) return;
  const P = state.player;
  if (T.phase === 'pickup') {
    if (P.inCar && dist2d(P.x, P.z, T.fare.x, T.fare.z) < 6 && Math.abs(state.playerCar.speed) < 1.5) {
      T.phase = 'deliver';
      T.fare.dead = false;
      state.peds = state.peds.filter((p) => p !== T.fare);
      const dests = [LOCATIONS.neonClub, LOCATIONS.pier, LOCATIONS.garage, LOCATIONS.market, LOCATIONS.bank, LOCATIONS.docks];
      T.dest = dests[Math.floor(state.rng() * dests.length)];
      T.startDist = Math.max(60, dist2d(P.x, P.z, T.dest.x, T.dest.z));
      T.timer = T.startDist / 9 + 25;
      T.objective = { x: T.dest.x, z: T.dest.z, label: `Take your fare to ${T.dest.name}`, radius: 9 };
      T.next = 'NEXT · Tip grows the faster you arrive';
      state.hud.toast('Fare aboard — drive!', '#ffd23f');
      state.sfx.door();
    }
  } else {
    T.timer -= dt;
    const d = dist2d(P.x, P.z, T.dest.x, T.dest.z);
    T.frac = 1 - d / T.startDist;
    if (d < 9 && P.inCar) {
      const fare = Math.round(30 + T.startDist * 0.22 + Math.max(0, T.timer) * 1.2);
      state.money += fare;
      state.stats.taxiFares++;
      state.hud.toast(`Fare paid +$${fare}`, '#7dff9a');
      state.sfx.cash();
      state.side.taxi = null;
      storeSave(state);
    } else if (T.timer <= 0) {
      state.hud.toast('Fare walked away — too slow', '#ffb3b3');
      state.sfx.fail();
      state.side.taxi = null;
    } else if (!P.inCar) {
      state.hud.toast('Your fare bailed — you left the car', '#ffb3b3');
      state.side.taxi = null;
    }
  }
}

// ---------------------------------------------------------------- race
const RACE_POINTS = [
  { x: 547, z: 388 }, { x: 336, z: 444 }, { x: 113, z: 388 }, { x: 223, z: 224 },
  { x: 444, z: 113 }, { x: 547, z: 388 },
];
export function startRace(state) {
  if (state.side.race || state.side.taxi) return;
  state.side.race = {
    cp: 0, time: 0,
    objective: { x: RACE_POINTS[0].x, z: RACE_POINTS[0].z, label: 'Harbor Run — hit every checkpoint', radius: 10 },
    frac: 0, next: 'NEXT · Beat 150 s for the full purse',
  };
  state.hud.toast('Harbor Run started — follow the pillars', '#7ad9ff');
  state.sfx.pickup();
}
export function updateRace(state, dt) {
  const Rc = state.side.race;
  if (!Rc) return;
  Rc.time += dt;
  const P = state.player;
  const pt = RACE_POINTS[Rc.cp];
  if (P.inCar && dist2d(P.x, P.z, pt.x, pt.z) < 11) {
    Rc.cp++;
    state.sfx.pickup();
    if (Rc.cp >= RACE_POINTS.length) {
      const bonus = Rc.time < 150 ? 400 : 200;
      state.money += bonus;
      state.stats.racesWon++;
      state.hud.toast(`Harbor Run finished in ${Rc.time.toFixed(1)}s — +$${bonus}`, '#7dff9a');
      state.sfx.success();
      state.side.race = null;
      storeSave(state);
      return;
    }
    const next = RACE_POINTS[Rc.cp];
    Rc.objective = { x: next.x, z: next.z, label: `Harbor Run checkpoint ${Rc.cp + 1}/${RACE_POINTS.length}`, radius: 10 };
    Rc.frac = Rc.cp / RACE_POINTS.length;
  }
}

// ---------------------------------------------------------------- chop shop
/** Cash value of a car rolled into Harbor Garage. */
export function chopValue(car) {
  return Math.round((90 + (car.topSpeed - 36) * 12) * (car.type.price || 1));
}
