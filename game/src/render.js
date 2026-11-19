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
  drawShorelineSparkle(ctx, state);
  drawBeachProps(ctx, state);
  // Marina pier planks.
  ctx.fillStyle = '#8a6b4f';
  ctx.fillRect(330, 2360, 220, 26);
  ctx.fillRect(420, 2360, 26, 130);

  drawRoads(ctx, state);
  drawHidingPads(ctx, state);
  drawBuildings(ctx, state);
  drawTrafficLights(ctx, state);
  drawPalms(ctx, state);

  // Mission / side-job beacon: a pillar of light anyone can read at a glance.
  const objective = state._objective;
  if (objective && objective.radius > 0) drawBeacon(ctx, state, objective.x, objective.y, PALETTE.accent2);
  if (state.mission.active) { /* beacon already set from objective */ }

  for (const car of state.cars) drawCar(ctx, state, car, false);
  for (const cop of state.policeCars) drawCar(ctx, state, cop, true);
  for (const ped of state.peds) drawPerson(ctx, state, ped, false);
  for (const cop of state.footCops) drawPerson(ctx, state, cop, true);
  drawPickups(ctx, state);
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
  drawCloudShadows(ctx, state);
}

// Animated sparkle along the waterline: short light dashes whose shimmer
// follows the world time, so the shore feels alive even standing still.
function drawShorelineSparkle(ctx, state) {
  const cam = state.camera;
  const y0 = state.city.waterY;
  const startX = Math.max(0, Math.floor((cam.x - 40) / 46) * 46);
  const endX = Math.min(WORLD.width, cam.x + VIEW.width + 40);
  for (let x = startX; x < endX; x += 46) {
    for (let row = 0; row < 2; row++) {
      const shimmer = 0.5 + 0.5 * Math.sin(state.time * 2.6 + x * 0.11 + row * 1.7);
      ctx.fillStyle = `rgba(255,252,215,${(0.10 + 0.30 * shimmer).toFixed(3)})`;
      const y = y0 + 5 + row * 13 + Math.sin(x * 0.02 + state.time * 1.2 + row) * 3;
      ctx.fillRect(x + (row ? 18 : 0), y, 20, 2.5);
    }
  }
}

