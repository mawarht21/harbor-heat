// The HUD and every screen that is not the world itself: minimap, wanted stars,
// health and money, the mission objective with its distance, dialog boxes, the
// title / pause / busted / wasted / ending screens and the controls card.

import { FONT, PALETTE, VIEW, WORLD } from './config.js';
import { ROAD_XS, ROAD_YS } from './city.js';
import { STORY } from './missions.js';
import { roundRect, skyColors } from './render.js';

const MAP = { x: 18, y: 18, w: 218, h: 158 };

export function drawHUD(ctx, state) {
  drawMinimap(ctx, state);
  drawTopRight(ctx, state);
  drawObjective(ctx, state);
  drawBottomLeft(ctx, state);
  if (state.mission.dialog) drawDialog(ctx, state);
  if (state.toastTime > 0 && state.toast) drawToast(ctx, state);
  if (state.wanted.bustMeter > 0.03 && state.mode === 'play') drawBustMeter(ctx, state);
  if (state.crimeFlash > 0) drawCrimeFlash(ctx, state);
}

function drawMinimap(ctx, state) {
  ctx.save();
  ctx.fillStyle = PALETTE.hudPanel;
  roundRect(ctx, MAP.x - 6, MAP.y - 6, MAP.w + 12, MAP.h + 30, 10); ctx.fill();
  const sx = MAP.w / WORLD.width;
  const sy = MAP.h / 2540;
  ctx.fillStyle = '#3f7d54';
  ctx.fillRect(MAP.x, MAP.y, MAP.w, MAP.h);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(MAP.x, MAP.y + state.city.waterY * sy, MAP.w, MAP.h - state.city.waterY * sy);
  ctx.strokeStyle = '#585270'; ctx.lineWidth = 3;
  for (const rx of ROAD_XS) { ctx.beginPath(); ctx.moveTo(MAP.x + rx * sx, MAP.y); ctx.lineTo(MAP.x + rx * sx, MAP.y + MAP.h); ctx.stroke(); }
  for (const ry of ROAD_YS) { ctx.beginPath(); ctx.moveTo(MAP.x, MAP.y + ry * sy); ctx.lineTo(MAP.x + MAP.w, MAP.y + ry * sy); ctx.stroke(); }
  // Buildings as faint blocks.
  ctx.fillStyle = 'rgba(240,220,190,0.5)';
  for (const b of state.city.buildings) ctx.fillRect(MAP.x + b.x * sx, MAP.y + b.y * sy, Math.max(2, b.w * sx), Math.max(2, b.h * sy));
  // Police blips.
  for (const cop of state.policeCars) {
    ctx.fillStyle = Math.sin(cop.lightPhase || 0) > 0 ? '#ff3b30' : '#3b82f6';
    ctx.fillRect(MAP.x + cop.x * sx - 2.5, MAP.y + cop.y * sy - 2.5, 5, 5);
  }
  for (const cop of state.footCops) { ctx.fillStyle = '#3b82f6'; ctx.fillRect(MAP.x + cop.x * sx - 2, MAP.y + cop.y * sy - 2, 4, 4); }
  // Objective blip.
  const obj = state._objective;
  if (obj) {
    ctx.fillStyle = PALETTE.accent2;
    ctx.beginPath(); ctx.arc(MAP.x + obj.x * sx, MAP.y + obj.y * sy, 4.6 + Math.sin(state.time * 6) * 1.2, 0, Math.PI * 2); ctx.fill();
  }
  // Player arrow.
  const px = MAP.x + state.player.x * sx;
  const py = MAP.y + state.player.y * sy;
  ctx.save();
  ctx.translate(px, py); ctx.rotate(state.player.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -4.6); ctx.lineTo(-5, 4.6); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = 'bold 12px ' + FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('SOLANA BAY — ' + state.district, MAP.x, MAP.y + MAP.h + 20);
  ctx.restore();
}

