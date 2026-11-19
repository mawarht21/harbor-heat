// The city of Solana Bay: a road grid, city blocks with named buildings, the beach
// and marina along the south edge, parks, palms and street lamps. Everything is
// generated once from a seed, and collision is plain rectangle tests.

import { WORLD } from './config.js';
import { createRandom, pick, randInt, randRange } from './random.js';

export const ROAD_W = 118;
export const ROAD_XS = [300, 820, 1340, 1860, 2380, 2900, 3380];
export const ROAD_YS = [280, 720, 1160, 1600, 2040];

const ROOFS = ['#e76f51', '#f4a261', '#e9c46a', '#2a9d8f', '#457b9d', '#9b5de5', '#ef476f', '#118ab2', '#606c38', '#bc6c25'];
const SIGNS = ['PALM HOTEL', 'CLUB CORAL', 'TACO SOL', 'CITY BANK', 'GYM 24H', 'SOLANA MALL', 'NOODLE BAR', 'SURF SHOP', 'CASINO AZUL', 'DENTIST', 'VINYL STORE', 'PIER CAFE', 'AUTO PARTS', 'BOOKS & CO', 'LAUNDRY', 'PHARMACY'];

// Hiding spots: quiet sidewalk corners where a player who breaks line of sight
// cools their wanted heat three times as fast (see wanted.js). Each sits on a
// sidewalk strip beside a vertical street, clear of the road and of buildings.
export const HIDING_SPOTS = [
  { x: 750, y: 500, name: 'Palm Heights alley' },
  { x: 1410, y: 940, name: 'Old Market loading bay' },
  { x: 2310, y: 1380, name: 'Neon Row service lane' },
  { x: 2970, y: 1820, name: 'Harbor parking notch' },
];

const BEACH_COLORS = ['#ef476f', '#ffd23f', '#06d6a0', '#4cc9f0', '#ff7b54', '#9b5de5'];

export const LOCATIONS = {
  start: { x: 880, y: 780, name: 'Palm Heights — your block' },
  garage: { x: 2960, y: 340, name: 'Harbor Garage' },
  docks: { x: 1450, y: 2120, name: 'The Docks, Warehouse 9' },
  neonClub: { x: 2440, y: 1230, name: 'Club Coral, Neon Row' },
  market: { x: 1940, y: 790, name: 'Old Market square' },
  pier: { x: 430, y: 2160, name: 'Marina Pier — the getaway boat' },
  taxiSpot: { x: 900, y: 1230, name: 'Taxi fare waiting' },
  raceStart: { x: 2960, y: 1680, name: 'Street race start' },
};

