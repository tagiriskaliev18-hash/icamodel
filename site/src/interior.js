/* Interiors. The plan gives a circular hall under the drum with a spiral stair,
   a long office block to the west and the diagonal wing. Rooms are cut into a
   simple grid of partitions; doors are openings with dark timber frames, windows
   get vertical blinds, and each floor gets its own ceiling grid with panels. */

import * as THREE from 'three';
import { Batch, DEG, LAYOUT, FLOOR, ROOF, PODIUM, polar, mulberry32 } from './core.js';

const B = LAYOUT.block;
const W = LAYOUT.wing;
const R = LAYOUT.rotunda;


const WALL_H = 3.6;
const PART_T = 0.14;

/* ------------------------------------------------------------ furniture */
function desk(batch, M, x, y, z, ry, w = 1.6, d = 0.8) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));
  const prev = batch.parent;
  batch.setParent(m);
  batch.box(M.wood, w, 0.06, d, 0, 0.74, 0);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    batch.box(M.metalDark, 0.05, 0.72, 0.05, sx * (w / 2 - 0.08), 0.36, sz * (d / 2 - 0.07));
  }
  // monitor
  batch.box(M.metalDark, 0.5, 0.32, 0.03, 0, 1.0, -0.16);
  batch.box(M.metalDark, 0.1, 0.16, 0.1, 0, 0.84, -0.16);
  batch.box(M.lampGlow, 0.44, 0.26, 0.01, 0, 1.0, -0.14);
  // chair
  const cx = 0, cz = 0.72;
  batch.box(M.fabric, 0.5, 0.09, 0.5, cx, 0.46, cz);
  batch.box(M.fabric, 0.5, 0.55, 0.09, cx, 0.76, cz + 0.24);
  batch.cyl(M.metalDark, 0.04, 0.05, 0.4, 8, cx, 0.22, cz);
  batch.cyl(M.metalDark, 0.26, 0.28, 0.04, 10, cx, 0.05, cz);
  // papers
  batch.box(M.stone, 0.24, 0.01, 0.32, 0.4, 0.78, 0.1, 0.2);
  batch.setParent(prev);
}

function meetingTable(batch, M, x, y, z, ry, len = 6) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));
  const prev = batch.parent;
  batch.setParent(m);
  batch.box(M.wood, len, 0.07, 1.5, 0, 0.75, 0);
  batch.box(M.metalDark, len - 1.4, 0.5, 0.16, 0, 0.42, 0);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const cx = -len / 2 + 0.9 + i * ((len - 1.8) / 4);
      batch.box(M.fabric, 0.52, 0.1, 0.5, cx, 0.46, s * 1.15);
      batch.box(M.fabric, 0.52, 0.58, 0.09, cx, 0.78, s * 1.15 + s * 0.24);
      batch.cyl(M.metalDark, 0.035, 0.04, 0.4, 8, cx, 0.22, s * 1.15);
    }
  }
  batch.setParent(prev);
}

function sofa(batch, M, x, y, z, ry) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));
  const prev = batch.parent;
  batch.setParent(m);
  batch.box(M.fabric, 2.1, 0.42, 0.9, 0, 0.3, 0);
  batch.box(M.fabric, 2.1, 0.6, 0.24, 0, 0.7, -0.34);
  for (const s of [-1, 1]) batch.box(M.fabric, 0.2, 0.4, 0.9, s * 1.0, 0.55, 0);
  batch.box(M.wood, 0.8, 0.05, 0.55, 0, 0.44, 0.9);
  batch.setParent(prev);
}

function plant(batch, M, x, y, z, s = 1) {
  batch.cyl(M.concrete, 0.26 * s, 0.2 * s, 0.46 * s, 12, x, y + 0.23 * s, z);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    batch.box(M.plant || M.grass, 0.1 * s, 0.8 * s, 0.34 * s, x + Math.sin(a) * 0.18 * s, y + 0.9 * s, z + Math.cos(a) * 0.18 * s, a, 0.35, 0);
  }
}