function drawTopRight(ctx, state) {
  const x = VIEW.width - 18;
  ctx.save();
  ctx.textAlign = 'right';
  // Wanted stars.
  ctx.font = '30px ' + FONT;
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < state.wanted.stars ? PALETTE.star : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', x - (4 - i) * 30, 44);
  }
  if (state.wanted.stars > 0 && !state.wanted.seenByPolice) {
    ctx.font = 'bold 12px ' + FONT; ctx.fillStyle = '#7bf1a8';
    ctx.fillText('LOSING THEM…', x, 66);
  }
  // Clock.
  const hours = Math.floor(state.dayTime * 24);
  const mins = Math.floor((state.dayTime * 24 - hours) * 60);
  ctx.font = 'bold 15px ' + FONT; ctx.fillStyle = PALETTE.hudText;
  ctx.fillText(`${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`, x, 92);
  // Money and respect.
  ctx.font = 'bold 24px ' + FONT; ctx.fillStyle = PALETTE.money;
  ctx.fillText('$' + state.player.money.toLocaleString('en-US'), x, 124);
  ctx.font = 'bold 13px ' + FONT; ctx.fillStyle = PALETTE.hudMuted;
  ctx.fillText('RESPECT ' + state.player.respect + ' · ' + (state.player.weapon === 'pistol' ? 'PISTOL' : 'FISTS'), x, 146);
  ctx.restore();
}

function drawObjective(ctx, state) {
  const obj = state._objective;
  ctx.save();
  ctx.fillStyle = PALETTE.hudPanel;
  roundRect(ctx, VIEW.width / 2 - 330, 14, 660, state.mission.active || obj ? 58 : 40, 10); ctx.fill();
  ctx.textAlign = 'center';
  if (state.storyDone) {
    ctx.fillStyle = PALETTE.accent2; ctx.font = 'bold 17px ' + FONT;
    ctx.fillText('STORY COMPLETE — free roam: taxi fares, the Harbor Run race, pure heat', VIEW.width / 2, 50);
  } else if (obj) {
    const dist = obj.radius === 0 ? 0 : Math.round(Math.hypot(state.player.x - obj.x, state.player.y - obj.y) / 10);
    ctx.fillStyle = PALETTE.accent2; ctx.font = 'bold 15px ' + FONT;
    const title = state.mission.active ? STORY[state.mission.index].title : 'SIDE JOB';
    ctx.fillText(title, VIEW.width / 2, 36);
    ctx.fillStyle = PALETTE.hudText; ctx.font = '14px ' + FONT;
    ctx.fillText(obj.label + (dist ? `  —  ${dist}m` : ''), VIEW.width / 2, 58);
    if (state.mission.timer > 0) {
      ctx.fillStyle = state.mission.timer < 20 ? '#ff5964' : PALETTE.accent2;
      ctx.font = 'bold 15px ' + FONT;
      ctx.fillText('⏱ ' + Math.ceil(state.mission.timer) + 's', VIEW.width / 2, 92);
    }
    if (state.mission.active && STORY[state.mission.index].steps[state.mission.stage].kind === 'fight') {
      ctx.fillStyle = '#ff8fa3'; ctx.font = 'bold 13px ' + FONT;
      ctx.fillText('Enforcers standing: ' + (state.mission.fightLeft ?? 3), VIEW.width / 2, 92);
    }
  } else {
    ctx.fillStyle = PALETTE.hudText; ctx.font = 'bold 15px ' + FONT;
    ctx.fillText('Walk into the gold beacon to start: ' + (STORY[state.mission.index] ? STORY[state.mission.index].title : 'Free roam'), VIEW.width / 2, 40);
  }
  ctx.restore();
  // Direction arrow to the objective at the screen edge of the player view.
  if (obj && obj.radius > 0) drawObjectiveArrow(ctx, state, obj);
}

