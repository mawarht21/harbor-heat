// The story of Harbor Heat, in six linked missions, plus two repeatable side jobs.
// Mara Voss, a fixer at the Marina, pulls the player from petty car theft into a
// full harbor heist. Each mission is a list of steps: go somewhere, in a car or on
// foot, sometimes against a timer, sometimes through checkpoints, sometimes fighting.

import { LOCATIONS } from './city.js';
import { CRIMES } from './config.js';
import { addCrime } from './wanted.js';
import { makeEnforcer } from './pedestrians.js';
import { saveGame } from './save.js';

export const STORY = [
  {
    title: '1 · FIRST WHEELS',
    giver: 'Mara Voss',
    intro: 'Mara: "You walk everywhere, kid? Steal that teal coupe by Palm Heights and bring it to Harbor Garage. Quietly."',
    steps: [
      { kind: 'goto', x: 880, y: 900, label: 'Reach the marked coupe in Palm Heights', radius: 90 },
      { kind: 'driveTo', x: LOCATIONS.garage.x, y: LOCATIONS.garage.y, label: 'Drive the stolen car to Harbor Garage', radius: 110 },
    ],
    reward: 250, respect: 5,
    done: 'Mara: "Not a scratch worth mentioning. You drive angry — I like that."',
  },
  {
    title: '2 · PACKAGE RUN',
    giver: 'Mara Voss',
    intro: 'Mara: "Warehouse 9 at the Docks has a package with my name on it. Take it to Club Coral. The SBPD disagrees — lose them or outrun them."',
    steps: [
      { kind: 'goto', x: LOCATIONS.docks.x, y: LOCATIONS.docks.y, label: 'Pick up the package at Warehouse 9, The Docks', radius: 95, pickup: 'the package' },
      { kind: 'driveTo', x: LOCATIONS.neonClub.x, y: LOCATIONS.neonClub.y, label: 'Deliver the package to Club Coral, Neon Row', radius: 105, timer: 150, alarm: true },
    ],
    reward: 450, respect: 8, weapon: 'pistol',
    done: 'Mara: "Here — a pistol. Solana Bay is done being polite to you."',
  },
  {
    title: '3 · DEBT CALL',
    giver: 'Rico Ferran',
    intro: 'Rico: "Three of Vasco\'s enforcers are shaking down the Old Market. Put all three on the pavement. Fists or iron, your call."',
    steps: [
      { kind: 'goto', x: LOCATIONS.market.x, y: LOCATIONS.market.y, label: 'Go to the Old Market square', radius: 120, spawnEnforcers: true },
      { kind: 'fight', x: LOCATIONS.market.x, y: LOCATIONS.market.y, label: 'Drop Vasco\'s 3 enforcers', radius: 420 },
    ],
    reward: 600, respect: 12,
    done: 'Rico: "The Market breathes again. Vasco will remember your face, though."',
  },
  {
    title: '4 · NIGHT COURIER',
    giver: 'Mara Voss',
    intro: 'Mara: "Four drops, one night, no questions. Hit every beacon before the clock dies — the city lights will guide you."',
    steps: [
      { kind: 'checkpoints', label: 'Hit all 4 courier beacons before time runs out', timer: 170,
        points: [
          { x: 360, y: 340 }, { x: 1900, y: 1180 }, { x: 3050, y: 2060 }, { x: 900, y: 2060 },
        ] },
    ],
    reward: 800, respect: 10,
    done: 'Mara: "Four for four. You were a rumor with headlights tonight."',
  },
  {
    title: '5 · THE VAULT JOB',
    giver: 'Rico Ferran',
    intro: 'Rico: "City Bank kept our harbor fund. Take the vault bag from the bank steps — then get to the Marina. Every badge in the bay will light up."',
    steps: [
      { kind: 'goto', x: 1500, y: 500, label: 'Grab the vault bag at City Bank steps', radius: 95, pickup: 'the vault bag', alarm: true },
      { kind: 'driveTo', x: LOCATIONS.pier.x, y: LOCATIONS.pier.y, label: 'Escape to the getaway boat at Marina Pier', radius: 115 },
    ],
    reward: 1500, respect: 16,
    done: 'Rico: "That bag just bought the whole harbor its freedom."',
  },
  {
    title: '6 · HARBOR HEAT — FINALE',
    giver: 'Mara Voss',
    intro: 'Mara: "Vasco\'s crew torched our dock and the SBPD blames us. Survive their heat for 60 seconds, then bring everyone home to the Pier."',
    steps: [
      { kind: 'survive', x: LOCATIONS.pier.x, y: LOCATIONS.pier.y, label: 'Survive the citywide manhunt — 60 seconds', timer: 60, bigAlarm: true },
      { kind: 'driveTo', x: LOCATIONS.pier.x, y: LOCATIONS.pier.y, label: 'Reach the Marina Pier — bring it home', radius: 120 },
    ],
    reward: 2500, respect: 25,
    done: 'Mara: "Solana Bay is ours tonight. Harbor Heat forever, kid."',
  },
];

