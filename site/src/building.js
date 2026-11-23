/* The building: rotunda with classical porticus (NO dome!), block wing, angled wing,
   curved entrance gallery with granite stair, radio relay tower.
   Fully rewritten to match the REAL UMG Uralsk (ICA) building from photographs.
   NO fake dome. White classical portico with 4 columns, 3-storey bronze panoramic
   glazing, blue sign frieze, tall red-white lattice radio tower behind.
   Open passages from rotunda into block (az 270°) and wing (az 41°).
   Annular balcony floors in rotunda (atrium). */

import * as THREE from 'three';
import { Batch, DEG, LAYOUT, FLOOR, ROOF, ATTIC, PODIUM, polar, clamp, mulberry32, cachedMaterial, addRotundaRing } from './core.js';

const R = LAYOUT.rotunda;
const B = LAYOUT.block;
const W = LAYOUT.wing;
const G = LAYOUT.gallery;

/* ---------------------------------------------------------------- helpers */
function frame(x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len;
  return { x0, z0, ux, uz, nx: -uz, nz: ux, len };
}

function inFrame(f, u, v) {
  return { x: f.x0 + f.ux * u + f.nx * v, z: f.z0 + f.uz * u + f.nz * v, ry: Math.atan2(-f.uz, f.ux) };
}

/* --------------------------------------------------------------- windows */
/* Tall arched window pair for the wings — 3-storey height with bronze glass */
function tallArchedVitrage(batch, M, f, u, baseY, w, totalH) {
  const p = inFrame(f, u, 0.02);
  const pg = inFrame(f, u, 0.08);
  const ry = p.ry;
  // Hollow 4-side dark frame (so glass is transparent from inside too)
  const ft = 0.08;
  for (const sgn of [-1, 1]) {
    const q = inFrame(f, u + sgn * (w / 2 + ft / 2), 0.02);
    batch.box(M.metalDark, ft, totalH, 0.32, q.x, baseY + totalH / 2, q.z, ry);
  }
  batch.box(M.metalDark, w + ft * 2, ft, 0.32, p.x, baseY + ft / 2, p.z, ry);
  batch.box(M.metalDark, w + ft * 2, ft, 0.32, p.x, baseY + totalH - ft / 2, p.z, ry);
  // Bronze tinted glass — reflective, NOT black holes
  batch.box(M.glassBronze, w - 0.04, totalH - 0.12, 0.04, pg.x, baseY + totalH / 2, pg.z, ry);
  // Mullion grid (horizontal transom bars every floor height)
  for (let lv = 0; lv < 3; lv++) {
    const q = inFrame(f, u, 0.11);
    batch.box(M.metalWhite, w + 0.06, 0.08, 0.1, q.x, baseY + lv * 3.6, q.z, ry);
  }
  // Vertical mullions
  const nMull = 3;
  for (let k = 0; k <= nMull; k++) {
    const mu = u + (k / nMull - 0.5) * w;
    const q = inFrame(f, mu, 0.11);
    batch.box(M.metalWhite, 0.06, totalH - 0.1, 0.08, q.x, baseY + totalH / 2, q.z, ry);
  }
  // White column surrounds on each side
  for (const sgn of [-1, 1]) {
    const cu = u + sgn * (w / 2 + 0.22);
    const q = inFrame(f, cu, 0.14);
    batch.cyl(M.stone, 0.14, 0.16, totalH + 0.2, 10, q.x, baseY + totalH / 2, q.z);
    // Capital
    batch.box(M.stone, 0.42, 0.18, 0.42, q.x, baseY + totalH + 0.1, q.z, ry);
    // Base
    batch.box(M.stone, 0.4, 0.2, 0.4, q.x, baseY + 0.1, q.z, ry);
  }
  // Arch head
  const archRad = w / 2 + 0.1;
  const arc = new THREE.TorusGeometry(archRad, 0.1, 6, 18, Math.PI);
  const pa = inFrame(f, u, 0.12);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(pa.x, baseY + totalH, pa.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    new THREE.Vector3(1, 1, 1));
  batch.add(arc, M.stone, m);
  // Arch glass fill
  const headGeo = new THREE.CylinderGeometry(w / 2 - 0.03, w / 2 - 0.03, 0.05, 20, 1, false, 0, Math.PI);
  const qHead = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0))
    .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)));
  const hm = new THREE.Matrix4().compose(
    new THREE.Vector3(pg.x, baseY + totalH, pg.z), qHead, new THREE.Vector3(1, 1, 1));
  batch.add(headGeo, M.glassBronze, hm);
}

/* Regular window with hollow frame, reflective glass, sill, and visible white crossbars */
function rectWindow(batch, M, f, u, y0, w, h, opts = {}) {
  const { depth = 0.26, glassMat = M.glassTint, frameMat = M.stone } = opts;
  const p = inFrame(f, u, -0.04);
  const pg = inFrame(f, u, 0.04);
  const ft = 0.055;
  // Hollow 4-side dark sash frame (clear opening for glass — visible from both sides)
  for (const sgn of [-1, 1]) {
    const qj = inFrame(f, u + sgn * (w / 2 - ft / 2), -0.04);
    batch.box(M.metalDark, ft, h, depth, qj.x, y0 + h / 2, qj.z, p.ry);
  }
  batch.box(M.metalDark, w, ft, depth, p.x, y0 + ft / 2, p.z, p.ry);
  batch.box(M.metalDark, w, ft, depth, p.x, y0 + h - ft / 2, p.z, p.ry);
  // Reflective tinted glass pane
  batch.box(glassMat, w - ft * 2, h - ft * 2, 0.03, pg.x, y0 + h / 2, pg.z, p.ry);
  // Window frame / nalichnik (exterior)
  const sw = 0.12;
  for (const sgn of [-1, 1]) {
    const q = inFrame(f, u + sgn * (w / 2 + sw / 2), 0.10);
    batch.box(frameMat, sw, h + sw * 2, 0.2, q.x, y0 + h / 2, q.z, q.ry);
  }
  for (const yy of [y0 - sw / 2, y0 + h + sw / 2]) {
    const q = inFrame(f, u, 0.10);
    batch.box(frameMat, w + sw * 2, sw, 0.2, q.x, yy, q.z, q.ry);
  }
  // Exterior sill
  const q = inFrame(f, u, 0.14);
  batch.box(M.stone, w + 0.34, 0.12, 0.3, q.x, y0 - 0.06, q.z, q.ry);
  // Interior white window sill
  const qi = inFrame(f, u, -0.22);
  batch.box(M.stone, w + 0.18, 0.06, 0.22, qi.x, y0 - 0.03, qi.z, qi.ry);
  // White crossbars (horizontal transom + vertical mullion, proud of glass on both sides)
  batch.box(M.metalWhite, w - 0.08, 0.055, 0.08, pg.x, y0 + h * 0.56, pg.z, p.ry);
  batch.box(M.metalWhite, 0.055, h - 0.08, 0.08, pg.x, y0 + h / 2, pg.z, p.ry);
}

