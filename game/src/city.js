// Solana Bay in 3D: a grid of avenues and streets on a coast. The whole static
// city (buildings with lit-window facades, roads, palms, lamps, signs, beach,
// pier) is baked once into a few merged meshes so the frame cost stays tiny.

import { Builder, createRng, pick, randInt, randRange, rgb, shade } from './engine.js';

export const AVENUES_X = [0, 110, 220, 330, 440, 550];   // north-south roads
export const STREETS_Z = [0, 110, 220, 330, 440];        // east-west roads
export const COAST_Z = 478;                              // the coast road
export const BEACH_Z = 505;                              // sand starts
export const WATER_Z = 578;                              // water starts
export const ROAD_HALF = 7;
export const WORLD = { x0: -70, x1: 620, z0: -70, z1: 720 };

export const LOCATIONS = {
  start: { x: 101, z: 56, name: 'Palm Heights — your block' },
  garage: { x: 524, z: 52, name: 'Harbor Garage' },
  docks: { x: 248, z: 474, name: 'The Docks, Warehouse 9' },
  neonClub: { x: 388, z: 232, name: 'Club Coral, Neon Row' },
  market: { x: 275, z: 165, name: 'Old Market square' },
  pier: { x: 66, z: 566, name: 'Marina Pier — the getaway boat' },
  bank: { x: 226, z: 52, name: 'City Bank steps' },
  taxiSpot: { x: 88, z: 228, name: 'Taxi fare waiting' },
  raceStart: { x: 547, z: 388, name: 'Harbor Run start' },
  hospital: { x: 113, z: 339, name: 'Solana General Hospital' },
};

export const HIDING_SPOTS = [
  { x: 96, z: 56, name: 'Palm Heights alley' },
  { x: 236, z: 166, name: 'Old Market loading bay' },
  { x: 426, z: 276, name: 'Neon Row service lane' },
  { x: 496, z: 386, name: 'Harbor parking notch' },
];

const ROOF_COLORS = ['#8d6e63', '#78909c', '#a1887f', '#6d4c41', '#546e7a', '#795548'];
const WALL_TINTS = [[1, 1, 1], [1.05, 0.95, 0.9], [0.92, 0.98, 1.05], [1.02, 1.0, 0.92]];
const SIGN_SPOTS = [
  { name: 'SOLANA MALL', bx: 2, bz: 2 }, { name: 'CITY BANK', bx: 2, bz: 0 },
  { name: 'CLUB CORAL', bx: 3, bz: 2 }, { name: 'CASINO AZUL', bx: 4, bz: 1 },
  { name: 'TACO SOL', bx: 1, bz: 1 }, { name: 'GYM 24H', bx: 0, bz: 2 },
  { name: 'NOODLE BAR', bx: 3, bz: 3 }, { name: 'SURF SHOP', bx: 1, bz: 4 },
  { name: 'PIER CAFE', bx: 0, bz: 4 }, { name: 'AUTO PARTS', bx: 4, bz: 3 },
];

/**
 * Crop a facade's uv rect so its windows keep their proportions on a face of
 * the given world size: the atlas art is drawn for a ~30 m wide, ~40 m tall
 * face. Wide faces sample less of the texture height (anchored at the ground
 * floor, so the storefront band always survives); tall faces sample less of
 * the width, at a random offset so neighbouring towers do not repeat.
 */
function facadeUVFor(facade, w, h, rng) {
  const [u0, v0, u1, v1] = facade;
  const sx = w / 30, sy = h / 40;
  let nu0 = u0, nu1 = u1, nv1 = v1;
  if (sx > sy) {
    const f = Math.max(0.34, sy / sx);
    nv1 = v0 + (v1 - v0) * f;
  } else {
    const f = Math.max(0.34, sx / sy);
    const off = rng() * (1 - f);
    nu0 = u0 + (u1 - u0) * off;
    nu1 = nu0 + (u1 - u0) * f;
  }
  return [nu0, v0, nu1, nv1];
}

export function districtAt(x, z) {
  if (z > BEACH_Z) return 'Solana Beach';
  if (z > 445) return x < 165 ? 'Marina District' : x < 460 ? 'The Docks' : 'Harbor District';
  const col = x < 165 ? 0 : x < 385 ? 1 : 2;
  const row = z < 165 ? 0 : z < 335 ? 1 : 2;
  const names = [
    ['Palm Heights', 'Old Market', 'Harbor District'],
    ['Marina District', 'Downtown', 'Neon Row'],
    ['Marina District', 'The Docks', 'Harbor District'],
  ];
  if (row === 1 && col === 2) return 'Neon Row';
  return names[row][col];
}

