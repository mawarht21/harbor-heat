// HARBOR HEAT 3D — a hand-written WebGL1 engine: matrix math, shaders, merged
// geometry and canvas textures. No libraries: every line here is the game's own.
// The look is flat-shaded low-poly boxes, distance fog, a day/night sky palette,
// and building facades whose windows light up after dark.

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;

export function createRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
export const randRange = (rng, a, b) => a + rng() * (b - a);
export const randInt = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

/** Shortest-path angle lerp, radians. */
export function angleLerp(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// ---------------------------------------------------------------- mat4 math
// Column-major Float32Array(16), the layout WebGL expects.
export function m4identity(out = new Float32Array(16)) {
  out.fill(0); out[0] = out[5] = out[10] = out[15] = 1;
  return out;
}
export function m4perspective(fovY, aspect, near, far, out = new Float32Array(16)) {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect; out[5] = f;
  out[10] = (far + near) * nf; out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}
export function m4lookAt(eye, center, up, out = new Float32Array(16)) {
  let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
  const xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz) || 1;
  const yx = zy * (xz / l) - zz * (xy / l), yy = zz * (xx / l) - zx * (xz / l), yz = zx * (xy / l) - zy * (xx / l);
  out[0] = xx / l; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy / l; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz / l; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(out[0] * eye[0] + out[4] * eye[1] + out[8] * eye[2]);
  out[13] = -(out[1] * eye[0] + out[5] * eye[1] + out[9] * eye[2]);
  out[14] = -(out[2] * eye[0] + out[6] * eye[1] + out[10] * eye[2]);
  out[15] = 1;
  return out;
}
export function m4multiply(a, b, out = new Float32Array(16)) {
  const r = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let row = 0; row < 4; row++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + row] * b[c * 4 + k];
    r[c * 4 + row] = s;
  }
  out.set(r);
  return out;
}
/** Compose T(x,y,z) · RotY(ry) · RotX(rx) · RotZ(rz) · Scale(sx,sy,sz). */
export function m4compose(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0, out = new Float32Array(16)) {
  const cy = Math.cos(ry), syaw = Math.sin(ry);
  const cx = Math.cos(rx), sxr = Math.sin(rx);
  const cz = Math.cos(rz), szr = Math.sin(rz);
  // R = Ry * Rx * Rz
  const r00 = cy * cz + syaw * sxr * szr, r01 = -cy * szr + syaw * sxr * cz, r02 = syaw * cx;
  const r10 = cx * szr, r11 = cx * cz, r12 = -sxr;
  const r20 = -syaw * cz + cy * sxr * szr, r21 = syaw * szr + cy * sxr * cz, r22 = cy * cx;
  out[0] = r00 * sx; out[1] = r10 * sx; out[2] = r20 * sx; out[3] = 0;
  out[4] = r01 * sy; out[5] = r11 * sy; out[6] = r21 * sy; out[7] = 0;
  out[8] = r02 * sz; out[9] = r12 * sz; out[10] = r22 * sz; out[11] = 0;
  out[12] = x; out[13] = y; out[14] = z; out[15] = 1;
  return out;
}

