// Solana Bay, composed as data and static geometry.
// The city is a regular road grid because traffic, police and the minimap
// all reason about the same avenues.  Decoration never changes that grid:
// buildings sit inside blocks, palms and lamps sit on sidewalks, and the
// marina extends the drivable world south to a pier and open water.

import { Batch, Texture, clamp, mat4Compose } from './engine.js';

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const TILE_COLUMNS = 8;
const TILE_ROWS = 8;

function tileRect(index) {
  const column = index % TILE_COLUMNS;
  const row = Math.floor(index / TILE_COLUMNS);
  return [
    column / TILE_COLUMNS,
    1 - (row + 1) / TILE_ROWS,
    (column + 1) / TILE_COLUMNS,
    1 - row / TILE_ROWS,
  ];
}

const TILES = {
  roof: 0,
  facadeA: 1,
  facadeB: 2,
  facadeC: 3,
  facadeD: 4,
  facadeE: 5,
  road: 6,
  sidewalk: 7,
  sand: 8,
  water: 9,
  grass: 10,
  awning: 11,
  blank: 12,
  hiding: 13,
  wood: 14,
  shutter: 15,
};

const SIGN_NAMES = [
  'SOLANA MALL',
  'TACO SOL',
  'CLUB CORAL',
  'CASINO AZUL',
  'GYM 24H',
  'NOODLE BAR',
  'CITY BANK',
  'SURF SHOP',
  'PIER CAFE',
  'AUTO PARTS',
  'WAREHOUSE 9',
  'HARBOR GARAGE',
];

function paintFacade(context, x, y, width, height, base, trim, rng) {
  context.fillStyle = base;
  context.fillRect(x, y, width, height);
  const gradient = context.createLinearGradient(x, y, x + width, y);
  gradient.addColorStop(0, 'rgba(255,255,255,0.2)');
  gradient.addColorStop(0.5, 'rgba(0,0,0,0.02)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.1)');
  context.fillStyle = gradient;
  context.fillRect(x, y, width, height);
  context.fillStyle = trim;
  context.fillRect(x, y, width, 10);
  context.fillRect(x, y + height - 12, width, 12);
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 6; column++) {
      const lit = rng() > 0.36;
      context.fillStyle = lit ? '#ffe6a8' : '#54708c';
      const wx = x + 18 + column * 38;
      const wy = y + 28 + row * 25;
      context.fillRect(wx, wy, 22, 15);
      context.fillStyle = 'rgba(255,255,255,0.28)';
      context.fillRect(wx, wy, 22, 3);
    }
  }
}

function paintSign(context, x, y, width, height, text, index) {
  const palettes = [
    ['#102a3a', '#ffb35c'], ['#3a1024', '#ff6b8a'], ['#082f35', '#53f2d2'],
    ['#241047', '#c9a7ff'], ['#35200a', '#ffd166'], ['#0d2d20', '#8dff9a'],
  ];
  const [background, foreground] = palettes[index % palettes.length];
  context.fillStyle = background;
  context.fillRect(x, y, width, height);
  context.strokeStyle = foreground;
  context.lineWidth = 7;
  context.strokeRect(x + 8, y + 8, width - 16, height - 16);
  context.fillStyle = foreground;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  let fontSize = 43;
  context.font = `900 ${fontSize}px Arial, sans-serif`;
  while (context.measureText(text).width > width - 28 && fontSize > 20) {
    fontSize -= 3;
    context.font = `900 ${fontSize}px Arial, sans-serif`;
  }
  context.shadowColor = foreground;
  context.shadowBlur = 13;
  context.fillText(text, x + width / 2, y + height / 2 + 2);
  context.shadowBlur = 0;
}

