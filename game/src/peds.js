// People of Solana Bay: sidewalk pedestrians, Vasco's enforcers, cash pickups,
// the player's own box-built figure, and fists/pistol combat.

import { angleDiff, angleLerp, clamp, dist2d, pick, randRange, rgb } from './engine.js';
import { AVENUES_X, STREETS_Z, COAST_Z, collideCircle, segmentBlocked } from './city.js';

const SHIRTS = ['#ef476f', '#ffd23f', '#06d6a0', '#4cc9f0', '#f4845f', '#c77dff', '#e8e4da', '#2a9d8f'];
const PANTS = ['#2b2d42', '#5c677d', '#7f5539', '#3a506b', '#22223b'];
const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
let pedSeq = 0;

export function makePed(x, z, kind = 'walker') {
  return {
    id: ++pedSeq, x, z, heading: randRange(Math.random, 0, 6.28), speed: 0,
    kind, health: 100, dead: false, deadT: 0,
    shirt: rgb(pick(Math.random, SHIRTS)), pants: rgb(pick(Math.random, PANTS)), skin: rgb(pick(Math.random, SKINS)),
    target: null, fleeT: 0, fleeFrom: null, walkPhase: Math.random() * 6,
    punchCd: 0, name: kind === 'enforcer' ? 'Vasco Enforcer' : 'Citizen', fare: false,
  };
}

export function spawnPeds(state, count) {
  const rng = state.rng;
  for (let i = 0; i < count; i++) {
    const p = sidewalkPoint(state);
    const ped = makePed(p.x, p.z);
    ped.heading = rng() * 6.28;
    state.peds.push(ped);
  }
}

export function sidewalkPoint(state) {
  const rng = state.rng;
  if (rng() < 0.55) {
    const ax = pick(rng, AVENUES_X);
    return { x: ax + (rng() < 0.5 ? -8.6 : 8.6), z: randRange(rng, -30, 465) };
  }
  const sz = pick(rng, [...STREETS_Z, COAST_Z]);
  return { x: randRange(rng, -30, 585), z: sz + (rng() < 0.5 ? -8.6 : 8.6) };
}

export function updatePeds(state, dt) {
  const P = state.player;
  for (const ped of state.peds) {
    if (ped.dead) { ped.deadT += dt; continue; }
    if (ped.punchCd > 0) ped.punchCd -= dt;
    let tx = null, tz = null, wantSpeed = 1.35;
    if (ped.kind === 'enforcer') {
      const d = dist2d(ped.x, ped.z, P.x, P.z);
      if (!P.inCar && d < 30) {
        tx = P.x; tz = P.z; wantSpeed = 3.1;
        if (d < 1.7 && ped.punchCd <= 0) {
          ped.punchCd = 0.9;
          hurtPlayer(state, 7, 'Vasco\'s enforcer worked you over');
          state.sfx.punch();
        }
      } else if (P.inCar && d < 16) { tx = ped.x + (ped.x - P.x); tz = ped.z + (ped.z - P.z); wantSpeed = 3.4; }
      else { tx = ped.homeX; tz = ped.homeZ; wantSpeed = 1.1; }
    } else if (ped.fare) {
      wantSpeed = 0; // the taxi fare waits at the curb
    } else {
      // danger? run
      const danger = state.danger;
      if (danger && dist2d(ped.x, ped.z, danger.x, danger.z) < 16) { ped.fleeT = 1.6; ped.fleeFrom = danger; }
      if (ped.fleeT > 0 && ped.fleeFrom) {
        ped.fleeT -= dt;
        tx = ped.x + (ped.x - ped.fleeFrom.x) * 2; tz = ped.z + (ped.z - ped.fleeFrom.z) * 2;
        wantSpeed = 3.6;
      } else {
        if (!ped.target || dist2d(ped.x, ped.z, ped.target.x, ped.target.z) < 2.5) ped.target = sidewalkPoint(state);
        tx = ped.target.x; tz = ped.target.z;
      }
    }
    if (tx !== null) {
      const want = Math.atan2(tx - ped.x, tz - ped.z);
      ped.heading = angleLerp(ped.heading, want, clamp(dt * 6, 0, 1));
      const dd = dist2d(ped.x, ped.z, tx, tz);
      ped.speed = dd > 0.8 ? wantSpeed : 0;
    } else ped.speed = 0;
    ped.x += Math.sin(ped.heading) * ped.speed * dt;
    ped.z += Math.cos(ped.heading) * ped.speed * dt;
    ped.walkPhase += dt * (2 + ped.speed * 2.6);
    collideCircle(state.city, ped, 0.45);
    // getting run over is bad for everyone
    for (const car of state.cars) {
      if (Math.abs(car.speed) > 4 && dist2d(ped.x, ped.z, car.x, car.z) < 2.3) {
        killPed(state, ped, car === state.playerCar ? 'player' : 'traffic');
        if (car === state.playerCar) state.onPedHit(ped);
        break;
      }
    }
  }
  // clear the long-dead
  state.peds = state.peds.filter((p) => !p.dead || p.deadT < 9);
}

