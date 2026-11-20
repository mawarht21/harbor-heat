// HARBOR HEAT 3D engine: a small, purpose-built WebGL1 renderer.
// It deliberately uses no libraries. The game composes coloured and
// textured boxes into batches; this file owns the mathematics, shaders,
// GPU buffers and the small amount of state needed to draw those batches.

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function degToRad(degrees) {
  return degrees * Math.PI / 180;
}

export function mat4Identity() {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

export function mat4Perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const range = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) * range, -1,
    0, 0, 2 * near * far * range, 0,
  ]);
}

export function mat4LookAt(eye, target, up) {
  const zx = eye.x - target.x;
  const zy = eye.y - target.y;
  const zz = eye.z - target.z;
  let length = Math.hypot(zx, zy, zz) || 1;
  const z = [zx / length, zy / length, zz / length];
  const x = [
    up.y * z[2] - up.z * z[1],
    up.z * z[0] - up.x * z[2],
    up.x * z[1] - up.y * z[0],
  ];
  length = Math.hypot(x[0], x[1], x[2]) || 1;
  x[0] /= length; x[1] /= length; x[2] /= length;
  const y = [
    z[1] * x[2] - z[2] * x[1],
    z[2] * x[0] - z[0] * x[2],
    z[0] * x[1] - z[1] * x[0],
  ];
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * eye.x + x[1] * eye.y + x[2] * eye.z),
    -(y[0] * eye.x + y[1] * eye.y + y[2] * eye.z),
    -(z[0] * eye.x + z[1] * eye.y + z[2] * eye.z),
    1,
  ]);
}

export function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[column * 4 + k];
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

export function mat4Compose(px, py, pz, rx, ry, rz, sx, sy, sz) {
  const cx = Math.cos(rx), sxn = Math.sin(rx);
  const cy = Math.cos(ry), syn = Math.sin(ry);
  const cz = Math.cos(rz), szn = Math.sin(rz);
  const r00 = cz * cy;
  const r01 = cz * syn * sxn - szn * cx;
  const r02 = cz * syn * cx + szn * sxn;
  const r10 = szn * cy;
  const r11 = szn * syn * sxn + cz * cx;
  const r12 = szn * syn * cx - cz * sxn;
  const r20 = -syn;
  const r21 = cy * sxn;
  const r22 = cy * cx;
  return new Float32Array([
    r00 * sx, r10 * sx, r20 * sx, 0,
    r01 * sy, r11 * sy, r21 * sy, 0,
    r02 * sz, r12 * sz, r22 * sz, 0,
    px, py, pz, 1,
  ]);
}

export function transformPoint(matrix, point) {
  const x = point.x, y = point.y, z = point.z;
  return {
    x: matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    y: matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    z: matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  };
}

export function transformDirection(matrix, direction) {
  const x = direction.x, y = direction.y, z = direction.z;
  const out = {
    x: matrix[0] * x + matrix[4] * y + matrix[8] * z,
    y: matrix[1] * x + matrix[5] * y + matrix[9] * z,
    z: matrix[2] * x + matrix[6] * y + matrix[10] * z,
  };
  const length = Math.hypot(out.x, out.y, out.z) || 1;
  out.x /= length; out.y /= length; out.z /= length;
  return out;
}