/* ------------------------------------------------------------ wall panel */
function facade(batch, M, f, opts = {}) {
  const {
    levels = 4, height = 3.6,
    bay = 3.6, winW = 1.55, winH = 2.15, sillH = 0.95,
    pilaster = true, tallArch = false, tallArchBays = [],
    cornice = true, parapet = true, trim = true, baseY = 0, plinth = true,
    skipBays = [], buildWalls = true, buildInnerLining = true,
  } = opts;

  const L = f.len;
  const bays = Math.max(1, Math.round(L / bay));
  const step = L / bays;

  // Perimeter-only Plinth (never fills interior!)
  if (plinth) {
    const q = inFrame(f, L / 2, 0.04);
    batch.box(M.graniteDark, L + 0.16, 0.62, 0.34, q.x, baseY + 0.31, q.z, q.ry);
  }

  // Perimeter-only String courses between levels (never fills interior!)
  if (trim) {
    for (let i = 1; i < levels; i++) {
      const q = inFrame(f, L / 2, 0.06);
      batch.box(M.stone, L + 0.16, 0.22, 0.36, q.x, baseY + i * height, q.z, q.ry);
    }
  }

  // Helper to stamp wall pier/spandrel for both exterior M.plaster and interior M.plasterWall
  const wallBox = (uCenter, yCenter, bw, bh) => {
    if (bw <= 0.01 || bh <= 0.01) return;
    if (buildWalls) {
      const qe = inFrame(f, uCenter, -0.09);
      batch.box(M.plaster, bw, bh, 0.18, qe.x, yCenter, qe.z, qe.ry);
    }
    if (buildInnerLining) {
      const qi = inFrame(f, uCenter, -0.25);
      batch.box(M.plasterWall, bw, bh, 0.12, qi.x, yCenter, qi.z, qi.ry);
    }
  };

  // Window bays + perforated exterior & interior wall shells
  for (let i = 0; i < bays; i++) {
    const u = step * (i + 0.5);
    if (skipBays.includes(i)) {
      if (buildWalls || buildInnerLining) {
        wallBox(u, baseY + (levels * height) / 2, step + 0.02, levels * height);
      }
      continue;
    }
    if (tallArch && tallArchBays.includes(i)) {
      const aw = winW + 0.6;
      const totalH = (levels - 1) * height + winH;
      const pierW = Math.max(0, (step - aw) / 2);
      // Piers flanking the tall arched vitrage (all levels)
      if (pierW > 0.02) {
        const fullH = levels * height;
        wallBox(u - aw / 2 - pierW / 2, baseY + fullH / 2, pierW + 0.02, fullH);
        wallBox(u + aw / 2 + pierW / 2, baseY + fullH / 2, pierW + 0.02, fullH);
      }
      // Spandrel below ground sill
      wallBox(u, baseY + sillH / 2, aw + 0.02, sillH);
      // Spandrel above top of arch
      const topH = levels * height - (sillH + totalH);
      if (topH > 0.02) {
        wallBox(u, baseY + sillH + totalH + topH / 2, aw + 0.02, topH);
      }
      // Full 3-storey arched vitrage
      tallArchedVitrage(batch, M, f, u, baseY + sillH, aw, totalH);
    } else {
      const pierW = Math.max(0, (step - winW) / 2);
      const lintelH = height - sillH - winH;
      for (let lv = 0; lv < levels; lv++) {
        const ly = baseY + lv * height;
        const y0 = ly + sillH;
        // Left & right piers
        if (pierW > 0.02) {
          wallBox(u - winW / 2 - pierW / 2, ly + height / 2, pierW + 0.02, height);
          wallBox(u + winW / 2 + pierW / 2, ly + height / 2, pierW + 0.02, height);
        }
        // Spandrel below sill
        wallBox(u, ly + sillH / 2, winW + 0.04, sillH);
        // Spandrel above window
        if (lintelH > 0.02) {
          wallBox(u, y0 + winH + lintelH / 2, winW + 0.04, lintelH);
        }
        rectWindow(batch, M, f, u, y0, winW, winH);
      }
    }
  }

  // Pilasters between the bays (white rusticated pilasters)
  if (pilaster) {
    for (let i = 0; i <= bays; i++) {
      const u = i * step;
      const q = inFrame(f, u, 0.13);
      batch.box(M.stone, 0.46, levels * height - 0.3, 0.3, q.x, baseY + (levels * height) / 2, q.z, q.ry);
      // Rustication strips
      for (let r = 0; r < Math.floor(levels * height / 0.65); r++) {
        const ry2 = baseY + 0.4 + r * 0.65;
        if (ry2 > baseY + levels * height - 0.5) break;
        const qr = inFrame(f, u, 0.17);
        batch.box(M.stone, 0.5, 0.06, 0.08, qr.x, ry2, qr.z, qr.ry);
      }
      // Capital and base blocks
      batch.box(M.stone, 0.56, 0.2, 0.36, q.x, baseY + levels * height - 0.35, q.z, q.ry);
      batch.box(M.stone, 0.54, 0.26, 0.34, q.x, baseY + 0.78, q.z, q.ry);
    }
  }

  // Cornice + parapet (perimeter only)
  if (cornice) {
    const q = inFrame(f, L / 2, 0.08);
    const top = baseY + levels * height;
    batch.box(M.stone, L + 0.36, 0.32, 0.55, q.x, top + 0.08, q.z, q.ry);
    batch.box(M.stone, L + 0.24, 0.16, 0.44, q.x, top - 0.12, q.z, q.ry);
  }
  if (parapet) {
    const q = inFrame(f, L / 2, 0.02);
    const top = baseY + levels * height + 0.2;
    batch.box(M.plasterWarm, L + 0.08, 0.95, 0.34, q.x, top + 0.48, q.z, q.ry);
    batch.box(M.stone, L + 0.22, 0.16, 0.46, q.x, top + 1.0, q.z, q.ry);
  }
}

