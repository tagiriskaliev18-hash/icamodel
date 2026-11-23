/* Core: layout constants, deterministic noise, procedural textures, materials,
   geometry batching and the sky/environment rig.
   Provides ALL PBR materials for both exterior (building.js, site.js) and
   interior (interior.js) through the shared `M` dictionary from makeMaterials(). */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

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
  rotunda: { r: 10.3, hall: 8.55, core: 1.85, drumTop: 18.2 },
  block:   { x0: -33.6, x1: -9.4, z0: -7.6, z1: 6.6 },
  wing:    { az: 41 * DEG, s0: 4.5, s1: 34.2, half: 7.15 },
  gallery: { a0: 112, a1: 248, r0: 14.2, r1: 18.6, h: 4.4 },
  entry:   { az: 180, width: 15.5, steps: 8 },
  site:    { x0: -120, x1: 120, z0: -110, z1: 120 },
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

/* Roughness-only procedural: fn(u,v) -> roughness 0..1 */
function proceduralRoughness(size, fn, { repeat = 1, aniso = 8 } = {}) {
  const { c, x } = canvas2d(size);
  const img = x.createImageData(size, size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const o = (j * size + i) * 4;
      const r = Math.round(clamp(fn(i / size, j / size, i, j), 0, 1) * 255);
      img.data[o] = img.data[o + 1] = img.data[o + 2] = r; img.data[o + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeat, repeat);
  map.anisotropy = aniso;
  return map;
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
    T.plaster.roughness = proceduralRoughness(512, (u, v) => {
      return 0.88 + fbm(u * 60, v * 60, 3) * 0.12;
    });
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
      // Red-brown polished granite as seen in photos
      return [148 * k + fleck * 40, 82 * k + fleck * 35, 72 * k + fleck * 30, 0.3 + (n - 0.5) * 0.4];
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
      // Terracotta-pink paving as in the real photos
      const tone = 0.82 + rnd * 0.3 + (n - 0.5) * 0.14;
      const base = [196, 136, 118];
      const r = joint ? 128 : base[0] * tone;
      const g = joint ? 118 : base[1] * tone;
      const b = joint ? 112 : base[2] * tone;
      return [r, g, b, joint ? 0.05 : 0.55 + (n - 0.5) * 0.3];
    }, { repeat: 1 });
    T.paving.roughness = proceduralRoughness(512, (u, v, i, j) => {
      const cell2 = 64;
      const fx = (i % cell2) / cell2, fy = (j % cell2) / cell2;
      const joint = Math.min(fx, 1 - fx, fy, 1 - fy) < 0.035 ? 1 : 0;
      return joint ? 0.98 : 0.72 + fbm(u * 40, v * 40, 2) * 0.18;
    });
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
      const base = [186, 122, 108];
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
    const S = 512, cell = 256;
    T.marble = procedural(S, (u, v, i, j) => {
      const fx = (i % cell) / cell, fy = (j % cell) / cell;
      const joint = Math.min(fx, 1 - fx, fy, 1 - fy) < 0.009 ? 1 : 0;
      const ti = (i / cell) | 0, tj = (j / cell) | 0;
      const tileSeed = ((ti * 7 + tj * 13) % 4) * 0.23;
      const turb = fbm(u * 5 + tileSeed, v * 5 + tileSeed * 1.4, 5);
      const vein1 = Math.abs(Math.sin((u * 2.1 + v * 1.3 + turb * 2.8) * Math.PI * 2));
      const vein2 = Math.abs(Math.sin((u * 4.2 - v * 2.4 + turb * 3.4) * Math.PI * 2));
      const vv = Math.pow(1 - vein1, 16) * 0.85 + Math.pow(1 - vein2, 22) * 0.42;
      const cloud = fbm(u * 12, v * 12, 3);
      const fine = fbm(u * 90, v * 90, 2);
      const k = 240 + (cloud - 0.5) * 10 + (fine - 0.5) * 5 - vv * 58;
      if (joint) return [192, 185, 174, 0.25];
      return [k, k - 4 - vv * 6, k - 11 - vv * 10, 0.52 - vv * 0.14];
    }, { repeat: 4 });
    T.marble.roughness = proceduralRoughness(S, (u, v, i, j) => {
      const fx = (i % cell) / cell, fy = (j % cell) / cell;
      const joint = Math.min(fx, 1 - fx, fy, 1 - fy) < 0.009 ? 1 : 0;
      if (joint) return 0.88;
      const turb = fbm(u * 5, v * 5, 4);
      const vein1 = Math.abs(Math.sin((u * 2.1 + v * 1.3 + turb * 2.8) * Math.PI * 2));
      const vv = Math.pow(1 - vein1, 14);
      return 0.15 + vv * 0.14 + fbm(u * 35, v * 35, 2) * 0.05;
    }, { repeat: 4 });
    return T.marble;
  },
  neroMarble() {
    if (T.neroMarble) return T.neroMarble;
    T.neroMarble = procedural(512, (u, v) => {
      const turb = fbm(u * 6, v * 6, 5);
      const vein = Math.abs(Math.sin((u * 2.4 - v * 1.4 + turb * 3.2) * Math.PI * 2));
      const fineVein = Math.abs(Math.sin((u * 5.1 + v * 3.2 + turb * 2.5) * Math.PI * 2));
      const vw = Math.pow(1 - vein, 24);
      const vg = Math.pow(1 - fineVein, 30) * 0.65;
      const n = fbm(u * 40, v * 40, 3);
      const base = 22 + n * 10;
      const r = Math.min(245, base + vw * 175 + vg * 140);
      const g = Math.min(240, base + 2 + vw * 168 + vg * 110);
      const b = Math.min(235, base + 5 + vw * 158 + vg * 62);
      return [r, g, b, 0.52 - vw * 0.12];
    }, { repeat: 2 });
    T.neroMarble.roughness = proceduralRoughness(512, (u, v) => {
      const turb = fbm(u * 6, v * 6, 4);
      const vein = Math.abs(Math.sin((u * 2.4 - v * 1.4 + turb * 3.2) * Math.PI * 2));
      return 0.14 + Math.pow(1 - vein, 20) * 0.16 + fbm(u * 40, v * 40, 2) * 0.04;
    }, { repeat: 2 });
    return T.neroMarble;
  },
  brushedMetal() {
    if (T.brushedMetal) return T.brushedMetal;
    T.brushedMetal = procedural(512, (u, v) => {
      const streak = fbm(u * 6, v * 260, 3);
      const macro = fbm(u * 18, v * 18, 2);
      const k = 0.88 + (streak - 0.5) * 0.16 + (macro - 0.5) * 0.06;
      const c = Math.round(clamp(218 * k, 120, 250));
      return [c, c, Math.min(255, c + 3), 0.45 + streak * 0.28];
    }, { repeat: 2 });
    T.brushedMetal.roughness = proceduralRoughness(512, (u, v) => {
      return 0.18 + fbm(u * 8, v * 240, 2) * 0.14;
    }, { repeat: 2 });
    return T.brushedMetal;
  },
  walnutSlat() {
    if (T.walnutSlat) return T.walnutSlat;
    const S = 512, slat = 32;
    T.walnutSlat = procedural(S, (u, v, i) => {
      const fx = (i % slat) / slat;
      const groove = fx < 0.18 || fx > 0.88 ? 1 : 0;
      const si = (i / slat) | 0;
      const rnd = mulberry32(si * 433 + 17)();
      const warp = fbm(u * 12 + rnd, v * 6, 4);
      const grain = Math.sin((u * 70 + warp * 9) * Math.PI) * 0.5 + 0.5;
      const k = (0.76 + grain * 0.22 + (rnd - 0.5) * 0.14) * (groove ? 0.34 : 1.0);
      return [148 * k, 96 * k, 62 * k, groove ? 0.12 : 0.68 + grain * 0.16];
    }, { repeat: 2 });
    return T.walnutSlat;
  },
  leather() {
    if (T.leather) return T.leather;
    T.leather = procedural(256, (u, v) => {
      const cell = fbm(u * 95, v * 95, 3);
      const fine = fbm(u * 210, v * 210, 2);
      const k = 0.88 + (cell - 0.5) * 0.18 + (fine - 0.5) * 0.08;
      const v2 = Math.round(clamp(235 * k, 120, 255));
      return [v2, v2, v2, 0.42 + cell * 0.36];
    }, { repeat: 4 });
    T.leather.roughness = proceduralRoughness(256, (u, v) => {
      return 0.34 + fbm(u * 95, v * 95, 2) * 0.18;
    }, { repeat: 4 });
    return T.leather;
  },
  aoDisc() {
    if (T.aoDisc) return T.aoDisc;
    const S = 256;
    const { c, x } = canvas2d(S);
    const g = x.createRadialGradient(S / 2, S / 2, S * 0.08, S / 2, S / 2, S * 0.5);
    g.addColorStop(0, 'rgba(10, 12, 18, 0.42)');
    g.addColorStop(0.5, 'rgba(10, 12, 18, 0.20)');
    g.addColorStop(0.82, 'rgba(10, 12, 18, 0.05)');
    g.addColorStop(1, 'rgba(10, 12, 18, 0.0)');
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    T.aoDisc = t;
    return T.aoDisc;
  },
  wood() {
    if (T.wood) return T.wood;
    T.wood = procedural(512, (u, v) => {
      const warp = fbm(u * 5, v * 26, 4);
      const grain = Math.sin((v * 46 + warp * 9) * Math.PI) * 0.5 + 0.5;
      const fine = fbm(u * 120, v * 300, 2);
      const k = 0.78 + grain * 0.18 + (fine - 0.5) * 0.08;
      return [224 * k, 198 * k, 162 * k, 0.45 + grain * 0.25];
    }, { repeat: 1 });
    return T.wood;
  },
  oakLaminate() {
    if (T.oakLam) return T.oakLam;
    T.oakLam = procedural(512, (u, v) => {
      const board = Math.floor(v * 8);
      const br = mulberry32(board * 317)();
      const warp = fbm(u * 4, v * 32, 4);
      const grain = Math.sin((v * 52 + warp * 7) * Math.PI) * 0.5 + 0.5;
      const fine = fbm(u * 100, v * 260, 2);
      const k = 0.86 + grain * 0.11 + (fine - 0.5) * 0.05 + br * 0.04;
      const seam = Math.min(v * 8 % 1, 1 - v * 8 % 1) < 0.015 ? 0.78 : 1.0;
      return [242 * k * seam, 224 * k * seam, 196 * k * seam, 0.45 + grain * 0.2];
    }, { repeat: 3 });
    return T.oakLam;
  },
  walnut() {
    if (T.walnut) return T.walnut;
    T.walnut = procedural(512, (u, v) => {
      const warp = fbm(u * 6, v * 22, 4);
      const grain = Math.sin((v * 40 + warp * 11) * Math.PI) * 0.5 + 0.5;
      const fine = fbm(u * 140, v * 280, 2);
      const k = 0.74 + grain * 0.22 + (fine - 0.5) * 0.08;
      return [178 * k, 128 * k, 96 * k, 0.42 + grain * 0.3];
    }, { repeat: 1 });
    return T.walnut;
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
      const grid = Math.min(fx, 1 - fx, fy, 1 - fy) < 0.015 ? 1 : 0;
      const perf = ((i % 8 === 0) && (j % 8 === 0)) ? 1 : 0;
      const n = fbm(u * 30, v * 30, 3);
      const base = 248 + (n - 0.5) * 4 - perf * 10;
      return grid ? [210, 212, 216, 0.2] : [base, base, Math.min(255, base + 2), 0.6];
    }, { repeat: 4 });
    return T.ceiling;
  },
  fabric() {
    if (T.fabric) return T.fabric;
    T.fabric = procedural(256, (u, v) => {
      const n = fbm(u * 260, v * 260, 2);
      const k = 0.85 + n * 0.25;
      return [140 * k, 148 * k, 165 * k, 0.5 + (n - 0.5) * 0.4];
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
  needleBlue() {
    if (T.needleBlue) return T.needleBlue;
    T.needleBlue = procedural(256, (u, v) => {
      const n = fbm(u * 90, v * 90, 4);
      const k = 0.6 + n * 0.52;
      // Blue-grey spruce needles
      return [44 * k, 68 * k, 82 * k, 0.5 + (n - 0.5) * 0.8];
    }, { repeat: 2 });
    return T.needleBlue;
  },
};

/* --------------------------------------------------------------- canvas textures for interior */
function makeCanvasTex(w, h, drawFn) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  drawFn(x, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function makeICABanner() {
  return makeCanvasTex(1024, 512, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#09438f'); g.addColorStop(0.55, '#0f5ec2'); g.addColorStop(1, '#083a7c');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // Subtle decorative rays
    x.strokeStyle = 'rgba(0,220,255,0.18)'; x.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      x.beginPath(); x.moveTo(0, h * (0.15 + i * 0.15)); x.lineTo(w, h * (0.05 + i * 0.16)); x.stroke();
    }
    // Kazakhstan map silhouette
    x.fillStyle = 'rgba(90,190,255,0.26)';
    x.strokeStyle = 'rgba(130,220,255,0.55)'; x.lineWidth = 3;
    const pts = [[130,220],[210,145],[390,120],[580,110],[770,135],[890,195],[900,295],[810,360],[650,375],[460,390],[280,365],[165,320]];
    x.beginPath(); x.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) x.lineTo(p[0], p[1]);
    x.closePath(); x.fill(); x.stroke();
    // Sun emblem
    x.fillStyle = '#ffd633';
    x.beginPath(); x.arc(w * 0.5, h * 0.34, 42, 0, Math.PI * 2); x.fill();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      x.save(); x.translate(w * 0.5 + Math.cos(a) * 56, h * 0.34 + Math.sin(a) * 56);
      x.rotate(a); x.fillRect(-3, -10, 6, 20); x.restore();
    }
    // Text
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#ffffff';
    x.font = '800 54px "Segoe UI", Arial, sans-serif';
    x.fillText('ҰЛЫ ДАЛАНЫҢ ҚУАТЫ', w / 2, h * 0.64);
    x.font = '600 40px "Segoe UI", Arial, sans-serif';
    x.fillStyle = '#d8efff';
    x.fillText('ЭНЕРГИЯ ВЕЛИКОЙ СТЕПИ', w / 2, h * 0.77);
    x.font = '700 32px "Segoe UI", Arial, sans-serif';
    x.fillStyle = '#6ce2ff';
    x.fillText('ИНТЕРГАЗ ЦЕНТРАЛЬНАЯ АЗИЯ · QazaqGaz', w / 2, h * 0.90);
    x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 4;
    x.strokeRect(18, 18, w - 36, h - 36);
  });
}