function drawObjectiveArrow(ctx, state, obj) {
  const sx = state.player.x - state.camera.x;
  const sy = state.player.y - state.camera.y;
  const a = Math.atan2(obj.y - state.player.y, obj.x - state.player.x);
  const ax = sx + Math.cos(a) * 54;
  const ay = sy + Math.sin(a) * 54;
  ctx.save();
  ctx.translate(ax, ay); ctx.rotate(a);
  ctx.fillStyle = PALETTE.accent2;
  ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-7, -7); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawBottomLeft(ctx, state) {
  const x = 18; const y = VIEW.height - 64;
  ctx.save();
  ctx.fillStyle = PALETTE.hudPanel;
  roundRect(ctx, x - 6, y - 8, 300, 62, 10); ctx.fill();
  // Health bar.
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x, y, 190, 13);
  ctx.fillStyle = state.player.health > 30 ? PALETTE.health : '#ff2020';
  ctx.fillRect(x, y, 190 * Math.max(0, state.player.health) / 100, 13);
  ctx.fillStyle = PALETTE.hudText; ctx.font = 'bold 11px ' + FONT; ctx.textAlign = 'left';
  ctx.fillText('HEALTH ' + Math.ceil(state.player.health), x, y - 12 + 24);
  if (state.player.inCar) {
    const car = state.player.inCar;
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x, y + 20, 190, 9);
    ctx.fillStyle = '#4cc9f0'; ctx.fillRect(x, y + 20, 190 * Math.max(0, car.health) / 100, 9);
    ctx.fillStyle = PALETTE.hudText; ctx.font = 'bold 14px ' + FONT;
    ctx.fillText(car.name, x, y + 48);
    ctx.textAlign = 'right';
    ctx.font = 'bold 20px ' + FONT; ctx.fillStyle = PALETTE.accent2;
    ctx.fillText(state.speedKmh + ' km/h', x + 294, y + 26);
    ctx.font = '11px ' + FONT; ctx.fillStyle = PALETTE.hudMuted;
    ctx.fillText('E — get out', x + 294, y + 44);
  } else {
    ctx.fillStyle = PALETTE.hudMuted; ctx.font = '12px ' + FONT;
    ctx.fillText('E — steal / enter car · F or Click — attack · Shift — sprint', x, y + 44);
  }
  if (state.saveFlash > 0) {
    ctx.fillStyle = '#7bf1a8'; ctx.font = 'bold 12px ' + FONT;
    ctx.fillText('✓ SAVED', x + 200, y + 12);
  }
  ctx.restore();
}

function drawDialog(ctx, state) {
  const d = state.mission.dialog;
  ctx.save();
  ctx.fillStyle = PALETTE.dialog;
  roundRect(ctx, VIEW.width / 2 - 430, VIEW.height - 148, 860, 86, 12); ctx.fill();
  ctx.strokeStyle = PALETTE.accent; ctx.lineWidth = 2;
  roundRect(ctx, VIEW.width / 2 - 430, VIEW.height - 148, 860, 86, 12); ctx.stroke();
  ctx.fillStyle = PALETTE.accent; ctx.font = 'bold 14px ' + FONT; ctx.textAlign = 'left';
  ctx.fillText(d.who.toUpperCase(), VIEW.width / 2 - 408, VIEW.height - 118);
  ctx.fillStyle = PALETTE.hudText; ctx.font = '15px ' + FONT;
  wrapText(ctx, d.text, VIEW.width / 2 - 408, VIEW.height - 94, 816, 20);
  ctx.restore();
}

function drawToast(ctx, state) {
  ctx.save();
  ctx.globalAlpha = Math.min(1, state.toastTime);
  ctx.fillStyle = PALETTE.hudPanel;
  const w = ctx.measureText(state.toast).width + 44;
  ctx.font = 'bold 15px ' + FONT;
  const width = Math.max(280, ctx.measureText(state.toast).width + 44);
  void w;
  roundRect(ctx, VIEW.width / 2 - width / 2, 108, width, 36, 9); ctx.fill();
  ctx.fillStyle = '#ffe9a8'; ctx.textAlign = 'center';
  ctx.fillText(state.toast, VIEW.width / 2, 132);
  ctx.restore();
}