/* --------------------------------------------------------------- blinds */
function blinds(batch, M, f, u, y0, w, h) {
  const n = Math.max(6, Math.round(w / 0.09));
  for (let i = 0; i < n; i++) {
    const uu = u - w / 2 + (i + 0.5) * (w / n);
    const p = { x: f.x0 + f.ux * uu + f.nx * 0.06, z: f.z0 + f.uz * uu + f.nz * 0.06 };
    batch.box(M.blind, w / n * 0.82, h, 0.02, p.x, y0 + h / 2, p.z, Math.atan2(f.ux, f.uz));
  }
  const p = { x: f.x0 + f.ux * u + f.nx * 0.1, z: f.z0 + f.uz * u + f.nz * 0.1 };
  batch.box(M.stone, w + 0.1, 0.09, 0.14, p.x, y0 + h + 0.05, p.z, Math.atan2(f.ux, f.uz));
}

/* ---------------------------------------------------------------- doors */
function door(batch, M, f, u, w = 1.05, h = 2.2) {
  const ry = Math.atan2(f.ux, f.uz);
  const p = { x: f.x0 + f.ux * u, z: f.z0 + f.uz * u };
  // frame
  for (const s of [-1, 1]) {
    const q = { x: p.x + f.ux * s * (w / 2 + 0.05), z: p.z + f.uz * s * (w / 2 + 0.05) };
    batch.box(M.wood, 0.1, h + 0.1, 0.2, q.x, h / 2, q.z, ry);
  }
  batch.box(M.wood, w + 0.2, 0.1, 0.2, p.x, h + 0.05, p.z, ry);
  // leaf, dark timber with a glazed upper panel
  batch.box(M.wood, w, h, 0.07, p.x, h / 2, p.z, ry);
  batch.box(M.glassTint, w - 0.26, h * 0.46, 0.02, p.x, h * 0.66, p.z + 0.04 * f.nx, ry);
  batch.box(M.metalDark, 0.05, 0.28, 0.06, p.x + f.ux * (w / 2 - 0.14), 1.02, p.z + f.uz * (w / 2 - 0.14), ry);
}

/* ----------------------------------------------------------- partitions */
function partition(batch, M, f, u0, u1, y0, h = WALL_H, mat = M.plasterWall, opts = {}) {
  const len = u1 - u0;
  const u = (u0 + u1) / 2;
  const p = { x: f.x0 + f.ux * u, z: f.z0 + f.uz * u };
  const ry = Math.atan2(f.ux, f.uz);
  const t = opts.t ?? PART_T;
  batch.box(mat, len, h, t, p.x, y0 + h / 2, p.z, ry);
  // skirting
  batch.box(M.wood, len, 0.1, t + 0.03, p.x, y0 + 0.05, p.z, ry);
}

/* --------------------------------------------------------------- lights */
function ceilingPanel(batch, M, x, z, y, ry, w = 1.2, d = 0.6) {
  batch.box(M.lampPanel, w, 0.06, d, x, y - 0.02, z, ry);
}