// ---------------------------------------------------------------- geometry
/** Accumulates lit geometry: position, normal, color(rgb), uv, indices. */
export class Builder {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.uv = []; this.idx = []; }
  vert(x, y, z, nx, ny, nz, r, g, b, u, v) {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.col.push(r, g, b); this.uv.push(u, v);
    return this.pos.length / 3 - 1;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  /** Flat quad in 3D: corners p0..p3 counter-clockwise seen from the normal side. */
  plane(p0, p1, p2, p3, n, color, uvRect) {
    const [r, g, b] = color;
    const [u0, v0, u1, v1] = uvRect || WHITE_UV;
    const a = this.vert(p0[0], p0[1], p0[2], n[0], n[1], n[2], r, g, b, u0, v0);
    const bb = this.vert(p1[0], p1[1], p1[2], n[0], n[1], n[2], r, g, b, u1, v0);
    const c = this.vert(p2[0], p2[1], p2[2], n[0], n[1], n[2], r, g, b, u1, v1);
    const d = this.vert(p3[0], p3[1], p3[2], n[0], n[1], n[2], r, g, b, u0, v1);
    this.quad(a, bb, c, d);
  }
  /** Axis-aligned box; opts: color, topColor, facadeUV (uv rect for the 4 sides). */
  box(cx, cy, cz, w, h, d, opts = {}) {
    const col = opts.color || [1, 1, 1];
    const top = opts.topColor || col;
    const f = opts.facadeUV || WHITE_UV;
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    this.plane([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], col, f);            // +z
    this.plane([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], col, f);          // -z
    this.plane([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], col, f);           // +x
    this.plane([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], col, f);          // -x
    this.plane([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], top, WHITE_UV);    // top
    this.plane([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], col, WHITE_UV);   // bottom
  }
  /** Box rotated around Y by ry (radians), same coloring rules as box(). */
  boxR(cx, cy, cz, w, h, d, ry, opts = {}) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const rot = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
    const col = opts.color || [1, 1, 1];
    const top = opts.topColor || col;
    const f = opts.facadeUV || WHITE_UV;
    const hw = w / 2, hd = d / 2, y0 = cy - h / 2, y1 = cy + h / 2;
    const A = rot(-hw, -hd), B = rot(hw, -hd), C = rot(hw, hd), D = rot(-hw, hd);
    const P = (p, y) => [p[0], y, p[1]];
    this.plane(P(D, y0), P(C, y0), P(C, y1), P(D, y1), [s, 0, c], col, f);
    this.plane(P(B, y0), P(A, y0), P(A, y1), P(B, y1), [-s, 0, -c], col, f);
    this.plane(P(C, y0), P(B, y0), P(B, y1), P(C, y1), [c, 0, -s], col, f);
    this.plane(P(A, y0), P(D, y0), P(D, y1), P(A, y1), [-c, 0, s], col, f);
    this.plane(P(D, y1), P(C, y1), P(B, y1), P(A, y1), [0, 1, 0], top, WHITE_UV);
    this.plane(P(A, y0), P(B, y0), P(C, y0), P(D, y0), [0, -1, 0], col, WHITE_UV);
  }
  /** Open cone (no caps), apex up at height h, base radius r. */
  cone(cx, cy, cz, r, h, color, seg = 10) {
    const [rr, gg, bb] = color;
    const apex = this.vert(cx, cy + h, cz, 0, 1, 0, rr, gg, bb, 0.5, 0.5);
    let prev = null, first = null;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * TAU;
      const nx = Math.cos(a), nz = Math.sin(a);
      const v = this.vert(cx + nx * r, cy, cz + nz * r, nx, 0.4, nz, rr, gg, bb, 0.5, 0.5);
      if (first === null) first = v;
      if (prev !== null) this.tri(apex, v, prev);
      prev = v;
    }
  }
  build(gl) {
    const mesh = { count: this.idx.length };
    const mk = (arr, itemSize) => {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
      return { buf, itemSize };
    };
    mesh.pos = mk(this.pos, 3); mesh.nor = mk(this.nor, 3); mesh.col = mk(this.col, 3); mesh.uv = mk(this.uv, 2);
    mesh.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(this.idx), gl.STATIC_DRAW);
    return mesh;
  }
}

// A uv rect that samples the atlas' plain white texel: vertex color does the work.
export const WHITE_UV = [0.004, 0.996, 0.012, 0.988];

// ---------------------------------------------------------------- textures
export function makeTexture(gl, canvas) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.generateMipmap(gl.TEXTURE_2D);
  return tex;
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

