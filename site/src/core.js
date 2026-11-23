/* Core: layout constants, deterministic noise, procedural textures, materials,
   geometry batching and the sky/environment rig. */

import * as THREE from 'three';

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ layout */
/* Metres, Y up. +X east, +Z south. The street is to the south (+Z).
   Levels come straight off the drawings: basement -3.30, 0.000, +3.600, +7.200. */
export const FLOOR = [0, 3.6, 7.2, 10.8];
/* the entrance floor sits one broad flight above the forecourt */
export const PODIUM = 1.2;
export const ROOF = 14.4;
export const ATTIC = 16.2;

export const LAYOUT = {
  rotunda: { r: 10.3, hall: 8.55, core: 1.35, drumTop: 19.2 },
  block: { x0: -33.6, x1: -9.4, z0: -7.6, z1: 6.6 },
  wing: { az: 41 * DEG, s0: 4.5, s1: 34.2, half: 7.15 },
  gallery: { a0: 112, a1: 248, r0: 15.0, r1: 19.4, h: 4.6 },
  entry: { az: 180, width: 15.5, steps: 8 },
  site: { x0: -120, x1: 120, z0: -110, z1: 120 },
};

/* --------------------------------------------------------------- utilities */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOISE = (() => {
  const rnd = mulberry32(20210618);
  const a = new Float32Array(256 * 256);
  for (let i = 0; i < a.length; i++) a[i] = rnd();
  return a;
})();

function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const i0 = xi & 255, j0 = yi & 255, i1 = (i0 + 1) & 255, j1 = (j0 + 1) & 255;
  const a = NOISE[j0 * 256 + i0], b = NOISE[j0 * 256 + i1];
  const c = NOISE[j1 * 256 + i0], d = NOISE[j1 * 256 + i1];
  const ab = a + (b - a) * sx, cd = c + (d - c) * sx;
  return ab + (cd - ab) * sy;
}

export function fbm(x, y, oct = 4, gain = 0.5) {
  let v = 0, amp = 1, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { v += amp * vnoise(x * f, y * f); norm += amp; amp *= gain; f *= 2; }
  return v / norm;
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smoothstep(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
export function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

export function polar(az, r) { return { x: Math.sin(az) * r, z: -Math.cos(az) * r }; }

/* ---------------------------------------------------------------- textures */
function canvas2d(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { c, x: c.getContext('2d') };
}

/* fn(u, v) -> [r, g, b, height 0..1] */
function procedural(size, fn, { repeat = 1, srgb = true, aniso = 8 } = {}) {
  const { c, x } = canvas2d(size);
  const img = x.createImageData(size, size);
  const hgt = new Float32Array(size * size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const o = (j * size + i) * 4;
      const p = fn(i / size, j / size, i, j);
      img.data[o] = p[0]; img.data[o + 1] = p[1]; img.data[o + 2] = p[2]; img.data[o + 3] = 255;
      hgt[j * size + i] = p[3] === undefined ? 0.5 : p[3];
    }
  }
  x.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeat, repeat);
  map.anisotropy = aniso;
  if (srgb) map.colorSpace = THREE.SRGBColorSpace;

  const { c: bc, x: bx } = canvas2d(size);
  const bimg = bx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.round(clamp(hgt[i], 0, 1) * 255);
    bimg.data[i * 4] = bimg.data[i * 4 + 1] = bimg.data[i * 4 + 2] = v;
    bimg.data[i * 4 + 3] = 255;
  }
  bx.putImageData(bimg, 0, 0);
  const bump = new THREE.CanvasTexture(bc);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(repeat, repeat);
  bump.anisotropy = aniso;
  return { map, bump };
}

const T = {};

