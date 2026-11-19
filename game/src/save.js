// localStorage save for Harbor Heat 3D: money, respect, story progress, stats.

const KEY = 'harbor-heat-3d-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function storeSave(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      money: state.money,
      respect: state.respect,
      missionIndex: state.mission.index,
      storyDone: state.storyDone,
      hasPistol: state.hasPistol,
      stats: state.stats,
      timeHours: state.timeHours,
    }));
  } catch { /* storage unavailable — play on without saving */ }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}

export const RESPECT_RANKS = [
  [0, 'NOBODY'], [12, 'RUNNER'], [30, 'WHEELMAN'], [55, 'FIXER'], [85, 'SHOT CALLER'], [120, 'HARBOR LEGEND'],
];
export function respectRank(respect) {
  let name = RESPECT_RANKS[0][1];
  for (const [need, label] of RESPECT_RANKS) if (respect >= need) name = label;
  return name;
}
