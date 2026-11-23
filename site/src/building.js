/* The building: rotunda with glass drum, long block, angled wing, curved entrance
   gallery, granite stair. Everything is generated from a small set of dimensions so
   the facade rhythm stays consistent across all four levels. */

import * as THREE from 'three';
import { Batch, DEG, LAYOUT, FLOOR, ROOF, ATTIC, PODIUM, polar, clamp, mulberry32 } from './core.js';

const R = LAYOUT.rotunda;
const B = LAYOUT.block;
const W = LAYOUT.wing;
const G = LAYOUT.gallery;

/* a wall run described in plan: from p0 to p1, facing outward normal n */
function frame(x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len;
  // outward normal for CCW perimeter (south x0->x1 has ux=1,uz=0 => n=(0,+1) south)
  return { x0, z0, ux, uz, nx: -uz, nz: ux, len };
}

/* place a box in the frame's local (u along the wall, v out of the wall) coordinates */
function inFrame(f, u, v) {
  return { x: f.x0 + f.ux * u + f.nx * v, z: f.z0 + f.uz * u + f.nz * v, ry: Math.atan2(-f.uz, f.ux) };
}

function wallBox(batch, mat, f, u, v, y, w, h, d, ry = 0) {
  const p = inFrame(f, u, v);
  return batch.box(mat, w, h, d, p.x, y, p.z, p.ry + ry);
}

/* --------------------------------------------------------------- windows */
/* arched window: recessed reveal, glass, white surround, keystone */
function archWindow(batch, M, f, u, y0, w, h, opts = {}) {
  const { sill = true, arch = true, depth = 0.22, glassMat = M.glassTint } = opts;
  const p = inFrame(f, u, 0.04);
  const pg = inFrame(f, u, 0.14);
  const ry = p.ry;

  // reveal: dark recess box sitting slightly proud of the facade plane
  batch.box(M.metalDark, w, h, depth, p.x, y0 + h / 2, p.z, ry);
  // glass slightly in front of the reveal
  batch.box(glassMat, w - 0.1, h - 0.08, 0.04, pg.x, y0 + h / 2, pg.z, ry);
  // white surround: jambs and sill band, the opening itself stays clear
  const sw = 0.18;
  for (const sgn of [-1, 1]) {
    const q = inFrame(f, u + sgn * (w / 2 + sw / 2), 0.10);
    batch.box(M.stone, sw, h + sw, 0.22, q.x, y0 + (h + sw) / 2, q.z, q.ry);
  }
  if (arch) {
    const rad = w / 2 + sw;
    const arc = new THREE.TorusGeometry(rad, 0.09, 6, 18, Math.PI);
    const pa = inFrame(f, u, 0.10);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(pa.x, y0 + h, pa.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
      new THREE.Vector3(1, 1, 1));
    batch.add(arc, M.stone, m);
    // glass in the arch head
    const head = new THREE.CylinderGeometry(w / 2 - 0.05, w / 2 - 0.05, 0.04, 20, 1, false, 0, Math.PI);
    const qHead = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0))
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)));
    const hm = new THREE.Matrix4().compose(
      new THREE.Vector3(pg.x, y0 + h, pg.z),
      qHead,
      new THREE.Vector3(1, 1, 1));
    batch.add(head, glassMat, hm);
    // keystone
    batch.box(M.stone, 0.3, 0.42, 0.24, pa.x, y0 + h + rad * 0.92, pa.z, ry);
  }
  if (sill) {
    const q = inFrame(f, u, 0.14);
    batch.box(M.stone, w + 0.44, 0.14, 0.34, q.x, y0 - 0.05, q.z, q.ry);
  }
}

/* rectangular window for the wing and secondary elevations */
function rectWindow(batch, M, f, u, y0, w, h, opts = {}) {
  const { depth = 0.2, glassMat = M.glassTint, frameMat = M.stone } = opts;
  const p = inFrame(f, u, 0.04);
  const pg = inFrame(f, u, 0.14);
  batch.box(M.metalDark, w, h, depth, p.x, y0 + h / 2, p.z, p.ry);
  batch.box(glassMat, w - 0.08, h - 0.08, 0.04, pg.x, y0 + h / 2, pg.z, p.ry);
  const sw = 0.12;
  for (const sgn of [-1, 1]) {
    const q = inFrame(f, u + sgn * (w / 2 + sw / 2), 0.10);
    batch.box(frameMat, sw, h + sw * 2, 0.2, q.x, y0 + h / 2, q.z, q.ry);
  }
  for (const yy of [y0 - sw / 2, y0 + h + sw / 2]) {
    const q = inFrame(f, u, 0.10);
    batch.box(frameMat, w + sw * 2, sw, 0.2, q.x, yy, q.z, q.ry);
  }
  const q = inFrame(f, u, 0.14);
  batch.box(M.stone, w + 0.34, 0.12, 0.3, q.x, y0 - 0.06, q.z, q.ry);
}

