// Combat: fists when close, a pistol once Mara hands one over in the story.
// Bullets are short-lived tracers; hits spawn particles, cost health, and —
// when witnessed — raise the wanted heat.

import { CRIMES, PLAYER } from './config.js';
import { addCrime } from './wanted.js';
import { distance } from './random.js';

export function spawnParticles(state, x, y, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const a = state.rng() * Math.PI * 2;
    const s = (speed || 120) * (0.3 + state.rng() * 0.9);
    state.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.45 + state.rng() * 0.4, maxLife: 0.8, color, size: 2 + state.rng() * 3,
    });
  }
}

// A fallen enforcer drops their pocket cash as a spinning $ pickup. Walking
// (or driving) over it banks the money — the only thing that persists is the
// cash itself, through the normal money save.
export function dropCashPickup(state, x, y) {
  state.pickups.push({
    x, y,
    amount: 40 + Math.floor(state.rng() * 51),
    phase: state.rng() * Math.PI * 2,
  });
}

export function updatePickups(state, dt) {
  void dt;
  const p = state.player;
  for (const pk of state.pickups) {
    if (Math.hypot(p.x - pk.x, p.y - pk.y) < 32) {
      pk.taken = true;
      p.money += pk.amount;
      state.toast = `+$${pk.amount} — pocket cash.`;
      state.toastTime = 2.0;
      if (state.audio) state.audio.cash();
      spawnParticles(state, pk.x, pk.y, '#7bf1a8', 7, 110);
    }
  }
  if (state.pickups.some((pk) => pk.taken)) state.pickups = state.pickups.filter((pk) => !pk.taken);
}

export function updateParticles(state, dt) {
  for (const pt of state.particles) {
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    pt.vx *= 0.88; pt.vy *= 0.88; pt.life -= dt;
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);
}

export function tryAttack(state, input) {
  const p = state.player;
  if (p.inCar || p.attackCd > 0) return;
  const mouse = input.mouse();
  const aimWorldX = state.camera.x + mouse.x;
  const aimWorldY = state.camera.y + mouse.y;
  p.angle = Math.atan2(aimWorldY - p.y, aimWorldX - p.x);
  if (p.weapon === 'pistol') {
    p.attackCd = PLAYER.shotCooldown;
    state.bullets.push({
      x: p.x + Math.cos(p.angle) * 20, y: p.y + Math.sin(p.angle) * 20,
      vx: Math.cos(p.angle) * PLAYER.bulletSpeed, vy: Math.sin(p.angle) * PLAYER.bulletSpeed,
      life: 0.55, fromPlayer: true,
    });
    spawnParticles(state, p.x + Math.cos(p.angle) * 24, p.y + Math.sin(p.angle) * 24, '#ffd23f', 3, 60);
    if (state.audio) state.audio.shot();
    addCrime(state, CRIMES.shotFired, 'Shots fired');
    return;
  }
  // Fists: hit whoever stands in the punch arc.
  p.attackCd = PLAYER.punchCooldown;
  p.punchAnim = 0.18;
  if (state.audio) state.audio.punch();
  let hitSomeone = false;
  const targets = [...state.peds, ...state.footCops];
  for (const ped of targets) {
    if (ped.dead) continue;
    if (distance(p.x, p.y, ped.x, ped.y) < PLAYER.punchRange) {
      ped.health -= PLAYER.punchDamage;
      ped.panic = 3;
      hitSomeone = true;
      spawnParticles(state, ped.x, ped.y, '#ff5964', 6, 130);
      if (state.audio) state.audio.hit();
      if (ped.health <= 0) {
        ped.dead = true;
        if (ped.enforcer) { state.stats.enforcersDown++; dropCashPickup(state, ped.x, ped.y); }
        else state.stats.pedsDown++;
      }
    }
  }
  if (hitSomeone) addCrime(state, CRIMES.punchPerson, 'Assault');
}

export function updateBullets(state, dt) {
  for (const b of state.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    // Bullets stop at buildings.
    for (const bd of state.city.buildings) {
      if (b.x > bd.x && b.x < bd.x + bd.w && b.y > bd.y && b.y < bd.y + bd.h) { b.life = 0; break; }
    }
    if (b.life <= 0) continue;
    const targets = [...state.peds, ...state.footCops];
    for (const ped of targets) {
      if (ped.dead) continue;
      if (Math.hypot(ped.x - b.x, ped.y - b.y) < 14) {
        ped.health -= 55; b.life = 0;
        spawnParticles(state, ped.x, ped.y, '#ff5964', 8, 150);
        if (ped.health <= 0) {
          ped.dead = true;
          if (ped.enforcer) { state.stats.enforcersDown++; dropCashPickup(state, ped.x, ped.y); }
          else state.stats.pedsDown++;
        }
        break;
      }
    }
    if (b.life <= 0) continue;
    for (const cop of state.policeCars) {
      if (!cop.dead && Math.hypot(cop.x - b.x, cop.y - b.y) < 26) {
        cop.health -= 26; b.life = 0;
        spawnParticles(state, cop.x, cop.y, '#ffd23f', 5, 120);
        if (cop.health <= 0) cop.dead = true;
        break;
      }
    }
  }
  state.bullets = state.bullets.filter((b) => b.life > 0);
}

export function damagePlayer(state, amount) {
  const p = state.player;
  p.health -= amount;
  state.hurtFlash = 0.4;
  if (p.health <= 0) {
    p.health = 0;
    state.mode = 'gameover';
    if (state.audio) state.audio.busted();
    if (state.audio) state.audio.setSiren(false);
  }
}
