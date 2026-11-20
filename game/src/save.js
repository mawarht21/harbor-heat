// One localStorage record: cash, story progress, lifetime counters and
// the mute setting.  Nothing else is worth restoring between visits.

const SAVE_KEY = 'harbor-heat-3d-save-v1';

export function defaultSave() {
  return {
    cash: 250,
    missionIndex: 0,
    muted: false,
    stats: {
      missionsCompleted: 0,
      taxiFares: 0,
      racesWon: 0,
      carsChopped: 0,
      busts: 0,
    },
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const fallback = defaultSave();
    return {
      ...fallback,
      ...parsed,
      stats: { ...fallback.stats, ...(parsed.stats || {}) },
    };
  } catch {
    return null;
  }
}

export function hasSave() {
  try {
    return Boolean(localStorage.getItem(SAVE_KEY));
  } catch {
    return false;
  }
}

export function storeSave(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Private browsing and full storage both land here; the game continues
    // without persistence rather than failing on a save.
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing sensible to do beyond ignoring the failure.
  }
}