export function buildCity(gl, atlas, seed = 7) {
  const rng = createRng(seed * 7919 + 13);
  const B = new Builder();       // lit static geometry
  const S = new Builder();       // unlit sign geometry (vertex colors carry through)
  const G = new Builder();       // lamp glow discs (unlit, additive at night)
  const signList = [];
  const buildings = [];          // {x,z,hw,hd,h}
  const lamps = [];
  const palms = [];
  const intersections = [];
  for (const ax of AVENUES_X) for (const sz of STREETS_Z) intersections.push({ x: ax, z: sz });
  for (const ax of AVENUES_X) intersections.push({ x: ax, z: COAST_Z });

  const asphalt = rgb('#33363e'), asphalt2 = rgb('#3a3d45');
  const walk = rgb('#9aa0a3'), walkDark = rgb('#83888c');
  const ground = rgb('#7d8c74');

  // ---- ground base: city slab, then beach sand, then the sea handled apart
  B.plane([WORLD.x0, 0, WORLD.z0], [WORLD.x1, 0, WORLD.z0], [WORLD.x1, 0, BEACH_Z + 4], [WORLD.x0, 0, BEACH_Z + 4], [0, 1, 0], ground, undefined);
  const sand = rgb('#ecd28f');
  B.plane([WORLD.x0, 0.02, BEACH_Z], [WORLD.x1, 0.02, BEACH_Z], [WORLD.x1, 0.02, WATER_Z + 30], [WORLD.x0, 0.02, WATER_Z + 30], [0, 1, 0], sand, undefined);

  // ---- roads
  const roadQuad = (x0, z0, x1, z1, col) =>
    B.plane([x0, 0.06, z0], [x1, 0.06, z0], [x1, 0.06, z1], [x0, 0.06, z1], [0, 1, 0], col, undefined);
  for (const ax of AVENUES_X) roadQuad(ax - ROAD_HALF, -46, ax + ROAD_HALF, COAST_Z + ROAD_HALF, asphalt);
  for (const sz of STREETS_Z) roadQuad(-46, sz - ROAD_HALF, 596, sz + ROAD_HALF, asphalt2);
  roadQuad(-46, COAST_Z - ROAD_HALF, 596, COAST_Z + ROAD_HALF, asphalt);
  // sidewalk strips flanking every road
  const walkStrip = (x0, z0, x1, z1) => B.box((x0 + x1) / 2, 0.07, (z0 + z1) / 2, x1 - x0, 0.14, z1 - z0, { color: walk, topColor: walk });
  for (const ax of AVENUES_X) {
    walkStrip(ax - ROAD_HALF - 3, -46, ax - ROAD_HALF, COAST_Z + ROAD_HALF + 3);
    walkStrip(ax + ROAD_HALF, -46, ax + ROAD_HALF + 3, COAST_Z + ROAD_HALF + 3);
  }
  for (const sz of [...STREETS_Z, COAST_Z]) {
    walkStrip(-46, sz - ROAD_HALF - 3, 596, sz - ROAD_HALF);
    walkStrip(-46, sz + ROAD_HALF, 596, sz + ROAD_HALF + 3);
  }
  // lane markings: center double-yellow + white lane dashes
  const yellow = rgb('#d9a821'), white = rgb('#e8e8e2');
  const dash = (x, z, w, d, col) => B.box(x, 0.09, z, w, 0.03, d, { color: col, topColor: col });
  for (const ax of AVENUES_X) {
    dash(ax - 0.35, 231, 0.22, 556, yellow); dash(ax + 0.35, 231, 0.22, 556, yellow);
    for (let z = -40; z < 480; z += 9) { dash(ax - 3.4, z, 0.18, 3.4, white); dash(ax + 3.4, z, 0.18, 3.4, white); }
  }
  for (const sz of [...STREETS_Z, COAST_Z]) {
    dash(275, sz - 0.35, 642, 0.22, yellow); dash(275, sz + 0.35, 642, 0.22, yellow);
    for (let x = -40; x < 590; x += 9) { dash(x, sz - 3.4, 3.4, 0.18, white); dash(x, sz + 3.4, 3.4, 0.18, white); }
  }
  // crosswalks at intersections
  for (const it of intersections) {
    for (let i = -2; i <= 2; i++) {
      dash(it.x + i * 2.6, it.z - ROAD_HALF - 1.2, 1.3, 2.0, white);
      dash(it.x + i * 2.6, it.z + ROAD_HALF + 1.2, 1.3, 2.0, white);
      dash(it.x - ROAD_HALF - 1.2, it.z + i * 2.6, 2.0, 1.3, white);
      dash(it.x + ROAD_HALF + 1.2, it.z + i * 2.6, 2.0, 1.3, white);
    }
  }
  // continuous edge lines so the carriageway reads at speed and after dark
  const edge = rgb('#c9c9c2');
  for (const ax of AVENUES_X) { dash(ax - 6.4, 231, 0.16, 556, edge); dash(ax + 6.4, 231, 0.16, 556, edge); }
  for (const sz of [...STREETS_Z, COAST_Z]) { dash(275, sz - 6.4, 642, 0.16, edge); dash(275, sz + 6.4, 642, 0.16, edge); }

  // ---- blocks & buildings
  const signFor = {};
  for (const s of SIGN_SPOTS) signFor[s.bx + ',' + s.bz] = s.name;
  const signBest = {}; // sign name -> the block building closest to the street it faces
  const allRoadZ = [...STREETS_Z, COAST_Z];
  for (let bx = 0; bx < AVENUES_X.length; bx++) {
    for (let bz = 0; bz < allRoadZ.length; bz++) {
      const x0 = AVENUES_X[bx] + ROAD_HALF + 4;
      const x1 = (bx + 1 < AVENUES_X.length ? AVENUES_X[bx + 1] : 606) - ROAD_HALF - 4;
      const z0 = allRoadZ[bz] + ROAD_HALF + 4;
      const z1 = (bz + 1 < allRoadZ.length ? allRoadZ[bz + 1] : BEACH_Z) - ROAD_HALF - 4;
      const w = x1 - x0, d = z1 - z0;
      // The Docks: the waterfront row south of street 440 is a thin strip —
      // give it long low sheds along the coast road instead of towers.
      const isDocks = bz === 4 && bx >= 1 && bx <= 3;
      if (isDocks) {
        const dz0 = 449, dz1 = 469;
        B.box((x0 + x1) / 2, 0.08, (dz0 + dz1) / 2, w + 4, 0.16, dz1 - dz0 + 4, { color: walkDark, topColor: shade(walkDark, 1.06) });
        for (let i = 0; i < 2; i++) {
          const bw = w / 2 - 6, bd = dz1 - dz0 - 4;
          const cx = x0 + w / 4 + i * (w / 2), cz = (dz0 + dz1) / 2;
          const h = 11;
          B.box(cx, h / 2 + 0.16, cz, bw, h, bd, { color: rgb('#7f8c99'), topColor: rgb('#5d6a76'), facadeUV: facadeUVFor(atlas.facades[2], Math.max(bw, bd), h, rng) });
          buildings.push({ x: cx, z: cz, hw: bw / 2, hd: bd / 2, h });
        }
        continue;
      }
      if (w < 40 || d < 30) continue;
      // block pad
      B.box((x0 + x1) / 2, 0.08, (z0 + z1) / 2, w + 4, 0.16, d + 4, { color: walkDark, topColor: shade(walkDark, 1.06) });
      const downtown = bx >= 2 && bx <= 3 && bz >= 1 && bz <= 2;
      // The Old Market (bx 2, bz 1) is an open plaza with stalls — mission 3's arena.
      if (bx === 2 && bz === 1) {
        const pcx = (x0 + x1) / 2, pcz = (z0 + z1) / 2;
        // sandstone pavers over the plain plaza pad: a grout base with a
        // grid of slightly varied slabs baked as geometry (merged, so free)
        B.plane([x0 - 2, 0.17, z0 - 2], [x1 + 2, 0.17, z0 - 2], [x1 + 2, 0.17, z1 + 2], [x0 - 2, 0.17, z1 + 2], [0, 1, 0], rgb('#8a7a5f'), undefined);
        const paverCols = ['#b0986e', '#ac9164', '#b69f74', '#a78c5e', '#b49c72'];
        for (let px2 = x0 + 1; px2 < x1 - 2; px2 += 4.6) for (let pz2 = z0 + 1; pz2 < z1 - 2; pz2 += 4.6) {
          const pc = rgb(pick(rng, paverCols));
          B.plane([px2, 0.185, pz2], [px2 + 4.3, 0.185, pz2], [px2 + 4.3, 0.185, pz2 + 4.3], [px2, 0.185, pz2 + 4.3], [0, 1, 0], pc, undefined);
        }
        // a market stall: wooden counter, corner posts, a striped slat awning
        // sloping toward the front, goods on top, crates stacked alongside.
        // dir: 0 faces +z, 1 faces -z, 2 faces +x, 3 faces -x (toward plaza centre)
        const stall = (sx, sz, dir) => {
          const f = [[0, 1], [0, -1], [1, 0], [-1, 0]][dir];
          const r = [f[1], -f[0]];
          const ry = Math.atan2(f[0], f[1]);
          B.boxR(sx, 0.75, sz, 6.4, 1.1, 2.4, ry, { color: rgb('#9a6b45'), topColor: rgb('#b58556') });
          buildings.push({ x: sx, z: sz, hw: dir >= 2 ? 1.2 : 3.2, hd: dir >= 2 ? 3.2 : 1.2, h: 1.3 });
          for (const a of [-3, 3]) for (const bq of [-1.1, 1.1]) {
            B.box(sx + r[0] * a + f[0] * bq, 1.55, sz + r[1] * a + f[1] * bq, 0.14, 2.9, 0.14, { color: rgb('#6e4f30'), topColor: rgb('#6e4f30') });
          }
          const c1 = rgb(pick(rng, ['#e76f51', '#2a9d8f', '#ef476f', '#f4a261'])), c2 = rgb('#f4ead8');
          const nrm = [f[0] * 0.55, 0.75, f[1] * 0.55];
          for (let i = 0; i < 6; i++) {
            const off = -3.1 + i * 1.03 + 0.5;
            const cxp = sx + r[0] * off, czp = sz + r[1] * off;
            const bx2 = cxp - f[0] * 1.5, bz2 = czp - f[1] * 1.5;
            const fx2 = cxp + f[0] * 1.7, fz2 = czp + f[1] * 1.7;
            const px2 = r[0] * 0.52, pz2 = r[1] * 0.52;
            B.plane([bx2 - px2, 3.15, bz2 - pz2], [bx2 + px2, 3.15, bz2 + pz2], [fx2 + px2, 2.45, fz2 + pz2], [fx2 - px2, 2.45, fz2 - pz2], nrm, i % 2 ? c1 : c2, undefined);
          }
          for (let i = 0; i < 3; i++) {
            const gx = sx + r[0] * (-2 + i * 2) + f[0] * 0.3, gz = sz + r[1] * (-2 + i * 2) + f[1] * 0.3;
            const gc = rgb(pick(rng, ['#ef476f', '#ffd23f', '#06d6a0', '#f4845f']));
            B.box(gx, 1.55, gz, 0.8, 0.5, 0.8, { color: gc, topColor: gc });
          }
          B.box(sx - r[0] * 4.1, 0.6, sz - r[1] * 4.1, 0.95, 0.9, 0.95, { color: rgb('#a97c50'), topColor: rgb('#bd8f5c') });
          B.box(sx - r[0] * 4.1, 1.42, sz - r[1] * 4.1, 0.8, 0.75, 0.8, { color: rgb('#8a6238'), topColor: rgb('#a97c50') });
        };
        stall(pcx - 20, pcz - 25, 0); stall(pcx + 20, pcz - 25, 0);
        stall(pcx - 20, pcz + 25, 1); stall(pcx + 20, pcz + 25, 1);
        stall(pcx - 27, pcz, 2); stall(pcx + 27, pcz, 3);
        // loose dressing: crate clusters, barrels, planters at the corners
        const crate = (x, z, y = 0.6, s = 0.95) => B.box(x, y, z, s, s, s, { color: rgb('#a97c50'), topColor: rgb('#bd8f5c') });
        crate(pcx - 35, pcz - 31); crate(pcx - 33.8, pcz - 31); crate(pcx - 34.4, pcz - 31, 1.5, 0.8);
        crate(pcx + 35, pcz + 30); crate(pcx + 35, pcz + 28.8);
        crate(pcx - 12, pcz + 33); crate(pcx + 30, pcz - 33, 0.6, 0.8);
        for (const [bx3, bz3] of [[pcx + 12, pcz - 32], [pcx - 30, pcz + 12], [pcx + 33, pcz + 8]]) {
          B.box(bx3, 0.72, bz3, 0.78, 1.15, 0.78, { color: rgb('#8a4a30'), topColor: rgb('#6e3a24') });
        }
        for (const [px3, pz3] of [[pcx - 38, pcz - 36], [pcx + 38, pcz - 36], [pcx - 38, pcz + 36], [pcx + 38, pcz + 36]]) {
          B.box(px3, 0.42, pz3, 2.0, 0.55, 2.0, { color: rgb('#7a4a3a'), topColor: rgb('#7a4a3a') });
          B.box(px3, 0.85, pz3, 1.8, 0.4, 1.8, { color: rgb('#3f7d44'), topColor: rgb('#4c9151') });
        }
        continue;
      }
      const signName = signFor[bx + ',' + bz];
      const cols = w > 70 ? 2 : 1, rows = d > 70 ? 2 : 1;
      for (let cxI = 0; cxI < cols; cxI++) for (let czI = 0; czI < rows; czI++) {
        if (rng() < 0.14) continue; // empty lot / plaza
        const bw = (w / cols) - 10, bd = (d / rows) - 10;
        const cx = x0 + (cxI + 0.5) * (w / cols), cz = z0 + (czI + 0.5) * (d / rows);
        // keep the Harbor Garage forecourt clear of random towers
        if (cx + bw / 2 > 500 && cx - bw / 2 < 550 && cz + bd / 2 > 24 && cz - bd / 2 < 74) continue;
        const h = downtown ? randRange(rng, 20, 46) : randRange(rng, 9, 26);
        const facade = facadeUVFor(atlas.facades[randInt(rng, 0, 5)], Math.max(bw, bd), h, rng);
        const tint = pick(rng, WALL_TINTS);
        B.box(cx, h / 2 + 0.16, cz, bw, h, bd, { color: tint, topColor: rgb(pick(rng, ROOF_COLORS)), facadeUV: facade });
        buildings.push({ x: cx, z: cz, hw: bw / 2, hd: bd / 2, h });
        // rooftop clutter
        const n = randInt(rng, 1, 3);
        for (let i = 0; i < n; i++) {
          const cw = randRange(rng, 2, 5), cd = randRange(rng, 2, 5), ch = randRange(rng, 0.8, 2.2);
          B.box(cx + randRange(rng, -bw / 4, bw / 4), h + 0.16 + ch / 2, cz + randRange(rng, -bd / 4, bd / 4), cw, ch, cd,
            { color: rgb('#9aa5ad'), topColor: rgb('#7e8a91') });
        }
        // awning on the street-facing side for ground-floor shops
        if (rng() < 0.4) {
          const awnCol = rgb(pick(rng, ['#e76f51', '#2a9d8f', '#ef476f', '#f4a261']));
          const az = cz + bd / 2 + 1.1;
          B.plane([cx - bw / 2, 3.4, az - 1.6], [cx + bw / 2, 3.4, az - 1.6], [cx + bw / 2, 2.7, az + 0.6], [cx - bw / 2, 2.7, az + 0.6], [0, 0.5, 0.86], awnCol, undefined);
        }
        // a name sign goes on whichever building of the block stands closest
        // to the street its face overlooks — never buried behind another tower
        if (signName) {
          const front = cz + bd / 2;
          const cur = signBest[signName];
          if (!cur || front > cur.front) signBest[signName] = { name: signName, cx, cz, bw, bd, h, front };
        }
      }
    }
  }

  // ---- emit the block name signs on their street-closest buildings
  for (const s of Object.values(signBest)) {
    const uv = atlas.signUV[s.name];
    if (!uv) continue;
    const sw = Math.min(s.bw * 0.92, 22), sh = sw * 0.25;
    const sy = Math.min(s.h - 1.2, 8.6), sz2 = s.cz + s.bd / 2 + 0.12;
    S.plane([s.cx - sw / 2, sy - sh / 2, sz2], [s.cx + sw / 2, sy - sh / 2, sz2], [s.cx + sw / 2, sy + sh / 2, sz2], [s.cx - sw / 2, sy + sh / 2, sz2], [0, 0, 1], [1, 1, 1], uv);
    signList.push({ name: s.name, x: s.cx, y: sy, z: sz2, sw, uv });
  }

  // ---- Harbor Garage: a landmark low block with a dark open bay
  {
    const gx = LOCATIONS.garage.x, gz = LOCATIONS.garage.z;
    B.box(gx, 4.2, gz - 12, 30, 8.4, 16, { color: rgb('#c96f4a'), topColor: rgb('#8a4a30'), facadeUV: facadeUVFor(atlas.facades[1], 30, 8.4, rng) });
    buildings.push({ x: gx, z: gz - 12, hw: 15, hd: 8, h: 8.4 });
    B.box(gx, 2.2, gz - 3.4, 18, 4.4, 0.6, { color: rgb('#191c22'), topColor: rgb('#191c22') }); // open bay mouth
    const uv = atlas.signUV['HARBOR GARAGE'];
    S.plane([gx - 11, 8.2, gz - 3.2], [gx + 11, 8.2, gz - 3.2], [gx + 11, 11.4, gz - 3.2], [gx - 11, 11.4, gz - 3.2], [0, 0, 1], [1, 1, 1], uv);
    B.box(gx, 0.1, gz + 6, 34, 0.2, 16, { color: rgb('#6d7278'), topColor: rgb('#757a80') }); // forecourt
  }
  // ---- Warehouse 9 sign on the shed face above the coast road
  {
    const uv = atlas.signUV['WAREHOUSE 9'];
    const wx = LOCATIONS.docks.x, wz = 467.6;
    S.plane([wx - 11, 7.4, wz], [wx + 11, 7.4, wz], [wx + 11, 10.6, wz], [wx - 11, 10.6, wz], [0, 0, 1], [1, 1, 1], uv);
  }

  // ---- palms: sidewalk corners + a beach row
  const trunkCol = rgb('#8a6b48'), frondCol = rgb('#2e9e5b'), frondCol2 = rgb('#37b268');
  const palm = (x, z, s) => {
    palms.push({ x, z });
    B.box(x, 1.7 * s, z, 0.28, 3.4 * s, 0.28, { color: trunkCol, topColor: trunkCol });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + x * 0.13;
      const fx = x + Math.cos(a) * 1.25 * s, fz = z + Math.sin(a) * 1.25 * s;
      B.boxR(fx, (3.45 - (i % 2) * 0.16) * s, fz, 2.6 * s, 0.07, 0.6 * s, -a, { color: i % 2 ? frondCol : frondCol2, topColor: frondCol2 });
    }
  };
  for (const ax of AVENUES_X) for (let z = -30; z < 470; z += 46) {
    if (rng() < 0.72) palm(ax - ROAD_HALF - 2.2, z + randRange(rng, -6, 6), randRange(rng, 0.85, 1.2));
    if (rng() < 0.72) palm(ax + ROAD_HALF + 2.2, z + 20 + randRange(rng, -6, 6), randRange(rng, 0.85, 1.2));
  }
  // palms along the east-west boulevards too — Neon Row and the cover street
  // (330) read as palm boulevards, not bare asphalt
  for (const sz of [...STREETS_Z, COAST_Z]) for (let x = -24; x < 596; x += 25) {
    for (const side of [-1, 1]) {
      if (rng() < 0.2) continue;
      const px = x + randRange(rng, -5, 5);
      if (AVENUES_X.some((ax) => Math.abs(px - ax) < 11)) continue; // keep intersections clear
      palm(px, sz + side * (ROAD_HALF + 2.2), randRange(rng, 0.85, 1.25));
    }
  }
  for (let x = -30; x < 600; x += 26) if (rng() < 0.8) palm(x + randRange(rng, -5, 5), BEACH_Z + randRange(rng, 8, 42), randRange(rng, 0.9, 1.35));
  // beach umbrellas
  for (let i = 0; i < 16; i++) {
    const x = randRange(rng, -20, 590), z = randRange(rng, BEACH_Z + 14, WATER_Z - 18);
    const col = rgb(pick(rng, ['#ef476f', '#ffd23f', '#06d6a0', '#4cc9f0', '#ff7b54']));
    B.box(x, 1.0, z, 0.09, 2.0, 0.09, { color: rgb('#dddddd'), topColor: rgb('#dddddd') });
    B.cone(x, 1.85, z, 1.9, 0.65, col, 8);
    B.box(x + 1.2, 0.12, z + 0.6, 1.7, 0.08, 0.8, { color: col, topColor: col });
  }

  // ---- street lamps + traffic light poles
  const poleCol = rgb('#3c4148');
  // one lamp head at (hx, hz): crossed glow quads at the head plus a warm
  // pool of light on the ground below — both live in the additive glow mesh
  const lampGlow = (hx, hz) => {
    const uv = atlas.discUV;
    G.plane([hx - 0.9, 4.0, hz], [hx + 0.9, 4.0, hz], [hx + 0.9, 5.8, hz], [hx - 0.9, 5.8, hz], [0, 0, 1], [1, 0.78, 0.45], uv);
    G.plane([hx, 4.0, hz - 0.9], [hx, 4.0, hz + 0.9], [hx, 5.8, hz + 0.9], [hx, 5.8, hz - 0.9], [1, 0, 0], [1, 0.78, 0.45], uv);
    G.plane([hx - 5.6, 0.1, hz - 5.6], [hx + 5.6, 0.1, hz - 5.6], [hx + 5.6, 0.1, hz + 5.6], [hx - 5.6, 0.1, hz + 5.6], [0, 1, 0], [1.25, 0.92, 0.42], uv);
  };
  for (const ax of AVENUES_X) for (let z = -28; z < 478; z += 46) {
    for (const side of [-1, 1]) {
      const x = ax + side * (ROAD_HALF + 1.6);
      lamps.push({ x, z });
      B.box(x, 2.5, z, 0.14, 5, 0.14, { color: poleCol, topColor: poleCol });
      B.box(x - side * 0.8, 4.95, z, 1.8, 0.12, 0.3, { color: poleCol, topColor: poleCol });
      lampGlow(x - side * 1.5, z);
    }
  }
  for (const sz of [...STREETS_Z, COAST_Z]) for (let x = -16; x < 596; x += 46) {
    for (const side of [-1, 1]) {
      const z = sz + side * (ROAD_HALF + 1.6);
      lamps.push({ x, z });
      B.box(x, 2.5, z, 0.14, 5, 0.14, { color: poleCol, topColor: poleCol });
      B.box(x, 4.95, z - side * 0.8, 0.3, 0.12, 1.8, { color: poleCol, topColor: poleCol });
      lampGlow(x, z - side * 1.5);
    }
  }
  for (const it of intersections) {
    const x = it.x + ROAD_HALF + 1.4, z = it.z + ROAD_HALF + 1.4;
    B.box(x, 1.9, z, 0.14, 3.8, 0.14, { color: poleCol, topColor: poleCol });
    B.box(x, 3.6, z, 0.34, 0.95, 0.24, { color: rgb('#22252b'), topColor: rgb('#22252b') });
  }

  // ---- sidewalk props: crates, dumpsters, planters, barriers on the outer
  // edge of the pavement, so the streets feel worked-in rather than bare
  const propAt = (x, z) => {
    const kind = rng();
    if (kind < 0.3) { // crate stack
      B.box(x, 0.6, z, 0.95, 0.9, 0.95, { color: rgb('#a97c50'), topColor: rgb('#bd8f5c') });
      if (rng() < 0.6) B.box(x + 0.15, 1.42, z - 0.1, 0.8, 0.75, 0.8, { color: rgb('#8a6238'), topColor: rgb('#a97c50') });
    } else if (kind < 0.52) { // dumpster
      B.box(x, 0.72, z, 2.2, 1.15, 1.25, { color: rgb('#2e5d43'), topColor: rgb('#264d38') });
      B.box(x, 1.36, z, 2.3, 0.14, 1.35, { color: rgb('#264d38'), topColor: rgb('#2e5d43') });
    } else if (kind < 0.76) { // planter with a green crown
      B.box(x, 0.42, z, 1.9, 0.55, 0.85, { color: rgb('#7a4a3a'), topColor: rgb('#7a4a3a') });
      B.box(x, 0.86, z, 1.75, 0.38, 0.72, { color: rgb('#3f7d44'), topColor: rgb('#4c9151') });
    } else { // barrier
      B.box(x, 0.5, z, 1.9, 0.85, 0.35, { color: rgb('#e8e4da'), topColor: rgb('#e8e4da') });
      B.box(x, 0.62, z, 1.92, 0.3, 0.37, { color: rgb('#e76f51'), topColor: rgb('#e76f51') });
    }
  };
  for (const ax of AVENUES_X) for (let z = -14; z < 470; z += 37) {
    for (const side of [-1, 1]) {
      if (rng() < 0.5) continue;
      const zz = z + randRange(rng, -6, 6);
      if ([...STREETS_Z, COAST_Z].some((s2) => Math.abs(zz - s2) < 10)) continue;
      propAt(ax + side * (ROAD_HALF + 2.4), zz);
    }
  }
  for (const sz of [...STREETS_Z, COAST_Z]) for (let x = -8; x < 592; x += 41) {
    for (const side of [-1, 1]) {
      if (rng() < 0.52) continue;
      const xx = x + randRange(rng, -6, 6);
      if (AVENUES_X.some((ax) => Math.abs(xx - ax) < 10)) continue;
      propAt(xx, sz + side * (ROAD_HALF + 2.4));
    }
  }

  // ---- marina pier + getaway boat
  {
    const px = LOCATIONS.pier.x;
    B.box(px, 0.9, 612, 9, 0.5, 74, { color: rgb('#9a7b55'), topColor: rgb('#ab8a5f') });
    for (let z = 580; z < 645; z += 9) {
      B.box(px - 4.2, 0.2, z, 0.4, 1.6, 0.4, { color: rgb('#6e573d'), topColor: rgb('#6e573d') });
      B.box(px + 4.2, 0.2, z, 0.4, 1.6, 0.4, { color: rgb('#6e573d'), topColor: rgb('#6e573d') });
    }
    // boat: hull + cabin, moored at the pier end
    B.box(px + 9, 0.7, 636, 4.4, 1.4, 13, { color: rgb('#e8e4da'), topColor: rgb('#f4f1e8') });
    B.box(px + 9, 1.9, 634, 3.2, 1.1, 5.5, { color: rgb('#2a6f97'), topColor: rgb('#3582ae') });
    B.box(px + 9, 1.15, 643.5, 3.6, 0.5, 1.2, { color: rgb('#c33c54'), topColor: rgb('#c33c54') });
  }

  // ---- the sea: its own mesh so main can slide it for a living shimmer
  const W = new Builder();
  const wuv = atlas.waterUV;
  const rep = 7;
  W.plane([WORLD.x0 - 160, -0.25, WATER_Z - 6], [WORLD.x1 + 160, -0.25, WATER_Z - 6],
    [WORLD.x1 + 160, -0.25, WORLD.z1 + 160], [WORLD.x0 - 160, -0.25, WORLD.z1 + 160],
    [0, 1, 0], [1, 1, 1], [wuv[0], wuv[1], wuv[0] + (wuv[2] - wuv[0]) * rep, wuv[1] + (wuv[3] - wuv[1]) * rep]);

  return {
    mesh: B.build(gl), signMesh: S.build(gl), glowMesh: G.build(gl), waterMesh: W.build(gl),
    buildings, lamps, palms, intersections, signList,
  };
}