function drawBustMeter(ctx, state) {
  ctx.save();
  ctx.fillStyle = PALETTE.hudPanel;
  roundRect(ctx, VIEW.width / 2 - 130, 160, 260, 34, 8); ctx.fill();
  ctx.fillStyle = '#ff3b30';
  ctx.fillRect(VIEW.width / 2 - 120, 176, 240 * state.wanted.bustMeter, 8);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 13px ' + FONT; ctx.textAlign = 'center';
  ctx.fillText('BUSTED METER — MOVE!', VIEW.width / 2, 170);
  ctx.restore();
}

function drawCrimeFlash(ctx, state) {
  ctx.save();
  ctx.globalAlpha = Math.min(1, state.crimeFlash);
  ctx.fillStyle = '#ff8fa3'; ctx.font = 'bold 14px ' + FONT; ctx.textAlign = 'right';
  ctx.fillText('⚠ ' + state.crimeText, VIEW.width - 20, 172);
  ctx.restore();
}

export function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = ''; let yy = y;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy); line = word; yy += lineHeight;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}

// --- Full screens ------------------------------------------------------------

export function drawTitleScreen(ctx, state, hasSaveGame) {
  const { darkness } = skyColors(0.70);
  void darkness;
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  grad.addColorStop(0, '#2b1055'); grad.addColorStop(0.55, '#7597de'); grad.addColorStop(0.78, '#ff9e6b'); grad.addColorStop(1, '#160f22');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  // Sun, sea and skyline silhouette.
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath(); ctx.arc(VIEW.width / 2, 408, 92, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1d1440';
  const skyline = [40, 130, 90, 210, 150, 260, 120, 300, 180, 240, 320, 160, 220, 110, 280, 140, 200, 90];
  skyline.forEach((h0, i) => { const h = h0 * 0.58; ctx.fillRect(30 + i * 72, 470 - h, 56, h + 130); });
  // Lit windows on the skyline.
  ctx.fillStyle = 'rgba(255,214,120,0.85)';
  skyline.forEach((h0, i) => {
    const h = h0 * 0.58;
    for (let wnd = 0; wnd < 4; wnd++) {
      if ((i * 3 + wnd * 7) % 3 === 0) continue;
      ctx.fillRect(38 + i * 72 + (wnd % 2) * 22, 486 - h + Math.floor(wnd / 2) * 30 + (i % 3) * 9, 8, 10);
    }
  });
  ctx.fillStyle = '#123a5c'; ctx.fillRect(0, 560, VIEW.width, 160);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 12; i++) ctx.fillRect(60 + i * 105, 592 + (i % 4) * 26, 52, 3);
  // Palms silhouette.
  ctx.strokeStyle = '#0d0a24'; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(120, 600); ctx.quadraticCurveTo(140, 470, 180, 420); ctx.stroke();
  ctx.lineWidth = 6;
  for (let i = 0; i < 6; i++) { const a = i * 1.05; ctx.beginPath(); ctx.moveTo(180, 420); ctx.lineTo(180 + Math.cos(a) * 62, 420 + Math.sin(a) * 30 - 14); ctx.stroke(); }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff7e6';
  ctx.font = '900 96px ' + FONT;
  ctx.fillText('HARBOR HEAT', VIEW.width / 2, 168);
  ctx.fillStyle = PALETTE.accent2; ctx.font = 'bold 21px ' + FONT;
  ctx.fillText('S O L A N A   B A Y   ·   A N   O P E N - W O R L D   C R I M E   S T O R Y', VIEW.width / 2, 208);
  ctx.fillStyle = 'rgba(12,8,24,0.78)';
  roundRect(ctx, VIEW.width / 2 - 330, 238, 660, 118, 14); ctx.fill();
  ctx.fillStyle = '#fff7e6'; ctx.font = '16px ' + FONT;
  wrapTextCentered(ctx, 'Steal cars on Palm Heights, run packages for fixer Mara Voss, dodge the SBPD through Neon Row, and pull the harbor job of the decade — on foot, behind the wheel, under a five-star sky.', VIEW.width / 2, 272, 600, 23);
  ctx.font = 'bold 20px ' + FONT; ctx.fillStyle = '#7bf1a8';
  ctx.fillText(hasSaveGame ? 'ENTER — New game      C — Continue saved game' : 'ENTER — Start the story', VIEW.width / 2, 402);
  ctx.font = '14px ' + FONT; ctx.fillStyle = 'rgba(255,247,230,0.9)';
  ctx.fillText('WASD / Arrows — move & drive · E — enter / steal car · F or Click — punch / shoot · Shift — sprint · P — pause · S in menus — save', VIEW.width / 2, 690);
  void state;
}

