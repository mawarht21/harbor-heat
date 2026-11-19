// Save and load the run in localStorage: money, story progress, position, health,
// weapon and respect survive a reload, so Continue on the title screen is real.

import { SAVE_KEY } from './config.js';

export function saveGame(state) {
  try {
    const data = {
      version: 1,
      money: state.player.money,
      respect: state.player.respect,
      health: state.player.health,
      x: Math.round(state.player.x),
      y: Math.round(state.player.y),
      weapon: state.player.weapon,
      missionIndex: state.mission.index,
      storyDone: state.storyDone,
      dayTime: state.dayTime,
      taxiDone: state.side.taxiDone,
      racesWon: state.side.racesWon,
      chopsDone: state.side.chopsDone || 0,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    state.saveFlash = 2.2;
    return true;
  } catch { return false; }
}

export function loadSavedData() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch { return null; }
}

export function applySavedData(state, data) {
  if (!data) return false;
  state.player.money = data.money | 0;
  state.player.respect = data.respect | 0;
  state.player.health = Math.max(30, data.health || 100);
  state.player.x = data.x || state.player.x;
  state.player.y = data.y || state.player.y;
  state.player.weapon = data.weapon === 'pistol' ? 'pistol' : 'fists';
  state.mission.index = Math.min(data.missionIndex || 0, 5);
  state.storyDone = !!data.storyDone;
  state.dayTime = typeof data.dayTime === 'number' ? data.dayTime : state.dayTime;
  state.side.taxiDone = data.taxiDone | 0;
  state.side.racesWon = data.racesWon | 0;
  state.side.chopsDone = data.chopsDone | 0;
  return true;
}

export function hasSave() { return loadSavedData() !== null; }
export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* private mode */ } }