function makeKZMapGlow() {
  return makeCanvasTex(1024, 512, (x, w, h) => {
    const bg = x.createRadialGradient(w * 0.5, h * 0.45, 40, w * 0.5, h * 0.45, w * 0.55);
    bg.addColorStop(0, '#0d3b7d'); bg.addColorStop(1, '#061533');
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    // Subtle grid
    x.strokeStyle = 'rgba(0,180,255,0.14)'; x.lineWidth = 1;
    for (let i = 0; i <= 16; i++) { x.beginPath(); x.moveTo(i * w / 16, 0); x.lineTo(i * w / 16, h); x.stroke(); }
    for (let i = 0; i <= 8; i++) { x.beginPath(); x.moveTo(0, i * h / 8); x.lineTo(w, i * h / 8); x.stroke(); }
    // Glowing Kazakhstan map contour
    const pts = [[105,215],[180,140],[310,130],[440,85],[595,80],[745,105],[880,175],[915,270],[855,345],[725,365],[570,385],[445,395],[315,365],[220,355],[135,310]];
    x.shadowColor = '#00ccff'; x.shadowBlur = 24;
    x.strokeStyle = '#38d8ff'; x.lineWidth = 5;
    x.fillStyle = 'rgba(24,148,255,0.30)';
    x.beginPath(); x.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) x.lineTo(p[0], p[1]);
    x.closePath(); x.fill(); x.stroke();
    // Main trunk gas pipelines
    x.strokeStyle = '#ffd23f'; x.lineWidth = 4; x.shadowColor = '#ffaa00'; x.shadowBlur = 12;
    const routes = [
      [[155,210],[255,235],[375,260],[540,315],[730,335],[865,280]],
      [[155,210],[220,170],[340,165],[520,180],[690,210]],
      [[255,235],[260,330],[410,360],[540,315]],
    ];
    for (const r of routes) {
      x.beginPath(); x.moveTo(r[0][0], r[0][1]);
      for (const p of r) x.lineTo(p[0], p[1]);
      x.stroke();
    }
    // Compressor station nodes + Uralsk highlight
    const cities = [
      [155, 210, 'УРАЛЬСК', true], [255, 235, 'АКТОБЕ', false], [260, 330, 'АТЫРАУ', false],
      [520, 180, 'АСТАНА', false], [540, 315, 'ШЫМКЕНТ', false], [730, 335, 'АЛМАТЫ', false],
    ];
    for (const [cx, cy, name, hi] of cities) {
      x.fillStyle = hi ? '#00ffaa' : '#00f5ff';
      x.shadowColor = hi ? '#00ffaa' : '#00f5ff'; x.shadowBlur = 14;
      x.beginPath(); x.arc(cx, cy, hi ? 10 : 6, 0, TAU); x.fill();
      x.shadowBlur = 0;
      x.fillStyle = hi ? '#aaffdd' : '#e6f6ff';
      x.font = hi ? '700 22px "Segoe UI", Arial' : '600 18px "Segoe UI", Arial';
      x.textAlign = 'left';
      x.fillText(name, cx + 14, cy + 6);
    }
    x.shadowBlur = 0;
    x.fillStyle = '#ffffff'; x.textAlign = 'center';
    x.font = '800 34px "Segoe UI", Arial, sans-serif';
    x.fillText('ҚАЗАҚСТАН · МАГИСТРАЛЬНЫЕ ГАЗОПРОВОДЫ ICA', w / 2, h * 0.91);
    x.strokeStyle = 'rgba(80,200,255,0.5)'; x.lineWidth = 4;
    x.strokeRect(12, 12, w - 24, h - 24);
  });
}