// ---------------------------------------------------------------- queries
export function isOnRoad(x, z) {
  for (const ax of AVENUES_X) if (Math.abs(x - ax) <= ROAD_HALF && z < COAST_Z + ROAD_HALF) return true;
  for (const sz of [...STREETS_Z, COAST_Z]) if (Math.abs(z - sz) <= ROAD_HALF) return true;
  return false;
}

/** Push a circle (x,z,r) out of all building AABBs; returns true if it hit. */
export function collideCircle(city, e, r) {
  let hit = false;
  for (const b of city.buildings) {
    const nx = Math.max(b.x - b.hw, Math.min(e.x, b.x + b.hw));
    const nz = Math.max(b.z - b.hd, Math.min(e.z, b.z + b.hd));
    const dx = e.x - nx, dz = e.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 < 1e-6) { e.x = b.x - b.hw - r; continue; }
      const d = Math.sqrt(d2);
      e.x = nx + (dx / d) * r; e.z = nz + (dz / d) * r;
    }
  }
  e.x = Math.max(WORLD.x0 + 2, Math.min(WORLD.x1 - 2, e.x));
  e.z = Math.max(WORLD.z0 + 2, Math.min(WORLD.z1 - 60, e.z));
  return hit;
}

/** 2D segment vs building AABBs — the wanted system's eyes. */
export function segmentBlocked(city, x1, z1, x2, z2) {
  for (const b of city.buildings) {
    if (b.h < 6) continue;
    if (segAabb(x1, z1, x2, z2, b.x - b.hw, b.z - b.hd, b.x + b.hw, b.z + b.hd)) return true;
  }
  return false;
}
function segAabb(x1, z1, x2, z2, minx, minz, maxx, maxz) {
  const dx = x2 - x1, dz = z2 - z1;
  let tmin = 0, tmax = 1;
  if (Math.abs(dx) < 1e-9) { if (x1 < minx || x1 > maxx) return false; }
  else {
    let t1 = (minx - x1) / dx, t2 = (maxx - x1) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (z1 < minz || z1 > maxz) return false; }
  else {
    let t1 = (minz - z1) / dz, t2 = (maxz - z1) / dz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

/** Traffic light phase for an intersection: 0 = NS green, 1 = NS amber, 2 = EW green, 3 = EW amber. */
export function lightPhase(time) {
  const t = time % 14;
  if (t < 6) return 0;
  if (t < 7) return 1;
  if (t < 13) return 2;
  return 3;
}

/** A random point on a road, at least minDist from (x,z) when given. */
export function randomRoadPoint(rng, x = null, z = null, minDist = 0) {
  for (let tries = 0; tries < 24; tries++) {
    let px, pz;
    if (rng() < 0.55) { px = pick(rng, AVENUES_X) + randRange(rng, -3, 3); pz = randRange(rng, -30, 470); }
    else { pz = pick(rng, [...STREETS_Z, COAST_Z]) + randRange(rng, -3, 3); px = randRange(rng, -30, 585); }
    if (x === null || Math.hypot(px - x, pz - z) >= minDist) return { x: px, z: pz };
  }
  return { x: 275, z: 220 };
}