export const TEX = {
  plaster() {
    if (T.plaster) return T.plaster;
    T.plaster = procedural(512, (u, v) => {
      const n = fbm(u * 14, v * 14, 5);
      const g = fbm(u * 120, v * 120, 3);
      const streak = fbm(u * 40, v * 2.5, 3);
      const k = 0.86 + n * 0.12 + (g - 0.5) * 0.05 + (streak - 0.5) * 0.04;
      return [232 * k, 220 * k, 190 * k, 0.55 + (n - 0.5) * 0.5];
    }, { repeat: 1 });
    return T.plaster;
  },
  stone() {
    if (T.stone) return T.stone;
    T.stone = procedural(512, (u, v) => {
      const n = fbm(u * 10, v * 10, 5);
      const g = fbm(u * 160, v * 160, 2);
      const k = 0.9 + n * 0.09 + (g - 0.5) * 0.035;
      return [244 * k, 241 * k, 232 * k, 0.6 + (n - 0.5) * 0.35];
    });
    return T.stone;
  },
  granite() {
    if (T.granite) return T.granite;
    T.granite = procedural(512, (u, v) => {
      const n = fbm(u * 90, v * 90, 3);
      const s = fbm(u * 260, v * 260, 2);
      const fleck = s > 0.62 ? 1 : 0;
      const k = 0.72 + n * 0.5;
      return [92 * k + fleck * 60, 66 * k + fleck * 55, 58 * k + fleck * 50, 0.45 + (n - 0.5) * 0.7];
    }, { repeat: 2 });
    return T.granite;
  },
  paving() {
    if (T.paving) return T.paving;
    const S = 512, cell = 64;
    T.paving = procedural(S, (u, v, i, j) => {
      const cx = (i / cell) | 0, cy = (j / cell) | 0;
      const rnd = mulberry32(cx * 977 + cy * 131 + 7)();
      const fx = (i % cell) / cell, fy = (j % cell) / cell;
      const joint = Math.min(fx, 1 - fx, fy, 1 - fy) < 0.035 ? 1 : 0;
      const n = fbm(u * 40, v * 40, 3);
      const tone = 0.82 + rnd * 0.3 + (n - 0.5) * 0.14;
      const base = [168, 158, 152];
      const r = joint ? 96 : base[0] * tone;
      const g = joint ? 92 : base[1] * tone;
      const b = joint ? 90 : base[2] * tone;
      return [r, g, b, joint ? 0.05 : 0.55 + (n - 0.5) * 0.3];
    }, { repeat: 1 });
    return T.paving;
  },
  brickPaving() {
    if (T.brick) return T.brick;
    const S = 512, bw = 64, bh = 32;
    T.brick = procedural(S, (u, v, i, j) => {
      const row = (j / bh) | 0;
      const off = (row % 2) * bw * 0.5;
      const col = ((i + off) / bw) | 0;
      const rnd = mulberry32(row * 733 + col * 191)();
      const fx = ((i + off) % bw) / bw, fy = (j % bh) / bh;
      const joint = Math.min(fx, 1 - fx) < 0.045 || Math.min(fy, 1 - fy) < 0.09;
      const n = fbm(u * 60, v * 60, 3);
      const tone = 0.8 + rnd * 0.4;
      const base = [176, 112, 100];
      return joint ? [150, 142, 136, 0.1] : [base[0] * tone, base[1] * tone, base[2] * tone, 0.55 + (n - 0.5) * 0.3];
    }, { repeat: 1 });
    return T.brick;
  },
  asphalt() {
    if (T.asphalt) return T.asphalt;
    T.asphalt = procedural(512, (u, v) => {
      const n = fbm(u * 30, v * 30, 4);
      const g = fbm(u * 220, v * 220, 2);
      const k = 0.55 + n * 0.28 + (g - 0.5) * 0.16;
      return [64 * k + 12, 63 * k + 12, 62 * k + 12, 0.5 + (g - 0.5) * 0.6];
    }, { repeat: 6 });
    return T.asphalt;
  },
  grass() {
    if (T.grass) return T.grass;
    T.grass = procedural(512, (u, v) => {
      const n = fbm(u * 22, v * 22, 5);
      const g = fbm(u * 180, v * 180, 2);
      const k = 0.62 + n * 0.5 + (g - 0.5) * 0.2;
      const dry = smoothstep(0.45, 0.8, fbm(u * 6, v * 6, 3));
      return [(58 + dry * 26) * k, (92 + dry * 14) * k, (48 + dry * 6) * k, 0.5 + (g - 0.5) * 0.8];
    }, { repeat: 1 });
    return T.grass;
  },
  marble() {
    if (T.marble) return T.marble;
    T.marble = procedural(512, (u, v) => {
      const turb = fbm(u * 6, v * 6, 5);
      const vein = Math.abs(Math.sin((u * 2.2 + v * 1.1 + turb * 2.6) * Math.PI * 2));
      const vv = Math.pow(1 - vein, 14);
      const n = fbm(u * 70, v * 70, 3);
      const base = 236 - vv * 46 + (n - 0.5) * 8;
      return [base, base - 3, base - 9, 0.5 + vv * 0.1];
    }, { repeat: 3 });
    return T.marble;
  },
  wood() {
    if (T.wood) return T.wood;
    T.wood = procedural(512, (u, v) => {
      const warp = fbm(u * 5, v * 26, 4);
      const grain = Math.sin((v * 46 + warp * 9) * Math.PI) * 0.5 + 0.5;
      const fine = fbm(u * 120, v * 300, 2);
      const k = 0.68 + grain * 0.24 + (fine - 0.5) * 0.12;
      return [86 * k, 56 * k, 38 * k, 0.45 + grain * 0.3];
    }, { repeat: 1 });
    return T.wood;
  },
  carpet() {
    if (T.carpet) return T.carpet;
    T.carpet = procedural(256, (u, v) => {
      const n = fbm(u * 200, v * 200, 2);
      const k = 0.9 + (n - 0.5) * 0.1;
      return [196 * k, 184 * k, 162 * k, 0.5 + (n - 0.5) * 0.5];
    }, { repeat: 8 });
    return T.carpet;
  },
  ceiling() {
    if (T.ceiling) return T.ceiling;
    const S = 512, cell = 128;
    T.ceiling = procedural(S, (u, v, i, j) => {
      const fx = (i % cell) / cell, fy = (j % cell) / cell;
      const grid = Math.min(fx, 1 - fx, fy, 1 - fy) < 0.012 ? 1 : 0;
      const perf = ((i % 8 === 0) && (j % 8 === 0)) ? 1 : 0;
      const n = fbm(u * 30, v * 30, 3);
      const base = 236 + (n - 0.5) * 6 - perf * 16;
      return grid ? [188, 186, 180, 0.2] : [base, base, base - 4, 0.6];
    }, { repeat: 1 });
    return T.ceiling;
  },
  fabric() {
    if (T.fabric) return T.fabric;
    T.fabric = procedural(256, (u, v) => {
      const n = fbm(u * 260, v * 260, 2);
      const k = 0.8 + n * 0.35;
      return [44 * k, 44 * k, 48 * k, 0.5 + (n - 0.5) * 0.4];
    }, { repeat: 4 });
    return T.fabric;
  },
  bark() {
    if (T.bark) return T.bark;
    T.bark = procedural(256, (u, v) => {
      const n = fbm(u * 14, v * 60, 4);
      const k = 0.6 + n * 0.5;
      return [82 * k, 62 * k, 48 * k, 0.5 + (n - 0.5) * 0.7];
    }, { repeat: 3 });
    return T.bark;
  },
  needle() {
    if (T.needle) return T.needle;
    T.needle = procedural(256, (u, v) => {
      const n = fbm(u * 90, v * 90, 4);
      const k = 0.62 + n * 0.55;
      return [34 * k, 62 * k, 52 * k, 0.5 + (n - 0.5) * 0.8];
    }, { repeat: 2 });
    return T.needle;
  },
};

