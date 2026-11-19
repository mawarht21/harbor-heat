// Drawing the world: Solana Bay at golden hour sliding into neon night.
// Roads with lane paint, sidewalks, named rooftops, the beach and marina, palms,
// cars with headlights, people, tracers and particles — then a light overlay
// whose colour follows the time of day.

import { FONT, PALETTE, VIEW, WORLD } from './config.js';
import { ROAD_W, ROAD_XS, ROAD_YS } from './city.js';

export function skyColors(dayTime) {
  // dayTime 0..1: 0.25 sunrise, 0.5 noon, 0.68 golden, 0.8 dusk, 0.95 night.
  const stops = [
    [0.0, '#1b2340', 0.55], [0.22, '#f7a56b', 0.12], [0.42, '#ffe9b8', 0.0],
    [0.62, '#ffd9a0', 0.05], [0.72, '#ff9e6b', 0.18], [0.84, '#5b4a8a', 0.38], [1.0, '#141a38', 0.55],
  ];
  let a = stops[0]; let b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (dayTime >= stops[i][0] && dayTime <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
  }
  const t = (dayTime - a[0]) / Math.max(0.0001, b[0] - a[0]);
  return { tint: a[1], darkness: a[2] + (b[2] - a[2]) * t };
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function drawWorld(ctx, state) {
  const cam = state.camera;
  const shakeX = state.cameraShake > 0 ? (state.rng() - 0.5) * state.cameraShake * 22 : 0;
  const shakeY = state.cameraShake > 0 ? (state.rng() - 0.5) * state.cameraShake * 22 : 0;
  ctx.save();
  ctx.translate(-Math.round(cam.x + shakeX), -Math.round(cam.y + shakeY));

  // Ground: grass, then beach sand and water along the south shore.
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(cam.x - 40, cam.y - 40, VIEW.width + 80, VIEW.height + 80);
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(0, state.city.beachY, WORLD.width, 170);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(0, state.city.waterY, WORLD.width, 220);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    const y = state.city.waterY + 24 + i * 22 + Math.sin(state.time * 1.4 + i) * 4;
    ctx.beginPath(); ctx.moveTo(Math.max(0, cam.x - 20), y); ctx.lineTo(Math.min(WORLD.width, cam.x + VIEW.width + 20), y); ctx.stroke();
  }
  // Marina pier planks.
  ctx.fillStyle = '#8a6b4f';
  ctx.fillRect(330, 2360, 220, 26);
  ctx.fillRect(420, 2360, 26, 130);

  drawRoads(ctx, state);
  drawBuildings(ctx, state);
  drawPalms(ctx, state);

  // Mission / side-job beacon: a pillar of light anyone can read at a glance.
  const objective = state._objective;
  if (objective && objective.radius > 0) drawBeacon(ctx, state, objective.x, objective.y, PALETTE.accent2);
  if (state.mission.active) { /* beacon already set from objective */ }

  for (const car of state.cars) drawCar(ctx, state, car, false);
  for (const cop of state.policeCars) drawCar(ctx, state, cop, true);
  for (const ped of state.peds) drawPerson(ctx, state, ped, false);
  for (const cop of state.footCops) drawPerson(ctx, state, cop, true);
  if (!state.player.inCar) drawPlayer(ctx, state);

  // Bullets and particles.
  ctx.strokeStyle = '#ffe66d'; ctx.lineWidth = 3;
  for (const b of state.bullets) {
    ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  for (const pt of state.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  drawLighting(ctx, state);
}

function drawRoads(ctx, state) {
  ctx.fillStyle = PALETTE.sidewalk;
  for (const rx of ROAD_XS) ctx.fillRect(rx - ROAD_W / 2 - 16, 0, ROAD_W + 32, 2340);
  for (const ry of ROAD_YS) ctx.fillRect(0, ry - ROAD_W / 2 - 16, WORLD.width, ROAD_W + 32);
  ctx.fillStyle = PALETTE.road;
  for (const rx of ROAD_XS) ctx.fillRect(rx - ROAD_W / 2, 0, ROAD_W, 2340);
  for (const ry of ROAD_YS) ctx.fillRect(0, ry - ROAD_W / 2, WORLD.width, ROAD_W);
  ctx.strokeStyle = PALETTE.lane;
  ctx.lineWidth = 4; ctx.setLineDash([26, 22]);
  for (const rx of ROAD_XS) { ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx, 2340); ctx.stroke(); }
  for (const ry of ROAD_YS) { ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(WORLD.width, ry); ctx.stroke(); }
  ctx.setLineDash([]);
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const rx of ROAD_XS) for (const ry of ROAD_YS) {
    for (let i = -2; i <= 2; i++) ctx.fillRect(rx - ROAD_W / 2 + 6, ry + i * 20 - 5, 16, 10);
  }
  void state;
}