function makeSCADAScreen() {
  return makeCanvasTex(1024, 512, (x, w, h) => {
    x.fillStyle = '#071426'; x.fillRect(0, 0, w, h);
    // Header bar
    x.fillStyle = '#0d2b52'; x.fillRect(0, 0, w, 58);
    x.fillStyle = '#00f0ff'; x.fillRect(0, 56, w, 3);
    // Grid
    x.strokeStyle = 'rgba(0,160,255,0.16)'; x.lineWidth = 1;
    for (let i = 0; i < 24; i++) { x.beginPath(); x.moveTo(i * w / 24, 58); x.lineTo(i * w / 24, h); x.stroke(); }
    for (let i = 1; i < 12; i++) { x.beginPath(); x.moveTo(0, i * h / 12); x.lineTo(w, i * h / 12); x.stroke(); }
    // Main trunk pipelines (green + cyan active lines)
    x.lineWidth = 5; x.shadowBlur = 12;
    x.strokeStyle = '#00ff99'; x.shadowColor = '#00ff99';
    x.beginPath();
    x.moveTo(40, 165); x.lineTo(270, 165); x.lineTo(360, 235);
    x.lineTo(640, 235); x.lineTo(740, 175); x.lineTo(984, 175);
    x.stroke();
    x.strokeStyle = '#00d4ff'; x.shadowColor = '#00d4ff';
    x.beginPath();
    x.moveTo(40, 325); x.lineTo(240, 325); x.lineTo(340, 375);
    x.lineTo(660, 375); x.lineTo(760, 305); x.lineTo(984, 305);
    x.stroke();
    // Cross-connect bridge
    x.strokeStyle = '#ffbb33'; x.shadowColor = '#ffbb33'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(360, 235); x.lineTo(340, 375); x.moveTo(640, 235); x.lineTo(660, 375); x.stroke();
    // Compressor stations & valves
    x.shadowBlur = 10;
    for (const [vx, vy, lbl] of [
      [270, 165, 'КС-Уральск'], [500, 235, 'КС-Чижа'], [740, 175, 'КС-Джангала'],
      [240, 325, 'ГРС-1'], [500, 375, 'КС-Тайпак'], [760, 305, 'ГРС-2'],
    ]) {
      x.fillStyle = '#0a223a'; x.strokeStyle = '#00ffaa'; x.lineWidth = 3;
      x.fillRect(vx - 26, vy - 18, 52, 36); x.strokeRect(vx - 26, vy - 18, 52, 36);
      x.fillStyle = '#ff5544'; x.beginPath(); x.arc(vx, vy, 7, 0, TAU); x.fill();
      x.shadowBlur = 0; x.fillStyle = '#ffffff'; x.font = '700 16px "Segoe UI", Arial'; x.textAlign = 'center';
      x.fillText(lbl, vx, vy - 26);
      x.shadowBlur = 10;
    }
    x.shadowBlur = 0;
    // Live telemetry boxes
    const boxes = [
      [50, 82, 'ДАВЛЕНИЕ ВХ', '5.42 МПа', '#00ff99'],
      [295, 82, 'ДАВЛЕНИЕ ВЫХ', '4.88 МПа', '#00d4ff'],
      [540, 82, 'РАСХОД ГАЗА', '32.7 тыс.м³/ч', '#ffdd55'],
      [785, 82, 'ТЕМПЕРАТУРА', '+12.8 °C', '#66eeff'],
    ];
    for (const [bx, by, t1, t2, col] of boxes) {
      x.fillStyle = 'rgba(10,36,68,0.88)'; x.fillRect(bx, by, 200, 56);
      x.strokeStyle = col; x.lineWidth = 2; x.strokeRect(bx, by, 200, 56);
      x.fillStyle = '#a0c8e8'; x.font = '600 13px Arial'; x.textAlign = 'left';
      x.fillText(t1, bx + 12, by + 20);
      x.fillStyle = col; x.font = '700 22px monospace';
      x.fillText(t2, bx + 12, by + 46);
    }
    // Bottom status bar
    x.fillStyle = '#0b2242'; x.fillRect(0, h - 44, w, 44);
    x.fillStyle = '#00ff88'; x.font = '700 18px monospace'; x.textAlign = 'left';
    x.fillText('● SCADA ONLINE  |  САЦ-УРАЛЬСК  |  РЕЖИМ: ШТАТНЫЙ', 24, h - 16);
    // Title
    x.fillStyle = '#ffffff'; x.font = '800 26px "Segoe UI", Arial'; x.textAlign = 'center';
    x.fillText('УМГ «УРАЛЬСК» — ЦЕНТРАЛЬНАЯ ДИСПЕТЧЕРСКАЯ · МНЕМОСХЕМА', w / 2, 36);
  });
}