function createAtlas(seed) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const context = canvas.getContext('2d');
  const rng = mulberry32(seed ^ 0x51ab);
  const tileWidth = canvas.width / TILE_COLUMNS;
  const tileHeight = canvas.height / TILE_ROWS;
  const at = (index) => ({
    x: (index % TILE_COLUMNS) * tileWidth,
    y: Math.floor(index / TILE_COLUMNS) * tileHeight,
  });

  let p = at(TILES.roof);
  context.fillStyle = '#2d3438';
  context.fillRect(p.x, p.y, tileWidth, tileHeight);
  context.fillStyle = '#454f52';
  for (let i = 0; i < 26; i++) context.fillRect(p.x + rng() * tileWidth, p.y + rng() * tileHeight, 22, 7);

  const facades = [
    ['#e0b98c', '#7a5638'], ['#93cdc4', '#2f6b6a'], ['#eda88f', '#81473d'],
    ['#93b4dc', '#3a5f8c'], ['#bda3d8', '#5c4278'],
  ];
  for (let i = 0; i < facades.length; i++) {
    p = at(TILES.facadeA + i);
    paintFacade(context, p.x, p.y, tileWidth, tileHeight, facades[i][0], facades[i][1], rng);
  }

  p = at(TILES.road);
  context.fillStyle = '#24282c';
  context.fillRect(p.x, p.y, tileWidth, tileHeight);
  context.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 500; i++) context.fillRect(p.x + rng() * tileWidth, p.y + rng() * tileHeight, 2, 2);

  p = at(TILES.sidewalk);
  context.fillStyle = '#9a978d';
  context.fillRect(p.x, p.y, tileWidth, tileHeight);
  context.strokeStyle = '#74716a';
  context.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    context.beginPath(); context.moveTo(p.x + i * tileWidth / 4, p.y); context.lineTo(p.x + i * tileWidth / 4, p.y + tileHeight); context.stroke();
    context.beginPath(); context.moveTo(p.x, p.y + i * tileHeight / 4); context.lineTo(p.x + tileWidth, p.y + i * tileHeight / 4); context.stroke();
  }

  p = at(TILES.sand);
  context.fillStyle = '#dec08a';
  context.fillRect(p.x, p.y, tileWidth, tileHeight);
  context.fillStyle = '#c9a86d';
  for (let i = 0; i < 180; i++) context.fillRect(p.x + rng() * tileWidth, p.y + rng() * tileHeight, 3, 2);

  p = at(TILES.water);
  const waterGradient = context.createLinearGradient(p.x, p.y, p.x, p.y + tileHeight);
  waterGradient.addColorStop(0, '#1d9db4');
  waterGradient.addColorStop(1, '#0b6e8c');
  context.fillStyle = waterGradient;
  context.fillRect(p.x, p.y, tileWidth, tileHeight);
  context.strokeStyle = 'rgba(180,255,244,0.4)';
  context.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    context.beginPath();
    const wy = p.y + 10 + i * 14;
    context.moveTo(p.x + (i % 3) * 22, wy);
    context.bezierCurveTo(p.x + 70, wy - 7, p.x + 145, wy + 7, p.x + tileWidth, wy - 3);
    context.stroke();
  }

  p = at(TILES.grass);
  context.fillStyle = '#3f7258';
  context.fillRect(p.x, p.y, tileWidth, tileHeight);
  context.fillStyle = '#57906a';
  for (let i = 0; i < 240; i++) context.fillRect(p.x + rng() * tileWidth, p.y + rng() * tileHeight, 2, 6);

  p = at(TILES.awning);
  for (let i = 0; i < 8; i++) {
    context.fillStyle = i % 2 ? '#f4ead8' : '#e4574f';
    context.fillRect(p.x + i * tileWidth / 8, p.y, tileWidth / 8, tileHeight);
  }

  p = at(TILES.blank);
  context.fillStyle = '#e8e4da';
  context.fillRect(p.x, p.y, tileWidth, tileHeight);

  p = at(TILES.hiding);
  context.fillStyle = '#063f3a';
  context.fillRect(p.x, p.y, tileWidth, tileHeight);
  context.fillStyle = '#62ffd0';
  context.font = '900 104px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('H', p.x + tileWidth / 2, p.y + tileHeight / 2 + 4);

  p = at(TILES.wood);
  context.fillStyle = '#7a5636';
  context.fillRect(p.x, p.y, tileWidth, tileHeight);
  context.strokeStyle = '#543a24';
  context.lineWidth = 5;
  for (let i = 0; i < 5; i++) {
    context.beginPath(); context.moveTo(p.x, p.y + i * tileHeight / 4); context.lineTo(p.x + tileWidth, p.y + i * tileHeight / 4); context.stroke();
  }

  p = at(TILES.shutter);
  context.fillStyle = '#69737a';
  context.fillRect(p.x, p.y, tileWidth, tileHeight);
  context.fillStyle = '#454f55';
  for (let y = 12; y < tileHeight; y += 16) context.fillRect(p.x + 8, p.y + y, tileWidth - 16, 5);

  SIGN_NAMES.forEach((name, index) => {
    p = at(16 + index);
    paintSign(context, p.x, p.y, tileWidth, tileHeight, name, index);
  });
  return canvas;
}