/* ------------------------------------------------------------ wall panel */
/* A facade run with plinth, string courses, pilasters, windows and cornice. */
function facade(batch, M, f, opts = {}) {
  const {
    levels = 4, first = 0, height = 3.6, thick = 0.5,
    bay = 3.6, winW = 1.55, winH = 2.15, sillH = 0.95,
    pilaster = true, archGround = false, archAll = false, plinth = true,
    cornice = true, parapet = true, trim = true, baseY = 0,
  } = opts;

  const L = f.len;
  const bays = Math.max(1, Math.round(L / bay));
  const step = L / bays;

  // wall body omitted when outer mass already provides solid volume (avoids z-fighting)
  if (opts.wallBody) {
    for (let i = 0; i < levels; i++) {
      const y = baseY + i * height;
      wallBox(batch, M.plaster, f, L / 2, -thick / 2, y + height / 2, L, height, thick);
    }
  }

  // plinth
  if (plinth) {
    const q = inFrame(f, L / 2, 0.03);
    batch.box(M.graniteDark, L + 0.1, 0.62, thick + 0.16, q.x, baseY + 0.31, q.z, q.ry);
  }

  // string courses between levels
  if (trim) {
    for (let i = 1; i < levels; i++) {
      const q = inFrame(f, L / 2, 0.05);
      batch.box(M.stone, L + 0.06, 0.22, thick + 0.22, q.x, baseY + i * height, q.z, q.ry);
    }
  }

  // window bays
  for (let i = 0; i < bays; i++) {
    const u = step * (i + 0.5);
    for (let lv = 0; lv < levels; lv++) {
      const y0 = baseY + lv * height + sillH;
      const isGround = lv === 0;
      if (isGround && archGround) {
        archWindow(batch, M, f, u, y0 - 0.1, winW + 0.25, winH + 0.55, { sill: false });
      } else if (archAll) {
        archWindow(batch, M, f, u, y0, winW, winH);
      } else {
        rectWindow(batch, M, f, u, y0, winW, winH);
      }
    }
  }

  // pilasters between the bays
  if (pilaster) {
    for (let i = 0; i <= bays; i++) {
      const u = i * step;
      const q = inFrame(f, u, 0.13);
      batch.box(M.stone, 0.46, levels * height - 0.3, 0.3, q.x, baseY + (levels * height) / 2, q.z, q.ry);
      // capital and base blocks
      batch.box(M.stone, 0.56, 0.2, 0.36, q.x, baseY + levels * height - 0.35, q.z, q.ry);
      batch.box(M.stone, 0.54, 0.26, 0.34, q.x, baseY + 0.78, q.z, q.ry);
    }
  }

  // cornice + parapet
  if (cornice) {
    const q = inFrame(f, L / 2, 0.1);
    const top = baseY + levels * height;
    batch.box(M.stone, L + 0.16, 0.3, thick + 0.5, q.x, top + 0.06, q.z, q.ry);
    batch.box(M.stone, L + 0.06, 0.16, thick + 0.34, q.x, top - 0.12, q.z, q.ry);
  }
  if (parapet) {
    const q = inFrame(f, L / 2, 0.06);
    const top = baseY + levels * height + 0.2;
    batch.box(M.plasterWarm, L, 0.95, thick - 0.05, q.x, top + 0.48, q.z, q.ry);
    batch.box(M.stone, L + 0.1, 0.16, thick + 0.14, q.x, top + 1.0, q.z, q.ry);
  }
}