function makeOfficeScreen() {
  return makeCanvasTex(512, 256, (x, w, h) => {
    x.fillStyle = '#1a2744'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#0d6efd'; x.fillRect(0, 0, w, 32);
    x.fillStyle = '#fff'; x.font = '14px Arial'; x.textAlign = 'left';
    x.fillText('Excel — Отчёт за квартал.xlsx', 12, 22);
    // Fake spreadsheet grid
    x.strokeStyle = 'rgba(255,255,255,0.1)'; x.lineWidth = 1;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 6; c++) {
      x.strokeRect(c * w / 6, 36 + r * 26, w / 6, 26);
    }
    x.fillStyle = 'rgba(100,180,255,0.3)'; x.fillRect(0, 36, w / 6, 26);
    x.fillStyle = '#aacfff'; x.font = '11px monospace';
    for (let r = 0; r < 7; r++) x.fillText(`${(r + 1) * 1234}`, w / 6 + 8, 54 + r * 26);
  });
}

function makePainting() {
  return makeCanvasTex(512, 384, (x, w, h) => {
    // Steppe landscape
    const sky = x.createLinearGradient(0, 0, 0, h * 0.6);
    sky.addColorStop(0, '#5a8cc0'); sky.addColorStop(1, '#c8dce8');
    x.fillStyle = sky; x.fillRect(0, 0, w, h * 0.6);
    // Hills
    const hill = x.createLinearGradient(0, h * 0.5, 0, h);
    hill.addColorStop(0, '#8aaa6a'); hill.addColorStop(1, '#6a8a4a');
    x.fillStyle = hill;
    x.beginPath(); x.moveTo(0, h * 0.6);
    x.quadraticCurveTo(w * 0.3, h * 0.42, w * 0.5, h * 0.56);
    x.quadraticCurveTo(w * 0.7, h * 0.48, w, h * 0.58);
    x.lineTo(w, h); x.lineTo(0, h); x.fill();
    // Frame
    x.strokeStyle = '#8a7044'; x.lineWidth = 8;
    x.strokeRect(4, 4, w - 8, h - 8);
  });
}