function box(batch, x, y, z, width, height, depth, color, uv = null, topUv = null, ry = 0) {
  batch.addBox(mat4Compose(x, y, z, 0, ry, 0, 1, 1, 1), width, height, depth, color, uv, topUv);
}

function plane(batch, x, y, z, width, depth, color, uv) {
  batch.addPlane(mat4Compose(x, y, z, 0, 0, 0, 1, 1, 1), width, depth, color, uv);
}

export class City {
  constructor(renderer, seed = 7) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.texture = new Texture(renderer, createAtlas(seed));
    this.batch = new Batch(renderer, { texture: this.texture });
    this.colliders = [];
    this.verticalRoads = [-125, -75, -25, 25, 75, 125];
    this.horizontalRoads = [-90, -45, 0, 45, 90];
    this.roadWidth = 16;
    this.bounds = { minX: -162, maxX: 162, minZ: -122, maxZ: 190 };
    this.lamps = [];
    this.hidingSpots = [
      { x: -58, z: 64 }, { x: 8, z: -64 }, { x: 58, z: 20 },
      { x: 108, z: -64 }, { x: -108, z: -20 }, { x: -8, z: 64 },
    ];
    this.locations = {
      garage: { x: 141, z: 109 },
      garageZone: { x: 132, z: 103 },
      chopShop: { x: 141, z: 58 },
      raceStart: { x: -142, z: 94, heading: Math.PI / 2 },
      bank: { x: 0, z: -25 },
      bankDoor: { x: 0, z: -15 },
      mall: { x: 0, z: -67 },
      mallDoor: { x: -10, z: -56 },
      docksPickup: { x: 104, z: 64 },
      marinaBoat: { x: 0, z: 168 },
      pier: { x: 0, z: 132 },
      oldMarket: { x: -100, z: 67 },
      neonRow: { x: -25, z: 0 },
      playerStart: { x: -137, z: 90 },
      startCar: { x: -129, z: 94, heading: Math.PI / 2 },
    };
    this.signNames = [...SIGN_NAMES];
    this.parkedSpots = [];
    this.build();
  }

  districtAt(x, z) {
    if (z > 104) return 'Marina';
    if (x > 92 && z > 28) return 'The Docks';
    if (x < -76 && z > 42) return 'Old Market';
    if (Math.abs(x) < 38 && z < -48) return 'Solana Mall';
    if (Math.abs(x + 25) < 28 && Math.abs(z) < 30) return 'Neon Row';
    if (z < -52) return 'Palm Heights';
    if (x > 126 && z > 88) return 'Harbor Garage';
    return 'Solana Bay';
  }

  isOnRoad(x, z, extra = 0) {
    const half = this.roadWidth / 2 + extra;
    return this.verticalRoads.some((roadX) => Math.abs(x - roadX) <= half) ||
      this.horizontalRoads.some((roadZ) => Math.abs(z - roadZ) <= half);
  }

  nearestRoadPoint(x, z) {
    let best = { x, z, distance: Infinity };
    for (const roadX of this.verticalRoads) {
      const candidate = { x: roadX, z: clamp(z, -106, 106), distance: Math.abs(x - roadX) };
      if (candidate.distance < best.distance) best = candidate;
    }
    for (const roadZ of this.horizontalRoads) {
      const candidate = { x: clamp(x, -142, 142), z: roadZ, distance: Math.abs(z - roadZ) };
      if (candidate.distance < best.distance) best = candidate;
    }
    return best;
  }

  addCollider(x, z, width, depth, height = 12) {
    this.colliders.push({
      minX: x - width / 2, maxX: x + width / 2,
      minZ: z - depth / 2, maxZ: z + depth / 2,
      height,
    });
  }

  addBuilding(x, z, width, depth, height, facadeIndex, options = {}) {
    const batch = this.batch;
    const facade = tileRect(TILES.facadeA + (facadeIndex % 5));
    const roof = tileRect(TILES.roof);
    box(batch, x, height / 2, z, width, height, depth, [1, 1, 1, 1], facade, roof);
    box(batch, x, height + 0.55, z, width * 0.52, 1.1, depth * 0.46, [0.32, 0.36, 0.38, 1], roof);
    if (this.rng() > 0.42) {
      box(batch, x + width * 0.22, height + 1.45, z - depth * 0.18, 2.4, 1.8, 2.2, [0.48, 0.5, 0.48, 1], roof);
    }
    if (options.sign !== undefined) {
      const signWidth = Math.min(width * 0.92, 24);
      const signY = options.signY || Math.min(height - 3.2, 8.5);
      box(batch, x, signY, z + depth / 2 + 0.18, signWidth, 3.4, 0.32,
        [1, 1, 1, 1], tileRect(16 + options.sign));
    }
    if (options.awning) {
      box(batch, x, 3.1, z + depth / 2 + 1.15, width * 0.94, 0.35, 2.6,
        [1, 1, 1, 1], tileRect(TILES.awning));
    }
    this.addCollider(x, z, width, depth, height);
  }

  addPalm(x, z, scale = 1) {
    const batch = this.batch;
    const bend = (this.rng() - 0.5) * 1.8;
    let px = x;
    let pz = z;
    const segments = 5;
    for (let i = 0; i < segments; i++) {
      const t = i / segments;
      px += bend * t * 0.24;
      pz += Math.sin(i * 1.7 + x) * 0.05;
      const matrix = mat4Compose(px, 1 + i * 1.15 * scale, pz, 0, 0, bend * 0.055, 1, 1, 1);
      batch.addBox(matrix, 0.55 * scale, 1.25 * scale, 0.55 * scale, [0.48, 0.34, 0.2, 1], tileRect(TILES.wood));
    }
    const topX = px + bend * 0.35;
    const topY = 1 + segments * 1.15 * scale;
    for (let i = 0; i < 7; i++) {
      const angle = i / 7 * Math.PI * 2 + this.rng() * 0.35;
      const matrix = mat4Compose(
        topX + Math.sin(angle) * 1.55 * scale,
        topY - 0.28 * scale,
        pz + Math.cos(angle) * 1.55 * scale,
        0.52, -angle, 0, 1, 1, 1);
      batch.addBox(matrix, 0.28 * scale, 0.12 * scale, 3.4 * scale, [0.16, 0.55, 0.28, 1], tileRect(TILES.grass));
    }
    for (let i = 0; i < 3; i++) {
      box(batch, topX + (i - 1) * 0.42, topY - 0.55, pz + (i % 2) * 0.3, 0.48, 0.48, 0.48,
        [0.4, 0.27, 0.14, 1], tileRect(TILES.wood));
    }
    this.addCollider(x, z, 0.8, 0.8, 6);
  }

  addLamp(x, z) {
    const batch = this.batch;
    box(batch, x, 2.8, z, 0.28, 5.6, 0.28, [0.12, 0.14, 0.16, 1], tileRect(TILES.roof));
    box(batch, x, 5.8, z, 1.15, 0.42, 1.15, [1, 0.78, 0.38, 1], tileRect(TILES.blank));
    this.lamps.push({ x, z });
  }

  buildGroundAndRoads() {
    const batch = this.batch;
    plane(batch, 0, -0.08, 34, 380, 330, [1, 1, 1, 1], tileRect(TILES.grass));
    plane(batch, 0, 0.0, 128, 340, 52, [1, 1, 1, 1], tileRect(TILES.sand));
    plane(batch, 0, -0.18, 222, 390, 145, [1, 1, 1, 1], tileRect(TILES.water));

    for (const x of this.verticalRoads) {
      box(batch, x, 0.025, 0, this.roadWidth, 0.05, 218, [1, 1, 1, 1], tileRect(TILES.road));
      for (let z = -102; z <= 102; z += 9) {
        if (this.horizontalRoads.some((hz) => Math.abs(z - hz) < 9)) continue;
        box(batch, x, 0.065, z, 0.32, 0.025, 4.6, [0.95, 0.82, 0.35, 1], tileRect(TILES.blank));
      }
    }
    for (const z of this.horizontalRoads) {
      box(batch, 0, 0.03, z, 292, 0.05, this.roadWidth, [1, 1, 1, 1], tileRect(TILES.road));
      for (let x = -140; x <= 140; x += 9) {
        if (this.verticalRoads.some((vx) => Math.abs(x - vx) < 9)) continue;
        box(batch, x, 0.07, z, 4.6, 0.025, 0.32, [0.92, 0.92, 0.88, 1], tileRect(TILES.blank));
      }
    }
    // Crosswalks make intersections read instantly from the chase camera.
    for (const x of this.verticalRoads) {
      for (const z of this.horizontalRoads) {
        for (let stripe = -2; stripe <= 2; stripe++) {
          box(batch, x + stripe * 2.4, 0.075, z - 9.4, 1.15, 0.02, 3.2, [0.9, 0.9, 0.86, 1], tileRect(TILES.blank));
          box(batch, x + stripe * 2.4, 0.075, z + 9.4, 1.15, 0.02, 3.2, [0.9, 0.9, 0.86, 1], tileRect(TILES.blank));
        }
      }
    }
    // Pier: a broad timber deck reaching from the beach to the escape boat.
    box(batch, 0, 0.35, 143, 11, 0.7, 58, [1, 1, 1, 1], tileRect(TILES.wood));
    for (let z = 120; z <= 168; z += 8) {
      box(batch, -5.8, 0.65, z, 0.35, 1.3, 0.35, [0.42, 0.3, 0.18, 1], tileRect(TILES.wood));
      box(batch, 5.8, 0.65, z, 0.35, 1.3, 0.35, [0.42, 0.3, 0.18, 1], tileRect(TILES.wood));
    }
  }

  buildBlocks() {
    const xBlocks = [[-117, -83], [-67, -33], [-17, 17], [33, 67], [83, 117]];
    const zBlocks = [[-82, -53], [-37, -8], [8, 37], [53, 82]];
    let facade = 0;
    for (let zi = 0; zi < zBlocks.length; zi++) {
      for (let xi = 0; xi < xBlocks.length; xi++) {
        const [x0, x1] = xBlocks[xi];
        const [z0, z1] = zBlocks[zi];
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        box(this.batch, cx, 0.06, cz, x1 - x0 + 7, 0.12, z1 - z0 + 7,
          [1, 1, 1, 1], tileRect(TILES.sidewalk));
        const isMall = xi === 2 && zi === 0;
        const isBank = xi === 2 && zi === 1;
        const isMarket = xi === 0 && zi === 3;
        if (isMall) {
          this.addBuilding(cx, cz - 2, 31, 23, 15, 1, { sign: 0, signY: 10 });
          continue;
        }
        if (isBank) {
          this.addBuilding(cx, cz - 3, 27, 20, 18, 3, { sign: 6, signY: 12 });
          box(this.batch, cx - 9, 2.2, cz + 8.5, 1.1, 4.4, 1.1, [0.88, 0.84, 0.72, 1], tileRect(TILES.blank));
          box(this.batch, cx + 9, 2.2, cz + 8.5, 1.1, 4.4, 1.1, [0.88, 0.84, 0.72, 1], tileRect(TILES.blank));
          continue;
        }
        if (isMarket) {
          this.buildMarket(cx, cz);
          continue;
        }
        const lots = [[-8.5, -7.5], [8.5, -7.5], [-8.5, 7.5], [8.5, 7.5]];
        for (const [ox, oz] of lots) {
          if (this.rng() < 0.08) continue;
          const height = 9 + this.rng() * (zi === 0 ? 30 : 21);
          this.addBuilding(cx + ox, cz + oz, 13.5, 12.5, height, facade++);
        }
      }
    }
  }

  buildMarket(cx, cz) {
    const batch = this.batch;
    const stallPositions = [[-11, -7], [0, -7], [11, -7], [-6, 7], [6, 7]];
    for (const [ox, oz] of stallPositions) {
      const x = cx + ox, z = cz + oz;
      box(batch, x, 1.05, z, 7.5, 2.1, 4.6, [0.56, 0.36, 0.2, 1], tileRect(TILES.wood));
      box(batch, x, 3.15, z + 0.4, 8.6, 0.32, 5.8, [1, 1, 1, 1], tileRect(TILES.awning));
      box(batch, x - 2, 2.25, z, 1.25, 0.8, 1.1, [0.95, 0.42, 0.2, 1], tileRect(TILES.blank));
      box(batch, x + 1.8, 2.25, z + 0.5, 1.1, 0.7, 1.0, [0.3, 0.75, 0.35, 1], tileRect(TILES.blank));
      this.addCollider(x, z, 7.5, 4.6, 3.4);
    }
  }

  buildNamedShops() {
    // A readable commercial spine.  The buildings are modest in height so
    // their signs survive in screenshots taken from street level.
    const shops = [
      { name: 1, x: -42, z: -18, w: 17, h: 10, f: 2 },
      { name: 2, x: -42, z: 17, w: 17, h: 12, f: 4 },
      { name: 3, x: 42, z: -18, w: 18, h: 14, f: 3 },
      { name: 4, x: 42, z: 17, w: 16, h: 9, f: 1 },
      { name: 5, x: -92, z: -18, w: 17, h: 10, f: 0 },
      { name: 7, x: 92, z: 17, w: 16, h: 9, f: 2 },
      { name: 8, x: -92, z: 100, w: 17, h: 9, f: 1 },
      { name: 9, x: 92, z: -62, w: 16, h: 10, f: 4 },
    ];
    for (const shop of shops) {
      this.addBuilding(shop.x, shop.z, shop.w, 13, shop.h, shop.f,
        { sign: shop.name, awning: true, signY: Math.min(shop.h - 1.8, 7.4) });
    }
    // Docks warehouse and the Harbor Garage are destinations, so they get
    // larger footprints and clear open aprons rather than decorative lots.
    this.addBuilding(141, 58, 25, 22, 13, 3, { sign: 10, signY: 9 });
    box(this.batch, 128, 2.6, 58, 0.4, 5.2, 13, [0.2, 0.23, 0.25, 1], tileRect(TILES.shutter));
    this.addBuilding(141, 112, 25, 18, 11, 2, { sign: 11, signY: 8 });
    box(this.batch, 132, 2.4, 103.2, 12, 4.8, 0.35, [0.08, 0.1, 0.11, 1], tileRect(TILES.shutter));
    // Marina cafe and a low beach club give the south road a destination.
    this.addBuilding(-48, 108, 20, 12, 8, 1, { sign: 8, awning: true, signY: 6.2 });
  }

  buildVegetationAndLights() {
    for (let x = -150; x <= 150; x += 18) {
      if (Math.abs(x) < 9) continue;
      this.addPalm(x + (this.rng() - 0.5) * 3, 111 + this.rng() * 4, 0.9 + this.rng() * 0.35);
    }
    for (const x of this.verticalRoads) {
      for (const z of this.horizontalRoads) {
        this.addLamp(x - 9.4, z - 9.4);
        if ((x + z) % 3 === 0) this.addLamp(x + 9.4, z + 9.4);
      }
    }
    const palmCorners = [[-136, -101], [-64, -101], [36, -56], [86, 56], [-64, 101], [64, -101], [136, 34]];
    for (const [x, z] of palmCorners) this.addPalm(x, z, 1.05);
    // Hiding spots: teal H boards on two faces of a short post.
    for (const spot of this.hidingSpots) {
      box(this.batch, spot.x, 1.5, spot.z, 0.35, 3, 0.35, [0.1, 0.14, 0.14, 1], tileRect(TILES.roof));
      box(this.batch, spot.x, 3.25, spot.z, 2.6, 1.7, 0.22, [1, 1, 1, 1], tileRect(TILES.hiding));
      const rotated = mat4Compose(spot.x, 3.25, spot.z, 0, Math.PI / 2, 0, 1, 1, 1);
      this.batch.addBox(rotated, 2.6, 1.7, 0.22, [1, 1, 1, 1], tileRect(TILES.hiding));
    }
  }

  buildParkedSpots() {
    let flip = 1;
    for (const z of this.horizontalRoads) {
      for (let x = -142; x <= 142; x += 31) {
        if (this.verticalRoads.some((vx) => Math.abs(x - vx) < 13)) continue;
        this.parkedSpots.push({ x, z: z + flip * 10.6, heading: flip > 0 ? Math.PI / 2 : -Math.PI / 2 });
        flip *= -1;
      }
    }
    for (const x of this.verticalRoads) {
      for (let z = -78; z <= 78; z += 37) {
        if (this.horizontalRoads.some((hz) => Math.abs(z - hz) < 13)) continue;
        this.parkedSpots.push({ x: x + flip * 10.6, z, heading: flip > 0 ? 0 : Math.PI });
        flip *= -1;
      }
    }
  }

  buildBoats() {
    const batch = this.batch;
    const boats = [[-34, 166, 0.2], [28, 181, -0.3], [0, 168, 0]];
    for (const [x, z, ry] of boats) {
      const hull = mat4Compose(x, 0.65, z, 0, ry, 0, 1, 1, 1);
      batch.addBox(hull, 4.6, 1.25, 11, [0.92, 0.94, 0.9, 1], tileRect(TILES.blank));
      const cabin = mat4Compose(x, 1.75, z - 0.8, 0, ry, 0, 1, 1, 1);
      batch.addBox(cabin, 3.1, 1.5, 4.4, [0.15, 0.42, 0.52, 1], tileRect(TILES.facadeB));
      const mast = mat4Compose(x, 5.2, z + 1.4, 0, ry, 0, 1, 1, 1);
      batch.addBox(mast, 0.22, 7.5, 0.22, [0.8, 0.82, 0.78, 1], tileRect(TILES.blank));
    }
  }

  build() {
    this.buildGroundAndRoads();
    this.buildBlocks();
    this.buildNamedShops();
    this.buildVegetationAndLights();
    this.buildParkedSpots();
    this.buildBoats();
    this.batch.upload();
  }

  drawDynamic(batch, glowBatch, elapsed, night) {
    // Water sparkle: a few pale foam ribbons slide along the shoreline.
    for (let i = 0; i < 9; i++) {
      const x = -150 + i * 37 + Math.sin(elapsed * 0.55 + i * 1.7) * 4;
      box(batch, x, 0.04, 151 + (i % 3) * 3.2, 17, 0.06, 0.55,
        [0.72, 0.98, 0.94, 0.34]);
    }
    if (night > 0.18) {
      for (const lamp of this.lamps) {
        box(glowBatch, lamp.x, 5.8, lamp.z, 1.7, 0.65, 1.7,
          [1, 0.72, 0.28, 0.32 + night * 0.42]);
      }
    }
    const pulse = 0.72 + Math.sin(elapsed * 2.4) * 0.18;
    for (const spot of this.hidingSpots) {
      box(glowBatch, spot.x, 2.4, spot.z, 2.2, 4.8, 2.2,
        [0.1, 1, 0.72, 0.1 + pulse * 0.1]);
    }
  }

  collideCircle(position, radius) {
    let hit = false;
    for (const collider of this.colliders) {
      const nearestX = clamp(position.x, collider.minX, collider.maxX);
      const nearestZ = clamp(position.z, collider.minZ, collider.maxZ);
      const dx = position.x - nearestX;
      const dz = position.z - nearestZ;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared >= radius * radius) continue;
      hit = true;
      if (distanceSquared > 0.0001) {
        const distance = Math.sqrt(distanceSquared);
        position.x = nearestX + dx / distance * radius;
        position.z = nearestZ + dz / distance * radius;
      } else {
        const left = Math.abs(position.x - collider.minX);
        const right = Math.abs(collider.maxX - position.x);
        const top = Math.abs(position.z - collider.minZ);
        const bottom = Math.abs(collider.maxZ - position.z);
        const smallest = Math.min(left, right, top, bottom);
        if (smallest === left) position.x = collider.minX - radius;
        else if (smallest === right) position.x = collider.maxX + radius;
        else if (smallest === top) position.z = collider.minZ - radius;
        else position.z = collider.maxZ + radius;
      }
    }
    position.x = clamp(position.x, this.bounds.minX, this.bounds.maxX);
    position.z = clamp(position.z, this.bounds.minZ, this.bounds.maxZ);
    return hit;
  }
}

export function createCity(renderer, seed) {
  return new City(renderer, seed);
}