/* --------------------------------------------------------------- rotunda */
function rotunda(batch, M, group) {
  const r = R.r, hall = R.hall;
  const levels = 4, h = 3.6;

  // outer drum wall, built as 48 segments so window openings can be cut by omission
  const seg = 64;
  const bays = 20;
  const bayAng = 360 / bays;
  const winW = 1.5, winH = 2.2;

  for (let s = 0; s < seg; s++) {
    const a0 = (s / seg) * 360, a1 = ((s + 1) / seg) * 360;
    const mid = (a0 + a1) / 2;
    const p = polar(mid * DEG, r - 0.25);
    const ry = Math.atan2(Math.sin(mid * DEG), -Math.cos(mid * DEG));
    const w = (2 * Math.PI * r / seg) * 1.02;
    // skip segments that fall inside a window opening or main south entrance (180 deg)
    const rel = ((mid % bayAng) + bayAng) % bayAng;
    const inWindow = Math.abs(rel - bayAng / 2) < (winW / (2 * Math.PI * r)) * 360 * 0.62;
    const inSouthEntry = Math.abs(mid - 180) < 15;
    const inWestPassage = Math.abs(mid - 270) < 14;
    const inWingPassage = Math.abs(mid - 41) < 14;
    for (let lv = 0; lv < levels; lv++) {
      if (lv === 0 && (inSouthEntry || inWestPassage || inWingPassage)) continue;
      if (lv > 0 && (inWestPassage || inWingPassage)) continue;
      if (inWindow) continue;          // openings are filled by the window pass below
      batch.box(M.plaster, w, h, 0.55, p.x, lv * h + h / 2, p.z, ry);
    }
  }

  // windows on the drum, aligned to the bay rhythm
  for (let i = 0; i < bays; i++) {
    const a = (i + 0.5) * bayAng;
    const azr = a * DEG;
    const pIn = polar(azr, r - 0.55);
    const ry = Math.atan2(Math.sin(azr), -Math.cos(azr));
    const isSouthEntry = Math.abs(a - 180) < 15;
    const isWestPassage = Math.abs(a - 270) < 14;
    const isWingPassage = Math.abs(a - 41) < 14;
    for (let lv = 0; lv < levels; lv++) {
      if (lv === 0 && (isSouthEntry || isWestPassage || isWingPassage)) continue;
      if (lv > 0 && (isWestPassage || isWingPassage)) continue;
      const y0 = lv * h + 0.95;
      // recess
      batch.box(M.metalDark, winW, winH, 0.4, pIn.x, y0 + winH / 2, pIn.z, ry);
      const pg = polar(azr, r - 0.42);
      batch.box(M.glassTint, winW - 0.08, winH - 0.08, 0.05, pg.x, y0 + winH / 2, pg.z, ry);
      // surround
      for (const sgn of [-1, 1]) {
        const off = sgn * (winW / 2 + 0.09);
        const q = polar(azr + off / r, r - 0.3);
        batch.box(M.stone, 0.18, winH + 0.2, 0.2, q.x, y0 + winH / 2, q.z, ry);
      }
      const qs = polar(azr, r - 0.28);
      batch.box(M.stone, winW + 0.4, 0.14, 0.3, qs.x, y0 - 0.06, qs.z, ry);
      // arch head on the first level
      if (lv === 0) {
        const arc = new THREE.TorusGeometry(winW / 2 + 0.09, 0.08, 6, 16, Math.PI);
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(qs.x, y0 + winH, qs.z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
          new THREE.Vector3(1, 1, 1));
        batch.add(arc, M.stone, m);
      }
    }
  }

  // plinth ring and string courses
  const ring = (radius, y, hh, mat, inset = 0) => {
    const g = new THREE.CylinderGeometry(radius, radius, hh, 72, 1, true);
    batch.add(g, mat, new THREE.Matrix4().makeTranslation(0, y, 0));
  };
  ring(r + 0.08, 0.3, 0.6, M.graniteDark);
  for (let lv = 1; lv < levels; lv++) ring(r + 0.1, lv * h, 0.22, M.stone);
  ring(r + 0.16, levels * h + 0.1, 0.34, M.stone);
  ring(r + 0.02, levels * h + 0.5, 1.0, M.plasterWarm);
  ring(r + 0.1, levels * h + 1.02, 0.16, M.stone);

  /* glass drum with mullions, 14.4 -> 18.3 */
  const drumY0 = levels * h + 1.1, drumH = 3.9, drumR = r - 0.5;
  ring(drumR, drumY0 + drumH / 2, drumH, M.glass, 0);
  // solid inner core so you do not see through the drum into the roof
  const core = new THREE.CylinderGeometry(drumR - 0.9, drumR - 0.9, drumH, 48, 1, true);
  batch.add(core, M.plaster, new THREE.Matrix4().makeTranslation(0, drumY0 + drumH / 2, 0));
  // mullions
  const mull = 34;
  for (let i = 0; i < mull; i++) {
    const a = (i / mull) * Math.PI * 2;
    const p = polar(a, drumR);
    batch.box(M.metalWhite, 0.12, drumH, 0.2, p.x, drumY0 + drumH / 2, p.z, Math.atan2(Math.sin(a), -Math.cos(a)));
  }
  for (const yy of [drumY0 + 0.06, drumY0 + drumH * 0.52, drumY0 + drumH - 0.06]) {
    const g = new THREE.CylinderGeometry(drumR + 0.06, drumR + 0.06, 0.16, 64, 1, true);
    batch.add(g, M.metalWhite, new THREE.Matrix4().makeTranslation(0, yy, 0));
  }

  /* white attic with the sign band */
  const atticY0 = drumY0 + drumH;
  ring(drumR + 0.25, atticY0 + 0.45, 0.9, M.stone);
  ring(drumR + 0.15, atticY0 + 1.0, 0.2, M.stone);
  // blue sign fascia
  const fasciaH = 0.72;
  const fascia = new THREE.CylinderGeometry(drumR + 0.02, drumR + 0.02, fasciaH, 64, 1, true);
  batch.add(fascia, M.signBlue, new THREE.Matrix4().makeTranslation(0, atticY0 + 1.62, 0));
  ring(drumR + 0.22, atticY0 + 1.26, 0.14, M.stone);
  ring(drumR + 0.22, atticY0 + 1.98, 0.16, M.stone);
  // shallow dome cap seated flush on the cornice
  const capR = drumR + 0.2;
  const capTheta = Math.PI / 2.6;
  const cap = new THREE.SphereGeometry(capR, 48, 12, 0, Math.PI * 2, 0, capTheta);
  batch.add(cap, M.roof, new THREE.Matrix4().makeTranslation(0, atticY0 + 2.0 - capR * Math.cos(capTheta), 0));
  ring(drumR + 0.06, atticY0 + 2.06, 0.14, M.metalWhite);

  /* sign texture wrapped on the fascia, front (south) side */
  const signTex = makeSignTexture();
  const signMat = new THREE.MeshBasicMaterial({ map: signTex, transparent: true, depthWrite: false, toneMapped: false });
  const signGeo = new THREE.CylinderGeometry(drumR + 0.035, drumR + 0.035, fasciaH * 0.86, 64, 1, true, -Math.PI * 0.46, Math.PI * 0.92);
  const sign = new THREE.Mesh(signGeo, signMat);
  sign.position.y = atticY0 + 1.62;
  sign.rotation.y = 0;         // face south (+Z)
  group.add(sign);

  return { atticY0, drumY0 };
}