/* --------------------------------------------------------------- PBR & GLB asset loaders */
const _texLoader = new THREE.TextureLoader();
const _pbrTexCache = new Map();

function loadTex(url, { srgb = false, repeat = [1, 1], aniso = 8, remap = null } = {}) {
  const key = `${url}|${repeat[0]}|${repeat[1]}|${srgb ? 1 : 0}|${remap ? remap.join(',') : ''}`;
  if (_pbrTexCache.has(key)) return _pbrTexCache.get(key);

  const tex = _texLoader.load(
    url,
    (loaded) => {
      if (remap && loaded.image) {
        const w = Math.min(512, loaded.image.width || 512);
        const h = Math.min(512, loaded.image.height || 512);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(loaded.image, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        const [minR, maxR] = remap;
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const v = Math.round((minR + (d[i] / 255) * (maxR - minR)) * 255);
          d[i] = d[i + 1] = d[i + 2] = v;
        }
        ctx.putImageData(img, 0, 0);
        loaded.image = c;
      }
      loaded.needsUpdate = true;
    },
    undefined,
    () => console.warn('[core] Failed PBR texture:', url)
  );
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = aniso;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  _pbrTexCache.set(key, tex);
  return tex;
}

export function loadPBRSet(name, { repeat = [1, 1], aniso = 8, roughRemap = null } = {}) {
  return {
    map: loadTex(`./assets/pbr/${name}_col.jpg`, { srgb: true, repeat, aniso }),
    normalMap: loadTex(`./assets/pbr/${name}_nor.jpg`, { srgb: false, repeat, aniso }),
    roughnessMap: loadTex(`./assets/pbr/${name}_rough.jpg`, { srgb: false, repeat, aniso, remap: roughRemap }),
  };
}

const _dracoLoader = new DRACOLoader();
_dracoLoader.setDecoderPath('./vendor/draco/');
const _gltfLoader = new GLTFLoader();
_gltfLoader.setDRACOLoader(_dracoLoader);
const _glbCache = new Map();

export function loadGLB(url) {
  if (_glbCache.has(url)) return _glbCache.get(url);
  const p = new Promise((resolve, reject) => {
    _gltfLoader.load(url, resolve, undefined, (err) => {
      console.warn('[core] Failed GLB:', url, err);
      reject(err);
    });
  });
  _glbCache.set(url, p);
  return p;
}

export function prepareModel(root, {
  targetHeight = null,
  groundY = 0,
  centerXZ = false,
  castShadow = true,
  receiveShadow = true,
  envMapIntensity = 0.85,
  cloneMaterials = false,
  onMesh = null,
} = {}) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);

  if (targetHeight && size.y > 1e-4) {
    const s = targetHeight / size.y;
    root.scale.multiplyScalar(s);
    root.updateMatrixWorld(true);
    box.setFromObject(root);
  }

  box.getCenter(center);
  if (centerXZ) {
    root.position.x -= center.x;
    root.position.z -= center.z;
  }
  if (groundY !== null && groundY !== undefined) {
    root.position.y += groundY - box.min.y;
  }

  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = castShadow;
    obj.receiveShadow = receiveShadow;
    const applyMat = (m) => {
      const mat = cloneMaterials ? m.clone() : m;
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        if (mat.envMapIntensity === undefined || mat.envMapIntensity === 1) {
          mat.envMapIntensity = envMapIntensity;
        }
      }
      return mat;
    };
    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map(applyMat);
    } else if (obj.material) {
      obj.material = applyMat(obj.material);
    }
    if (onMesh) onMesh(obj);
  });

  root.updateMatrixWorld(true);
  return root;
}

export async function cloneGLB(url, opts = {}) {
  const gltf = await loadGLB(url);
  const clone = gltf.scene.clone(true);
  return prepareModel(clone, opts);
}

const _rgbeLoader = new RGBELoader();
export function loadHDR(url, pmremGenerator) {
  return new Promise((resolve, reject) => {
    _rgbeLoader.load(
      url,
      (hdrTex) => {
        hdrTex.mapping = THREE.EquirectangularReflectionMapping;
        const rt = pmremGenerator.fromEquirectangular(hdrTex);
        hdrTex.dispose();
        resolve({ renderTarget: rt, texture: rt.texture });
      },
      undefined,
      (err) => {
        console.warn('[core] Failed HDR:', url, err);
        reject(err);
      }
    );
  });
}