/* --------------------------------------------------------------- rotunda */
function rotunda(batch, M, group) {
  const r = R.r, hall = R.hall;
  const levels = 4, h = 3.6;

  /* Define passage angle ranges (degrees) for open transitions */
  const passages = [
    { center: 180, half: 18 },   // South entry
    { center: 270, half: 15 },   // West passage -> block
    { center: 41,  half: 15 },   // NE passage -> wing (az 41°)
  ];
  function inPassage(deg, lv = 1) {
    if (lv === 0 && Math.abs(((deg - 180 + 540) % 360) - 180) < 34) return true; // Wide open lobby->vestibule on 1st floor
    for (const p of passages) if (Math.abs(((deg - p.center + 540) % 360) - 180) < p.half) return true;
    return false;
  }

  // Outer drum wall (segments, skipping passages) + crisp white interior wall lining
  const seg = 72;
  const bays = 24;
  const bayAng = 360 / bays;
  const winW = 1.4, winH = 2.0;

  for (let s = 0; s < seg; s++) {
    const a0 = (s / seg) * 360, a1 = ((s + 1) / seg) * 360;
    const mid = (a0 + a1) / 2;
    const p = polar(mid * DEG, r - 0.25);
    const pIn = polar(mid * DEG, hall + 0.08);
    const ry = Math.atan2(Math.sin(mid * DEG), -Math.cos(mid * DEG));
    const w = (2 * Math.PI * r / seg) * 1.03;
    const wIn = (2 * Math.PI * hall / seg) * 1.03;
    for (let lv = 0; lv < levels; lv++) {
      if (inPassage(mid, lv)) continue;
      // Check if this segment is a window bay
      const rel = ((mid % bayAng) + bayAng) % bayAng;
      const isWin = Math.abs(rel - bayAng / 2) < (winW / (2 * Math.PI * r)) * 360 * 0.56;
      if (isWin) {
        // Spandrels below sill and above window lintel (both outer and inner)
        batch.box(M.plaster, w, 0.95, 0.52, p.x, lv * h + 0.475, p.z, ry);
        batch.box(M.plasterWall, wIn, 0.95, 0.14, pIn.x, lv * h + 0.475, pIn.z, ry);
        const topH = h - 0.95 - winH;
        batch.box(M.plaster, w, topH, 0.52, p.x, lv * h + 0.95 + winH + topH / 2, p.z, ry);
        batch.box(M.plasterWall, wIn, topH, 0.14, pIn.x, lv * h + 0.95 + winH + topH / 2, pIn.z, ry);
        continue;
      }
      batch.box(M.plaster, w, h, 0.52, p.x, lv * h + h / 2, p.z, ry);
      batch.box(M.plasterWall, wIn, h, 0.14, pIn.x, lv * h + h / 2, pIn.z, ry);
    }
  }

  // Windows on the drum (hollow dark frame so glass is transparent from inside too)
  for (let i = 0; i < bays; i++) {
    const a = (i + 0.5) * bayAng;
    const azr = a * DEG;
    const pIn = polar(azr, r - 0.48);
    const pg = polar(azr, r - 0.36);
    const ry = Math.atan2(Math.sin(azr), -Math.cos(azr));
    for (let lv = 0; lv < levels; lv++) {
      if (inPassage(a, lv)) continue;
      const y0 = lv * h + 0.95;
      // Hollow 4-side sash frame
      const ft = 0.06;
      for (const sgn of [-1, 1]) {
        const qj = polar(azr + (sgn * (winW / 2 - ft / 2)) / r, r - 0.44);
        batch.box(M.metalDark, ft, winH, 0.32, qj.x, y0 + winH / 2, qj.z, ry);
      }
      batch.box(M.metalDark, winW, ft, 0.32, pIn.x, y0 + ft / 2, pIn.z, ry);
      batch.box(M.metalDark, winW, ft, 0.32, pIn.x, y0 + winH - ft / 2, pIn.z, ry);
      batch.box(M.glassTint, winW - 0.1, winH - 0.1, 0.04, pg.x, y0 + winH / 2, pg.z, ry);
      // Exterior stone surround
      for (const sgn of [-1, 1]) {
        const off = sgn * (winW / 2 + 0.09);
        const q = polar(azr + off / r, r - 0.24);
        batch.box(M.stone, 0.18, winH + 0.2, 0.2, q.x, y0 + winH / 2, q.z, ry);
      }
      const qs = polar(azr, r - 0.22);
      batch.box(M.stone, winW + 0.4, 0.14, 0.3, qs.x, y0 - 0.06, qs.z, ry);
      // White crossbars
      batch.box(M.metalWhite, winW - 0.1, 0.05, 0.07, pg.x, y0 + winH * 0.56, pg.z, ry);
      batch.box(M.metalWhite, 0.05, winH - 0.1, 0.07, pg.x, y0 + winH / 2, pg.z, ry);
    }
  }

  // Plinth ring (skipping wide south entrance into gallery!) and string courses
  const ring = (radius, y, hh, mat, tStart = 0, tLen = Math.PI * 2) => {
    const g = new THREE.CylinderGeometry(radius, radius, hh, 72, 1, true, tStart, tLen);
    batch.add(g, mat, new THREE.Matrix4().makeTranslation(0, y, 0));
  };
  ring(r + 0.08, 0.3, 0.6, M.graniteDark, 0.62, Math.PI * 2 - 1.24);
  for (let lv = 1; lv < levels; lv++) ring(r + 0.1, lv * h, 0.22, M.stone);
  ring(r + 0.16, levels * h + 0.1, 0.34, M.stone);

  /* ---- WHITE CLASSICAL PORTICO (south face, az 152°..208°) ---- */
  const porticoA0 = 152, porticoA1 = 208;
  const colR = r + 0.8;      // column line (11.1)

  // 4 classical columns framing a wide unobstructed central entrance portal
  const colAngles = [155, 168, 192, 205];
  for (const t of colAngles) {
    const azr = t * DEG;
    const p = polar(azr, colR);
    // Column shaft (slender Doric proportions)
    batch.cyl(M.stone, 0.28, 0.32, levels * h - 0.5, 14, p.x, (levels * h - 0.5) / 2 + 0.4, p.z);
    // Column base (Attic profile)
    batch.cyl(M.stone, 0.42, 0.44, 0.35, 12, p.x, 0.18, p.z);
    batch.box(M.stone, 0.72, 0.12, 0.72, p.x, 0.06, p.z);
    // Capital (simplified Ionic)
    batch.cyl(M.stone, 0.38, 0.28, 0.28, 12, p.x, levels * h - 0.14, p.z);
    batch.box(M.stone, 0.68, 0.12, 0.68, p.x, levels * h + 0.02, p.z);
  }

  // Entablature (architrave + frieze + cornice) across the portico
  const entSeg = 16;
  for (let i = 0; i < entSeg; i++) {
    const t0 = porticoA0 + (porticoA1 - porticoA0) * i / entSeg;
    const t1 = porticoA0 + (porticoA1 - porticoA0) * (i + 1) / entSeg;
    const tm = ((t0 + t1) / 2) * DEG;
    const p = polar(tm, colR + 0.15);
    const arcW = 2 * Math.PI * (colR + 0.15) * (porticoA1 - porticoA0) / 360 / entSeg * 1.04;
    const ry = Math.atan2(Math.sin(tm), -Math.cos(tm));
    // Architrave
    batch.box(M.stone, arcW, 0.32, 0.5, p.x, levels * h + 0.26, p.z, ry);
    // Frieze
    batch.box(M.stone, arcW, 0.46, 0.44, p.x, levels * h + 0.65, p.z, ry);
    // Cornice with overhang
    batch.box(M.stone, arcW, 0.2, 0.7, p.x, levels * h + 0.98, p.z, ry);
  }

  // 3-storey panoramic bronze glazing behind the columns (starts above gallery roof so 1st-floor lobby is wide open!)
  const glazeSeg = 12;
  const glazeBot = G.h - 0.2;
  const glazeH = levels * h - glazeBot;
  for (let i = 0; i < glazeSeg; i++) {
    const t0 = (porticoA0 + 2) + ((porticoA1 - porticoA0 - 4) * i / glazeSeg);
    const t1 = (porticoA0 + 2) + ((porticoA1 - porticoA0 - 4) * (i + 1) / glazeSeg);
    const tm = ((t0 + t1) / 2) * DEG;
    const pGlz = polar(tm, r - 0.1);
    const arcW = 2 * Math.PI * r * (t1 - t0) / 360 * 1.03;
    const ry = Math.atan2(Math.sin(tm), -Math.cos(tm));
    batch.box(M.glassBronze, arcW - 0.05, glazeH, 0.05, pGlz.x, glazeBot + glazeH / 2, pGlz.z, ry);
    batch.box(M.metalDark, 0.06, glazeH, 0.1, pGlz.x, glazeBot + glazeH / 2, pGlz.z, ry);
  }
  // Horizontal transom bars on the upper glazing (floors 2, 3, 4)
  for (let lv = 2; lv < levels; lv++) {
    const y = lv * h;
    for (let i = 0; i < glazeSeg; i++) {
      const t0 = (porticoA0 + 2) + ((porticoA1 - porticoA0 - 4) * i / glazeSeg);
      const t1 = (porticoA0 + 2) + ((porticoA1 - porticoA0 - 4) * (i + 1) / glazeSeg);
      const tm = ((t0 + t1) / 2) * DEG;
      const pBar = polar(tm, r - 0.08);
      const arcW = 2 * Math.PI * r * (t1 - t0) / 360 * 1.03;
      const ry = Math.atan2(Math.sin(tm), -Math.cos(tm));
      batch.box(M.metalDark, arcW, 0.08, 0.1, pBar.x, y, pBar.z, ry);
    }
  }

  /* ---- SIGN FRIEZE: «ИНТЕРГАЗ ЦЕНТРАЛЬНАЯ АЗИЯ · QazaqGaz» proud of cornice by +0.35m ---- */
  const signR = colR + 0.77;  // +0.35m proud of previous colR + 0.42, clear of cornice (colR + 0.50)
  const signY = levels * h + 0.96;
  const fasciaH = 1.24;
  const signSpan = 1.04; // ~60° arc cleanly spanning across the portico front
  const signBackGeo = new THREE.CylinderGeometry(signR - 0.04, signR - 0.04, fasciaH + 0.08, 48, 1, true, -signSpan / 2, signSpan);
  const signBackMat = cachedMaterial({ color: 0x0a3978, roughness: 0.45, metalness: 0.15, side: THREE.DoubleSide });
  const signBack = new THREE.Mesh(signBackGeo, signBackMat);
  signBack.position.y = signY;
  group.add(signBack);
  // Sleek silver-white top & bottom trim bars on the signboard
  for (const dy of [-fasciaH / 2 - 0.04, fasciaH / 2 + 0.04]) {
    const trimGeo = new THREE.CylinderGeometry(signR + 0.02, signR + 0.02, 0.06, 48, 1, true, -signSpan / 2, signSpan);
    const trimMesh = new THREE.Mesh(trimGeo, M.metalWhite);
    trimMesh.position.y = signY + dy;
    group.add(trimMesh);
  }
  const signTex = makeSignTexture();
  const signMat = new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false, side: THREE.DoubleSide });
  const signGeo = new THREE.CylinderGeometry(signR, signR, fasciaH, 48, 1, true, -signSpan / 2, signSpan);
  const sign = new THREE.Mesh(signGeo, signMat);
  sign.position.y = signY;
  group.add(sign);

  /* ---- FLAT ROOF (NO DOME!) ---- */
  // Simple flat roof slab with stone cornice
  ring(r + 0.2, levels * h + 1.1, 0.14, M.stone);
  // Flat roof disc
  const roofDisc = new THREE.CylinderGeometry(r + 0.1, r + 0.1, 0.2, 48);
  batch.add(roofDisc, M.roof, new THREE.Matrix4().makeTranslation(0, levels * h + 1.2, 0));
  // Slight parapet ring
  ring(r + 0.1, levels * h + 1.4, 0.4, M.plasterWarm);
  ring(r + 0.14, levels * h + 1.65, 0.12, M.stone);

  /* ---- RADIO RELAY TOWER ---- */
  buildRadioTower(batch, M);
}