/**
 * The one big atlas: white texel, 6 building facades (day row + lit-night row),
 * sign strips, a water-stripe tile and a soft disc for glows.
 * Layout (1024x1024): facades 128x256 each: day at canvas y 256..512, night at y 0..256.
 * With flipY, day v-range is [0.5,0.75], night [0.75,1.0]; the lit shader adds
 * uNight * 0.25 to v to slide from the day row into the lit row.
 */
export function buildAtlas(gl, rng) {
  const c = canvas(1024, 1024);
  const g = c.getContext('2d');
  // only the white-texel corner is painted white; the rest stays transparent so
  // the glow disc (bottom area) keeps a real alpha gradient
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 16, 16);
  const wallPalettes = [
    ['#e0c9a6', '#8a97a5'], ['#e8a58c', '#7d8ca3'], ['#cfd8dc', '#78909c'], ['#f2d38a', '#a1887f'],
    ['#b39ddb', '#6a8caf'], ['#ef9a9a', '#5f8d87'],
  ];
  const accents = ['#ff5d8f', '#ffd23f', '#4cc9f0', '#06d6a0', '#f4845f', '#c77dff'];
  window.__facades = [];
  for (let i = 0; i < 6; i++) {
    const x = 16 + i * 136;
    const [wall, trim] = wallPalettes[i];
    const accent = accents[i];
    // night row (canvas y 0..256): deep walls, windows lit warm
    g.fillStyle = '#22252f'; g.fillRect(x, 0, 128, 256);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, 0, 128, 12);
    // day row (canvas y 256..512): wall, parapet cap, base shadow line
    g.fillStyle = wall; g.fillRect(x, 256, 128, 256);
    g.fillStyle = trim; g.fillRect(x, 256, 128, 11);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x, 267, 128, 2);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x, 500, 128, 12);
    // window grid — one layout shared by both rows so the night v-slide lines up
    const cols = 6, rows = 7, fx0 = x + 9, fy0 = 22, cw = 18.4, chh = 23.5, ww = 11, wh = 14;
    const dayGlass = ['#33475e', '#3d5a76', '#2c3e50', '#5b7a99', '#46586a', '#6d8aa5'];
    const litGlass = ['#ffd76a', '#ffca4f', '#fff3b0', '#ffb84d', '#ffe9a8'];
    for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
      const wx = fx0 + cx * cw, wy = fy0 + cy * chh;
      // day: dark frame, varied glass, centre mullion, top sheen
      g.fillStyle = 'rgba(30,34,44,0.55)'; g.fillRect(wx - 1.5, 256 + wy - 1.5, ww + 3, wh + 3);
      g.fillStyle = dayGlass[Math.floor(rng() * dayGlass.length)];
      g.fillRect(wx, 256 + wy, ww, wh);
      g.fillStyle = 'rgba(255,255,255,0.20)'; g.fillRect(wx + ww / 2 - 0.5, 256 + wy, 1, wh);
      g.fillStyle = 'rgba(255,255,255,0.13)'; g.fillRect(wx, 256 + wy, ww, 4);
      // night: the same window, lit warm or dark
      const lit = rng();
      g.fillStyle = lit < 0.58 ? litGlass[Math.floor(rng() * litGlass.length)] : (rng() < 0.5 ? '#252d3d' : '#1d2431');
      g.fillRect(wx, wy, ww, wh);
      if (lit < 0.58) { g.fillStyle = 'rgba(120,70,10,0.35)'; g.fillRect(wx + ww / 2 - 0.5, wy, 1, wh); }
    }
    // ground-floor storefront band (rel y 200..256 in both rows): shaded band,
    // a coloured sign stripe, three glass panes with a door split in the middle
    for (const yBase of [0, 256]) {
      const nightBand = yBase === 0;
      g.fillStyle = nightBand ? 'rgba(6,8,14,0.55)' : 'rgba(20,22,32,0.30)';
      g.fillRect(x, yBase + 200, 128, 56);
      g.fillStyle = accent; g.fillRect(x, yBase + 200, 128, 9);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, yBase + 209, 128, 2);
      for (let p = 0; p < 3; p++) {
        const px = x + 8 + p * 39, pw = 33;
        const litInterior = nightBand && rng() < 0.7;
        g.fillStyle = litInterior ? '#e8a54b' : (nightBand ? '#141a26' : '#2e4256');
        g.fillRect(px, yBase + 216, pw, 34);
        g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(px, yBase + 216, pw, 5);
        if (p === 1) { g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(px + pw / 2 - 1, yBase + 216, 2, 34); }
      }
    }
    window.__facades.push([x / 1024, 0.5, (x + 128) / 1024, 0.75]);
  }
  // market pavement tile at canvas (0,768) 256x256: warm sandstone pavers
  {
    g.fillStyle = '#a08b62'; g.fillRect(0, 768, 256, 256);
    const ts = 64;
    for (let tx = 0; tx < 4; tx++) for (let ty = 0; ty < 4; ty++) {
      const v = Math.round((rng() - 0.5) * 14);
      g.fillStyle = `rgb(${176 + v},${152 + v},${110 + v})`;
      g.fillRect(tx * ts + 2, 768 + ty * ts + 2, ts - 4, ts - 4);
      g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(tx * ts + 2, 768 + ty * ts + 2, ts - 4, 5);
      g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(tx * ts + 2, 768 + ty * ts + ts - 9, ts - 4, 5);
    }
    g.fillStyle = 'rgba(90,70,40,0.5)';
    for (let i = 0; i < 260; i++) g.fillRect(rng() * 256, 768 + rng() * 256, 2, 2);
  }
  window.__pavementUV = [0, 0, 0.25, 0.25];
  // cash banknote sprite at canvas (256,768) 128x64
  {
    g.fillStyle = '#2fae5f'; g.fillRect(256, 768, 128, 64);
    g.strokeStyle = '#bff0cd'; g.lineWidth = 3; g.strokeRect(260, 772, 120, 56);
    g.fillStyle = '#1d7a40'; g.beginPath(); g.arc(320, 800, 17, 0, 6.29); g.fill();
    g.fillStyle = '#eafff1'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('$', 320, 802);
    g.font = 'bold 13px Arial'; g.fillText('100', 276, 800); g.fillText('100', 364, 800);
  }
  window.__cashUV = [256 / 1024, 1 - 832 / 1024, 384 / 1024, 1 - 768 / 1024];
  // sign strips: canvas y 512..576, each 256x64, dark board + neon text
  const signs = ['SOLANA MALL', 'TACO SOL', 'CLUB CORAL', 'CASINO AZUL', 'GYM 24H', 'NOODLE BAR', 'CITY BANK', 'SURF SHOP', 'PIER CAFE', 'AUTO PARTS', 'WAREHOUSE 9', 'HARBOR GARAGE'];
  window.__signUV = {};
  signs.forEach((name, i) => {
    const x = (i % 4) * 256, y = 512 + Math.floor(i / 4) * 64;
    g.fillStyle = '#14101f'; g.fillRect(x, y, 256, 64);
    const hues = ['#ff5d8f', '#ffd23f', '#4cc9f0', '#06d6a0', '#f4845f', '#c77dff'];
    const fs = name.length > 11 ? 25 : name.length > 9 ? 29 : 34;
    g.font = `bold ${fs}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = hues[i % hues.length]; g.shadowBlur = 16;
    g.fillStyle = hues[i % hues.length];
    g.fillText(name, x + 128, y + 34);
    g.shadowBlur = 0;
    window.__signUV[name] = [x / 1024, 1 - (y + 64) / 1024, (x + 256) / 1024, 1 - y / 1024];
  });
  // water stripes tile at canvas (768, 768) 256x256
  g.fillStyle = '#1b6f9e'; g.fillRect(768, 768, 256, 256);
  g.strokeStyle = 'rgba(160,225,255,0.5)'; g.lineWidth = 3;
  for (let i = 0; i < 14; i++) {
    g.beginPath();
    const y = 776 + i * 18;
    g.moveTo(768, y);
    for (let x = 768; x <= 1024; x += 32) g.lineTo(x, y + Math.sin((x + i * 40) * 0.05) * 3);
    g.stroke();
  }
  window.__waterUV = [768 / 1024, 0, 1, 0.25];
  // soft round disc (glow / spotlight pool) at canvas (512,768) 256x256.
  // Clear the tile first (the water strokes next door bleed a couple of px
  // into it) and keep the gradient well inside the tile, so mip filtering
  // on huge glow quads can never smear neighbour texels into streaks.
  g.clearRect(512, 768, 256, 256);
  const grad = g.createRadialGradient(640, 896, 8, 640, 896, 104);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(512, 768, 256, 256);
  window.__discUV = [512 / 1024, 0, 768 / 1024, 0.25];
  const tex = makeTexture(gl, c);
  // repeat wrapping lets the water tile scroll; facade/sign uvs stay inside
  // [0,1] so they are unaffected
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return { tex, canvas: c, facades: window.__facades, signUV: window.__signUV, waterUV: window.__waterUV, discUV: window.__discUV, pavementUV: window.__pavementUV, cashUV: window.__cashUV };
}

// ---------------------------------------------------------------- renderer
const LIT_VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol; attribute vec2 aUv;
uniform mat4 uMVP; uniform mat4 uModel; uniform mat3 uNorm; uniform float uNight;
varying vec3 vCol; varying vec3 vNor; varying vec2 vUv; varying float vFog;
uniform vec3 uCam;
void main(){
  gl_Position = uMVP * vec4(aPos,1.0);
  vec3 world = (uModel * vec4(aPos,1.0)).xyz;
  vCol = aCol; vNor = uNorm * aNor;
  vUv = vec2(aUv.x, aUv.y + uNight * 0.25 * step(0.49, aUv.y) * step(aUv.y, 0.76));
  vFog = distance(uCam, world);
}`;
const LIT_FS = `
precision highp float;
varying vec3 vCol; varying vec3 vNor; varying vec2 vUv; varying float vFog;
uniform sampler2D uTex; uniform vec3 uTint; uniform float uAlpha;
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmb;
uniform vec3 uFogCol; uniform float uFogNear; uniform float uFogFar; uniform float uNight;
void main(){
  vec4 tex = texture2D(uTex, vUv);
  vec3 n = normalize(vNor);
  float diff = max(dot(n, normalize(uSunDir)), 0.0);
  vec3 col = tex.rgb * vCol * uTint * (uAmb + uSunCol * diff);
  // windows in the lit-night facade row glow: warm, saturated texels add back light
  float warm = clamp((tex.r + tex.g) * 0.5 - tex.b, 0.0, 1.0);
  float inFacade = step(0.49, vUv.y) * step(vUv.y, 1.01);
  col += tex.rgb * warm * uNight * inFacade * 0.9;
  float f = smoothstep(uFogNear, uFogFar, vFog);
  col = mix(col, uFogCol, f);
  gl_FragColor = vec4(col, uAlpha);
}`;
const UNLIT_VS = `
attribute vec3 aPos; attribute vec3 aCol; attribute vec2 aUv;
uniform mat4 uMVP;
varying vec3 vCol; varying vec2 vUv;
void main(){ gl_Position = uMVP * vec4(aPos,1.0); vCol = aCol; vUv = aUv; }`;
const UNLIT_FS = `
precision mediump float;
varying vec3 vCol; varying vec2 vUv;
uniform sampler2D uTex; uniform float uAlpha; uniform vec3 uTint;
void main(){
  vec4 tex = texture2D(uTex, vUv);
  gl_FragColor = vec4(tex.rgb * vCol * uTint, tex.a * uAlpha);
}`;

function program(gl, vs, fs) {
  const mk = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(sh));
    return sh;
  };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  return p;
}