/* --------------------------------------------------------------- materials */
export function makeMaterials(env) {
  const plasterT = TEX.plaster();
  const grassT = TEX.grass(), walnutSlatT = TEX.walnutSlat();
  const brushedT = TEX.brushedMetal(), leatherT = TEX.leather();
  const carpet = TEX.carpet(), ceil = TEX.ceiling(), fabricT = TEX.fabric();
  const needleBlue = TEX.needleBlue();

  // Real staged PBR texture sets
  const travPBR = loadPBRSet('travertine', { repeat: [2, 2], roughRemap: [0.58, 0.78] });
  const granitePBR = loadPBRSet('granite', { repeat: [2, 2], roughRemap: [0.36, 0.54] });
  const graniteDarkPBR = loadPBRSet('granite', { repeat: [2, 2], roughRemap: [0.46, 0.64] });
  const paverPBR = loadPBRSet('paver', { repeat: [10, 14] });
  const asphaltPBR = loadPBRSet('asphalt', { repeat: [12, 12] });
  const marblePBR = loadPBRSet('marble', { repeat: [4, 4], roughRemap: [0.14, 0.22] });
  const neroPBR = loadPBRSet('nero', { repeat: [2, 2], roughRemap: [0.14, 0.28] });
  const walnutDoorPBR = loadPBRSet('walnut', { repeat: [1, 1] });
  const oakFloorPBR = loadPBRSet('walnut', { repeat: [4, 4], roughRemap: [0.34, 0.52] });
  const woodLightPBR = loadPBRSet('walnut', { repeat: [2, 2], roughRemap: [0.36, 0.54] });
  const rockPBR = loadPBRSet('rock', { repeat: [4, 4], roughRemap: [0.78, 0.94] });

  const M = {
    /* ==================== EXTERIOR ==================== */
    plaster: new THREE.MeshStandardMaterial({
      color: 0xe6dcc0, map: plasterT.map, normalMap: travPBR.normalMap, normalScale: new THREE.Vector2(0.24, 0.24),
      roughness: 0.92, roughnessMap: plasterT.roughness, metalness: 0,
      side: THREE.DoubleSide,
    }),
    plasterWarm: new THREE.MeshStandardMaterial({
      color: 0xdecba6, map: plasterT.map, normalMap: travPBR.normalMap, normalScale: new THREE.Vector2(0.22, 0.22), roughness: 0.94,
    }),
    stone: new THREE.MeshStandardMaterial({
      color: 0xfbf7ee, map: travPBR.map, normalMap: travPBR.normalMap, normalScale: new THREE.Vector2(0.42, 0.42),
      roughness: 1.0, roughnessMap: travPBR.roughnessMap, envMapIntensity: 0.52,
    }),
    granite: new THREE.MeshStandardMaterial({
      color: 0xa67462, map: granitePBR.map, normalMap: granitePBR.normalMap, normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 1.0, roughnessMap: granitePBR.roughnessMap, metalness: 0.02, envMapIntensity: 0.85,
    }),
    graniteDark: new THREE.MeshStandardMaterial({
      color: 0x62504b, map: graniteDarkPBR.map, normalMap: graniteDarkPBR.normalMap, normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 1.0, roughnessMap: graniteDarkPBR.roughnessMap, envMapIntensity: 0.65,
    }),
    paver: new THREE.MeshStandardMaterial({
      color: 0xe6baa8, map: paverPBR.map, normalMap: paverPBR.normalMap, normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 1.0, roughnessMap: paverPBR.roughnessMap, envMapIntensity: 0.42,
    }),
    paving: new THREE.MeshStandardMaterial({
      color: 0xd0c4bc, map: paverPBR.map, normalMap: paverPBR.normalMap, normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 1.0, roughnessMap: paverPBR.roughnessMap, envMapIntensity: 0.4,
    }),
    brick: new THREE.MeshStandardMaterial({
      color: 0xd49c8c, map: paverPBR.map, normalMap: paverPBR.normalMap, normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 1.0, roughnessMap: paverPBR.roughnessMap, envMapIntensity: 0.4,
    }),
    asphalt: new THREE.MeshStandardMaterial({
      color: 0x9a9c9e, map: asphaltPBR.map, normalMap: asphaltPBR.normalMap, normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 1.0, roughnessMap: asphaltPBR.roughnessMap, envMapIntensity: 0.35,
    }),
    grass: new THREE.MeshStandardMaterial({
      color: 0x86a06a, map: grassT.map, bumpMap: grassT.bump, bumpScale: 0.4, roughness: 1,
    }),
    metalDark: new THREE.MeshStandardMaterial({ color: 0x2b2b2d, metalness: 0.85, roughness: 0.42 }),
    metalWhite: new THREE.MeshStandardMaterial({ color: 0xf2f0ea, metalness: 0.35, roughness: 0.45 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe4e7ec, metalness: 0.95, roughness: 0.13, envMapIntensity: 1.45 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x4a4b4d, roughness: 0.9, metalness: 0.1 }),
    concrete: new THREE.MeshStandardMaterial({
      color: 0xc8c4bc, map: rockPBR.map, normalMap: rockPBR.normalMap, normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 1.0, roughnessMap: rockPBR.roughnessMap,
    }),
    lampGlow: new THREE.MeshStandardMaterial({
      color: 0xfff4de, emissive: 0xffe6bd, emissiveIntensity: 0.95, roughness: 0.4,
    }),
    parkLampGlobe: new THREE.MeshStandardMaterial({
      color: 0xfff8ee, emissive: 0xfff0d0, emissiveIntensity: 0.25,
      roughness: 0.3, transparent: true, opacity: 0.85,
    }),
    signBlue: new THREE.MeshStandardMaterial({ color: 0x0b4a8c, roughness: 0.5, metalness: 0.1 }),

    /* ---- Trees/vegetation ---- */
    spruceBlue: new THREE.MeshStandardMaterial({
      color: 0x4a7a90, roughness: 0.92, map: needleBlue.map, bumpMap: needleBlue.bump, bumpScale: 0.5,
    }),
    spruceGreen: new THREE.MeshStandardMaterial({
      color: 0x3f6d5c, roughness: 0.92, map: TEX.needle().map, bumpMap: TEX.needle().bump, bumpScale: 0.5,
    }),
    roseRed: new THREE.MeshStandardMaterial({ color: 0xd42040, roughness: 0.82 }),
    hedge: new THREE.MeshStandardMaterial({ color: 0x3a6830, roughness: 0.95, map: TEX.needle().map }),

    /* ==================== INTERIOR ==================== */
    marbleFloor: new THREE.MeshPhysicalMaterial({
      color: 0xebe3d5, map: marblePBR.map, normalMap: marblePBR.normalMap, normalScale: new THREE.Vector2(0.22, 0.22),
      roughness: 1.0, roughnessMap: marblePBR.roughnessMap, metalness: 0.02,
      clearcoat: 0.45, clearcoatRoughness: 0.12, envMapIntensity: 1.35, side: THREE.DoubleSide,
    }),
    neroMarble: new THREE.MeshPhysicalMaterial({
      color: 0x242830, map: neroPBR.map, normalMap: neroPBR.normalMap, normalScale: new THREE.Vector2(0.28, 0.28),
      roughness: 1.0, roughnessMap: neroPBR.roughnessMap, metalness: 0.03,
      clearcoat: 0.68, clearcoatRoughness: 0.14, envMapIntensity: 1.05, side: THREE.DoubleSide,
    }),
    brushedSteel: new THREE.MeshStandardMaterial({
      color: 0xd8dce2, map: brushedT.map, bumpMap: brushedT.bump, bumpScale: 0.03,
      roughness: 1.0, roughnessMap: brushedT.roughness, metalness: 0.92, envMapIntensity: 1.35,
    }),
    darkTitanium: new THREE.MeshStandardMaterial({
      color: 0x363b44, map: brushedT.map, bumpMap: brushedT.bump, bumpScale: 0.03,
      roughness: 1.0, roughnessMap: brushedT.roughness, metalness: 0.88, envMapIntensity: 1.2,
    }),
    brushedBrass: new THREE.MeshStandardMaterial({
      color: 0xd9b366, map: brushedT.map, bumpMap: brushedT.bump, bumpScale: 0.025,
      roughness: 1.0, roughnessMap: brushedT.roughness, metalness: 0.94, envMapIntensity: 1.45,
    }),
    oakLaminate: new THREE.MeshStandardMaterial({
      color: 0xffe4c4, map: oakFloorPBR.map, normalMap: oakFloorPBR.normalMap, normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 1.0, roughnessMap: oakFloorPBR.roughnessMap, metalness: 0, envMapIntensity: 0.52, side: THREE.DoubleSide,
    }),
    plasterWall: new THREE.MeshStandardMaterial({
      color: 0xe5e2da, normalMap: travPBR.normalMap, normalScale: new THREE.Vector2(0.10, 0.10),
      roughness: 0.88, metalness: 0, envMapIntensity: 0.32, side: THREE.DoubleSide,
    }),
    walnutDoor: new THREE.MeshStandardMaterial({
      color: 0xc89676, map: walnutDoorPBR.map, normalMap: walnutDoorPBR.normalMap, normalScale: new THREE.Vector2(0.42, 0.42),
      roughness: 1.0, roughnessMap: walnutDoorPBR.roughnessMap, metalness: 0, envMapIntensity: 0.48,
    }),
    walnutSlat: new THREE.MeshStandardMaterial({
      color: 0xffffff, map: walnutSlatT.map, normalMap: woodLightPBR.normalMap, normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 1.0, roughnessMap: woodLightPBR.roughnessMap, metalness: 0, envMapIntensity: 0.48,
    }),
    frostedGlass: new THREE.MeshPhysicalMaterial({
      color: 0xe8eef4, metalness: 0, roughness: 0.52, transparent: true, opacity: 0.36,
      envMapIntensity: 0.5, side: THREE.DoubleSide, depthWrite: false,
      clearcoat: 0.5, clearcoatRoughness: 0.38,
    }),
    guardDesk: new THREE.MeshStandardMaterial({ color: 0xd4d8e0, roughness: 0.65, metalness: 0.05, envMapIntensity: 0.35 }),
    leatherBlack: new THREE.MeshStandardMaterial({
      color: 0x22252c, map: leatherT.map, bumpMap: leatherT.bump, bumpScale: 0.08,
      roughness: 1.0, roughnessMap: leatherT.roughness, metalness: 0.04, envMapIntensity: 0.65,
    }),
    leatherCognac: new THREE.MeshStandardMaterial({
      color: 0x9b5a34, map: leatherT.map, bumpMap: leatherT.bump, bumpScale: 0.09,
      roughness: 1.0, roughnessMap: leatherT.roughness, metalness: 0.02, envMapIntensity: 0.58,
    }),
    leatherEspresso: new THREE.MeshStandardMaterial({
      color: 0x422e24, map: leatherT.map, bumpMap: leatherT.bump, bumpScale: 0.09,
      roughness: 1.0, roughnessMap: leatherT.roughness, metalness: 0.03, envMapIntensity: 0.58,
    }),
    aoShadow: new THREE.MeshBasicMaterial({
      map: TEX.aoDisc(), transparent: true, opacity: 0.92, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }),
    fabric: new THREE.MeshStandardMaterial({
      color: 0x35445c, map: fabricT.map, bumpMap: fabricT.bump, bumpScale: 0.18, roughness: 0.85, envMapIntensity: 0.25,
    }),
    woodLight: new THREE.MeshStandardMaterial({
      color: 0xffe8cb, map: woodLightPBR.map, normalMap: woodLightPBR.normalMap, normalScale: new THREE.Vector2(0.32, 0.32),
      roughness: 1.0, roughnessMap: woodLightPBR.roughnessMap, envMapIntensity: 0.42,
    }),
    blind: new THREE.MeshStandardMaterial({ color: 0xede5d4, roughness: 0.88, envMapIntensity: 0.25, side: THREE.DoubleSide }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0xe2e4e8, map: ceil.map, roughness: 0.92, envMapIntensity: 0.22, side: THREE.DoubleSide }),
    lampPanel: new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xfff8ea, emissiveIntensity: 1.15, roughness: 0.35,
    }),
    fireRed: new THREE.MeshStandardMaterial({ color: 0xcc2020, roughness: 0.75 }),

    /* Canvas-based textures for interior features — low envMap + clean emissiveMap so graphics stay rich & crisp */
    icaBanner: (() => {
      const tex = makeICABanner();
      return new THREE.MeshStandardMaterial({
        map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55,
        roughness: 0.85, metalness: 0, envMapIntensity: 0.12, side: THREE.DoubleSide,
      });
    })(),
    kzMapGlow: (() => {
      const tex = makeKZMapGlow();
      return new THREE.MeshStandardMaterial({
        map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.85,
        roughness: 0.75, metalness: 0, envMapIntensity: 0.12, side: THREE.DoubleSide,
      });
    })(),
    scadaScreen: (() => {
      const tex = makeSCADAScreen();
      return new THREE.MeshStandardMaterial({
        map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.88,
        roughness: 0.72, metalness: 0, envMapIntensity: 0.1, side: THREE.DoubleSide,
      });
    })(),
    officeScreen: (() => {
      const tex = makeOfficeScreen();
      return new THREE.MeshStandardMaterial({
        map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.65,
        roughness: 0.55, metalness: 0, envMapIntensity: 0.15,
      });
    })(),
    painting: new THREE.MeshStandardMaterial({ map: makePainting(), roughness: 0.75, envMapIntensity: 0.25 }),
  };

  /* ---- Glass materials (MeshPhysicalMaterial) ---- */
  M.glass = new THREE.MeshPhysicalMaterial({
    color: 0xb6ccd6, metalness: 0.04, roughness: 0.04, transparent: true, opacity: 0.20,
    envMapIntensity: 1.15, side: THREE.DoubleSide, depthWrite: false,
    clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.52, reflectivity: 0.92,
  });
  M.glassTint = new THREE.MeshPhysicalMaterial({
    color: 0x6a8898, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.55,
    envMapIntensity: 2.2, side: THREE.DoubleSide, depthWrite: false,
    clearcoat: 1, clearcoatRoughness: 0.03, reflectivity: 1,
  });
  M.glassDark = new THREE.MeshPhysicalMaterial({
    color: 0x2c3a42, metalness: 0.4, roughness: 0.08, transparent: true, opacity: 0.72,
    envMapIntensity: 1.4, side: THREE.DoubleSide,
  });
  M.glassBronze = new THREE.MeshPhysicalMaterial({
    color: 0x5a4a38, metalness: 0.3, roughness: 0.06, transparent: true, opacity: 0.58,
    envMapIntensity: 2.0, side: THREE.DoubleSide, depthWrite: false,
    clearcoat: 1, clearcoatRoughness: 0.03, reflectivity: 1,
  });

  _cachedEnv = env;
  for (const k of Object.keys(M)) {
    if (M[k].isMeshStandardMaterial || M[k].isMeshPhysicalMaterial) {
      M[k].envMap = env; M[k].envMapIntensity = M[k].envMapIntensity ?? 0.55;
    }
  }
  return M;
}