function makeSignTexture() {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 256;
  const x = c.getContext('2d');
  // Deep corporate ICA blue gradient fascia
  const g = x.createLinearGradient(0, 0, c.width, 0);
  g.addColorStop(0, '#07326c');
  g.addColorStop(0.5, '#0c4fa0');
  g.addColorStop(1, '#07326c');
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, c.height);
  // Subtle crisp top & bottom cyan-white accent stripes
  x.fillStyle = '#38d8ff';
  x.fillRect(0, 0, c.width, 8);
  x.fillRect(0, c.height - 8, c.width, 8);
  // Main crisp white lettering
  x.textBaseline = 'middle';
  x.textAlign = 'center';
  x.fillStyle = '#ffffff';
  x.font = '900 108px "Segoe UI", Arial, sans-serif';
  x.fillText('ИНТЕРГАЗ', c.width * 0.36, 92);
  x.font = '700 58px "Segoe UI", Arial, sans-serif';
  x.fillStyle = '#dff2ff';
  x.fillText('ЦЕНТРАЛЬНАЯ АЗИЯ', c.width * 0.36, 188);
  // Divider line
  x.fillStyle = 'rgba(100,220,255,0.75)';
  x.fillRect(c.width * 0.66, 44, 5, c.height - 88);
  // QazaqGaz emblem dot + bold brand
  x.fillStyle = '#ffd633';
  x.beginPath(); x.arc(c.width * 0.705, 128, 22, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#38e8ff';
  x.beginPath(); x.arc(c.width * 0.705, 128, 12, 0, Math.PI * 2); x.fill();
  x.textAlign = 'left';
  x.fillStyle = '#ffffff';
  x.font = '800 84px "Segoe UI", Arial, sans-serif';
  x.fillText('QazaqGaz', c.width * 0.73, 130);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ---- Red-white lattice radio relay tower ---- */
function buildRadioTower(batch, M) {
  // Tower behind the building, north side of rotunda
  const tx = 0, tz = -R.r - 2.5;
  const towerH = 42;
  const baseW = 2.8, topW = 0.6;
  const sections = 12;
  const redMat = cachedMaterial({ color: 0xcc2020, roughness: 0.65, metalness: 0.3 });
  const whiteMat = cachedMaterial({ color: 0xf0f0f0, roughness: 0.6, metalness: 0.3 });
  const dishMat = cachedMaterial({ color: 0xd0d0d0, roughness: 0.5, metalness: 0.3 });

  for (let s = 0; s < sections; s++) {
    const t0 = s / sections, t1 = (s + 1) / sections;
    const w0 = baseW * (1 - t0) + topW * t0;
    const w1 = baseW * (1 - t1) + topW * t1;
    const y0 = ROOF + t0 * towerH, y1 = ROOF + t1 * towerH;
    const h = y1 - y0;
    const ym = (y0 + y1) / 2;
    const wm = (w0 + w1) / 2;
    const mat = s % 2 === 0 ? redMat : whiteMat;
    // 4 vertical legs
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const lx = tx + dx * wm / 2;
      const lz = tz + dz * wm / 2;
      batch.box(mat, 0.12, h, 0.12, lx, ym, lz);
    }
    // Horizontal cross braces
    batch.box(mat, wm, 0.08, 0.08, tx, y0 + 0.04, tz);
    batch.box(mat, 0.08, 0.08, wm, tx, y0 + 0.04, tz);
    // Diagonal bracing (simplified as thin boxes)
    if (s % 2 === 0) {
      batch.box(mat, 0.06, h * 1.3, 0.06, tx, ym, tz, 0, 0, 0.6);
      batch.box(mat, 0.06, h * 1.3, 0.06, tx, ym, tz, Math.PI / 2, 0, 0.6);
    }
  }
  // Dish antennas on the tower
  for (const y of [ROOF + towerH * 0.4, ROOF + towerH * 0.65, ROOF + towerH * 0.85]) {
    const dishGeo = new THREE.CylinderGeometry(0.6, 0.8, 0.2, 12);
    const p = { x: tx + baseW * 0.3, z: tz };
    batch.add(dishGeo, dishMat, new THREE.Matrix4().compose(
      new THREE.Vector3(p.x, y, p.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)),
      new THREE.Vector3(1, 1, 1)));
  }
  // Warning light on top
  batch.cyl(M.lampGlow, 0.15, 0.15, 0.3, 8, tx, ROOF + towerH + 0.15, tz);
}