export function buildCity(seed) {
  const rng = createRandom(seed * 7919 + 13);
  const buildings = [];
  // Blocks live between roads; each block holds 2-4 buildings with a plaza gap.
  for (let bx = 0; bx < ROAD_XS.length; bx++) {
    for (let by = 0; by < ROAD_YS.length; by++) {
      const x0 = ROAD_XS[bx] + ROAD_W / 2 + 26;
      const y0 = ROAD_YS[by] + ROAD_W / 2 + 26;
      const x1 = (bx + 1 < ROAD_XS.length ? ROAD_XS[bx + 1] : WORLD.width + 200) - ROAD_W / 2 - 26;
      const y1 = (by + 1 < ROAD_YS.length ? ROAD_YS[by + 1] : 2320) - ROAD_W / 2 - 26;
      const w = x1 - x0; const h = y1 - y0;
      if (w < 160 || h < 140) continue;
      const cols = w > 300 ? 3 : w > 170 ? 2 : 1;
      const rows = h > 250 ? 2 : 1;
      for (let cx = 0; cx < cols; cx++) {
        for (let cy = 0; cy < rows; cy++) {
          if (rng() < 0.16) continue; // an empty lot / plaza
          const bw = (w / cols) - 18; const bh = (h / rows) - 18;
          buildings.push({
            x: x0 + cx * (w / cols) + 9, y: y0 + cy * (h / rows) + 9,
            w: bw, h: bh,
            color: pick(rng, ROOFS),
            floors: randInt(rng, 2, 9),
            sign: rng() < 0.34 ? pick(rng, SIGNS) : null,
            shade: randRange(rng, 0.82, 1.05),
          });
        }
      }
    }
  }
  const palms = [];
  for (let i = 0; i < 130; i++) {
    const onBeach = i < 46;
    palms.push({
      x: onBeach ? randRange(rng, 60, WORLD.width - 60) : randRange(rng, 80, WORLD.width - 80),
      y: onBeach ? randRange(rng, 2330, 2470) : randRange(rng, 80, 2280),
      s: randRange(rng, 0.8, 1.35),
    });
  }
  const lamps = [];
  for (const rx of ROAD_XS) for (let y = 120; y < 2300; y += 190) lamps.push({ x: rx - ROAD_W / 2 - 8, y });
  for (const ry of ROAD_YS) for (let x = 160; x < 3500; x += 210) lamps.push({ x, y: ry - ROAD_W / 2 - 8 });

  // Beach life: umbrellas and towels scattered on the sand between the last
  // avenue and the waterline.
  const umbrellas = [];
  for (let i = 0; i < 16; i++) {
    umbrellas.push({
      x: randRange(rng, 80, WORLD.width - 80), y: randRange(rng, 2352, 2440),
      color: pick(rng, BEACH_COLORS), s: randRange(rng, 0.8, 1.25),
    });
  }
  const towels = [];
  for (let i = 0; i < 14; i++) {
    towels.push({
      x: randRange(rng, 80, WORLD.width - 80), y: randRange(rng, 2346, 2452),
      color: pick(rng, BEACH_COLORS), angle: randRange(rng, 0, Math.PI),
    });
  }

  return {
    buildings, palms, lamps, umbrellas, towels,
    hidingSpots: HIDING_SPOTS,
    waterY: 2480,
    beachY: 2320,
  };
}

export function isOnRoad(x, y) {
  for (const rx of ROAD_XS) if (Math.abs(x - rx) <= ROAD_W / 2) return true;
  for (const ry of ROAD_YS) if (Math.abs(y - ry) <= ROAD_W / 2) return true;
  return false;
}

export function isOnSidewalk(x, y) {
  const edge = ROAD_W / 2 + 20;
  for (const rx of ROAD_XS) if (Math.abs(x - rx) <= edge && Math.abs(x - rx) > ROAD_W / 2 - 4) return true;
  for (const ry of ROAD_YS) if (Math.abs(y - ry) <= edge && Math.abs(y - ry) > ROAD_W / 2 - 4) return true;
  return false;
}

/** Push a circle (the player, a pedestrian) out of every building it overlaps. */
export function collideCircleWithBuildings(city, e, radius) {
  for (const b of city.buildings) {
    const nx = Math.max(b.x, Math.min(e.x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(e.y, b.y + b.h));
    const dx = e.x - nx; const dy = e.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      if (d2 === 0) { e.x = b.x - radius; continue; }
      const d = Math.sqrt(d2);
      e.x = nx + (dx / d) * radius;
      e.y = ny + (dy / d) * radius;
    }
  }
  e.x = Math.max(24, Math.min(WORLD.width - 24, e.x));
  e.y = Math.max(24, Math.min(2460, e.y));
}

/** Cars slide along buildings instead of passing through them. */
export function collideCarWithBuildings(city, car) {
  const r = 24;
  for (const b of city.buildings) {
    if (car.x > b.x - r && car.x < b.x + b.w + r && car.y > b.y - r && car.y < b.y + b.h + r) {
      const left = Math.abs(car.x - (b.x - r));
      const right = Math.abs(car.x - (b.x + b.w + r));
      const top = Math.abs(car.y - (b.y - r));
      const bottom = Math.abs(car.y - (b.y + b.h + r));
      const m = Math.min(left, right, top, bottom);
      if (m === left) car.x = b.x - r; else if (m === right) car.x = b.x + b.w + r;
      else if (m === top) car.y = b.y - r; else car.y = b.y + b.h + r;
      car.speed *= 0.35;
      car.bump = 0.2;
    }
  }
  car.x = Math.max(30, Math.min(WORLD.width - 30, car.x));
  car.y = Math.max(30, Math.min(2440, car.y));
}
