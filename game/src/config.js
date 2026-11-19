// HARBOR HEAT — every tuning number, colour and name in one place.
// The world is a big coastal city in world pixels; the screen is a fixed 1280x720
// logical view that the renderer scales to the window and centres on a camera.

export const VIEW = { width: 1280, height: 720 };
export const STEP = 1 / 60;
export const WORLD = { width: 3600, height: 2600 };

export const PLAYER = {
  radius: 14, walkSpeed: 168, sprintSpeed: 272, health: 100,
  punchRange: 48, punchDamage: 34, punchCooldown: 0.34,
  shotCooldown: 0.22, bulletSpeed: 780,
};

export const CAR = {
  length: 52, width: 26, accel: 360, brake: 540, reverseMax: 125,
  drag: 0.74, grip: 5.4, health: 100,
};

export const WANTED = {
  perStar: 100, maxStars: 5, coolRate: 6.5,
  bustFillSeconds: 2.4, bustDrainSeconds: 1.4,
};

export const CRIMES = {
  stealCar: 55, hitPedestrian: 95, hitCar: 35,
  shotFired: 28, punchPerson: 42, missionAlarm: 130,
};

export const DAY = { seconds: 420, start: 0.64 };
export const SAVE_KEY = 'harbor-heat.save.v1';

export const PALETTE = {
  water: '#1d6f8e', sand: '#e8c98a', grass: '#57a773', park: '#37946b',
  road: '#34313d', roadEdge: '#554f68', lane: '#f4d35e', sidewalk: '#a79bb5',
  plaza: '#c9b8a3', player: '#ffd23f', police: '#2b50c8',
  policeLightA: '#ff3b30', policeLightB: '#3b82f6',
  money: '#7bf1a8', health: '#ef476f', star: '#ffd23f',
  hudPanel: 'rgba(18,12,32,0.74)', hudText: '#fff7e6', hudMuted: '#d8cbe8',
  accent: '#ff7b54', accent2: '#ffd23f', dialog: 'rgba(12,8,24,0.90)',
};

export const DISTRICTS = [
  { name: 'MARINA PIER', x: 430, y: 2290 },
  { name: 'THE DOCKS', x: 1560, y: 2290 },
  { name: 'NEON ROW', x: 2560, y: 1450 },
  { name: 'PALM HEIGHTS', x: 860, y: 840 },
  { name: 'OLD MARKET', x: 2020, y: 840 },
  { name: 'HARBOR GARAGE', x: 3120, y: 400 },
];

export const FONT = '"Trebuchet MS", system-ui, -apple-system, "Segoe UI", sans-serif';