/* --------------------------------------------------------------- masses */
function blockMass(batch, M) {
  const x0 = B.x0, x1 = B.x1, z0 = B.z0, z1 = B.z1;
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const levels = 4, h = 3.6;

  // Hollow perimeter facades with aligned exterior plaster + interior white plaster lining
  // South elevation — with tall arched vitrages + regular windows
  const south = frame(x0, z1, x1, z1);
  const southBays = Math.max(1, Math.round(south.len / 3.7));
  const tallBays = [];
  for (let i = 1; i < southBays; i += 3) tallBays.push(i);
  facade(batch, M, south, {
    levels, bay: 3.7, winW: 1.5, winH: 2.1, pilaster: true,
    tallArch: true, tallArchBays: tallBays,
    plinth: true, cornice: true, parapet: true, trim: true,
  });
  // North elevation
  const north = frame(x1, z0, x0, z0);
  facade(batch, M, north, {
    levels, bay: 3.9, winW: 1.4, winH: 1.95,
    plinth: true, cornice: true, parapet: true, trim: true, pilaster: false,
  });
  // West end — exterior windows outside; interior lined solid in buildInteriorShell for SCADA & ICA banner walls
  const west = frame(x0, z0, x0, z1);
  facade(batch, M, west, {
    levels, bay: 3.6, winW: 1.4, winH: 2.0,
    plinth: true, cornice: true, parapet: true, trim: true, pilaster: true,
    buildInnerLining: false,
  });
  // East end (meets rotunda): leave central corridor passage (z = -2.2..+1.2) WIDE OPEN on all floors!
  const eastSouth = frame(x1, z1, x1, 1.2);
  facade(batch, M, eastSouth, {
    levels, bay: 3.4, winW: 1.3, winH: 1.9, skipBays: [0, 1],
    plinth: true, cornice: true, parapet: true, trim: true, pilaster: false,
  });
  const eastNorth = frame(x1, -2.2, x1, z0);
  facade(batch, M, eastNorth, {
    levels, bay: 3.4, winW: 1.3, winH: 1.9, skipBays: [0, 1],
    plinth: true, cornice: true, parapet: true, trim: true, pilaster: false,
  });

  // Roof slab + parapet top
  batch.box(M.roof, w, 0.2, d, cx, ROOF + 0.02, cz);
  // Roof equipment
  const rnd = mulberry32(77);
  for (let i = 0; i < 7; i++) {
    const bx = x0 + 3 + rnd() * (w - 6), bz = z0 + 2 + rnd() * (d - 4);
    const bw = 1.2 + rnd() * 1.6, bd = 1.0 + rnd() * 1.2, bh = 0.7 + rnd() * 0.6;
    batch.box(M.concrete, bw, bh, bd, bx, levels * h + 1.2 + bh / 2, bz);
  }
}

function wingMass(batch, M) {
  const a = W.az;
  const ax = Math.sin(a), az = -Math.cos(a);
  const nx = Math.cos(a), nz = Math.sin(a);
  const half = W.half;
  // Start exterior wing walls tangent to rotunda cylinder (sqrt(10.3^2 - 7.15^2) ≈ 7.41) so wing never pokes into atrium!
  const s0 = 7.4, s1 = W.s1;
  const cx = ax * (s0 + s1) / 2, cz = az * (s0 + s1) / 2;
  const len = s1 - s0, ry = Math.atan2(ax, az);

  const levels = 4, h = 3.6;

  // Four corners at s0..s1, ±half
  const p0 = { x: ax * s0 + nx * half, z: az * s0 + nz * half }; // SE inner
  const p1 = { x: ax * s1 + nx * half, z: az * s1 + nz * half }; // SE outer
  const p2 = { x: ax * s1 - nx * half, z: az * s1 - nz * half }; // NW outer
  const p3 = { x: ax * s0 - nx * half, z: az * s0 - nz * half }; // NW inner

  // South-East front elevation (facing viewer! Correct outward normal = +nx, +nz)
  const longFrame1 = frame(p0.x, p0.z, p1.x, p1.z);
  const longBays1 = Math.max(1, Math.round(longFrame1.len / 3.8));
  const tallBays1 = [];
  for (let i = 1; i < longBays1; i += 3) tallBays1.push(i);
  facade(batch, M, longFrame1, {
    levels, bay: 3.8, winW: 1.5, winH: 2.05, pilaster: true,
    tallArch: true, tallArchBays: tallBays1,
    plinth: true, cornice: true, parapet: true, trim: true,
  });

  // North-West back elevation (outward normal = -nx, -nz)
  const longFrame2 = frame(p2.x, p2.z, p3.x, p3.z);
  const longBays2 = Math.max(1, Math.round(longFrame2.len / 3.9));
  const tallBays2 = [];
  for (let i = 1; i < longBays2; i += 3) tallBays2.push(i);
  facade(batch, M, longFrame2, {
    levels, bay: 3.9, winW: 1.4, winH: 1.95, pilaster: true,
    tallArch: true, tallArchBays: tallBays2,
    plinth: true, cornice: true, parapet: true, trim: true,
  });

  // Far North-East end elevation (outward normal = +ax, +az)
  facade(batch, M, frame(p1.x, p1.z, p2.x, p2.z), {
    levels, bay: 3.5, winW: 1.35, winH: 1.95, pilaster: true,
    plinth: true, cornice: true, parapet: true, trim: true,
  });

  // Roof slab
  batch.box(M.roof, half * 2, 0.2, len, cx, ROOF + 0.02, cz, ry);
  // Roof plant
  batch.box(M.concrete, 2.6, 1.1, 2.0, ax * (s1 - 5), levels * h + 1.7, az * (s1 - 5), ry);
  batch.box(M.metalDark, 0.9, 2.2, 0.9, ax * (s0 + 6) + nx * 3, levels * h + 2.2, az * (s0 + 6) + nz * 3, ry);
}