/* --------------------------------------------------------------- materials */
export function makeMaterials(env) {
  const plaster = TEX.plaster(), stone = TEX.stone(), granite = TEX.granite();
  const paving = TEX.paving(), brick = TEX.brickPaving(), asphalt = TEX.asphalt();
  const grass = TEX.grass(), marble = TEX.marble(), wood = TEX.wood();
  const carpet = TEX.carpet(), ceil = TEX.ceiling(), fabric = TEX.fabric();

  const M = {
    plaster: new THREE.MeshStandardMaterial({ color: 0xe6d9bb, map: plaster.map, bumpMap: plaster.bump, bumpScale: 0.35, roughness: 0.94, metalness: 0 }),
    plasterWarm: new THREE.MeshStandardMaterial({ color: 0xdecba6, map: plaster.map, bumpMap: plaster.bump, bumpScale: 0.3, roughness: 0.95 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xf6f3ea, map: stone.map, bumpMap: stone.bump, bumpScale: 0.2, roughness: 0.82 }),
    granite: new THREE.MeshStandardMaterial({ color: 0x8d6a5f, map: granite.map, bumpMap: granite.bump, bumpScale: 0.5, roughness: 0.55 }),
    graniteDark: new THREE.MeshStandardMaterial({ color: 0x5c4a45, map: granite.map, bumpMap: granite.bump, bumpScale: 0.5, roughness: 0.5 }),
    paving: new THREE.MeshStandardMaterial({ color: 0xb9aca4, map: paving.map, bumpMap: paving.bump, bumpScale: 0.4, roughness: 0.88 }),
    brick: new THREE.MeshStandardMaterial({ color: 0xb08076, map: brick.map, bumpMap: brick.bump, bumpScale: 0.4, roughness: 0.9 }),
    asphalt: new THREE.MeshStandardMaterial({ color: 0x6a6a6c, map: asphalt.map, bumpMap: asphalt.bump, bumpScale: 0.25, roughness: 0.96 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x86a06a, map: grass.map, bumpMap: grass.bump, bumpScale: 0.4, roughness: 1 }),
    marble: new THREE.MeshStandardMaterial({ color: 0xf2ece2, map: marble.map, bumpMap: marble.bump, bumpScale: 0.06, roughness: 0.28, metalness: 0.02, envMapIntensity: 0.8 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6a4630, map: wood.map, bumpMap: wood.bump, bumpScale: 0.25, roughness: 0.55 }),
    carpet: new THREE.MeshStandardMaterial({ color: 0xc9bda6, map: carpet.map, bumpMap: carpet.bump, bumpScale: 0.3, roughness: 0.98 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0xf4f2ec, map: ceil.map, roughness: 0.92 }),
    fabric: new THREE.MeshStandardMaterial({ color: 0x24242a, map: fabric.map, bumpMap: fabric.bump, bumpScale: 0.2, roughness: 0.92 }),
    metalDark: new THREE.MeshStandardMaterial({ color: 0x2b2b2d, metalness: 0.85, roughness: 0.42 }),
    metalWhite: new THREE.MeshStandardMaterial({ color: 0xf2f0ea, metalness: 0.35, roughness: 0.45 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x4a4b4d, roughness: 0.9, metalness: 0.1 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0xb8b4ac, roughness: 0.92 }),
    lampGlow: new THREE.MeshStandardMaterial({ color: 0xfff4de, emissive: 0xffe6bd, emissiveIntensity: 1.1, roughness: 0.4 }),
    signBlue: new THREE.MeshStandardMaterial({ color: 0x0b4a8c, roughness: 0.5, metalness: 0.1 }),
  };

  M.glass = new THREE.MeshPhysicalMaterial({
    color: 0xcfe0e6, metalness: 0, roughness: 0.06, transparent: true, opacity: 0.28,
    envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false,
    clearcoat: 1, clearcoatRoughness: 0.04,
  });
  M.glassTint = new THREE.MeshPhysicalMaterial({
    color: 0x8fa9b4, metalness: 0.15, roughness: 0.05, transparent: true, opacity: 0.5,
    envMapIntensity: 2.0, side: THREE.DoubleSide, depthWrite: false,
    clearcoat: 1, clearcoatRoughness: 0.03,
  });
  M.glassDark = new THREE.MeshPhysicalMaterial({
    color: 0x2c3a42, metalness: 0.4, roughness: 0.08, transparent: true, opacity: 0.72,
    envMapIntensity: 1.4, side: THREE.DoubleSide,
  });

  for (const k of Object.keys(M)) {
    if (M[k].isMeshStandardMaterial || M[k].isMeshPhysicalMaterial) {
      M[k].envMap = env; M[k].envMapIntensity = M[k].envMapIntensity ?? 0.55;
    }
  }
  return M;
}