function drawBuildings(ctx, state) {
  const cam = state.camera;
  for (const b of state.city.buildings) {
    if (b.x + b.w < cam.x - 60 || b.x > cam.x + VIEW.width + 60 || b.y + b.h < cam.y - 60 || b.y > cam.y + VIEW.height + 60) continue;
    // Shadow, body, roof.
    ctx.fillStyle = 'rgba(20,10,30,0.35)';
    ctx.fillRect(b.x + 10, b.y + 12, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(b.x, b.y, b.w, 10);
    // Windows: lit at dusk and night.
    const lit = skyColors(state.dayTime).darkness > 0.2;
    ctx.fillStyle = lit ? 'rgba(255,214,120,0.9)' : 'rgba(24,28,48,0.55)';
    const cols = Math.max(2, Math.floor(b.w / 30));
    const rows = Math.max(2, Math.floor(b.h / 30));
    for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
      if ((cx * 7 + cy * 13 + b.floors) % 3 === 0) continue;
      ctx.fillRect(b.x + 10 + cx * ((b.w - 20) / cols), b.y + 12 + cy * ((b.h - 20) / rows), 11, 8);
    }
    if (b.sign) {
      ctx.fillStyle = 'rgba(12,8,24,0.85)';
      const tw = ctx.measureText(b.sign).width;
      void tw;
      ctx.font = 'bold 13px ' + FONT;
      const width = ctx.measureText(b.sign).width + 16;
      ctx.fillRect(b.x + b.w / 2 - width / 2, b.y + b.h / 2 - 11, width, 22);
      ctx.fillStyle = '#ffd23f';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.sign, b.x + b.w / 2, b.y + b.h / 2 + 1);
    }
  }
}

function drawPalms(ctx, state) {
  const cam = state.camera;
  for (const palm of state.city.palms) {
    if (palm.x < cam.x - 40 || palm.x > cam.x + VIEW.width + 40 || palm.y < cam.y - 40 || palm.y > cam.y + VIEW.height + 40) continue;
    ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 5 * palm.s;
    ctx.beginPath(); ctx.moveTo(palm.x, palm.y); ctx.lineTo(palm.x + 6 * palm.s, palm.y - 16 * palm.s); ctx.stroke();
    ctx.strokeStyle = '#2e9e5b'; ctx.lineWidth = 3.4 * palm.s;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.moveTo(palm.x + 6 * palm.s, palm.y - 16 * palm.s);
      ctx.lineTo(palm.x + 6 * palm.s + Math.cos(a) * 17 * palm.s, palm.y - 16 * palm.s + Math.sin(a) * 9 * palm.s);
      ctx.stroke();
    }
  }
  void hexToRgb;
}

export function drawBeacon(ctx, state, x, y, color) {
  const pulse = 1 + Math.sin(state.time * 5) * 0.12;
  ctx.save();
  ctx.globalAlpha = 0.20;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, y, 52 * pulse, 20 * pulse, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.30;
  const grad = ctx.createLinearGradient(x, y - 190, x, y);
  grad.addColorStop(0, 'rgba(255,210,63,0)');
  grad.addColorStop(1, 'rgba(255,210,63,0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(x - 13, y - 190, 26, 190);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#160f22';
  ctx.font = 'bold 13px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('!', x, y + 1);
  ctx.restore();
}

export function drawCar(ctx, state, car, isPolice) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow + body.
  ctx.fillStyle = 'rgba(15,8,25,0.4)';
  ctx.fillRect(-24, -10, 56, 28);
  ctx.fillStyle = car.dead ? '#3a3a44' : car.color;
  roundRect(ctx, -27, -14, 54, 28, 8); ctx.fill();
  ctx.fillStyle = isPolice ? '#2b50c8' : 'rgba(18,22,38,0.88)';
  roundRect(ctx, -8, -11, 22, 22, 5); ctx.fill();
  ctx.fillStyle = 'rgba(180,230,255,0.85)';
  ctx.fillRect(10, -9, 5, 18);
  // Wheels.
  ctx.fillStyle = '#14141c';
  ctx.fillRect(-20, -17, 12, 5); ctx.fillRect(-20, 12, 12, 5);
  ctx.fillRect(9, -17, 12, 5); ctx.fillRect(9, 12, 12, 5);
  if (isPolice) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-24, -3, 48, 6);
    const phase = Math.sin((car.lightPhase || 0)) > 0;
    ctx.fillStyle = phase ? PALETTE.policeLightA : PALETTE.policeLightB;
    ctx.beginPath(); ctx.arc(1, 0, 5.4, 0, Math.PI * 2); ctx.fill();
    // Headlight glow at night.
    if (skyColors(state.dayTime).darkness > 0.18) {
      ctx.fillStyle = 'rgba(255,240,180,0.12)';
      ctx.beginPath(); ctx.moveTo(27, -10); ctx.lineTo(72, -20); ctx.lineTo(72, 20); ctx.lineTo(27, 10); ctx.fill();
    }
  } else if (skyColors(state.dayTime).darkness > 0.18) {
    ctx.fillStyle = 'rgba(255,240,180,0.09)';
    ctx.beginPath(); ctx.moveTo(27, -10); ctx.lineTo(64, -17); ctx.lineTo(64, 17); ctx.lineTo(27, 10); ctx.fill();
  }
  if (car.dead) { ctx.fillStyle = 'rgba(30,30,30,0.5)'; roundRect(ctx, -27, -14, 54, 28, 8); ctx.fill(); }
  ctx.restore();
  if (car.kind === 'player' || isPolice) {
    ctx.fillStyle = 'rgba(12,8,24,0.66)';
    ctx.font = 'bold 11px ' + FONT; ctx.textAlign = 'center';
    const label = isPolice ? 'SBPD' : car.name;
    const w = ctx.measureText(label).width + 12;
    ctx.fillRect(car.x - w / 2, car.y - 34, w, 16);
    ctx.fillStyle = '#fff7e6';
    ctx.fillText(label, car.x, car.y - 22);
  }
}