function galleryMass(batch, M) {
  /* Semicircular glazed entrance vestibule with dark-brown aluminum profile,
     double glass doors, granite stair with chrome railings. */
  const r0 = R.hall, r1 = G.r1, a0 = G.a0 * DEG, a1 = G.a1 * DEG;
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
    // Continuous roof slab spanning from rotunda hall out to gallery facade
    batch.box(M.stone, w, 0.30, r1 - r0 + 0.4, p.x, h - 0.15, p.z, ry);
    // Clean white Armstrong ceiling underneath the gallery roof
    batch.box(M.ceiling, w, 0.04, r1 - r0 + 0.2, p.x, h - 0.34, p.z, ry);
    // Glazed storefront (dark brown frame with glass)
    if (Math.abs(deg - 180) > 12) {
      // Bronze-tinted glass in dark frame
      batch.box(M.glassBronze, w * 0.94, h - 0.6, 0.06, pOut.x, (h - 0.6) / 2 + 0.1, pOut.z, ry);
      batch.box(M.metalDark, 0.08, h - 0.5, 0.12, pOut.x, (h - 0.5) / 2 + 0.1, pOut.z, ry);
    }
  }
  // Entrance glass vestibule (тамбур) with outer & inner automatic sliding double doors
  for (const sgn of [-1, 1]) {
    const t = (180 + sgn * 12) * DEG;
    const p = polar(t, r1 - 0.18);
    batch.box(M.metalDark, 0.18, h - 0.36, 0.24, p.x, (h - 0.36) / 2, p.z, Math.atan2(Math.sin(t), -Math.cos(t)));
  }

  const vestW = 2.60;
  const vestZOut = 18.42;
  const vestZIn = 14.85;
  const doorClearW = 1.35;
  const doorH = 2.86;
  const soffitY = h - 0.34;
  const doorGlass = M.glass || M.glassBronze;
  const frameMat = M.metalDark;
  const steelMat = M.brushedSteel || M.chrome;
  const sensorMat = cachedMaterial({ color: 0x101318, roughness: 0.35, metalness: 0.4 });
  const sensorLedMat = cachedMaterial({ color: 0x00e68a, emissive: 0x00e68a, emissiveIntensity: 0.75 });
  const matCarpet = cachedMaterial({ color: 0x1f2228, roughness: 0.95, metalness: 0.02 });

  // Outer & inner automatic sliding glass door portals
  for (const pz of [vestZOut, vestZIn]) {
    // Full-width dark anodized transom beam & upper glazed fanlight
    batch.box(frameMat, vestW * 2 + 0.16, 0.16, 0.18, 0, doorH + 0.08, pz);
    batch.box(frameMat, vestW * 2 + 0.16, 0.10, 0.16, 0, soffitY - 0.05, pz);
    batch.box(doorGlass, vestW * 2 - 0.12, soffitY - doorH - 0.22, 0.04, 0, (doorH + 0.16 + soffitY - 0.10) / 2, pz);
    // Overhead automatic radar motion sensor + status indicator
    batch.box(sensorMat, 0.28, 0.075, 0.095, 0, doorH + 0.19, pz + (pz === vestZOut ? 0.09 : -0.09));
    batch.box(sensorLedMat, 0.022, 0.012, 0.01, 0, doorH + 0.19, pz + (pz === vestZOut ? 0.14 : -0.14));
    // Stainless steel floor sliding guide rail
    batch.box(steelMat, vestW * 2, 0.012, 0.06, 0, 0.006, pz);

    for (const sgn of [-1, 1]) {
      // Main portal jambs & outer corner posts
      batch.box(frameMat, 0.10, soffitY, 0.14, sgn * doorClearW, soffitY / 2, pz);
      batch.box(frameMat, 0.12, soffitY, 0.14, sgn * vestW, soffitY / 2, pz);
      // Fixed glazed sidelights (|x| = 1.35..2.60)
      const sideW = vestW - doorClearW - 0.10;
      const sideX = sgn * ((doorClearW + vestW) / 2);
      batch.box(doorGlass, sideW, doorH - 0.12, 0.04, sideX, (doorH - 0.06) / 2, pz);
      batch.box(frameMat, sideW, 0.08, 0.10, sideX, 0.04, pz);

      // Open automatic sliding glass double-door leaf parked neatly in front of sidelight
      const leafX = sgn * (doorClearW + 0.56);
      const leafZ = pz + (pz === vestZOut ? -0.055 : 0.055);
      batch.box(doorGlass, 1.24, doorH - 0.08, 0.03, leafX, doorH / 2, leafZ);
      batch.box(frameMat, 1.26, 0.05, 0.05, leafX, 0.025, leafZ);
      batch.box(frameMat, 1.26, 0.05, 0.05, leafX, doorH - 0.04, leafZ);
      batch.box(frameMat, 0.045, doorH, 0.05, leafX - sgn * 0.61, doorH / 2, leafZ);
      batch.box(frameMat, 0.045, doorH, 0.05, leafX + sgn * 0.61, doorH / 2, leafZ);
      // Brushed stainless vertical pull handle
      batch.cyl(M.chrome, 0.016, 0.016, 0.92, 10, leafX - sgn * 0.48, 1.18, leafZ + (pz === vestZOut ? 0.05 : -0.05));
    }
  }

  // Vestibule glazed side enclosure walls (connecting outer & inner portals)
  const vestLen = vestZOut - vestZIn;
  const vestMidZ = (vestZOut + vestZIn) / 2;
  for (const sgn of [-1, 1]) {
    batch.box(doorGlass, 0.04, soffitY - 0.14, vestLen - 0.12, sgn * vestW, soffitY / 2, vestMidZ);
    batch.box(frameMat, 0.10, 0.09, vestLen, sgn * vestW, 0.045, vestMidZ);
    batch.box(frameMat, 0.10, 0.10, vestLen, sgn * vestW, soffitY - 0.05, vestMidZ);
    for (const mz of [vestZIn + vestLen * 0.34, vestZIn + vestLen * 0.67]) {
      batch.box(frameMat, 0.07, soffitY, 0.07, sgn * vestW, soffitY / 2, mz);
    }
  }

  // Recessed ribbed entrance floor mat (грязезащитный ковёр) inset in brushed-steel frame
  batch.box(steelMat, 4.48, 0.014, 3.06, 0, 0.007, vestMidZ);
  batch.box(matCarpet, 4.32, 0.016, 2.90, 0, 0.008, vestMidZ);
  for (let r = -6; r <= 6; r++) {
    batch.box(steelMat, 4.24, 0.004, 0.018, 0, 0.017, vestMidZ + r * 0.21);
  }

  // Vestibule ceiling LED soffit downlights
  const downlightMat = M.lampPanel || M.lampGlow;
  for (const dx of [-1.25, 1.25]) {
    for (const dz of [vestZIn + 0.95, vestZOut - 0.95]) {
      batch.cyl(steelMat, 0.14, 0.15, 0.02, 16, dx, soffitY - 0.01, dz);
      batch.cyl(downlightMat, 0.11, 0.11, 0.025, 16, dx, soffitY - 0.018, dz);
    }
  }
  // Parapet ring
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
  // Columns on gallery outer edge
  const ncol = 8;
  for (let i = 0; i < ncol; i++) {
    const t = a0 + ((a1 - a0) * (i + 0.5)) / ncol;
    if (Math.abs(t / DEG - 180) < 10) continue;
    const p = polar(t, r1 - 0.55);
    batch.cyl(M.stone, 0.24, 0.28, h - 0.4, 14, p.x, (h - 0.4) / 2, p.z);
    batch.box(M.stone, 0.58, 0.18, 0.58, p.x, h - 0.44, p.z, Math.atan2(Math.sin(t), -Math.cos(t)));
    batch.box(M.stone, 0.62, 0.18, 0.62, p.x, 0.09, p.z, Math.atan2(Math.sin(t), -Math.cos(t)));
  }
  // Floor slab
  const floorSeg = 24;
  for (let i = 0; i < floorSeg; i++) {
    const t0 = a0 + ((a1 - a0) * i) / floorSeg, t1 = a0 + ((a1 - a0) * (i + 1)) / floorSeg;
    const tm = (t0 + t1) / 2, rm = (R.hall + r1) / 2;
    const p = polar(tm, rm);
    const w = Math.hypot(polar(t1, r1).x - polar(t0, r1).x, polar(t1, r1).z - polar(t0, r1).z) * 1.06;
    const ry = Math.atan2(Math.sin(tm), -Math.cos(tm));
    batch.box(M.marbleFloor, w, 0.16, (r1 - R.hall) + 0.5, p.x, -0.08, p.z, ry);
  }
}

/* ----------------------------------------------------------- grand stair */
const _upAxis = new THREE.Vector3(0, 1, 0);
function addCylinderBetween(batch, mat, x0, y0, z0, x1, y1, z1, radius, seg = 6) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return;
  const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
  const q = new THREE.Quaternion().setFromUnitVectors(_upAxis, dir);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
    q,
    new THREE.Vector3(1, 1, 1)
  );
  batch.add(new THREE.CylinderGeometry(radius, radius, len, seg), mat, m);
}

