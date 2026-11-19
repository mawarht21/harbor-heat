// HARBOR HEAT — boot and the one loop.
// Input is read every frame, the world advances in fixed 1/60 s steps, and the
// renderer paints the city, then the HUD, then whichever screen is active.
// Screens: title, play, paused, busted, wasted (gameover) and win.
//
// ?seed=N fixes the city. ?shot=city|drive|chase|mission stages that scene with
// the real systems, simulates a few seconds, paints twice and sets
// window.__shotReady for the screenshot tool.

import { DAY, STEP, VIEW } from './config.js';
import { createAudio } from './audio.js';
import { createInput, ACTION_CONFIRM, ACTION_INTERACT, ACTION_PAUSE, ACTION_ATTACK } from './input.js';
import { createGameState, updateCamera, updatePlayerOnFoot, districtAt } from './world.js';
import { enterExitCar, updatePlayerCar, updateTraffic } from './vehicles.js';
import { updatePedestrians } from './pedestrians.js';
import { updatePolice } from './police.js';
import { updateWanted } from './wanted.js';
import { tryAttack, updateBullets, updateParticles } from './combat.js';
import { currentObjective, startStoryMission, startTaxi, startRace, updateMissions, STORY } from './missions.js';
import { drawWorld } from './render.js';
import { drawHUD, drawTitleScreen, drawPauseScreen, drawEndScreen } from './hud.js';
import { applySavedData, hasSave, loadSavedData, saveGame } from './save.js';
import { LOCATIONS } from './city.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');
canvas.width = VIEW.width;
canvas.height = VIEW.height;

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 7) || 7;
const shotKind = params.get('shot');

const audio = createAudio();
const input = createInput(canvas);
let state = createGameState(seed, audio);
let hasSaveGame = hasSave();
// A read-only hook for automated play-tests: the current live state object.
Object.defineProperty(window, '__harborState', { get: () => state });

function startNewGame() {
  state = createGameState(seed, audio);
  state.mode = 'play';
  state.camera.x = state.player.x - 640;
  state.camera.y = state.player.y - 360;
  status.textContent = 'Harbor Heat started. First mission: First Wheels.';
}

function continueGame() {
  const data = loadSavedData();
  startNewGame();
  if (data) applySavedData(state, data);
  state.mode = 'play';
  state.camera.x = state.player.x - 640;
  state.camera.y = state.player.y - 360;
}

function respawnAfterEnd() {
  const money = state.player.money;
  const respect = state.player.respect;
  const weapon = state.player.weapon;
  const missionIndex = state.mode === 'busted' ? Math.max(0, state.mission.index) : state.mission.index;
  state = createGameState(seed, audio);
  state.player.money = money;
  state.player.respect = respect;
  state.player.weapon = weapon;
  state.mission.index = Math.min(missionIndex, STORY.length - 1);
  state.mode = 'play';
  state.camera.x = state.player.x - 640;
  state.camera.y = state.player.y - 360;
}

function checkJobMarkers() {
  // Standing in a gold beacon starts the next story mission; the TAXI and RACE
  // markers start side jobs. All three live in the world, not in a menu.
  const p = state.player;
  if (!state.mission.active && !state.storyDone) {
    const giver = missionGiverSpot(state);
    if (Math.hypot(p.x - giver.x, p.y - giver.y) < 46 && !p.inCar) startStoryMission(state);
  }
  if (!state.side.taxi?.active && Math.hypot(p.x - 1010, p.y - 1150) < 40 && !p.inCar) {
    state._taxiHint = true;
  } else state._taxiHint = false;
}

function missionGiverSpot(state) {
  // Mara and Rico wait near the player's own block until the story is done.
  return { x: LOCATIONS.start.x + 60, y: LOCATIONS.start.y - 40 };
}