/* ---------------------------------------------------------------- batching */
const KEEP = ['position', 'normal', 'uv'];

export class Batch {
  constructor() { this.buckets = new Map(); this.parent = null; }
  /* every subsequent add is pre-multiplied by this frame (local -> world) */
  setParent(m) { this.parent = m; return this; }
  add(geom, mat, matrix) {
    let g = geom.index ? geom.toNonIndexed() : geom.clone();
    for (const name of Object.keys(g.attributes)) if (!KEEP.includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) {
      const n = g.attributes.position.count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    if (matrix) g.applyMatrix4(matrix);
    if (this.parent) g.applyMatrix4(this.parent);
    if (!this.buckets.has(mat)) this.buckets.set(mat, []);
    this.buckets.get(mat).push(g);
    return this;
  }
  box(mat, w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
      new THREE.Vector3(1, 1, 1));
    return this.add(g, mat, m);
  }
  plane(mat, w, h, x, y, z, ry = 0, rx = 0) {
    const g = new THREE.PlaneGeometry(w, h);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0, 'YXZ')),
      new THREE.Vector3(1, 1, 1));
    return this.add(g, mat, m);
  }
  cyl(mat, rt, rb, h, seg, x, y, z, ry = 0, open = false) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
    const m = new THREE.Matrix4().makeTranslation(x, y, z);
    if (ry) m.multiply(new THREE.Matrix4().makeRotationY(ry));
    return this.add(g, mat, m);
  }
  build(parent, { cast = true, receive = true, name = 'batch' } = {}) {
    const out = [];
    for (const [mat, geoms] of this.buckets) {
      const merged = mergeAll(geoms);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast; mesh.receiveShadow = receive;
      mesh.name = name;
      parent.add(mesh);
      out.push(mesh);
    }
    this.buckets.clear();
    return out;
  }
}