/* ----------------------------------------------------------- material pool */
const _matPool = new Map();
let _cachedEnv = null;

export function cachedMaterial(opts) {
  const type = opts.type || 'std';
  const key = [
    type,
    opts.color ?? 0xffffff,
    opts.roughness ?? 0.5,
    opts.metalness ?? 0,
    opts.emissive ?? 0,
    opts.emissiveIntensity ?? 1,
    opts.transparent ? 1 : 0,
    opts.opacity ?? 1,
    opts.side ?? THREE.FrontSide,
    opts.depthWrite ?? true,
    opts.envMapIntensity ?? 0.55,
    opts.clearcoat ?? 0,
    opts.clearcoatRoughness ?? 0,
    opts.polygonOffset ? 1 : 0,
    opts.toneMapped ?? true,
    opts.map ? opts.map.uuid : '',
    opts.bumpMap ? opts.bumpMap.uuid : '',
    opts.roughnessMap ? opts.roughnessMap.uuid : '',
    opts.alphaMap ? opts.alphaMap.uuid : '',
    opts.bumpScale ?? 1,
  ].join('|');
  if (_matPool.has(key)) return _matPool.get(key);
  const { type: _t, ...rest } = opts;
  const m = type === 'physical'
    ? new THREE.MeshPhysicalMaterial(rest)
    : type === 'basic'
      ? new THREE.MeshBasicMaterial(rest)
      : new THREE.MeshStandardMaterial(rest);
  if ((m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) && _cachedEnv) {
    m.envMap = _cachedEnv;
    m.envMapIntensity = m.envMapIntensity ?? 0.55;
  }
  _matPool.set(key, m);
  return m;
}