export function createMissionState() {
  return { index: 0, stage: 0, timer: -1, checkpoint: 0, active: false, dialog: null, dialogTime: 0, enforcersSpawned: false };
}

export function startStoryMission(state) {
  const m = STORY[state.mission.index];
  if (!m) { state.storyDone = true; return; }
  state.mission.active = true;
  state.mission.stage = 0;
  state.mission.checkpoint = 0;
  state.mission.enforcersSpawned = false;
  setupStep(state);
  showDialog(state, m.giver, m.intro, 7);
  if (state.audio) state.audio.pickup();
}

function setupStep(state) {
  const m = STORY[state.mission.index];
  const step = m.steps[state.mission.stage];
  state.mission.timer = step.timer ? step.timer : -1;
  if (step.alarm) addCrime(state, CRIMES.missionAlarm, 'Alarm tripped');
  if (step.bigAlarm) { state.wanted.heat = 480; state.wanted.lastCrime = 'Citywide manhunt'; }
  if (step.spawnEnforcers && !state.mission.enforcersSpawned) {
    state.mission.enforcersSpawned = true;
    const base = LOCATIONS.market;
    state.peds.push(makeEnforcer(base.x - 70, base.y - 30, 'Vasco Enforcer'));
    state.peds.push(makeEnforcer(base.x + 60, base.y + 50, 'Vasco Enforcer'));
    state.peds.push(makeEnforcer(base.x + 10, base.y - 90, 'Vasco Heavy'));
    state.stats.enforcersDown = 0;
  }
}

export function currentObjective(state) {
  if (state.side.taxi && state.side.taxi.active) return state.side.taxi.objective;
  if (state.side.race && state.side.race.active) return state.side.race.objective;
  if (!state.mission.active || state.storyDone) return null;
  const m = STORY[state.mission.index];
  const step = m.steps[state.mission.stage];
  if (step.kind === 'checkpoints') {
    const pt = step.points[state.mission.checkpoint];
    return { x: pt.x, y: pt.y, label: `${step.label} (${state.mission.checkpoint + 1}/${step.points.length})`, radius: 95 };
  }
  if (step.kind === 'survive') return { x: state.player.x, y: state.player.y, label: step.label, radius: 0 };
  return { x: step.x, y: step.y, label: step.label, radius: step.radius };
}

export function showDialog(state, who, text, seconds) {
  state.mission.dialog = { who, text };
  state.mission.dialogTime = seconds || 5;
}

function finishMission(state) {
  const m = STORY[state.mission.index];
  state.player.money += m.reward;
  state.player.respect += m.respect;
  if (m.weapon) state.player.weapon = m.weapon;
  showDialog(state, m.giver, m.done + `  (+$${m.reward})`, 6);
  if (state.audio) state.audio.missionDone();
  if (state.audio) state.audio.cash();
  state.mission.active = false;
  state.mission.index++;
  state.stats.missionsDone++;
  if (state.mission.index >= STORY.length) {
    state.storyDone = true;
    state.mode = 'win';
  }
  saveGame(state);
}

function failMission(state, why) {
  showDialog(state, 'Mission failed', why + ' Talk to the marker to try again.', 5);
  state.mission.active = false;
  state.mission.stage = 0;
  state.wanted.heat = Math.min(state.wanted.heat, 90);
}

export function updateMissions(state, dt) {
  const ms = state.mission;
  if (ms.dialogTime > 0) { ms.dialogTime -= dt; if (ms.dialogTime <= 0) ms.dialog = null; }
  // Side jobs tick alongside the story.
  updateTaxi(state, dt);
  updateRace(state, dt);
  if (!ms.active || state.storyDone) return;
  const m = STORY[ms.index];
  const step = m.steps[ms.stage];
  if (ms.timer > 0) {
    ms.timer -= dt;
    if (ms.timer <= 0 && step.kind !== 'survive') { failMission(state, 'Out of time.'); return; }
    if (ms.timer <= 0 && step.kind === 'survive') { advanceStep(state); return; }
  }
  const p = state.player;
  if (step.kind === 'goto') {
    if (Math.hypot(p.x - step.x, p.y - step.y) < step.radius) {
      if (step.pickup) { state.toast = `Picked up ${step.pickup}.`; state.toastTime = 2.4; if (state.audio) state.audio.pickup(); }
      advanceStep(state);
    }
  } else if (step.kind === 'driveTo') {
    if (p.inCar && Math.hypot(p.x - step.x, p.y - step.y) < step.radius) advanceStep(state);
    else if (!p.inCar && Math.hypot(p.x - step.x, p.y - step.y) < step.radius) {
      state.toast = 'You need to arrive in a car.';
      state.toastTime = 1.2;
    }
  } else if (step.kind === 'checkpoints') {
    const pt = step.points[ms.checkpoint];
    if (Math.hypot(p.x - pt.x, p.y - pt.y) < 95) {
      ms.checkpoint++;
      if (state.audio) state.audio.pickup();
      state.toast = `Beacon ${ms.checkpoint}/${step.points.length}`;
      state.toastTime = 1.8;
      if (ms.checkpoint >= step.points.length) advanceStep(state);
    }
  } else if (step.kind === 'fight') {
    const alive = state.peds.filter((ped) => ped.enforcer && !ped.dead).length;
    state.mission.fightLeft = alive;
    if (state.mission.enforcersSpawned && alive === 0) advanceStep(state);
  }
}