// Beach umbrellas (coloured half-circles on a pole) and towels on the sand.
function drawBeachProps(ctx, state) {
  const cam = state.camera;
  for (const t of state.city.towels) {
    if (t.x < cam.x - 40 || t.x > cam.x + VIEW.width + 40 || t.y < cam.y - 40 || t.y > cam.y + VIEW.height + 40) continue;
    ctx.save();
    ctx.translate(t.x, t.y); ctx.rotate(t.angle);
    ctx.fillStyle = 'rgba(20,10,30,0.18)';
    ctx.fillRect(-15, -7, 32, 16);
    ctx.fillStyle = t.color;
    ctx.fillRect(-16, -8, 32, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(-16, -2, 32, 4);
    ctx.restore();
  }
  for (const u of state.city.umbrellas) {
    if (u.x < cam.x - 40 || u.x > cam.x + VIEW.width + 40 || u.y < cam.y - 40 || u.y > cam.y + VIEW.height + 40) continue;
    ctx.fillStyle = 'rgba(20,10,30,0.22)';
    ctx.beginPath(); ctx.ellipse(u.x + 5, u.y + 6, 17 * u.s, 7 * u.s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8a6b4f'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(u.x, u.y + 8); ctx.lineTo(u.x, u.y - 6 * u.s); ctx.stroke();
    ctx.fillStyle = u.color;
    ctx.beginPath(); ctx.arc(u.x, u.y - 5 * u.s, 17 * u.s, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(u.x, u.y - 5 * u.s, 17 * u.s, Math.PI * 1.22, Math.PI * 1.5); ctx.closePath(); ctx.fill();
  }
}

// The shaded H pads that mark hiding spots on the ground.
function drawHidingPads(ctx, state) {
  const cam = state.camera;
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const spot of state.city.hidingSpots) {
    if (spot.x < cam.x - 80 || spot.x > cam.x + VIEW.width + 80 || spot.y < cam.y - 80 || spot.y > cam.y + VIEW.height + 80) continue;
    ctx.fillStyle = 'rgba(18,14,38,0.30)';
    roundRect(ctx, spot.x - 42, spot.y - 42, 84, 84, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    ctx.setLineDash([7, 6]);
    roundRect(ctx, spot.x - 42, spot.y - 42, 84, 84, 12); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = 'bold 30px ' + FONT;
    ctx.fillText('H', spot.x, spot.y + 1);
  }
  ctx.restore();
}

// Traffic-light poles at the main intersections; the lamp cycles with world
// time, offset per intersection so the grid never blinks in unison.
const LIGHT_COLORS = ['#39d353', '#ffb020', '#ff3b30'];
function drawTrafficLights(ctx, state) {
  const cam = state.camera;
  let idx = 0;
  for (const rx of ROAD_XS) {
    for (const ry of ROAD_YS) {
      idx++;
      const x = rx + ROAD_W / 2 + 13;
      const y = ry - ROAD_W / 2 - 13;
      if (x < cam.x - 40 || x > cam.x + VIEW.width + 40 || y < cam.y - 60 || y > cam.y + VIEW.height + 40) continue;
      const phase = Math.floor(state.time / 3.5 + idx * 0.7) % 3;
      const color = LIGHT_COLORS[phase];
      ctx.strokeStyle = '#23202e'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x, y + 16); ctx.lineTo(x, y - 18); ctx.stroke();
      ctx.fillStyle = '#1b1826';
      roundRect(ctx, x - 6, y - 30, 12, 24, 4); ctx.fill();
      ctx.save();
      ctx.globalAlpha = 0.30;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y - 18, 10, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y - 18, 4.6, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// Spinning cash pickups dropped by fallen enforcers.
export function drawPickups(ctx, state) {
  for (const pk of state.pickups) {
    const bob = Math.sin(state.time * 4 + pk.phase) * 3;
    const squish = 0.72 + 0.28 * Math.abs(Math.sin(state.time * 3 + pk.phase));
    ctx.fillStyle = 'rgba(15,8,25,0.30)';
    ctx.beginPath(); ctx.ellipse(pk.x, pk.y + 7, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    ctx.scale(squish, 1);
    ctx.fillStyle = PALETTE.money;
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1d7a44'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#0d4d27';
    ctx.font = 'bold 14px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 1);
    ctx.restore();
  }
}

// Drifting cloud shadows: big, very soft dark ellipses sliding across the
// city in screen space. They fade out as night falls.
function drawCloudShadows(ctx, state) {
  const { darkness } = skyColors(state.dayTime);
  if (darkness > 0.38) return;
  const cam = state.camera;
  ctx.save();
  for (let i = 0; i < 5; i++) {
    const wx = ((state.time * (7 + i * 1.9) + i * 1150) % (WORLD.width + 1000)) - 500;
    const wy = 260 + i * 470 + Math.sin(state.time * 0.05 + i * 1.3) * 46;
    const sx = wx - cam.x; const sy = wy - cam.y;
    if (sx < -420 || sx > VIEW.width + 420 || sy < -220 || sy > VIEW.height + 220) continue;
    ctx.fillStyle = 'rgba(22,18,48,0.055)';
    ctx.beginPath(); ctx.ellipse(sx, sy, 330, 130, 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(22,18,48,0.075)';
    ctx.beginPath(); ctx.ellipse(sx, sy, 225, 88, 0.15, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
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

// A stable 0..1 hash from numbers, so rooftop details and window lights are
// the same on every frame and every visit without storing extra state.
function hash01(a, b, c) {
  const h = Math.sin(a * 12.9898 + b * 78.233 + (c || 0) * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

function drawBuildings(ctx, state) {
  const cam = state.camera;
  const darkness = skyColors(state.dayTime).darkness;
  for (const b of state.city.buildings) {
    if (b.x + b.w < cam.x - 60 || b.x > cam.x + VIEW.width + 60 || b.y + b.h < cam.y - 60 || b.y > cam.y + VIEW.height + 60) continue;
    // Shadow, body, roof.
    ctx.fillStyle = 'rgba(20,10,30,0.35)';
    ctx.fillRect(b.x + 10, b.y + 12, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(b.x, b.y, b.w, 10);
    // Parapet: a darker inset rim around the rooftop.
    ctx.strokeStyle = 'rgba(15,8,25,0.28)';
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
    // Window grid: as darkness grows, more windows glow warm, each on its own
    // deterministic hash so the pattern never flickers between frames.
    const cols = Math.max(2, Math.floor(b.w / 30));
    const rows = Math.max(2, Math.floor(b.h / 30));
    for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
      if ((cx * 7 + cy * 13 + b.floors) % 3 === 0) continue;
      const wx = b.x + 10 + cx * ((b.w - 20) / cols);
      const wy = b.y + 12 + cy * ((b.h - 20) / rows);
      if (hash01(b.x + cx * 31, b.y + cy * 57, b.floors) < darkness * 1.5) {
        ctx.fillStyle = 'rgba(255,205,110,0.92)';
      } else {
        ctx.fillStyle = 'rgba(24,28,48,0.55)';
      }
      ctx.fillRect(wx, wy, 11, 8);
    }
    drawRooftopDetails(ctx, b);
    if (b.sign) {
      ctx.fillStyle = 'rgba(12,8,24,0.85)';
      ctx.font = 'bold 13px ' + FONT;
      const width = ctx.measureText(b.sign).width + 16;
      ctx.fillRect(b.x + b.w / 2 - width / 2, b.y + b.h / 2 - 11, width, 22);
      ctx.fillStyle = '#ffd23f';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.sign, b.x + b.w / 2, b.y + b.h / 2 + 1);
      drawAwning(ctx, b);
    }
  }
}

// Rooftop clutter derived from the building's own position: an AC box on most
// roofs, a water tank on some, placed deterministically.
function drawRooftopDetails(ctx, b) {
  if (b.w < 56 || b.h < 56) return;
  const kind = hash01(b.x, b.y, 3);
  const dx = b.x + 12 + hash01(b.x, b.y, 5) * Math.max(4, b.w - 46);
  const dy = b.y + 12 + hash01(b.x, b.y, 9) * Math.max(4, b.h - 46);
  ctx.fillStyle = 'rgba(15,8,25,0.20)';
  if (kind < 0.42) {
    // AC unit: a slab with a fan circle.
    ctx.fillRect(dx + 3, dy + 3, 24, 18);
    ctx.fillStyle = 'rgba(230,230,238,0.5)';
    ctx.fillRect(dx, dy, 24, 18);
    ctx.strokeStyle = 'rgba(15,8,25,0.35)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(dx + 12, dy + 9, 6, 0, Math.PI * 2); ctx.stroke();
  } else if (kind < 0.68) {
    // Water tank: a squat cylinder seen from above.
    ctx.beginPath(); ctx.ellipse(dx + 11, dy + 12, 13, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(146,104,66,0.85)';
    ctx.beginPath(); ctx.ellipse(dx + 10, dy + 10, 13, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(90,60,34,0.9)';
    ctx.beginPath(); ctx.ellipse(dx + 10, dy + 10, 6.5, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  } else if (kind < 0.86) {
    // Skylight strip.
    ctx.fillStyle = 'rgba(170,225,255,0.5)';
    ctx.fillRect(dx, dy, 26, 12);
    ctx.strokeStyle = 'rgba(15,8,25,0.3)'; ctx.lineWidth = 1.6;
    ctx.strokeRect(dx, dy, 26, 12);
  }
}

// A striped ground-floor awning along the front of every signed building.
function drawAwning(ctx, b) {
  const y = b.y + b.h - 3;
  const x0 = b.x + 7;
  const x1 = b.x + b.w - 7;
  ctx.fillStyle = 'rgba(15,8,25,0.25)';
  ctx.fillRect(x0 + 2, y + 3, x1 - x0, 11);
  for (let x = x0, i = 0; x < x1; x += 12, i++) {
    ctx.fillStyle = i % 2 ? '#fff3e0' : PALETTE.accent;
    ctx.fillRect(x, y, Math.min(12, x1 - x), 11);
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
  // Braking is read off the speed trace: any sharp drop since the last drawn
  // frame lights the brake lamps (traffic braking, police braking, the player
  // standing on the pedal, even a crash check).
  const prevSpeed = car._ps === undefined ? car.speed : car._ps;
  const braking = !car.dead && car.speed < prevSpeed - 1.2;
  car._ps = car.speed;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Soft ellipse shadow + body.
  ctx.fillStyle = 'rgba(15,8,25,0.38)';
  ctx.beginPath(); ctx.ellipse(2, 3, 34, 17.5, 0, 0, Math.PI * 2); ctx.fill();
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
  // Tail lamps: dim red always, flaring with a glow halo while braking.
  if (braking) {
    ctx.fillStyle = 'rgba(255,45,45,0.32)';
    ctx.beginPath(); ctx.arc(-28, -8, 9, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-28, 8, 9, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = braking ? '#ff2d2d' : 'rgba(200,40,50,0.75)';
  ctx.fillRect(-28.5, -11, 3.4, 6);
  ctx.fillRect(-28.5, 5, 3.4, 6);
  // Taxis carry a little lit roof bar on top of their sign colour.
  if (!isPolice && car.name === 'Harbor Taxi' && !car.dead) {
    ctx.fillStyle = '#fff7e6';
    roundRect(ctx, -6, -4.5, 13, 9, 3); ctx.fill();
    ctx.fillStyle = '#160f22';
    ctx.fillRect(-3.5, -1.4, 8, 2.8);
  }
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