/* ----------------------------------------------------------------- hall */
function hall(batch, M, colliders) {
  const r = R.hall;
  const levels = [0, 3.6, 7.2];
  const stairCore = R.core;

  for (const y of levels) {
    // polished floor with a darker inlay ring
    batch.add(new THREE.CylinderGeometry(r - 0.1, r - 0.1, 0.05, 72), M.marble, new THREE.Matrix4().makeTranslation(0, y + 0.025, 0));
    const ringGeo = new THREE.RingGeometry(r - 1.6, r - 1.35, 72);
    ringGeo.rotateX(-Math.PI / 2);
    batch.add(ringGeo, M.graniteDark, new THREE.Matrix4().makeTranslation(0, y + 0.052, 0));
    const inner = new THREE.CircleGeometry(1.5, 48);
    inner.rotateX(-Math.PI / 2);
    batch.add(inner, M.graniteDark, new THREE.Matrix4().makeTranslation(0, y + 0.052, 0));

    // eight columns around the hall
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const p = polar(a, r - 1.1);
      batch.cyl(M.stone, 0.28, 0.34, WALL_H - 0.5, 14, p.x, y + (WALL_H - 0.5) / 2 + 0.1, p.z);
      batch.box(M.stone, 0.72, 0.16, 0.72, p.x, y + WALL_H - 0.4, p.z, -a);
      batch.box(M.stone, 0.78, 0.2, 0.78, p.x, y + 0.16, p.z, -a);
      colliders.push({ type: 'circle', x: p.x, z: p.z, r: 0.4, y0: PODIUM + y, y1: PODIUM + y + WALL_H });
    }

    // ceiling: coffer ring facing downwards so it's visible from inside the hall
    const ringC = new THREE.RingGeometry(3.7, r - 0.1, 72, 1);
    ringC.rotateX(Math.PI / 2);
    batch.add(ringC, M.ceiling, new THREE.Matrix4().makeTranslation(0, y + WALL_H - 0.05, 0));
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const p = polar(a, r - 1.9);
      ceilingPanel(batch, M, p.x, p.z, y + WALL_H - 0.05, -a, 1.0, 0.5);
    }
  }

  /* spiral stair inside the drum: two helical runs with a central newel */
  const turns = 2.0, total = 32;
  const riseTotal = 7.2;
  const rStep = 2.55;
  for (let i = 0; i < total; i++) {
    const t = i / total;
    const a = t * turns * Math.PI * 2;
    const y = 0.18 + t * riseTotal;
    const p = polar(a, rStep);
    const ry = -a;
    batch.box(M.granite, 2.2, 0.16, 0.46, p.x, y, p.z, ry);
    batch.box(M.stone, 2.2, 0.18, 0.06, p.x, y - 0.09, p.z, ry);
    if (i % 2 === 0) {
      const q = polar(a, rStep + 1.0);
      batch.cyl(M.metalDark, 0.025, 0.025, 0.95, 6, q.x, y + 0.5, q.z);
    }
  }
  colliders.push({ type: 'spiral', rMin: 1.2, rMax: 3.7, y0: PODIUM, y1: PODIUM + riseTotal, turns });
  // newel
  batch.cyl(M.stone, 0.55, 0.62, 8.4, 20, 0, 4.2, 0);
  batch.add(new THREE.SphereGeometry(0.62, 16, 10), M.stone, new THREE.Matrix4().makeTranslation(0, 8.5, 0));
  colliders.push({ type: 'circle', x: 0, z: 0, r: 0.72, y0: PODIUM, y1: PODIUM + 9 });

  /* reception: counter, backdrop panel, soft seating */
  const rx = 0, rz = -5.6;
  batch.box(M.wood, 5.2, 1.05, 0.75, rx, 0.53, rz);
  batch.box(M.marble, 5.4, 0.1, 0.85, rx, 1.1, rz);
  batch.box(M.wood, 5.2, 0.5, 0.3, rx, 0.3, rz + 0.2);
  // backdrop with the corporate blue panel seen in the video
  batch.box(M.signBlue, 3.6, 1.5, 0.06, rx, 2.2, rz - 2.2);
  batch.box(M.stone, 3.8, 0.06, 0.1, rx, 2.98, rz - 2.2);
  colliders.push({ type: 'rect', x0: rx - 2.7, x1: rx + 2.7, z0: rz - 0.5, z1: rz + 0.5, y0: PODIUM, y1: PODIUM + 1.2 });
  sofa(batch, M, -6.4, 0, -1.6, Math.PI / 2);
  sofa(batch, M, -6.4, 0, 2.2, Math.PI / 2);
  for (const zz of [-3.4, 0.2, 3.6]) plant(batch, M, 6.6, 0, zz, 1.1);
  // chandelier over the hall
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const p = polar(a, 3.4);
    batch.cyl(M.metalWhite, 0.02, 0.02, 1.2, 4, p.x, 3.0, p.z);
    batch.add(new THREE.SphereGeometry(0.16, 10, 8), M.lampGlow, new THREE.Matrix4().makeTranslation(p.x, 2.4, p.z));
  }
}