export class Renderer {
  constructor(canvasEl) {
    const gl = canvasEl.getContext('webgl', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL unavailable');
    gl.getExtension('OES_element_index_uint');
    this.gl = gl;
    this.canvas = canvasEl;
    this.lit = program(gl, LIT_VS, LIT_FS);
    this.unlit = program(gl, UNLIT_VS, UNLIT_FS);
    this.loc = {};
    for (const [name, p] of [['lit', this.lit], ['unlit', this.unlit]]) {
      const L = {};
      for (const a of ['aPos', 'aNor', 'aCol', 'aUv']) L[a] = gl.getAttribLocation(p, a);
      for (const u of ['uMVP', 'uModel', 'uNorm', 'uTex', 'uTint', 'uAlpha', 'uSunDir', 'uSunCol', 'uAmb', 'uFogCol', 'uFogNear', 'uFogFar', 'uNight', 'uCam'])
        L[u] = gl.getUniformLocation(p, u);
      this.loc[name] = L;
    }
    // shared unit cube + unit ground quad for immediate-mode draws
    const b = new Builder();
    b.box(0, 0, 0, 1, 1, 1, { color: [1, 1, 1] });
    this.cube = b.build(gl);
    const q = new Builder();
    q.plane([-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5], [0, 1, 0], [1, 1, 1], WHITE_UV);
    this.quad = q.build(gl);
    const cb = new Builder();
    cb.cone(0, 0, 0, 1, 1, [1, 1, 1], 12);
    this.coneMesh = cb.build(gl);
    this.view = m4identity();
    this.proj = m4identity();
    this.camPos = [0, 2, 0];
    this.atlas = null;
    gl.enable(gl.DEPTH_TEST);
    gl.clearDepth(1);
  }
  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.proj = m4perspective(1.05, this.canvas.width / this.canvas.height, 0.3, 900);
  }
  setCamera(eye, center) {
    this.camPos = eye;
    this.view = m4lookAt(eye, center, [0, 1, 0]);
  }
  /** env: {sky, fog, fogNear, fogFar, sunDir, sunCol, amb, night} */
  begin(env) {
    const gl = this.gl;
    gl.clearColor(env.fog[0], env.fog[1], env.fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.BLEND);
    this.env = env;
  }
  _bindMesh(p, L, mesh, withNormal) {
    const gl = this.gl;
    gl.useProgram(p);
    const bind = (attr, slot) => {
      if (slot < 0) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, attr.buf);
      gl.enableVertexAttribArray(slot);
      gl.vertexAttribPointer(slot, attr.itemSize, gl.FLOAT, false, 0, 0);
    };
    bind(mesh.pos, L.aPos); bind(mesh.col, L.aCol); bind(mesh.uv, L.aUv);
    if (withNormal) bind(mesh.nor, L.aNor);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
  }
  /** Draw a merged mesh. opts: {model, tint, alpha, night, blend} */
  drawLit(mesh, opts = {}) {
    const gl = this.gl, L = this.loc.lit, env = this.env;
    this._bindMesh(this.lit, L, mesh, true);
    const model = opts.model || IDENTITY;
    const mvp = m4multiply(m4multiply(this.proj, this.view), model);
    gl.uniformMatrix4fv(L.uMVP, false, mvp);
    gl.uniformMatrix4fv(L.uModel, false, model);
    const nm = new Float32Array(9);
    nm[0] = model[0]; nm[1] = model[1]; nm[2] = model[2];
    nm[3] = model[4]; nm[4] = model[5]; nm[5] = model[6];
    nm[6] = model[8]; nm[7] = model[9]; nm[8] = model[10];
    // normalize columns to soften non-uniform scale on normals
    for (let c = 0; c < 3; c++) {
      const l = Math.hypot(nm[c * 3], nm[c * 3 + 1], nm[c * 3 + 2]) || 1;
      nm[c * 3] /= l; nm[c * 3 + 1] /= l; nm[c * 3 + 2] /= l;
    }
    gl.uniformMatrix3fv(L.uNorm, false, nm);
    gl.uniform3fv(L.uCam, this.camPos);
    gl.uniform3fv(L.uTint, opts.tint || [1, 1, 1]);
    gl.uniform1f(L.uAlpha, opts.alpha !== undefined ? opts.alpha : 1);
    gl.uniform3fv(L.uSunDir, env.sunDir); gl.uniform3fv(L.uSunCol, env.sunCol); gl.uniform3fv(L.uAmb, env.amb);
    gl.uniform3fv(L.uFogCol, env.fog);
    gl.uniform1f(L.uFogNear, env.fogNear); gl.uniform1f(L.uFogFar, env.fogFar);
    gl.uniform1f(L.uNight, opts.night !== undefined ? opts.night : env.night);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas.tex);
    gl.uniform1i(L.uTex, 0);
    if (opts.blend) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
    if (opts.blend) { gl.disable(gl.BLEND); gl.depthMask(true); }
  }
  drawUnlit(mesh, opts = {}) {
    const gl = this.gl, L = this.loc.unlit;
    this._bindMesh(this.unlit, L, mesh, false);
    const model = opts.model || IDENTITY;
    const mvp = m4multiply(m4multiply(this.proj, this.view), model);
    gl.uniformMatrix4fv(L.uMVP, false, mvp);
    gl.uniform3fv(L.uTint, opts.tint || [1, 1, 1]);
    gl.uniform1f(L.uAlpha, opts.alpha !== undefined ? opts.alpha : 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas.tex);
    gl.uniform1i(L.uTex, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, opts.additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
    if (opts.noDepthWrite) gl.depthMask(false);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
    if (opts.noDepthWrite) gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
  // ---- immediate-mode helpers (model matrix built per call) ----
  box(x, y, z, sx, sy, sz, color, ry = 0, rx = 0, rz = 0) {
    _tmpM = m4compose(x, y, z, ry, sx, sy, sz, rx, rz, _tmpM);
    this.drawLit(this.cube, { model: _tmpM, tint: color });
  }
  /** Unlit colored box (light bars, windows of opportunity, markers). */
  glowBox(x, y, z, sx, sy, sz, color, ry = 0, alpha = 1) {
    _tmpM = m4compose(x, y, z, ry, sx, sy, sz, 0, 0, _tmpM);
    this.drawUnlit(this.cube, { model: _tmpM, tint: color, alpha });
  }
  /** Flat ground quad (blob shadows, light pools). uv picks the atlas disc when given. */
  groundQuad(x, y, z, sx, sz, color, alpha = 1, uv = null, ry = 0) {
    const mesh = uv ? _discMesh(this, uv) : this.quad;
    _tmpM = m4compose(x, y, z, ry, sx, 1, sz, 0, 0, _tmpM);
    this.drawUnlit(mesh, { model: _tmpM, tint: color, alpha, noDepthWrite: true });
  }
  cone(x, y, z, r, h, color, alpha, additive = true) {
    _tmpM = m4compose(x, y, z, 0, r, h, r, 0, 0, _tmpM);
    this.drawUnlit(this.coneMesh, { model: _tmpM, tint: color, alpha, additive, noDepthWrite: true });
  }
}
const IDENTITY = m4identity();
let _tmpM = new Float32Array(16);
const _discCache = {};
function _discMesh(r, uv) {
  const key = uv.join(',');
  if (_discCache[key]) return _discCache[key];
  const b = new Builder();
  b.plane([-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5], [0, 1, 0], [1, 1, 1], uv);
  _discCache[key] = b.build(r.gl);
  return _discCache[key];
}

/** Parse '#e76f51' or [r,g,b] into a 0..1 rgb array. */
export function rgb(hex) {
  if (Array.isArray(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export function shade(col, f) { return [col[0] * f, col[1] * f, col[2] * f]; }