function makeSignTexture() {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#0a4b8f'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = 'rgba(255,255,255,0.10)';
  for (let i = 0; i < 40; i++) x.fillRect(0, i * 7, c.width, 2);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#ffffff';
  x.font = '600 132px "Segoe UI", Arial, sans-serif';
  x.letterSpacing = '10px';
  x.fillText('ИНТЕРГАЗ', c.width / 2, 118);
  x.font = '400 42px "Segoe UI", Arial, sans-serif';
  x.fillStyle = 'rgba(255,255,255,0.86)';
  x.fillText('ЦЕНТРАЛЬНАЯ АЗИЯ', c.width / 2, 204);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* --------------------------------------------------------------- masses */
function blockMass(batch, M) {
  // rectangular block west of the rotunda
  const x0 = B.x0, x1 = B.x1, z0 = B.z0, z1 = B.z1;
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const levels = 4, h = 3.6;
  for (let lv = 0; lv < levels; lv++) {
    batch.box(M.plaster, w, h, d, cx, lv * h + h / 2, cz);
  }
  batch.box(M.graniteDark, w + 0.2, 0.62, d + 0.2, cx, 0.31, cz);
  for (let lv = 1; lv < levels; lv++) batch.box(M.stone, w + 0.16, 0.22, d + 0.16, cx, lv * h, cz);
  batch.box(M.stone, w + 0.5, 0.34, d + 0.5, cx, levels * h + 0.08, cz);
  batch.box(M.plasterWarm, w - 0.1, 0.95, d - 0.1, cx, levels * h + 0.62, cz);
  batch.box(M.stone, w + 0.2, 0.16, d + 0.2, cx, levels * h + 1.12, cz);

  // south elevation (faces the street) — arched ground floor, tall windows above
  const south = frame(x0, z1, x1, z1);
  facade(batch, M, south, { levels, bay: 3.7, winW: 1.6, winH: 2.2, archGround: true, plinth: false, cornice: false, parapet: false, trim: false, pilaster: true });
  // north elevation — simpler
  const north = frame(x1, z0, x0, z0);
  facade(batch, M, north, { levels, bay: 3.9, winW: 1.45, winH: 1.95, plinth: false, cornice: false, parapet: false, trim: false, pilaster: false });
  // west end
  const west = frame(x0, z0, x0, z1);
  facade(batch, M, west, { levels, bay: 3.6, winW: 1.4, winH: 2.0, plinth: false, cornice: false, parapet: false, trim: false, pilaster: true });
  // east end meets the rotunda: leave solid, just a strip of windows above the drum
  const east = frame(x1, z1, x1, z0);
  facade(batch, M, east, { levels, bay: 3.4, winW: 1.3, winH: 1.9, plinth: false, cornice: false, parapet: false, trim: false, pilaster: false });

  // roof clutter
  const rnd = mulberry32(77);
  for (let i = 0; i < 7; i++) {
    const bx = x0 + 3 + rnd() * (w - 6), bz = z0 + 2 + rnd() * (d - 4);
    const bw = 1.2 + rnd() * 1.6, bd = 1.0 + rnd() * 1.2, bh = 0.7 + rnd() * 0.6;
    batch.box(M.concrete, bw, bh, bd, bx, levels * h + 1.2 + bh / 2, bz);
  }
  // flagpoles on the parapet, three of them as in the photographs
  for (let i = 0; i < 3; i++) {
    const fx = x0 + 7 + i * 5.2, fz = z1 + 1.6;
    batch.cyl(M.metalWhite, 0.045, 0.055, 9, 8, fx, 4.5, fz);
    batch.box(M.stone, 0.5, 0.22, 0.5, fx, 0.11, fz);
  }
}

function wingMass(batch, M) {
  const a = W.az;
  const ax = Math.sin(a), az = -Math.cos(a);        // along the wing
  const nx = Math.cos(a), nz = Math.sin(a);         // across it
  const half = W.half, s0 = W.s0, s1 = W.s1;
  const cx = ax * (s0 + s1) / 2, cz = az * (s0 + s1) / 2;
  const len = s1 - s0, ry = Math.atan2(ax, az);

  const levels = 4, h = 3.6;
  for (let lv = 0; lv < levels; lv++) {
    batch.box(M.plaster, half * 2, h, len, cx, lv * h + h / 2, cz, ry);
  }
  batch.box(M.graniteDark, half * 2 + 0.2, 0.62, len + 0.2, cx, 0.31, cz, ry);
  for (let lv = 1; lv < levels; lv++) batch.box(M.stone, half * 2 + 0.16, 0.22, len + 0.16, cx, lv * h, cz, ry);
  batch.box(M.stone, half * 2 + 0.5, 0.34, len + 0.5, cx, levels * h + 0.08, cz, ry);
  batch.box(M.plasterWarm, half * 2 - 0.1, 0.95, len - 0.1, cx, levels * h + 0.62, cz, ry);
  batch.box(M.stone, half * 2 + 0.2, 0.16, len + 0.2, cx, levels * h + 1.12, cz, ry);

  // two long elevations (wound CCW so outward normals point away from wing)
  const p0 = { x: ax * s0 + nx * half, z: az * s0 + nz * half };
  const p1 = { x: ax * s1 + nx * half, z: az * s1 + nz * half };
  const p2 = { x: ax * s1 - nx * half, z: az * s1 - nz * half };
  const p3 = { x: ax * s0 - nx * half, z: az * s0 - nz * half };
  facade(batch, M, frame(p1.x, p1.z, p0.x, p0.z), { levels, bay: 3.8, winW: 1.5, winH: 2.05, plinth: false, cornice: false, parapet: false, trim: false, archGround: true });
  facade(batch, M, frame(p3.x, p3.z, p2.x, p2.z), { levels, bay: 3.9, winW: 1.4, winH: 1.95, plinth: false, cornice: false, parapet: false, trim: false });
  // far end
  facade(batch, M, frame(p2.x, p2.z, p1.x, p1.z), { levels, bay: 3.5, winW: 1.35, winH: 1.95, plinth: false, cornice: false, parapet: false, trim: false });

  // roof plant
  batch.box(M.concrete, 2.6, 1.1, 2.0, ax * (s1 - 5), levels * h + 1.7, az * (s1 - 5), ry);
  batch.box(M.metalDark, 0.9, 2.2, 0.9, ax * (s0 + 6) + nx * 3, levels * h + 2.2, az * (s0 + 6) + nz * 3, ry);
}

function galleryMass(batch, M) {
  /* the low curved entrance gallery wrapping the south side of the rotunda:
     open glazed vestibule in the centre (164..196 deg) so the walker enters straight from the stair */
  const r0 = G.r0, r1 = G.r1, a0 = G.a0 * DEG, a1 = G.a1 * DEG;
  const h = G.h;
  const seg = 26;
  for (let i = 0; i < seg; i++) {
    const t0 = a0 + ((a1 - a0) * i) / seg, t1 = a0 + ((a1 - a0) * (i + 1)) / seg;
    const tm = (t0 + t1) / 2;
    const deg = tm / DEG;
    const rm = (r0 + r1) / 2;
    const p = polar(tm, rm);
    const pOut = polar(tm, r1 - 0.18);
    const w = Math.hypot(polar(t1, r1).x - polar(t0, r1).x, polar(t1, r1).z - polar(t0, r1).z) * 1.05;
    const ry = Math.atan2(Math.sin(tm), -Math.cos(tm));
    // roof slab of the gallery runs continuously
    batch.box(M.stone, w, 0.36, r1 - r0 + 0.5, p.x, h - 0.18, p.z, ry);
    // side wings of the gallery have glazed storefront; centre (170..190) is open entry portal
    if (Math.abs(deg - 180) > 12) {
      batch.box(M.glassTint, w * 0.96, h - 0.6, 0.08, pOut.x, (h - 0.6) / 2 + 0.1, pOut.z, ry);
      batch.box(M.metalDark, 0.08, h - 0.5, 0.12, pOut.x, (h - 0.5) / 2 + 0.1, pOut.z, ry);
    }
  }
  // entrance glass door frame posts flanking the central portal
  for (const sgn of [-1, 1]) {
    const t = (180 + sgn * 12) * DEG;
    const p = polar(t, r1 - 0.18);
    batch.box(M.metalDark, 0.18, h - 0.4, 0.24, p.x, (h - 0.4) / 2, p.z, Math.atan2(Math.sin(t), -Math.cos(t)));
  }
  // parapet ring with stone coping
  const ringSeg = 40;
  for (let i = 0; i < ringSeg; i++) {
    const t0 = a0 + ((a1 - a0) * i) / ringSeg, t1 = a0 + ((a1 - a0) * (i + 1)) / ringSeg;
    const tm = (t0 + t1) / 2, rm = r1 - 0.2;
    const p = polar(tm, rm);
    const w = Math.hypot(polar(t1, r1).x - polar(t0, r1).x, polar(t1, r1).z - polar(t0, r1).z) * 1.08;
    const ry = Math.atan2(Math.sin(tm), -Math.cos(tm));
    batch.box(M.plasterWarm, w, 0.9, 0.42, p.x, h + 0.45, p.z, ry);
    batch.box(M.stone, w + 0.06, 0.16, 0.54, p.x, h + 0.98, p.z, ry);
    const nb = Math.max(2, Math.round(w / 0.36));
    for (let k = 0; k < nb; k++) {
      const tt = t0 + (t1 - t0) * ((k + 0.5) / nb);
      const q = polar(tt, r1 - 0.2);
      batch.cyl(M.stone, 0.055, 0.075, 0.56, 6, q.x, h + 0.4, q.z);
    }
  }
  // columns along the outer edge of the gallery (leave central portal clear)
  const ncol = 8;
  for (let i = 0; i < ncol; i++) {
    const t = a0 + ((a1 - a0) * (i + 0.5)) / ncol;
    if (Math.abs(t / DEG - 180) < 10) continue;
    const p = polar(t, r1 - 0.55);
    batch.cyl(M.stone, 0.24, 0.28, h - 0.4, 14, p.x, (h - 0.4) / 2, p.z);
    batch.box(M.stone, 0.58, 0.18, 0.58, p.x, h - 0.44, p.z, Math.atan2(Math.sin(t), -Math.cos(t)));
    batch.box(M.stone, 0.62, 0.18, 0.62, p.x, 0.09, p.z, Math.atan2(Math.sin(t), -Math.cos(t)));
  }
  // floor slab of the gallery bridging rotunda hall (r=8.55) to outer edge (r1=19.4)
  const floorSeg = 24;
  for (let i = 0; i < floorSeg; i++) {
    const t0 = a0 + ((a1 - a0) * i) / floorSeg, t1 = a0 + ((a1 - a0) * (i + 1)) / floorSeg;
    const tm = (t0 + t1) / 2, rm = (R.hall + r1) / 2;
    const p = polar(tm, rm);
    const w = Math.hypot(polar(t1, r1).x - polar(t0, r1).x, polar(t1, r1).z - polar(t0, r1).z) * 1.06;
    const ry = Math.atan2(Math.sin(tm), -Math.cos(tm));
    batch.box(M.marble, w, 0.16, (r1 - R.hall) + 0.5, p.x, -0.08, p.z, ry);
  }
}

/* ----------------------------------------------------------- grand stair */
function stair(batch, M, colliders) {
  const az = LAYOUT.entry.az * DEG;
  const dirX = Math.sin(az), dirZ = -Math.cos(az);
  const width = LAYOUT.entry.width;
  const steps = LAYOUT.entry.steps;
  const rise = PODIUM / steps, run = 0.46;
  const startR = G.r1 + 0.2;

  for (let i = 0; i < steps; i++) {
    const y = (steps - i) * rise;
    const r = startR + i * run;
    const p = polar(az, r);
    const ry = Math.atan2(dirX, dirZ);
    // tread
    batch.box(M.granite, width, 0.16, run + 0.06, p.x, y - 0.08, p.z, ry);
    // riser face
    batch.box(M.graniteDark, width, rise, 0.16, p.x, y - rise / 2, p.z, ry);
    // cheek walls
    for (const sgn of [-1, 1]) {
      const q = polar(az + (sgn * (width / 2 + 0.35)) / r, r);
      batch.box(M.granite, 0.7, 0.5 + rise, run + 0.06, q.x, y - 0.08 + (0.5 + rise) / 2 - 0.4, q.z, ry);
    }
  }
  // landing at the bottom
  const lp = polar(az, startR + steps * run + 1.4);
  batch.box(M.paving, width + 5, 0.12, 3.2, lp.x, 0.06, lp.z, Math.atan2(dirX, dirZ));

  // collider for the stair so the walker climbs it
  colliders.push({ type: 'ramp', az, r0: startR, r1: startR + steps * run, width, y0: 0, y1: PODIUM });
}

/* ---------------------------------------------------------------- roof */
function roof(batch, M) {
  const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
  batch.box(M.roof, B.x1 - B.x0, 0.2, B.z1 - B.z0, cx, ROOF + 0.02, cz);
}

/* ------------------------------------------------------------ assemble */
export function buildBuilding(scene, M, colliders) {
  const group = new THREE.Group();
  group.name = 'building';
  const batch = new Batch();

  rotunda(batch, M, group);
  blockMass(batch, M);
  wingMass(batch, M);
  galleryMass(batch, M);
  roof(batch, M);

  batch.build(group, { cast: true, receive: true, name: 'facade' });

  // the plinth skirt from the forecourt (y=0) up to the entrance floor (y=PODIUM)
  const skirtGroup = new THREE.Group();
  skirtGroup.name = 'skirt';
  const skirt = new Batch();
  skirt.add(new THREE.CylinderGeometry(G.r1 + 0.1, G.r1 + 0.2, PODIUM, 64, 1, false, Math.PI * 0.58, Math.PI * 0.84), M.graniteDark, new THREE.Matrix4().makeTranslation(0, PODIUM / 2, 0));
  skirt.add(new THREE.CylinderGeometry(R.r + 0.15, R.r + 0.25, PODIUM, 64), M.graniteDark, new THREE.Matrix4().makeTranslation(0, PODIUM / 2, 0));
  skirt.box(M.graniteDark, B.x1 - B.x0 + 1.0, PODIUM, B.z1 - B.z0 + 1.0, (B.x0 + B.x1) / 2, PODIUM / 2, (B.z0 + B.z1) / 2);
  {
    const a = W.az, ax = Math.sin(a), az = -Math.cos(a);
    skirt.box(M.graniteDark, (W.half + 0.4) * 2, PODIUM, W.s1 - W.s0 + 0.8, ax * (W.s0 + W.s1) / 2, PODIUM / 2, az * (W.s0 + W.s1) / 2, Math.atan2(ax, az));
  }
  skirt.build(skirtGroup, { cast: false, receive: true, name: 'skirt' });
  scene.add(skirtGroup);

  // the entrance stair stays at ground level and climbs to the podium
  const stairGroup = new THREE.Group();
  stairGroup.name = 'stair';
  const sb = new Batch();
  stair(sb, M, colliders);
  sb.build(stairGroup, { cast: true, receive: true, name: 'stair' });
  scene.add(stairGroup);

  group.position.y = PODIUM;

  // Walkable floor regions at podium level (rotunda + gallery + block + wing)
  colliders.push({ type: 'floorCircle', x: 0, z: 0, r: G.r1 + 0.2, y: PODIUM });
  colliders.push({ type: 'floorRect', x0: B.x0, x1: B.x1, z0: B.z0, z1: B.z1, y: PODIUM });

  // Shell wall colliders with openings so the walker can enter the rotunda hall via the south portal
  const wallSegs = 24;
  for (let i = 0; i < wallSegs; i++) {
    const mid = ((i + 0.5) / wallSegs) * 360;
    // leave south entry (180 deg) open
    if (Math.abs(mid - 180) < 16) continue;
    const p = polar(mid * DEG, R.r - 0.35);
    colliders.push({ type: 'circle', x: p.x, z: p.z, r: 1.45, y0: PODIUM, y1: ROOF + PODIUM });
  }
  // West block & wing exterior colliders (outside rotunda)
  colliders.push({ type: 'rect', x0: B.x0, x1: B.x1, z0: B.z0, z1: B.z1, y0: 0, y1: ROOF + PODIUM });
  {
    const a = W.az, ax = Math.sin(a), az = -Math.cos(a), nx = Math.cos(a), nz = Math.sin(a);
    const half = W.half;
    const pts = [
      [ax * (W.s0 + 5.5) + nx * half, az * (W.s0 + 5.5) + nz * half],
      [ax * W.s1 + nx * half, az * W.s1 + nz * half],
      [ax * W.s1 - nx * half, az * W.s1 - nz * half],
      [ax * (W.s0 + 5.5) - nx * half, az * (W.s0 + 5.5) - nz * half],
    ];
    colliders.push({ type: 'poly', pts, y0: 0, y1: ROOF + PODIUM });
  }

  scene.add(group);
  return group;
}

/* ------------------------------------------------------------ interiors */
/* Interior slabs and walls are generated here too: they share the plan grid. */
export function buildInteriorShell(scene, M) {
  const group = new THREE.Group();
  group.name = 'interior-shell';
  group.position.y = PODIUM;
  const batch = new Batch();

  const levels = [0, 3.6, 7.2, 10.8];
  // floor slabs
  for (let i = 0; i < levels.length; i++) {
    const y = levels[i];
    batch.box(M.marble, B.x1 - B.x0, 0.24, B.z1 - B.z0, (B.x0 + B.x1) / 2, y - 0.12, (B.z0 + B.z1) / 2);
    if (i === 0) {
      const disc = new THREE.CylinderGeometry(R.hall, R.hall, 0.24, 64);
      batch.add(disc, M.marble, new THREE.Matrix4().makeTranslation(0, y - 0.12, 0));
    } else {
      // upper levels have a central stairwell opening (r = 3.7m) for the spiral stair
      const ring = new THREE.RingGeometry(3.7, R.hall, 64);
      ring.rotateX(-Math.PI / 2);
      batch.add(ring, M.marble, new THREE.Matrix4().makeTranslation(0, y, 0));
    }
    // wing floor
    const a = W.az, ax = Math.sin(a), az = -Math.cos(a);
    batch.box(M.marble, W.half * 2, 0.24, W.s1 - W.s0, ax * (W.s0 + W.s1) / 2, y - 0.12, az * (W.s0 + W.s1) / 2, Math.atan2(ax, az));
  }
  // basement slab and walls
  batch.box(M.concrete, B.x1 - B.x0, 0.3, B.z1 - B.z0, (B.x0 + B.x1) / 2, -3.3, (B.z0 + B.z1) / 2);
  batch.add(new THREE.CylinderGeometry(R.hall, R.hall, 0.3, 48), M.concrete, new THREE.Matrix4().makeTranslation(0, -3.3, 0));

  // ceilings on the top level
  batch.box(M.ceiling, B.x1 - B.x0, 0.06, B.z1 - B.z0, (B.x0 + B.x1) / 2, ROOF - 0.06, (B.z0 + B.z1) / 2);
  batch.add(new THREE.CylinderGeometry(R.hall, R.hall, 0.06, 64), M.ceiling, new THREE.Matrix4().makeTranslation(0, ROOF - 0.06, 0));

  batch.build(group, { cast: false, receive: true, name: 'shell' });
  scene.add(group);
  return group;
}