export function killPed(state, ped, by) {
  if (ped.dead) return;
  ped.dead = true; ped.deadT = 0; ped.speed = 0;
  if (ped.kind === 'enforcer') {
    state.stats.enforcersDown++;
    dropCash(state, ped.x, ped.z, 40 + Math.floor(state.rng() * 51));
    state.sfx.cash();
  }
}

export function hurtPlayer(state, amount, cause) {
  const P = state.player;
  if (state.mode !== 'playing' || P.dead) return;
  const absorbed = Math.min(P.armour, amount * 0.6);
  P.armour -= absorbed;
  P.health -= (amount - absorbed);
  state.damageFlash = Math.min(1, state.damageFlash + 0.5);
  state.lastHurtCause = cause;
  if (P.health <= 0) { P.health = 0; P.dead = true; state.onWasted(cause); }
}

// ---------------------------------------------------------------- combat
export function playerAttack(state) {
  const P = state.player;
  if (P.inCar || P.dead) return;
  const usingPistol = state.weapon === 2 && state.hasPistol;
  if (usingPistol) {
    if (state.ammo <= 0) { state.hud.toast('Out of ammo — fists it is', '#ffb3b3'); state.weapon = 1; return; }
    state.ammo--;
    state.sfx.shot();
    state.onCrime(26, 'Shots fired');
    state.danger = { x: P.x, z: P.z, t: 1.5 };
    // hitscan: nearest ped or car within 46 m in a forward cone
    let best = null, bestD = 46;
    const fx = Math.sin(P.heading), fz = Math.cos(P.heading);
    for (const ped of state.peds) {
      if (ped.dead) continue;
      const rx = ped.x - P.x, rz = ped.z - P.z;
      const d = Math.hypot(rx, rz), along = rx * fx + rz * fz;
      if (d < bestD && along > 0 && Math.abs(rx * fz - rz * fx) < 1.1 + d * 0.05) {
        if (!segmentBlocked(state.city, P.x, P.z, ped.x, ped.z)) { best = ped; bestD = d; }
      }
    }
    if (best) {
      best.health -= 55;
      state.muzzle = { x: best.x, z: best.z, t: 0.06 };
      if (best.health <= 0) killPed(state, best, 'player');
      else if (best.kind !== 'enforcer') { best.fleeT = 2.5; best.fleeFrom = { x: P.x, z: P.z }; }
      if (best.kind === 'walker') state.onCrime(30, 'Civilian shot');
    } else {
      // maybe a car took it
      for (const car of state.cars) {
        const rx = car.x - P.x, rz = car.z - P.z;
        const d = Math.hypot(rx, rz), along = rx * fx + rz * fz;
        if (d < 40 && along > 0 && Math.abs(rx * fz - rz * fx) < 2.2) { car.health = Math.max(0, car.health - 9); car.bumpT = 0.15; break; }
      }
      state.muzzle = { x: P.x + fx * 14, z: P.z + fz * 14, t: 0.05 };
    }
    return;
  }
  // fists
  state.sfx.punch();
  P.punchT = 0.22;
  const fx = Math.sin(P.heading), fz = Math.cos(P.heading);
  for (const ped of state.peds) {
    if (ped.dead) continue;
    const rx = ped.x - P.x, rz = ped.z - P.z;
    if (Math.hypot(rx, rz) < 1.9 && rx * fx + rz * fz > 0) {
      ped.health -= 38;
      ped.x += fx * 0.5; ped.z += fz * 0.5;
      if (ped.health <= 0) killPed(state, ped, 'player');
      else if (ped.kind === 'walker') { ped.fleeT = 2; ped.fleeFrom = { x: P.x, z: P.z }; state.onCrime(18, 'Assault'); }
    }
  }
}