function advanceStep(state) {
  const ms = state.mission;
  ms.stage++;
  const m = STORY[ms.index];
  if (ms.stage >= m.steps.length) finishMission(state);
  else setupStep(state);
}

// --- Side job 1: taxi fares -------------------------------------------------

export function startTaxi(state) {
  const dests = [LOCATIONS.garage, LOCATIONS.neonClub, LOCATIONS.pier, LOCATIONS.market, LOCATIONS.docks];
  const dest = dests[Math.floor(state.rng() * dests.length) % dests.length];
  state.side.taxi = {
    active: true, pickedUp: false, timer: 95,
    objective: { x: LOCATIONS.taxiSpot.x, y: LOCATIONS.taxiSpot.y, label: 'Taxi: pick up the fare in Palm Heights', radius: 80 },
    dest,
  };
  state.toast = 'Taxi fare waiting — get a car and pick them up!';
  state.toastTime = 3;
}

function updateTaxi(state, dt) {
  const taxi = state.side.taxi;
  if (!taxi || !taxi.active) return;
  taxi.timer -= dt;
  if (taxi.timer <= 0) { taxi.active = false; state.toast = 'The fare gave up waiting.'; state.toastTime = 2.4; return; }
  const p = state.player;
  if (!taxi.pickedUp) {
    if (p.inCar && Math.hypot(p.x - LOCATIONS.taxiSpot.x, p.y - LOCATIONS.taxiSpot.y) < 85) {
      taxi.pickedUp = true;
      taxi.timer = 110;
      taxi.objective = { x: taxi.dest.x, y: taxi.dest.y, label: `Taxi: drive the fare to ${taxi.dest.name}`, radius: 100 };
      if (state.audio) state.audio.pickup();
    }
  } else if (p.inCar && Math.hypot(p.x - taxi.dest.x, p.y - taxi.dest.y) < 100) {
    taxi.active = false;
    state.side.taxiDone++;
    const pay = 120 + Math.round(taxi.timer);
    state.player.money += pay;
    state.toast = `Fare paid $${pay}. Taxi work: honest heat.`;
    state.toastTime = 3;
    if (state.audio) state.audio.cash();
    saveGame(state);
  }
}

// --- Side job 2: street race -------------------------------------------------

export function startRace(state) {
  state.side.race = {
    active: true, checkpoint: 0, timer: 105,
    points: [
      { x: 3050, y: 760 }, { x: 1980, y: 760 }, { x: 900, y: 1180 },
      { x: 900, y: 2060 }, { x: 2000, y: 2060 }, { x: 2960, y: 1680 },
    ],
    objective: null,
  };
  refreshRaceObjective(state);
  state.toast = 'Race on! Hit every beacon, first back wins $700.';
  state.toastTime = 3;
}

function refreshRaceObjective(state) {
  const race = state.side.race;
  const pt = race.points[race.checkpoint];
  race.objective = { x: pt.x, y: pt.y, label: `Street race checkpoint ${race.checkpoint + 1}/${race.points.length}`, radius: 95 };
}

function updateRace(state, dt) {
  const race = state.side.race;
  if (!race || !race.active) return;
  race.timer -= dt;
  if (race.timer <= 0) { race.active = false; state.toast = 'Race lost — the beacons went dark.'; state.toastTime = 2.6; return; }
  const pt = race.points[race.checkpoint];
  const p = state.player;
  if (p.inCar && Math.hypot(p.x - pt.x, p.y - pt.y) < 95) {
    race.checkpoint++;
    if (state.audio) state.audio.pickup();
    if (race.checkpoint >= race.points.length) {
      race.active = false;
      state.side.racesWon++;
      state.player.money += 700;
      state.player.respect += 6;
      state.toast = 'You won the Harbor Run! +$700';
      state.toastTime = 3.4;
      if (state.audio) state.audio.missionDone();
      saveGame(state);
    } else refreshRaceObjective(state);
  }
}