function stepGame(dt) {
  state.time += dt;
  state.dayTime = (state.dayTime + dt / DAY.seconds) % 1;
  const actions = input.takeActions();
  if (state.mode === 'title') {
    if (actions & ACTION_CONFIRM) { audio.unlock(); startNewGame(); }
    if (input.held('KeyC') && hasSaveGame) { audio.unlock(); continueGame(); }
    return;
  }
  if (state.mode === 'busted' || state.mode === 'gameover' || state.mode === 'win') {
    if (actions & ACTION_CONFIRM) respawnAfterEnd();
    return;
  }
  if (actions & ACTION_PAUSE) {
    state.mode = state.mode === 'paused' ? 'play' : 'paused';
    return;
  }
  if (state.mode === 'paused') {
    if (input.held('KeyS')) saveGame(state);
    if (actions & ACTION_CONFIRM) state.mode = 'play';
    return;
  }
  // --- play ---
  if (state.player.attackCd > 0) state.player.attackCd -= dt;
  if (state.player.punchAnim > 0) state.player.punchAnim -= dt;
  if (state.crashCooldown > 0) state.crashCooldown -= dt;
  if (state.toastTime > 0) state.toastTime -= dt;
  if (state.hurtFlash > 0) state.hurtFlash -= dt;
  if (state.saveFlash > 0) state.saveFlash -= dt;
  if (!state.player.inCar && state.speedKmh !== 0) state.speedKmh = 0;

  if (actions & ACTION_INTERACT) {
    const before = state.player.inCar;
    if (enterExitCar(state, audio) && !before) state.stats.carsStolen++;
  }
  if ((actions & ACTION_ATTACK) || (input.attackHeld() && state.player.weapon === 'pistol')) {
    tryAttack(state, input);
  }
  if (input.held('KeyS') && input.held('ShiftLeft')) saveGame(state);

  updatePlayerOnFoot(state, input, dt);
  updatePlayerCar(state, input, dt);
  updateTraffic(state, dt);
  updatePedestrians(state, dt);
  updatePolice(state, dt);
  updateWanted(state, dt);
  updateBullets(state, dt);
  updateParticles(state, dt);
  updateMissions(state, dt);
  checkJobMarkers();
  // Side-job keys when standing at their markers.
  if (state._taxiHint && (actions & ACTION_INTERACT)) startTaxi(state);
  const raceSpot = { x: LOCATIONS.raceStart.x, y: LOCATIONS.raceStart.y };
  if (!state.side.race?.active && Math.hypot(state.player.x - raceSpot.x, state.player.y - raceSpot.y) < 95 && state.player.inCar && (actions & ACTION_INTERACT)) startRace(state);
  state._objective = currentObjective(state);
  state.district = districtAt(state.player.x, state.player.y);
  updateCamera(state, dt);
}

function drawMarkers(ctx2) {
  // World-space job markers, drawn between the world and the HUD.
  ctx2.save();
  ctx2.translate(-Math.round(state.camera.x), -Math.round(state.camera.y));
  if (!state.mission.active && !state.storyDone && state.mode === 'play') {
    const g = missionGiverSpot(state);
    drawMarker(ctx2, g.x, g.y, '#ffd23f', 'MISSION');
  }
  drawMarker(ctx2, 1010, 1150, '#ffd23f', 'TAXI');
  drawMarker(ctx2, LOCATIONS.raceStart.x, LOCATIONS.raceStart.y, '#ff7b54', 'RACE');
  drawMarker(ctx2, LOCATIONS.pier.x, LOCATIONS.pier.y, '#4cc9f0', 'MARINA');
  ctx2.restore();
}

function drawMarker(ctx2, x, y, color, label) {
  const pulse = 1 + Math.sin(state.time * 4) * 0.1;
  ctx2.globalAlpha = 0.85;
  ctx2.fillStyle = color;
  ctx2.beginPath(); ctx2.arc(x, y, 15 * pulse, 0, Math.PI * 2); ctx2.fill();
  ctx2.globalAlpha = 1;
  ctx2.fillStyle = '#160f22';
  ctx2.font = 'bold 12px "Trebuchet MS", sans-serif';
  ctx2.textAlign = 'center';
  ctx2.fillText('!', x, y + 4);
  ctx2.fillStyle = color;
  ctx2.font = 'bold 11px "Trebuchet MS", sans-serif';
  ctx2.fillText(label, x, y - 24);
}

function draw() {
  ctx.clearRect(0, 0, VIEW.width, VIEW.height);
  if (state.mode === 'title') { drawTitleScreen(ctx, state, hasSaveGame); return; }
  drawWorld(ctx, state);
  drawMarkers(ctx);
  drawHUD(ctx, state);
  if (state.mode === 'paused') drawPauseScreen(ctx, state);
  if (state.mode === 'busted') drawEndScreen(ctx, state, 'busted');
  if (state.mode === 'gameover') drawEndScreen(ctx, state, 'wasted');
  if (state.mode === 'win') drawEndScreen(ctx, state, 'win');
}

// --- Screenshot staging -------------------------------------------------------
if (shotKind) {
  stageShot(state, shotKind);
  state._objective = currentObjective(state);
  // Simulate a few seconds of the real game so traffic, police and walkers settle.
  const simInput = createInput(canvas);
  if (state.player.inCar) simInput.press('KeyW');
  const steps = shotKind === 'chase' ? 300 : shotKind === 'drive' ? 115 : shotKind === 'mission' ? 55 : 90;
  // Borrow the live input for the simulation by pressing W on it too.
  if (state.player.inCar) input.press('KeyW');
  for (let i = 0; i < steps; i++) stepGame(STEP);
  input.releaseAll();
  void simInput;
  state._objective = currentObjective(state);
  draw();
  draw();
  window.__shotReady = true;
} else {
  // --- The live loop ----------------------------------------------------------
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    acc += Math.min(0.12, (now - last) / 1000);
    last = now;
    while (acc >= STEP) { stepGame(STEP); acc -= STEP; }
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