export function drawPerson(ctx, state, ped, isCop) {
  if (ped.dead) {
    ctx.fillStyle = 'rgba(120,20,30,0.55)';
    ctx.beginPath(); ctx.ellipse(ped.x, ped.y, 13, 7, ped.angle, 0, Math.PI * 2); ctx.fill();
    return;
  }
  const bob = Math.sin(ped.walkPhase || 0) * 1.6;
  ctx.fillStyle = 'rgba(15,8,25,0.32)';
  ctx.beginPath(); ctx.ellipse(ped.x, ped.y + 5, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = isCop ? '#2b50c8' : ped.color;
  ctx.beginPath(); ctx.arc(ped.x, ped.y + bob * 0.3, 9.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath(); ctx.arc(ped.x, ped.y + bob * 0.3, 5.2, 0, Math.PI * 2); ctx.fill();
  if (ped.enforcer) {
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 10px ' + FONT; ctx.textAlign = 'center';
    ctx.fillText('VASCO', ped.x, ped.y - 17);
    // Health pips for enforcers.
    ctx.fillStyle = 'rgba(12,8,24,0.7)'; ctx.fillRect(ped.x - 14, ped.y - 30, 28, 5);
    ctx.fillStyle = '#ef476f'; ctx.fillRect(ped.x - 14, ped.y - 30, 28 * Math.max(0, ped.health) / 100, 5);
  }
  if (isCop) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px ' + FONT; ctx.textAlign = 'center';
    ctx.fillText('POLICE', ped.x, ped.y - 16);
  }
  void state;
}

export function drawPlayer(ctx, state) {
  const p = state.player;
  const bob = p.moving ? Math.sin(p.walkPhase || 0) * 1.8 : 0;
  ctx.fillStyle = 'rgba(15,8,25,0.38)';
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 6, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
  // Direction tick.
  ctx.strokeStyle = PALETTE.player; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(p.angle) * 19, p.y + Math.sin(p.angle) * 19); ctx.stroke();
  // A bright ring so the player reads at a glance in a crowded street.
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.arc(p.x, p.y + bob * 0.3, 14.5, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = PALETTE.player;
  ctx.beginPath(); ctx.arc(p.x, p.y + bob * 0.3, 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8d5524';
  ctx.beginPath(); ctx.arc(p.x, p.y + bob * 0.3, 6.2, 0, Math.PI * 2); ctx.fill();
  if (p.weapon === 'pistol') {
    ctx.strokeStyle = '#222'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(p.angle) * 24, p.y + Math.sin(p.angle) * 24); ctx.stroke();
  }
  if (p.punchAnim > 0) {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x + Math.cos(p.angle) * 22, p.y + Math.sin(p.angle) * 22, 8, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawLighting(ctx, state) {
  const { darkness } = skyColors(state.dayTime);
  if (darkness > 0.02) {
    ctx.fillStyle = `rgba(16,14,52,${darkness.toFixed(3)})`;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }
  // Golden-hour warmth wash.
  if (state.dayTime > 0.58 && state.dayTime < 0.8) {
    ctx.fillStyle = 'rgba(255,140,60,0.10)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }
  // Street lamp glow pools at night, in screen space from world lamps nearby.
  if (darkness > 0.32) {
    const cam = state.camera;
    ctx.save();
    ctx.globalAlpha = 0.09;
    ctx.fillStyle = '#ffd98a';
    for (const lamp of state.city.lamps) {
      const sx = lamp.x - cam.x; const sy = lamp.y - cam.y;
      if (sx < -50 || sx > VIEW.width + 50 || sy < -50 || sy > VIEW.height + 50) continue;
      ctx.beginPath(); ctx.arc(sx, sy, 23, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  if (state.hurtFlash > 0) {
    ctx.fillStyle = `rgba(220,30,50,${(state.hurtFlash * 0.5).toFixed(3)})`;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