export function updateCachedMaterialsEnv(envTex) {
  _cachedEnv = envTex;
  for (const m of _matPool.values()) {
    if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) {
      m.envMap = envTex;
    }
  }
}

/* Build annular rotunda floor/ceiling ring, cutting the 20°..160° and 200°..340°
   grand staircase wells (r = 4.48..6.72) when cutStairwell is true.
   Ceilings cut slightly wider (16°..164° and 196°..344°) for generous >2.4m headroom. */
export function addRotundaRing(batch, mat, rIn, rOut, y, faceDown = false, cutStairwell = false) {
  const rx = faceDown ? Math.PI / 2 : -Math.PI / 2;
  const addArc = (ri, ro, seg, thetaStart, thetaLength) => {
    const g = new THREE.RingGeometry(ri, ro, seg, 1, thetaStart, thetaLength);
    g.rotateX(rx);
    batch.add(g, mat, new THREE.Matrix4().makeTranslation(0, y, 0));
  };
  if (!cutStairwell) {
    addArc(rIn, rOut, 72, 0, Math.PI * 2);
    return;
  }
  const rStairIn = 4.48;
  const rStairOut = 6.72;
  if (rIn < rStairIn) addArc(rIn, Math.min(rOut, rStairIn), 64, 0, Math.PI * 2);
  if (rOut > rStairOut) addArc(Math.max(rIn, rStairOut), rOut, 64, 0, Math.PI * 2);
  const bandIn = Math.max(rIn, rStairIn);
  const bandOut = Math.min(rOut, rStairOut);
  if (bandOut > bandIn) {
    // North landing (az 340°..20° floor, 344°..16° ceiling) & South landing (az 160°..200° floor, 164°..196° ceiling)
    const span = faceDown ? 32 * DEG : 40 * DEG;
    const northStart = faceDown ? 254 * DEG : 70 * DEG;
    const southStart = faceDown ? 74 * DEG : 250 * DEG;
    addArc(bandIn, bandOut, 16, northStart, span);
    addArc(bandIn, bandOut, 16, southStart, span);
  }
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