const VERTEX_SHADER = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec4 aColor;
attribute vec2 aUv;
uniform mat4 uMvp;
uniform mat4 uModel;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec4 vColor;
varying vec2 vUv;
void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(uModel) * aNormal);
  vColor = aColor;
  vUv = aUv;
  gl_Position = uMvp * vec4(aPosition, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D uTexture;
uniform int uUseTexture;
uniform int uUnlit;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uSkyAmbient;
uniform vec3 uGroundAmbient;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uCamera;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec4 vColor;
varying vec2 vUv;
void main() {
  vec4 base = vColor;
  if (uUseTexture == 1) base *= texture2D(uTexture, vUv);
  vec3 color = base.rgb;
  if (uUnlit == 0) {
    vec3 normal = normalize(vNormal);
    float diffuse = max(dot(normal, normalize(uSunDirection)), 0.0);
    vec3 ambient = mix(uGroundAmbient, uSkyAmbient, normal.y * 0.5 + 0.5);
    color *= ambient + uSunColor * diffuse;
  }
  float distanceToCamera = length(vWorld - uCamera);
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * distanceToCamera * distanceToCamera);
  color = mix(color, uFogColor, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(color, base.a);
}
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader failed: ${message}`);
  }
  return shader;
}

export class Texture {
  constructor(renderer, canvas) {
    const gl = renderer.gl;
    this.renderer = renderer;
    this.handle = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.handle);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  bind() {
    const gl = this.renderer.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.handle);
  }
}

export class Batch {
  constructor(renderer, options = {}) {
    this.renderer = renderer;
    this.texture = options.texture || null;
    this.unlit = Boolean(options.unlit);
    this.transparent = Boolean(options.transparent);
    this.dynamic = Boolean(options.dynamic);
    this.positions = [];
    this.normals = [];
    this.colors = [];
    this.uvs = [];
    this.indices = [];
    this.vertexCount = 0;
    this.buffers = null;
    this.indexCount = 0;
    this.dirty = true;
  }

  clear() {
    this.positions.length = 0;
    this.normals.length = 0;
    this.colors.length = 0;
    this.uvs.length = 0;
    this.indices.length = 0;
    this.vertexCount = 0;
    this.dirty = true;
  }

  vertex(matrix, x, y, z, nx, ny, nz, color, uv) {
    const p = transformPoint(matrix, { x, y, z });
    const n = transformDirection(matrix, { x: nx, y: ny, z: nz });
    this.positions.push(p.x, p.y, p.z);
    this.normals.push(n.x, n.y, n.z);
    this.colors.push(color[0], color[1], color[2], color.length > 3 ? color[3] : 1);
    this.uvs.push(uv ? uv[0] : 0, uv ? uv[1] : 0);
    return this.vertexCount++;
  }

  quad(matrix, corners, normal, color, uvRect) {
    const uv = uvRect || [0, 0, 1, 1];
    const base = this.vertexCount;
    const uvs = [
      [uv[0], uv[1]],
      [uv[2], uv[1]],
      [uv[2], uv[3]],
      [uv[0], uv[3]],
    ];
    for (let i = 0; i < 4; i++) {
      this.vertex(matrix, corners[i].x, corners[i].y, corners[i].z,
        normal.x, normal.y, normal.z, color, uvs[i]);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.dirty = true;
  }

  addBox(matrix, width, height, depth, color, uvRect = null, topUvRect = null) {
    const x = width / 2, y = height / 2, z = depth / 2;
    const uv = uvRect || [0.995, 0.995, 1, 1];
    const topUv = topUvRect || uv;
    this.quad(matrix, [{x:-x,y:-y,z:z},{x:x,y:-y,z:z},{x:x,y:y,z:z},{x:-x,y:y,z:z}], {x:0,y:0,z:1}, color, uv);
    this.quad(matrix, [{x:x,y:-y,z:-z},{x:-x,y:-y,z:-z},{x:-x,y:y,z:-z},{x:x,y:y,z:-z}], {x:0,y:0,z:-1}, color, uv);
    this.quad(matrix, [{x:x,y:-y,z:z},{x:x,y:-y,z:-z},{x:x,y:y,z:-z},{x:x,y:y,z:z}], {x:1,y:0,z:0}, color, uv);
    this.quad(matrix, [{x:-x,y:-y,z:-z},{x:-x,y:-y,z:z},{x:-x,y:y,z:z},{x:-x,y:y,z:-z}], {x:-1,y:0,z:0}, color, uv);
    this.quad(matrix, [{x:-x,y:y,z:z},{x:x,y:y,z:z},{x:x,y:y,z:-z},{x:-x,y:y,z:-z}], {x:0,y:1,z:0}, color, topUv);
    this.quad(matrix, [{x:-x,y:-y,z:-z},{x:x,y:-y,z:-z},{x:x,y:-y,z:z},{x:-x,y:-y,z:z}], {x:0,y:-1,z:0}, color, uv);
  }

  addPlane(matrix, width, depth, color, uvRect = null) {
    const x = width / 2, z = depth / 2;
    this.quad(matrix,
      [{x:-x,y:0,z:z},{x:x,y:0,z:z},{x:x,y:0,z:-z},{x:-x,y:0,z:-z}],
      {x:0,y:1,z:0}, color, uvRect || [0, 0, 1, 1]);
  }

  addCylinder(matrix, radiusTop, radiusBottom, height, segments, color) {
    const half = height / 2;
    for (let i = 0; i < segments; i++) {
      const a0 = i / segments * Math.PI * 2;
      const a1 = (i + 1) / segments * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0);
      const c1 = Math.cos(a1), s1 = Math.sin(a1);
      this.quad(matrix, [
        {x: radiusBottom * c0, y: -half, z: radiusBottom * s0},
        {x: radiusBottom * c1, y: -half, z: radiusBottom * s1},
        {x: radiusTop * c1, y: half, z: radiusTop * s1},
        {x: radiusTop * c0, y: half, z: radiusTop * s0},
      ], {x: c0, y: 0.25, z: s0}, color, [0.995, 0.995, 1, 1]);
    }
  }

  upload() {
    const gl = this.renderer.gl;
    if (!this.buffers) {
      this.buffers = {
        position: gl.createBuffer(),
        normal: gl.createBuffer(),
        color: gl.createBuffer(),
        uv: gl.createBuffer(),
        index: gl.createBuffer(),
      };
    }
    const usage = this.dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW;
    const arrays = [
      ['position', new Float32Array(this.positions)],
      ['normal', new Float32Array(this.normals)],
      ['color', new Float32Array(this.colors)],
      ['uv', new Float32Array(this.uvs)],
    ];
    for (const [name, array] of arrays) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[name]);
      gl.bufferData(gl.ARRAY_BUFFER, array, usage);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(this.indices), usage);
    this.indexCount = this.indices.length;
    this.dirty = false;
  }
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false }) ||
      canvas.getContext('experimental-webgl');
    if (!gl) throw new Error('WebGL is not available in this browser.');
    this.gl = gl;
    gl.getExtension('OES_element_index_uint');
    const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertex);
    gl.attachShader(this.program, fragment);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${gl.getProgramInfoLog(this.program)}`);
    }
    gl.useProgram(this.program);
    this.locations = {
      position: gl.getAttribLocation(this.program, 'aPosition'),
      normal: gl.getAttribLocation(this.program, 'aNormal'),
      color: gl.getAttribLocation(this.program, 'aColor'),
      uv: gl.getAttribLocation(this.program, 'aUv'),
      mvp: gl.getUniformLocation(this.program, 'uMvp'),
      model: gl.getUniformLocation(this.program, 'uModel'),
      texture: gl.getUniformLocation(this.program, 'uTexture'),
      useTexture: gl.getUniformLocation(this.program, 'uUseTexture'),
      unlit: gl.getUniformLocation(this.program, 'uUnlit'),
      sunDirection: gl.getUniformLocation(this.program, 'uSunDirection'),
      sunColor: gl.getUniformLocation(this.program, 'uSunColor'),
      skyAmbient: gl.getUniformLocation(this.program, 'uSkyAmbient'),
      groundAmbient: gl.getUniformLocation(this.program, 'uGroundAmbient'),
      fogColor: gl.getUniformLocation(this.program, 'uFogColor'),
      fogDensity: gl.getUniformLocation(this.program, 'uFogDensity'),
      camera: gl.getUniformLocation(this.program, 'uCamera'),
    };
    this.whiteTexture = new Texture(this, makeWhiteCanvas());
    this.environment = {
      sky: [0.85, 0.6, 0.45],
      fog: [0.85, 0.62, 0.48],
      fogDensity: 0.0026,
      sunDirection: [-0.45, 0.65, -0.4],
      sunColor: [1.15, 0.62, 0.38],
      skyAmbient: [0.72, 0.7, 0.68],
      groundAmbient: [0.44, 0.39, 0.33],
    };
    this.resize();
  }

  resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * ratio));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
    this.aspect = width / height;
  }

  setEnvironment(environment) {
    Object.assign(this.environment, environment);
  }

  begin(cameraPosition, view, projection) {
    const gl = this.gl;
    this.resize();
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const sky = this.environment.sky;
    gl.clearColor(sky[0], sky[1], sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.cameraPosition = cameraPosition;
    this.viewProjection = mat4Multiply(projection, view);
  }

  draw(batch) {
    if (!batch || batch.indices.length === 0) return;
    if (batch.dirty || !batch.buffers) batch.upload();
    const gl = this.gl;
    gl.useProgram(this.program);
    const texture = batch.texture || this.whiteTexture;
    texture.bind();
    gl.uniform1i(this.locations.texture, 0);
    gl.uniform1i(this.locations.useTexture, batch.texture ? 1 : 0);
    gl.uniform1i(this.locations.unlit, batch.unlit ? 1 : 0);
    gl.uniformMatrix4fv(this.locations.mvp, false, this.viewProjection);
    gl.uniformMatrix4fv(this.locations.model, false, mat4Identity());
    const env = this.environment;
    gl.uniform3fv(this.locations.sunDirection, env.sunDirection);
    gl.uniform3fv(this.locations.sunColor, env.sunColor);
    gl.uniform3fv(this.locations.skyAmbient, env.skyAmbient);
    gl.uniform3fv(this.locations.groundAmbient, env.groundAmbient);
    gl.uniform3fv(this.locations.fogColor, env.fog);
    gl.uniform1f(this.locations.fogDensity, env.fogDensity);
    gl.uniform3f(this.locations.camera, this.cameraPosition.x, this.cameraPosition.y, this.cameraPosition.z);
    const bindings = [
      ['position', 3],
      ['normal', 3],
      ['color', 4],
      ['uv', 2],
    ];
    for (const [name, size] of bindings) {
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.buffers[name]);
      gl.enableVertexAttribArray(this.locations[name]);
      gl.vertexAttribPointer(this.locations[name], size, gl.FLOAT, false, 0, 0);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, batch.buffers.index);
    if (batch.transparent) gl.depthMask(false);
    gl.drawElements(gl.TRIANGLES, batch.indexCount, gl.UNSIGNED_INT, 0);
    if (batch.transparent) gl.depthMask(true);
  }
}

function makeWhiteCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 4;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 4, 4);
  return canvas;
}

export function environmentForMinutes(minutes) {
  const hour = minutes / 60;
  const angle = (hour - 6) / 12 * Math.PI;
  const sunHeight = Math.sin(angle);
  // A long stylised golden hour: the city stays clearly sunlit through
  // the early evening instead of dropping to night values at sunset.
  const daylight = clamp(sunHeight * 1.7 + 0.6, 0, 1);
  const golden = clamp(1 - Math.abs(sunHeight - 0.15) * 2.2, 0, 1);
  const sky = [
    lerp(0.05, lerp(0.36, 0.98, golden), daylight),
    lerp(0.07, lerp(0.48, 0.62, golden), daylight),
    lerp(0.16, lerp(0.78, 0.46, golden), daylight),
  ];
  const fog = [
    lerp(0.07, lerp(0.62, 1.0, golden), daylight),
    lerp(0.08, lerp(0.48, 0.58, golden), daylight),
    lerp(0.16, lerp(0.48, 0.38, golden), daylight),
  ];
  return {
    sky,
    fog,
    fogDensity: lerp(0.0042, 0.0022, daylight),
    sunDirection: [Math.cos(angle) * 0.75, Math.max(sunHeight, -0.25), -0.38],
    sunColor: [
      lerp(0.1, 1.18, daylight),
      lerp(0.12, lerp(0.78, 0.55, golden), daylight),
      lerp(0.2, lerp(0.66, 0.38, golden), daylight),
    ],
    skyAmbient: [
      lerp(0.22, 0.74, daylight),
      lerp(0.24, 0.72, daylight),
      lerp(0.34, 0.7, daylight),
    ],
    groundAmbient: [
      lerp(0.12, 0.46, daylight),
      lerp(0.12, 0.41, daylight),
      lerp(0.15, 0.35, daylight),
    ],
    daylight,
    night: 1 - daylight,
    golden,
  };
}