function stair(batch, M, colliders) {
  const azr = LAYOUT.entry.az * DEG;
  const dirX = Math.sin(azr), dirZ = -Math.cos(azr);
  const width = LAYOUT.entry.width;
  const steps = LAYOUT.entry.steps;
  const rise = PODIUM / steps, run = 0.46;
  const startR = G.r1 + 0.2;

  for (let i = 0; i < steps; i++) {
    const y = (steps - i) * rise;
    const r = startR + i * run;
    const p = polar(azr, r);
    const ry = Math.atan2(dirX, dirZ);
    // Red-brown polished granite treads
    batch.box(M.granite, width, 0.16, run + 0.06, p.x, y - 0.08, p.z, ry);
    batch.box(M.graniteDark, width, rise, 0.16, p.x, y - rise / 2, p.z, ry);
    // Cheek walls
    for (const sgn of [-1, 1]) {
      const q = polar(azr + (sgn * (width / 2 + 0.35)) / r, r);
      batch.box(M.granite, 0.7, 0.5 + rise, run + 0.06, q.x, y - 0.08 + (0.5 + rise) / 2 - 0.4, q.z, ry);
    }
  }

  // Chrome railings on both sides
  for (const sgn of [-1, 1]) {
    for (let i = 0; i <= steps; i++) {
      const r = startR + i * run;
      const y = (steps - i) * rise + 0.9;
      const q = polar(azr + (sgn * (width / 2 + 0.1)) / r, r);
      // Post
      batch.cyl(M.chrome, 0.025, 0.025, 0.9, 6, q.x, y - 0.45, q.z);
    }
    // Handrail (angled along stair slope)
    for (let i = 0; i < steps; i++) {
      const r0 = startR + i * run, r1 = startR + (i + 1) * run;
      const y0 = (steps - i) * rise + 0.9, y1 = (steps - i - 1) * rise + 0.9;
      const p0 = polar(azr + (sgn * (width / 2 + 0.1)) / r0, r0);
      const p1 = polar(azr + (sgn * (width / 2 + 0.1)) / r1, r1);
      addCylinderBetween(batch, M.chrome, p0.x, y0, p0.z, p1.x, y1, p1.z, 0.022, 6);
    }
  }

  // Side ramp (ADA accessibility, properly sloped from PODIUM down to ground)
  const rampW = 2.0;
  const horizLen = steps * run * 2.4;
  const slopeLen = Math.hypot(horizLen, PODIUM);
  const slopeAngle = Math.atan2(PODIUM, horizLen);
  const sideX = -dirZ, sideZ = dirX;
  const latOff = width / 2 + rampW / 2 + 1.0;
  const topX = dirX * startR + sideX * latOff;
  const topZ = dirZ * startR + sideZ * latOff;
  const botX = topX + dirX * horizLen;
  const botZ = topZ + dirZ * horizLen;
  const rmx = (topX + botX) / 2;
  const rmz = (topZ + botZ) / 2;
  const rampRy = Math.atan2(dirX, dirZ);

  // Sloped ramp deck + top landing connecting to gallery podium
  batch.box(M.granite, rampW, 0.14, slopeLen, rmx, PODIUM / 2 - 0.07, rmz, rampRy, slopeAngle);
  batch.box(M.granite, rampW + 0.6, 0.16, 2.8, topX + dirX * -1.4, PODIUM - 0.08, topZ + dirZ * -1.4, rampRy);
  batch.box(M.graniteDark, rampW + 0.5, PODIUM - 0.16, 2.7, topX + dirX * -1.4, (PODIUM - 0.16) / 2, topZ + dirZ * -1.4, rampRy);

  // Sloped ramp railings & posts on both sides
  for (const side of [-1, 1]) {
    const offX = side * (rampW / 2 - 0.06) * sideX;
    const offZ = side * (rampW / 2 - 0.06) * sideZ;
    const nPosts = 5;
    for (let k = 0; k <= nPosts; k++) {
      const t = k / nPosts;
      const px = topX + offX + (botX - topX) * t;
      const pz = topZ + offZ + (botZ - topZ) * t;
      const py = PODIUM * (1 - t);
      batch.cyl(M.chrome, 0.025, 0.025, 0.9, 6, px, py + 0.45, pz);
    }
    addCylinderBetween(
      batch, M.chrome,
      topX + offX, PODIUM + 0.9, topZ + offZ,
      botX + offX, 0.9, botZ + offZ,
      0.022, 6
    );
  }

  // Landing platform at bottom
  const lp = polar(azr, startR + steps * run + 1.4);
  batch.box(M.paver, width + 5, 0.12, 3.2, lp.x, 0.06, lp.z, Math.atan2(dirX, dirZ));

  // Colliders for main stair, ADA ramp, and ADA top landing
  colliders.push({ type: 'ramp', az: azr, r0: startR, r1: startR + steps * run, width, y0: 0, y1: PODIUM });
  colliders.push({ type: 'ramp', az: azr, r0: startR, r1: startR + horizLen, width: rampW, sideOffset: latOff, y0: 0, y1: PODIUM });
  colliders.push({ type: 'floorRect', x0: -11.0, x1: -7.5, z0: 15.8, z1: startR + 0.2, y: PODIUM });
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

  batch.build(group, { cast: true, receive: true, name: 'facade' });

  // Plinth skirt from forecourt (y=0) up to just below entrance floor slab (no Z-fight with marble!)
  const skirtGroup = new THREE.Group();
  skirtGroup.name = 'skirt';
  const skirt = new Batch();
  const skirtH = PODIUM - 0.12;
  skirt.add(new THREE.CylinderGeometry(G.r1 + 0.1, G.r1 + 0.2, skirtH, 64, 1, false, Math.PI * 0.58, Math.PI * 0.84), M.graniteDark, new THREE.Matrix4().makeTranslation(0, skirtH / 2, 0));
  skirt.add(new THREE.CylinderGeometry(R.r + 0.15, R.r + 0.25, skirtH, 64), M.graniteDark, new THREE.Matrix4().makeTranslation(0, skirtH / 2, 0));
  skirt.box(M.graniteDark, B.x1 - B.x0 + 1.0, skirtH, B.z1 - B.z0 + 1.0, (B.x0 + B.x1) / 2, skirtH / 2, (B.z0 + B.z1) / 2);
  {
    const a = W.az, aax = Math.sin(a), aaz = -Math.cos(a);
    skirt.box(M.graniteDark, (W.half + 0.4) * 2, skirtH, W.s1 - W.s0 + 0.8, aax * (W.s0 + W.s1) / 2, skirtH / 2, aaz * (W.s0 + W.s1) / 2, Math.atan2(aax, aaz));
  }
  skirt.build(skirtGroup, { cast: false, receive: true, name: 'skirt' });
  scene.add(skirtGroup);

  // Entrance stair
  const stairGroup = new THREE.Group();
  stairGroup.name = 'stair';
  const sb = new Batch();
  stair(sb, M, colliders);
  sb.build(stairGroup, { cast: true, receive: true, name: 'stair' });
  scene.add(stairGroup);

  group.position.y = PODIUM;

  // Walkable floor regions
  colliders.push({ type: 'floorCircle', x: 0, z: 0, r: G.r1 + 0.2, y: PODIUM });
  colliders.push({ type: 'floorRect', x0: B.x0, x1: B.x1, z0: B.z0, z1: B.z1, y: PODIUM });

  // Shell wall colliders WITH OPEN PASSAGES
  const wallSegs = 36;
  for (let i = 0; i < wallSegs; i++) {
    const mid = ((i + 0.5) / wallSegs) * 360;
    // Leave south entry, west passage (block) and wing passage open!
    if (Math.abs(mid - 180) < 16) continue;  // South entry
    if (Math.abs(mid - 270) < 15) continue;  // West -> block
    if (Math.abs(mid - 41) < 15) continue;   // NE -> wing
    const p = polar(mid * DEG, R.r - 0.35);
    colliders.push({ type: 'circle', x: p.x, z: p.z, r: 1.2, y0: PODIUM, y1: ROOF + PODIUM });
  }

  // Gallery curved storefront wall colliders (keep central entrance portal 180° ± 12° open)
  const galSegs = 20;
  for (let i = 0; i < galSegs; i++) {
    const deg = G.a0 + ((G.a1 - G.a0) * (i + 0.5)) / galSegs;
    if (Math.abs(deg - 180) <= 12) continue;
    const p = polar(deg * DEG, G.r1 - 0.18);
    colliders.push({ type: 'circle', x: p.x, z: p.z, r: 1.15, y0: 0, y1: G.h + PODIUM });
  }
  // Vestibule glass side walls & fixed portal sidelights (center x = -1.35..+1.35 remains open!)
  for (const sgn of [-1, 1]) {
    const wx = sgn * 2.60;
    colliders.push({ type: 'rect', x0: wx - 0.10, x1: wx + 0.10, z0: 14.80, z1: 18.48, y0: PODIUM, y1: PODIUM + G.h });
    const xMin = sgn < 0 ? -2.65 : 1.35;
    const xMax = sgn < 0 ? -1.35 : 2.65;
    colliders.push({ type: 'rect', x0: xMin, x1: xMax, z0: 18.28, z1: 18.56, y0: PODIUM, y1: PODIUM + G.h });
    colliders.push({ type: 'rect', x0: xMin, x1: xMax, z0: 14.72, z1: 14.98, y0: PODIUM, y1: PODIUM + G.h });
  }

  // Block wing exterior wall box colliders (preserving central east corridor z = -2.2..1.2)
  const wallTop = ROOF + PODIUM;
  colliders.push({ type: 'rect', x0: B.x0 - 0.25, x1: B.x1 + 0.25, z0: B.z0 - 0.35, z1: B.z0 + 0.25, y0: 0, y1: wallTop });
  colliders.push({ type: 'rect', x0: B.x0 - 0.25, x1: B.x1 + 0.25, z0: B.z1 - 0.25, z1: B.z1 + 0.35, y0: 0, y1: wallTop });
  colliders.push({ type: 'rect', x0: B.x0 - 0.35, x1: B.x0 + 0.25, z0: B.z0 - 0.25, z1: B.z1 + 0.25, y0: 0, y1: wallTop });
  colliders.push({ type: 'rect', x0: B.x1 - 0.25, x1: B.x1 + 0.25, z0: B.z0, z1: -2.2, y0: 0, y1: wallTop });
  colliders.push({ type: 'rect', x0: B.x1 - 0.25, x1: B.x1 + 0.25, z0: 1.2, z1: B.z1, y0: 0, y1: wallTop });

  // Angled NE wing exterior wall colliders (OBB, leaving rotunda SW passage open)
  {
    const a = W.az, ax = Math.sin(a), az = -Math.cos(a);
    const nx = Math.cos(a), nz = Math.sin(a);
    const ws0 = 7.4, ws1 = W.s1;
    const sMid = (ws0 + ws1) / 2;
    const halfLen = (ws1 - ws0) / 2;
    for (const side of [-1, 1]) {
      const cx = ax * sMid + nx * (side * W.half);
      const cz = az * sMid + nz * (side * W.half);
      colliders.push({ type: 'obb', cx, cz, ux: ax, uz: az, halfW: halfLen, halfD: 0.28, y0: 0, y1: wallTop });
    }
    const endCx = ax * ws1, endCz = az * ws1;
    colliders.push({ type: 'obb', cx: endCx, cz: endCz, ux: ax, uz: az, halfW: 0.28, halfD: W.half + 0.25, y0: 0, y1: wallTop });
  }

  scene.add(group);
  return group;
}