// ---------------------------------------------------------------- pickups
export function dropCash(state, x, z, amount) {
  state.pickups.push({ x, z, amount, t: Math.random() * 6, kind: 'cash' });
}
export function updatePickups(state, dt) {
  const P = state.player;
  for (const pk of state.pickups) pk.t += dt * 3;
  state.pickups = state.pickups.filter((pk) => {
    const d = dist2d(pk.x, pk.z, P.x, P.z);
    if (d < (P.inCar ? 3.2 : 1.6)) {
      state.money += pk.amount;
      state.stats.cashPicked = (state.stats.cashPicked || 0) + pk.amount;
      state.hud.toast(`+$${pk.amount}`, '#7dff9a');
      state.sfx.cash();
      return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------- drawing
export function drawHumanoid(R, x, z, heading, o) {
  const swing = Math.sin(o.walkPhase || 0) * (o.swing || 0);
  const fx = Math.sin(heading), fz = Math.cos(heading);
  const rx = fz, rz = -fx;
  const hipY = 0.95;
  if (o.dead) {
    // fallen: one flat stack on the ground
    R.box(x, 0.18, z, 0.55, 0.3, 1.7, o.shirt, heading);
    R.box(x + fx * 0.95, 0.16, z + fz * 0.95, 0.34, 0.3, 0.36, o.skin, heading);
    return;
  }
  R.groundQuad(x, 0.1, z, 1.1, 1.1, [0, 0, 0], 0.3, R.discUV);
  for (const s of [-1, 1]) {
    const sw = swing * s;
    const lx = x + rx * 0.13 * s + fx * Math.sin(sw) * 0.42;
    const lz = z + rz * 0.13 * s + fz * Math.sin(sw) * 0.42;
    R.box(lx, hipY - Math.cos(sw) * 0.44, lz, 0.17, 0.92, 0.2, o.pants, heading, sw, 0);
    const aw = o.aim ? 0 : -swing * s * 0.8;
    const ax2 = x + rx * 0.36 * s + fx * Math.sin(aw) * 0.3;
    const az2 = z + rz * 0.36 * s + fz * Math.sin(aw) * 0.3;
    if (o.aim && s === 1) {
      // pistol arm points forward
      R.box(x + rx * 0.3 + fx * 0.34, 1.42, z + rz * 0.3 + fz * 0.34, 0.13, 0.13, 0.72, o.skin, heading);
      R.box(x + rx * 0.3 + fx * 0.72, 1.42, z + rz * 0.3 + fz * 0.72, 0.09, 0.14, 0.3, [0.12, 0.12, 0.14], heading);
    } else {
      R.box(ax2, 1.4 - Math.cos(aw) * 0.32, az2, 0.13, 0.72, 0.15, o.shirt, heading, aw, 0);
    }
  }
  R.box(x, 1.22, z, 0.54, 0.58, 0.27, o.shirt, heading);
  R.box(x, 1.68, z, 0.34, 0.36, 0.34, o.skin, heading);
  R.box(x, 1.88, z, 0.36, 0.09, 0.36, o.hair || [0.16, 0.12, 0.1], heading);
  if (o.punchT > 0) {
    R.box(x + fx * 0.55, 1.35, z + fz * 0.55, 0.14, 0.14, 0.5, o.skin, heading);
  }
}

export function drawPeds(R, state) {
  for (const ped of state.peds) {
    drawHumanoid(R, ped.x, ped.z, ped.heading, {
      shirt: ped.shirt, pants: ped.pants, skin: ped.skin,
      walkPhase: ped.walkPhase, swing: clamp(ped.speed * 0.24, 0, 0.62), dead: ped.dead,
      hair: ped.kind === 'enforcer' ? [0.05, 0.05, 0.05] : undefined,
    });
    if (ped.fare) {
      R.glowBox(ped.x, 2.6 + Math.sin(performance.now() / 300) * 0.15, ped.z, 0.3, 0.3, 0.3, [1, 0.82, 0.2], performance.now() / 500);
    }
  }
}

export function drawPickups(R, state) {
  for (const pk of state.pickups) {
    const bob = 0.55 + Math.sin(pk.t * 2) * 0.12;
    R.glowBox(pk.x, bob, pk.z, 0.55, 0.55, 0.55, [0.25, 0.95, 0.4], pk.t);
    R.groundQuad(pk.x, 0.11, pk.z, 2.6, 2.6, [0.3, 1, 0.45], 0.35, R.discUV);
  }
}