/* ------------------------------------------------------------ block floors */
function blockFloor(batch, M, y, colliders, level) {
  const x0 = B.x0 + 0.4, x1 = B.x1 - 0.4, z0 = B.z0 + 0.4, z1 = B.z1 - 0.4;
  const depth = z1 - z0;
  const corrZ = z1 - 2.3;                       // corridor along the south wall

  // carpet in the corridor, tile in rooms
  batch.box(M.carpet, x1 - x0, 0.02, 2.4, (x0 + x1) / 2, y + 0.02, corrZ + 1.2);
  batch.box(M.carpet, x1 - x0, 0.02, depth - 2.6, (x0 + x1) / 2, y + 0.02, z0 + (depth - 2.6) / 2);

  // spine wall with door openings
  const spine = { x0, z0: corrZ, ux: 1, uz: 0, nx: 0, nz: -1, len: x1 - x0 };
  const rooms = 4;
  const rw = (x1 - x0) / rooms;
  for (let i = 0; i < rooms; i++) {
    const u0 = i * rw, u1 = u0 + rw;
    const a = x0 + u0;
    // doorway in the middle of each room's spine wall
    partition(batch, M, spine, u0, u0 + rw / 2 - 0.7, y);
    partition(batch, M, spine, u0 + rw / 2 + 0.7, u1, y);
    door(batch, M, spine, u0 + rw / 2, 1.3, 2.25);
    // dividing walls between rooms
    if (i > 0) {
      const f = { x0: a, z0: z0, ux: 0, uz: 1, nx: 1, nz: 0, len: depth - 2.4 };
      partition(batch, M, f, 0, depth - 2.4, y);
    }
  }
  // south corridor outer wall is the facade; put blinds and a bench
  for (let i = 0; i < rooms; i++) {
    const cx = x0 + (i + 0.5) * rw;
    const f = { x0, z0: z1, ux: 1, uz: 0, nx: 0, nz: -1, len: x1 - x0 };
    blinds(batch, M, f, cx - x0, y + 1.0, 1.5, 2.0);
  }

  // furniture per room
  const rnd = mulberry32(100 + level * 7);
  for (let i = 0; i < rooms; i++) {
    const cx = x0 + (i + 0.5) * rw;
    const cz = z0 + (depth - 2.6) / 2;
    if (i === 0 && level === 1) {
      meetingTable(batch, M, cx, y, cz, 0, Math.min(6, rw - 2));
      batch.box(M.carpet, rw - 1.6, 0.02, 5.4, cx, y + 0.04, cz);
    } else {
      desk(batch, M, cx - rw * 0.2, y, cz + 1.1, 0);
      desk(batch, M, cx + rw * 0.2, y, cz - 0.4, Math.PI);
      if (rnd() > 0.4) desk(batch, M, cx + rw * 0.24, y, cz + 2.2, Math.PI / 2);
      plant(batch, M, cx + rw / 2 - 0.7, y, z0 + 0.7, 0.9);
    }
    // ceiling panels
    for (let k = 0; k < 3; k++) {
      ceilingPanel(batch, M, cx - rw * 0.25 + k * rw * 0.25, cz, y + WALL_H - 0.02, 0, 1.1, 0.55);
    }
  }
  // corridor ceiling lights
  for (let i = 0; i < 8; i++) ceilingPanel(batch, M, x0 + 1 + i * (x1 - x0 - 2) / 7, corrZ + 1.2, y + WALL_H - 0.02, 0, 1.2, 0.35);
}