function wrapTextCentered(ctx, text, cx, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = ''; let yy = y;
  const prev = ctx.textAlign; ctx.textAlign = 'center';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) { ctx.fillText(line, cx, yy); line = word; yy += lineHeight; }
    else line = test;
  }
  if (line) ctx.fillText(line, cx, yy);
  ctx.textAlign = prev;
}

export function drawPauseScreen(ctx, state) {
  ctx.fillStyle = 'rgba(10,6,20,0.72)'; ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff7e6';
  ctx.font = '900 54px ' + FONT; ctx.fillText('PAUSED', VIEW.width / 2, 240);
  ctx.font = '17px ' + FONT;
  ctx.fillText(`Missions done: ${state.stats.missionsDone}/6 · Taxi fares: ${state.side.taxiDone} · Races won: ${state.side.racesWon}`, VIEW.width / 2, 300);
  ctx.fillText(`Cars stolen: ${state.stats.carsStolen} · Money: $${state.player.money} · Respect: ${state.player.respect}`, VIEW.width / 2, 330);
  ctx.font = 'bold 19px ' + FONT; ctx.fillStyle = '#7bf1a8';
  ctx.fillText('P — resume · S — save game · ENTER — resume', VIEW.width / 2, 396);
  ctx.font = '14px ' + FONT; ctx.fillStyle = PALETTE.hudMuted;
  ctx.fillText('Side jobs: walk to the TAXI sign for fares, or the RACE beacon south-east for the Harbor Run.', VIEW.width / 2, 440);
}

export function drawEndScreen(ctx, state, kind) {
  ctx.fillStyle = kind === 'win' ? 'rgba(8,30,18,0.78)' : 'rgba(24,6,14,0.80)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.font = '900 72px ' + FONT;
  ctx.fillStyle = kind === 'win' ? '#7bf1a8' : '#ff5964';
  const title = kind === 'win' ? 'HARBOR LEGEND' : kind === 'busted' ? 'BUSTED' : 'WASTED';
  ctx.fillText(title, VIEW.width / 2, 250);
  ctx.fillStyle = '#fff7e6'; ctx.font = '18px ' + FONT;
  const line = kind === 'win'
    ? 'Mara raises a glass at the Marina. Solana Bay tells your story now — free roam is yours.'
    : kind === 'busted'
      ? 'The SBPD got cuffs on you. The bay keeps your money… this time. Your story resets to the last save point.'
      : 'You flatlined on a Solana Bay sidewalk. The city shrugs and keeps moving.';
  wrapTextCentered(ctx, line, VIEW.width / 2, 310, 700, 26);
  ctx.font = '16px ' + FONT; ctx.fillStyle = PALETTE.hudMuted;
  ctx.fillText(`Final money $${state.player.money} · Respect ${state.player.respect} · Missions ${state.stats.missionsDone}/6`, VIEW.width / 2, 380);
  ctx.font = 'bold 20px ' + FONT; ctx.fillStyle = '#7bf1a8';
  ctx.fillText('ENTER — back to the streets (story restarts, money kept)', VIEW.width / 2, 450);
}