/* merge without pulling in the addon: geometries already share the same attributes */
export function mergeAll(geoms) {
  if (!geoms.length) return null;
  if (geoms.length === 1) return geoms[0];
  let total = 0;
  for (const g of geoms) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of geoms) {
    const p = g.attributes.position.array, n = g.attributes.normal.array, u = g.attributes.uv.array;
    pos.set(p, o * 3); nor.set(n, o * 3); uv.set(u, o * 2);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

/* ------------------------------------------------------------------- sky */
const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}`;

const SKY_FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform vec3 uZenith, uHorizon, uGround, uSunColor;
uniform vec3 uSunDir;
uniform float uCloud, uHaze;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i=0;i<5;i++){ v += a*vn(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
  col = mix(col, uGround, smoothstep(0.02, -0.16, d.y));

  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * pow(sd, 1400.0) * 22.0;
  col += uSunColor * pow(sd, 12.0) * 0.28 * uHaze;
  col += uSunColor * pow(sd, 3.0) * 0.10 * uHaze;

  // high cirrus, projected on a virtual plane
  if (d.y > 0.015) {
    vec2 p = d.xz / (d.y + 0.12) * 1.25;
    float c = fbm(p * 1.7 + vec2(0.0, 0.35));
    c = smoothstep(0.52, 0.86, c) * smoothstep(0.02, 0.28, d.y);
    float shade = smoothstep(0.35, 0.95, fbm(p * 3.1 + 4.0));
    vec3 cloudCol = mix(vec3(0.86, 0.87, 0.90), vec3(1.0, 0.99, 0.97), shade);
    cloudCol = mix(cloudCol, uSunColor * 1.1, pow(sd, 3.0) * 0.5);
    col = mix(col, cloudCol, c * uCloud);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export const TIME_MODES = {
  day: {
    label: 'День',
    sunEl: 46, sunAz: 152,
    zenith: 0x2f6fb5, horizon: 0xbfd4e4, ground: 0x9a9a92,
    sun: 0xfff2dc, sunI: 3.4, amb: 0x9fc0e0, ambI: 0.85,
    fog: 0xbcd0de, fogD: 0.0032, exposure: 0.95, cloud: 0.55, haze: 1.0,
    night: false,
  },
  golden: {
    label: 'Золотой час',
    sunEl: 9, sunAz: 246,
    zenith: 0x27578f, horizon: 0xf0b079, ground: 0x8d7b6c,
    sun: 0xffb268, sunI: 3.9, amb: 0x8fa6c8, ambI: 0.55,
    fog: 0xe0b48c, fogD: 0.0042, exposure: 1.0, cloud: 0.7, haze: 1.6,
    night: false,
  },
  night: {
    label: 'Ночь',
    sunEl: 38, sunAz: 320,
    zenith: 0x050a16, horizon: 0x16233c, ground: 0x0a0e15,
    sun: 0xa8c0e8, sunI: 0.35, amb: 0x24354f, ambI: 0.4,
    fog: 0x101a2c, fogD: 0.0055, exposure: 1.15, cloud: 0.25, haze: 0.4,
    night: true,
  },
};

export function createSky() {
  const uniforms = {
    uZenith: { value: new THREE.Color(0x2f6fb5) },
    uHorizon: { value: new THREE.Color(0xbfd4e4) },
    uGround: { value: new THREE.Color(0x9a9a92) },
    uSunColor: { value: new THREE.Color(0xfff2dc) },
    uSunDir: { value: new THREE.Vector3(0.4, 0.7, 0.3) },
    uCloud: { value: 0.55 },
    uHaze: { value: 1.0 },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1800, 40, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

export function sunDirection(mode) {
  const el = mode.sunEl * DEG, az = mode.sunAz * DEG;
  return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)).normalize();
}