/* --------------------------------------------------------------- the wing */
function wingFloor(batch, M, y, colliders) {
  const a = W.az, ax = Math.sin(a), az = -Math.cos(a), nx = Math.cos(a), nz = Math.sin(a);
  const half = W.half - 0.5;
  const len = W.s1 - W.s0;

  // local frame -> world helper
  const put = (s, t) => ({ x: ax * s + nx * t, z: az * s + nz * t });

  // corridor down the middle
  const c0 = put(W.s0 + 0.5, 0), c1 = put(W.s1 - 0.5, 0);
  const cf = { x0: c0.x, z0: c0.z, ux: ax, uz: az, nx: -az, nz: ax, len };
  batch.box(M.carpet, 2.6, 0.02, len, put(W.s0 + len / 2, 0).x, y + 0.02, put(W.s0 + len / 2, 0).z, Math.atan2(ax, az));

  const rooms = 5;
  const rl = len / rooms;
  for (let i = 0; i < rooms; i++) {
    const s0 = W.s0 + 0.5 + i * rl;
    for (const sgn of [-1, 1]) {
      const off = sgn * (half / 2 + 0.7);
      const p = put(s0 + rl / 2, off);
      // dividing wall across the wing
      const f = { x0: put(s0, -half).x, z0: put(s0, -half).z, ux: nx, uz: nz, nx: ax, nz: az, len: half * 2 };
      if (i > 0) partition(batch, M, f, 0, half - 1.1, y);
      // corridor wall with door
      const wallF = { x0: put(s0, sgn * 1.3).x, z0: put(s0, sgn * 1.3).z, ux: ax, uz: az, nx: -az * sgn, nz: ax * sgn, len: rl };
      partition(batch, M, wallF, 0.2, rl / 2 - 0.7, y);
      partition(batch, M, wallF, rl / 2 + 0.7, rl - 0.2, y);
      door(batch, M, wallF, rl / 2, 1.2, 2.2);
      // desks
      desk(batch, M, p.x, y, p.z, Math.atan2(ax, az));
      if (i % 2 === 0) desk(batch, M, put(s0 + rl * 0.75, off).x, y, put(s0 + rl * 0.75, off).z, Math.atan2(ax, az) + Math.PI);
      ceilingPanel(batch, M, p.x, p.z, y + WALL_H - 0.02, Math.atan2(ax, az), 1.2, 0.6);
    }
  }
  // end room
  const e = put(W.s1 - 1.4, 0);
  meetingTable(batch, M, e.x, y, e.z, Math.atan2(ax, az), 4.6);
}

/* ------------------------------------------------------------ assembly */
export function buildInteriors(scene, M, colliders) {
  M.plasterWall = new THREE.MeshStandardMaterial({ color: 0xf0e9dc, roughness: 0.95 });
  M.blind = new THREE.MeshStandardMaterial({ color: 0xded8cb, roughness: 0.9, side: THREE.DoubleSide });
  M.lampPanel = new THREE.MeshStandardMaterial({ color: 0xfffdf4, emissive: 0xfff0d2, emissiveIntensity: 2.2, roughness: 0.6 });
  M.plant = new THREE.MeshStandardMaterial({ color: 0x3f6a3a, roughness: 0.9 });

  const group = new THREE.Group();
  group.name = 'interiors';
  group.position.y = PODIUM;
  const batch = new Batch();

  hall(batch, M, colliders);
  for (let lv = 0; lv < 3; lv++) {
    blockFloor(batch, M, FLOOR[lv], colliders, lv);
    wingFloor(batch, M, FLOOR[lv], colliders);
  }
  batch.build(group, { cast: true, receive: true, name: 'interior' });

  // interior lights: rotunda hall + each floor
  const interiorLights = [];
  const hallLight = new THREE.PointLight(0xfff0d4, 1.8, 28, 1.6);
  hallLight.position.set(0, PODIUM + 3.1, 0);
  scene.add(hallLight);
  interiorLights.push(hallLight);

  const hallUpper = new THREE.PointLight(0xffe8c0, 1.2, 26, 1.7);
  hallUpper.position.set(0, PODIUM + 7.0, 0);
  scene.add(hallUpper);
  interiorLights.push(hallUpper);

  for (let lv = 0; lv < 3; lv++) {
    const l = new THREE.PointLight(0xffe9c8, 1.0, 34, 1.8);
    l.position.set(-14, PODIUM + FLOOR[lv] + 2.6, -1);
    scene.add(l);
    interiorLights.push(l);
  }
  group.userData.lights = interiorLights;
  scene.add(group);
  return group;
}