/* ------------------------------------------------------------ interiors shell */
export function buildInteriorShell(scene, M) {
  const group = new THREE.Group();
  group.name = 'interior-shell';
  group.position.y = PODIUM;
  const batch = new Batch();

  const levels = [0, 3.6, 7.2, 10.8];
  const a = W.az, ax = Math.sin(a), az = -Math.cos(a);
  const wS0 = 8.4; // starts cleanly outside rotunda hall (8.55) without poking into atrium
  const wRy = Math.atan2(ax, az);

  for (let i = 0; i < levels.length; i++) {
    const y = levels[i];
    // 0.16m floor slabs: top flush at y, underside at y - 0.16 (safely ABOVE lower floor ceiling at y - 0.22!)
    // Block floor — warm light oak laminate
    batch.box(M.oakLaminate, B.x1 - B.x0, 0.16, B.z1 - B.z0, (B.x0 + B.x1) / 2, y - 0.08, (B.z0 + B.z1) / 2);
    // Corridor threshold bridge connecting block (-9.4) to rotunda hall (-8.4)
    batch.box(M.oakLaminate, 1.4, 0.16, 3.6, -8.8, y - 0.08, -0.5);

    if (i === 0) {
      // Ground floor rotunda — polished marble disc
      const disc = new THREE.CylinderGeometry(R.hall, R.hall, 0.16, 64);
      batch.add(disc, M.marbleFloor, new THREE.Matrix4().makeTranslation(0, y - 0.08, 0));
    } else {
      // Upper rotunda levels — annular marble gallery leaving elevator shaft & grand stairwells open
      addRotundaRing(batch, M.marbleFloor, R.core + 0.04, R.hall, y, false, i >= 1);
    }
    // Wing floor — warm light oak laminate
    batch.box(M.oakLaminate, W.half * 2 - 0.2, 0.16, W.s1 - wS0, ax * (wS0 + W.s1) / 2, y - 0.08, az * (wS0 + W.s1) / 2, wRy);
  }

  // Basement
  batch.box(M.concrete, B.x1 - B.x0, 0.3, B.z1 - B.z0, (B.x0 + B.x1) / 2, -3.3, (B.z0 + B.z1) / 2);
  batch.add(new THREE.CylinderGeometry(R.hall, R.hall, 0.3, 48), M.concrete, new THREE.Matrix4().makeTranslation(0, -3.3, 0));

  // Ceilings — bright white Armstrong ceiling panels on EVERY floor, placed at y + 3.38 (BELOW next floor slab at y + 3.44!)
  for (let i = 0; i < 4; i++) {
    const cy = levels[i] + 3.38;
    batch.box(M.ceiling, B.x1 - B.x0 - 0.2, 0.04, B.z1 - B.z0 - 0.2, (B.x0 + B.x1) / 2, cy, (B.z0 + B.z1) / 2);
    batch.box(M.ceiling, 1.4, 0.04, 3.6, -8.8, cy, -0.5);
    batch.box(M.ceiling, W.half * 2 - 0.3, 0.04, W.s1 - wS0, ax * (wS0 + W.s1) / 2, cy, az * (wS0 + W.s1) / 2, wRy);
    // Rotunda ceiling (white Armstrong ring on every floor, open above grand stairwells on levels 0, 1 & 2)
    addRotundaRing(batch, M.ceiling, R.core + 0.04, R.hall, cy, true, i < 3);
  }
  // Rotunda roof cap
  batch.add(new THREE.CylinderGeometry(R.hall, R.hall, 0.06, 64), M.ceiling, new THREE.Matrix4().makeTranslation(0, ROOF - 0.08, 0));

  // Solid interior white plaster lining for block west end wall (supports SCADA video wall & Assembly Hall ICA banner)
  const wallMat = M.plasterWall;
  for (let lv = 0; lv < 3; lv++) {
    const y = levels[lv];
    batch.box(wallMat, 0.14, 3.42, B.z1 - B.z0 - 0.4, B.x0 + 0.30, y + 1.71, (B.z0 + B.z1) / 2);
  }

  batch.build(group, { cast: false, receive: true, name: 'shell' });
  scene.add(group);
  return group;
}
