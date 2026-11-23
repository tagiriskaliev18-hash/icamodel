/* interior.js — Full interior: lobby/turnstiles/guard/waiting area, semicircular grand
   stairs, panoramic elevator shaft, corridors with real walnut doors & Armstrong
   ceilings, Assembly Hall, Meeting Room (KZ map), Dispatch Center, Director's
   Office, department offices.  Every room matches real ICA reference photos.
   Safe material fallbacks: M.oakLaminate || M.carpet, M.marbleFloor || M.marble, etc.
   Exports buildInteriors(scene, M, colliders) which returns a group with
   .userData.lights and an .update(dt, playerPos) for animated turnstiles & lift doors. */

import * as THREE from 'three';
import { Batch, DEG, LAYOUT, FLOOR, PODIUM, polar, mulberry32, clamp, cachedMaterial, addRotundaRing } from './core.js';

const B = LAYOUT.block;
const W = LAYOUT.wing;
const R = LAYOUT.rotunda;

const WALL_H = 3.6;
const PART_T = 0.14;
const CORR_W = 2.8; // corridor width from contract
const CORR_Z = -0.5; // block corridor center-line z

/* ---- safe material helpers ---- */
const mat = (M, ...keys) => {
  for (const k of keys) if (M[k]) return M[k];
  return M.stone || cachedMaterial({ color: 0xcccccc });
};

const _labelMatCache = new Map();
function getLabelMat(text, w = 512, h = 128, bgColor = '#1a3a6c', fgColor = '#ffffff') {
  const key = `${text}|${w}|${h}|${bgColor}|${fgColor}`;
  if (_labelMatCache.has(key)) return _labelMatCache.get(key);
  const tex = makeCanvasLabel(text, w, h, bgColor, fgColor);
  const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  _labelMatCache.set(key, m);
  return m;
}

/* ---- nested parent-matrix stack helper (never clobbers outer room transform!) ---- */
function pushParent(batch, m4) {
  const prev = batch.parent;
  batch.setParent(prev ? prev.clone().multiply(m4) : m4);
  return prev;
}

/* ================================================================== furniture helpers */
function desk(batch, M, x, y, z, ry, w = 1.6, d = 0.8) {
  const m4 = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    new THREE.Vector3(1, 1, 1));
  const prev = pushParent(batch, m4);
  // desk top
  batch.box(mat(M, 'woodLight', 'wood'), w, 0.04, d, 0, 0.74, 0);
  // pedestal
  batch.box(mat(M, 'woodLight', 'wood'), 0.46, 0.68, d - 0.06, -w / 2 + 0.28, 0.36, 0);
  // legs
  for (const [sx, sz] of [[1, -1], [1, 1]]) {
    batch.box(mat(M, 'metalDark'), 0.04, 0.72, 0.04, sx * (w / 2 - 0.06), 0.36, sz * (d / 2 - 0.06));
  }
  // monitor
  batch.box(mat(M, 'metalDark'), 0.5, 0.32, 0.03, 0.1, 1.0, -d / 2 + 0.16);
  batch.box(mat(M, 'metalDark'), 0.08, 0.16, 0.08, 0.1, 0.84, -d / 2 + 0.16);
  batch.box(mat(M, 'officeScreen', 'lampGlow'), 0.44, 0.26, 0.01, 0.1, 1.0, -d / 2 + 0.14);
  // keyboard
  batch.box(mat(M, 'metalDark'), 0.38, 0.015, 0.14, -0.08, 0.76, 0);
  // chair behind
  const cx = 0, cz = d / 2 + 0.42;
  batch.box(mat(M, 'leatherBlack', 'fabric'), 0.5, 0.09, 0.5, cx, 0.46, cz);
  batch.box(mat(M, 'leatherBlack', 'fabric'), 0.5, 0.56, 0.08, cx, 0.78, cz + 0.24);
  batch.cyl(mat(M, 'metalDark'), 0.04, 0.05, 0.4, 8, cx, 0.22, cz);
  batch.cyl(mat(M, 'chrome', 'metalDark'), 0.26, 0.28, 0.04, 10, cx, 0.05, cz);
  batch.setParent(prev);
}

function officeChair(batch, M, x, y, z, ry) {
  const m4 = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    new THREE.Vector3(1, 1, 1));
  const prev = pushParent(batch, m4);
  batch.box(mat(M, 'leatherBlack', 'fabric'), 0.5, 0.09, 0.5, 0, 0.46, 0);
  batch.box(mat(M, 'leatherBlack', 'fabric'), 0.5, 0.56, 0.08, 0, 0.78, 0.24);
  batch.cyl(mat(M, 'metalDark'), 0.04, 0.05, 0.4, 8, 0, 0.22, 0);
  batch.cyl(mat(M, 'chrome', 'metalDark'), 0.26, 0.28, 0.04, 10, 0, 0.05, 0);
  // armrests
  for (const s of [-1, 1]) {
    batch.box(mat(M, 'metalDark'), 0.04, 0.22, 0.26, s * 0.24, 0.6, 0.06);
    batch.box(mat(M, 'leatherBlack', 'fabric'), 0.08, 0.025, 0.2, s * 0.24, 0.72, 0.06);
  }
  batch.setParent(prev);
}

function conferenceChair(batch, M, x, y, z, ry) {
  const m4 = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    new THREE.Vector3(1, 1, 1));
  const prev = pushParent(batch, m4);
  batch.box(mat(M, 'leatherBlack', 'fabric'), 0.44, 0.07, 0.44, 0, 0.44, 0);
  batch.box(mat(M, 'leatherBlack', 'fabric'), 0.44, 0.42, 0.06, 0, 0.7, -0.2);
  // chrome legs
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    batch.cyl(mat(M, 'chrome', 'metalDark'), 0.015, 0.015, 0.4, 6, sx * 0.18, 0.2, sz * 0.18);
  }
  batch.setParent(prev);
}

function sofa(batch, M, x, y, z, ry) {
  const m4 = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    new THREE.Vector3(1, 1, 1));
  const prev = pushParent(batch, m4);
  batch.box(mat(M, 'leatherBlack', 'fabric'), 2.0, 0.42, 0.85, 0, 0.3, 0);
  batch.box(mat(M, 'leatherBlack', 'fabric'), 2.0, 0.6, 0.2, 0, 0.72, -0.33);
  for (const s of [-1, 1]) batch.box(mat(M, 'leatherBlack', 'fabric'), 0.18, 0.4, 0.85, s * 0.95, 0.56, 0);
  batch.setParent(prev);
}

function plant(batch, M, x, y, z, s = 1) {
  batch.cyl(mat(M, 'concrete', 'stone'), 0.24 * s, 0.18 * s, 0.44 * s, 12, x, y + 0.22 * s, z);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    batch.box(mat(M, 'plant', 'grass'), 0.08 * s, 0.75 * s, 0.3 * s,
      x + Math.sin(a) * 0.16 * s, y + 0.85 * s, z + Math.cos(a) * 0.16 * s, a, 0.35, 0);
  }
}

function fileCabinet(batch, M, x, y, z, ry = 0) {
  const m4 = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    new THREE.Vector3(1, 1, 1));
  const prev = pushParent(batch, m4);
  batch.box(mat(M, 'woodLight', 'wood'), 0.86, 1.8, 0.42, 0, 0.9, 0);
  // shelves
  for (let i = 0; i < 4; i++) {
    batch.box(mat(M, 'woodLight', 'wood'), 0.8, 0.02, 0.38, 0, 0.3 + i * 0.42, 0);
  }
  // coloured binder spines
  const cols = [0x2255aa, 0xcc3333, 0x33aa55, 0xddcc22, 0x5544aa];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 5; j++) {
      const c = cols[(i * 5 + j) % cols.length];
      const bm = cachedMaterial({ color: c, roughness: 0.8 });
      batch.box(bm, 0.06, 0.28, 0.24, -0.3 + j * 0.14, 0.46 + i * 0.42, -0.04);
    }
  }
  batch.setParent(prev);
}

function waterCooler(batch, M, x, y, z) {
  batch.box(mat(M, 'stone', 'metalWhite'), 0.36, 1.0, 0.36, x, y + 0.5, z);
  // blue water bottle
  batch.cyl(cachedMaterial({ color: 0x3388cc, transparent: true, opacity: 0.5, roughness: 0.3 }),
    0.14, 0.14, 0.44, 12, x, y + 1.22, z);
}

function printer(batch, M, x, y, z, ry = 0) {
  batch.box(mat(M, 'metalDark'), 0.55, 0.38, 0.45, x, y + 0.19, z);
  batch.box(mat(M, 'stone', 'metalWhite'), 0.5, 0.06, 0.4, x, y + 0.41, z);
}

function radiator(batch, M, x, y, z, w = 1.0, ry = 0) {
  const m4 = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    new THREE.Vector3(1, 1, 1));
  const prev = pushParent(batch, m4);
  const fins = Math.round(w / 0.065);
  for (let i = 0; i < fins; i++) {
    batch.box(mat(M, 'metalWhite', 'stone'), 0.04, 0.5, 0.08, -w / 2 + 0.03 + i * (w / fins), 0.3, 0);
  }
  batch.setParent(prev);
}

/* ============================================================ CANVAS TEXTURES */
function makeCanvasLabel(text, w = 512, h = 128, bgColor = '#1a3a6c', fgColor = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fgColor;
  ctx.font = `600 ${Math.round(h * 0.44)}px "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeICABannerTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  // blue gradient background
  const grad = ctx.createLinearGradient(0, 0, c.width, 0);
  grad.addColorStop(0, '#0a4080');
  grad.addColorStop(1, '#1565b8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);
  // KZ map silhouette
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.ellipse(c.width * 0.5, c.height * 0.4, 320, 140, 0, 0, Math.PI * 2);
  ctx.fill();
  // sun burst
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  ctx.arc(c.width * 0.5, c.height * 0.32, 44, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.fillRect(c.width * 0.5 + Math.cos(a) * 52 - 2, c.height * 0.32 + Math.sin(a) * 52 - 8, 4, 16);
  }
  // text
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 56px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('ҰЛЫ ДАЛАНЫҢ ҚУАТЫ', c.width / 2, c.height * 0.65);
  ctx.font = '600 44px "Segoe UI", Arial, sans-serif';
  ctx.fillText('ЭНЕРГИЯ ВЕЛИКОЙ СТЕПИ', c.width / 2, c.height * 0.78);
  ctx.font = '500 32px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('ҚазТрансГаз · ICA', c.width / 2, c.height * 0.92);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeKZMapTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a3570';
  ctx.fillRect(0, 0, c.width, c.height);
  // map outline approximation
  ctx.strokeStyle = '#00aaff';
  ctx.lineWidth = 3;
  ctx.fillStyle = 'rgba(0,120,255,0.25)';
  ctx.beginPath();
  // simplified KZ shape
  const pts = [[120,200],[200,120],[400,100],[600,80],[800,100],[900,160],[920,280],
    [860,360],[700,380],[500,400],[300,380],[160,340],[120,280]];
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // pipeline dots
  ctx.fillStyle = '#ff4444';
  const cities = [[300,220],[450,180],[600,200],[700,260],[250,300],[500,300],[750,200]];
  for (const p of cities) {
    ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffaa00'; ctx.lineWidth = 1.5;
    if (cities.indexOf(p) < cities.length - 1) {
      const n = cities[cities.indexOf(p) + 1];
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(n[0], n[1]); ctx.stroke();
    }
  }
  // labels
  ctx.fillStyle = '#ffffff';
  ctx.font = '500 28px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('МАГИСТРАЛЬНЫЕ ГАЗОПРОВОДЫ', c.width / 2, c.height * 0.9);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeSCADATexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a1a2e';
  ctx.fillRect(0, 0, c.width, c.height);
  // grid
  ctx.strokeStyle = 'rgba(0,180,255,0.15)';
  ctx.lineWidth = 1;
  for (let x = 0; x < c.width; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, c.height); ctx.stroke(); }
  for (let y = 0; y < c.height; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.width, y); ctx.stroke(); }
  // pipeline schematics
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 3;
  const pipes = [[80,256],[200,180],[350,180],[450,260],[600,260],[700,180],[900,180],[950,300]];
  ctx.beginPath();
  ctx.moveTo(pipes[0][0], pipes[0][1]);
  for (const p of pipes) ctx.lineTo(p[0], p[1]);
  ctx.stroke();
  // valve symbols
  ctx.fillStyle = '#ff4444';
  for (const p of [pipes[2], pipes[4], pipes[6]]) {
    ctx.beginPath(); ctx.arc(p[0], p[1], 10, 0, Math.PI * 2); ctx.fill();
  }
  // pressure readouts
  ctx.fillStyle = '#00ff88';
  ctx.font = '500 22px monospace';
  ctx.fillText('P1: 5.4 МПа', 200, 140);
  ctx.fillText('P2: 4.8 МПа', 500, 300);
  ctx.fillText('T: 12°C', 750, 140);
  ctx.font = '600 32px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText('МНЕМОСХЕМА УМГ «УРАЛЬСК»', c.width / 2, 44);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ============================================================ DOORS */
function door(batch, M, x, z, ry, opts = {}) {
  const { y = 0, w = 1.05, h = 2.3, open = false, label = null, doubleLeaf = false } = opts;
  const m4 = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    new THREE.Vector3(1, 1, 1));
  const prev = pushParent(batch, m4);
  const doorMat = mat(M, 'walnutDoor', 'wood');
  // frame
  for (const s of [-1, 1]) batch.box(doorMat, 0.08, h + 0.08, 0.16, s * (w / 2 + 0.04), h / 2, 0);
  batch.box(doorMat, w + 0.16, 0.08, 0.16, 0, h + 0.04, 0);
  // frosted glass transom above
  batch.box(mat(M, 'frostedGlass', 'glassTint'), w - 0.1, h * 0.36, 0.03, 0, h * 0.78, 0);
  // door leaf(ves)
  if (doubleLeaf) {
    const leafW = w / 2 - 0.04;
    if (open) {
      for (const s of [-1, 1]) {
        batch.box(doorMat, leafW, h * 0.6, 0.06, s * (w / 2 + leafW / 2 + 0.02), h * 0.3, 0.12);
      }
    } else {
      for (const s of [-1, 1]) {
        batch.box(doorMat, leafW, h * 0.6, 0.06, s * leafW / 2, h * 0.3, 0);
      }
    }
  } else {
    if (open) {
      batch.box(doorMat, w - 0.1, h * 0.6, 0.06, w / 2 + 0.4, h * 0.3, 0.12);
    } else {
      batch.box(doorMat, w - 0.1, h * 0.6, 0.06, 0, h * 0.3, 0);
    }
  }
  // handle
  batch.box(mat(M, 'chrome', 'metalDark'), 0.04, 0.2, 0.05,
    open ? w / 2 + 0.1 : w / 3, h * 0.42, open ? 0.15 : 0.05);
  // label plate above door
  if (label) {
    batch.box(getLabelMat(label, 512, 96, '#1a3a6c'), 0.5, 0.12, 0.02, 0, h + 0.18, 0.09);
  }
  batch.setParent(prev);
}

/* ============================================================ BLINDS */
function blinds(batch, M, x, y, z, w, h, ry = 0) {
  const m4 = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    new THREE.Vector3(1, 1, 1));
  const prev = pushParent(batch, m4);
  const n = Math.max(6, Math.round(w / 0.09));
  const blindMat = mat(M, 'blind', 'stone');
  for (let i = 0; i < n; i++) {
    const u = -w / 2 + (i + 0.5) * (w / n);
    batch.box(blindMat, w / n * 0.82, h, 0.015, u, h / 2, 0);
  }
  // pelmet
  batch.box(mat(M, 'stone'), w + 0.08, 0.08, 0.12, 0, h + 0.04, 0);
  batch.setParent(prev);
}

/* ============================================================ CEILING PANELS */
function ceilingGrid(batch, M, x0, z0, x1, z1, y) {
  const ceilMat = mat(M, 'ceiling', 'stone');
  const lampMat = mat(M, 'lampPanel', 'lampGlow');
  const dz = z1 - z0, dx = x1 - x0;
  // Sit 0.24m below next floor level (y = baseY + 3.6 -> cy = baseY + 3.36, cleanly below 3.44 upper slab!)
  const cy = y - 0.24;
  batch.box(ceilMat, dx, 0.03, dz, (x0 + x1) / 2, cy, (z0 + z1) / 2);
  // LED panels hanging 2cm below ceiling tiles
  const nx = Math.max(1, Math.round(dx / 3.0));
  const nz = Math.max(1, Math.round(dz / 3.5));
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const lx = x0 + (i + 0.5) * dx / nx;
      const lz = z0 + (j + 0.5) * dz / nz;
      batch.box(lampMat, 1.15, 0.03, 0.55, lx, cy - 0.025, lz);
    }
  }
}

/* ============================================================ FIRE CABINET ПК-6 */
function fireCabinet(batch, M, x, y, z, ry = 0) {
  const m4 = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    new THREE.Vector3(1, 1, 1));
  const prev = pushParent(batch, m4);
  batch.box(mat(M, 'metalWhite', 'stone'), 0.6, 0.6, 0.18, 0, 0.3, 0);
  // red stripe
  batch.box(mat(M, 'fireRed', 'metalDark'), 0.56, 0.08, 0.01, 0, 0.3, 0.1);
  // ПК-6 label
  batch.box(getLabelMat('ПК-6 / 101', 256, 64, '#cc2222'), 0.3, 0.08, 0.01, 0, 0.5, 0.1);
  batch.setParent(prev);
}

function painting(batch, M, x, y, z, ry = 0, w = 0.7, h = 0.5) {
  batch.box(mat(M, 'woodLight', 'walnutDoor'), w + 0.08, h + 0.08, 0.03, x, y, z, ry);
  batch.box(mat(M, 'painting', 'lampGlow'), w - 0.04, h - 0.04, 0.01, x, y, z, ry);
}

function flag(batch, M, x, y, z, color = 0x0066cc, ry = 0) {
  const m4 = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    new THREE.Vector3(1, 1, 1));
  const prev = pushParent(batch, m4);
  batch.cyl(mat(M, 'chrome', 'metalDark'), 0.02, 0.025, 2.15, 8, 0, 1.075, 0);
  batch.cyl(mat(M, 'metalDark'), 0.15, 0.19, 0.08, 10, 0, 0.04, 0);
  const fm = cachedMaterial({ color, roughness: 0.72, side: THREE.DoubleSide });
  batch.box(fm, 0.72, 0.46, 0.015, 0.38, 1.84, 0);
  batch.setParent(prev);
}

/* ============================================================ TURNSTILES */
function buildTurnstiles(scene, y) {
  const group = new THREE.Group();
  group.name = 'turnstiles';
  group.position.y = y;
  const turnstileZ = 8.2;
  const positions = [-1.6, 0, 1.6]; // 3 passages
  const gates = [];

  const bollardMat = cachedMaterial({ color: 0xd0d0d0, metalness: 0.7, roughness: 0.25 });
  const ledMat = cachedMaterial({ color: 0x00ff88, emissive: 0x00ff88, emissiveIntensity: 1.5 });
  const gateMat = cachedMaterial({
    type: 'physical',
    color: 0xddeeff, transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.1,
    clearcoat: 1, side: THREE.DoubleSide, depthWrite: false,
  });

  for (let i = 0; i <= positions.length; i++) {
    // bollard/post
    const bx = i === 0 ? -2.4 : i === positions.length ? 2.4 : (positions[i - 1] + positions[i]) / 2;
    const bollard = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 1.0, 0.5),
      bollardMat
    );
    bollard.position.set(bx, 0.5, turnstileZ);
    bollard.castShadow = true;
    group.add(bollard);
    // green LED strip
    const led = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.04, 0.02),
      ledMat
    );
    led.position.set(bx, 0.9, turnstileZ + 0.26);
    group.add(led);
  }

  // glass gates (animated)
  for (const px of positions) {
    const leftGate = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.9, 0.02), gateMat);
    leftGate.position.set(px - 0.2, 0.5, turnstileZ);
    const rightGate = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.9, 0.02), gateMat);
    rightGate.position.set(px + 0.2, 0.5, turnstileZ);
    group.add(leftGate, rightGate);
    gates.push({ left: leftGate, right: rightGate, x: px, z: turnstileZ, open: 0 });
  }

  scene.add(group);
  return gates;
}

/* ============================================================ SEMICIRCULAR STAIRS */
function buildGrandStairs(batch, M, colliders) {
  // Two symmetrical semicircular stairs as per f1_rot.jpg
  // Left stair: arc from ~225° to ~315° (south-west to north-west)
  // Right stair: arc from ~225° to ~315° mirrored (south-east to north-east)
  const rInner = 4.6, rOuter = 6.6;
  const stairW = rOuter - rInner;
  const rMid = (rInner + rOuter) / 2;
  const stepsPerFlight = 20;
  const risePer = 3.6 / stepsPerFlight; // height of one step
  const marbleMat = mat(M, 'marbleFloor', 'marble');
  const glassMat = mat(M, 'glass', 'glassTint');

  // Build stairs for levels 0→1 and 1→2
  for (let level = 0; level < 2; level++) {
    const baseY = FLOOR[level];
    // Left stair: arc from 200° to 340° (CCW seen from top)
    // Right stair: arc from 20° to 160°
    const arcs = [
      { a0: 200 * DEG, a1: 340 * DEG, dir: 1, label: 'left' },
      { a0: 20 * DEG, a1: 160 * DEG, dir: 1, label: 'right' },
    ];

    for (const arc of arcs) {
      const aSpan = arc.a1 - arc.a0;
      for (let i = 0; i < stepsPerFlight; i++) {
        const t = i / stepsPerFlight;
        const a = arc.a0 + t * aSpan;
        const stepY = baseY + (i + 1) * risePer;
        const p = polar(a, rMid);
        const ry = Math.atan2(Math.sin(a), -Math.cos(a));
        const stepW = (2 * Math.PI * rMid / stepsPerFlight) * (aSpan / (Math.PI * 2)) * stepsPerFlight / stepsPerFlight;
        const w = Math.max(0.6, (2 * Math.PI * rMid * Math.abs(aSpan)) / stepsPerFlight);
        // tread
        batch.box(marbleMat, w * 1.05, 0.05, stairW, p.x, stepY, p.z, ry);
        // riser
        batch.box(mat(M, 'stone'), w * 1.05, risePer, 0.04, p.x, stepY - risePer / 2, p.z, ry);

        // balustrade: chrome posts + glass panels on the outer edge
        if (i % 3 === 0) {
          const pOuter = polar(a, rOuter - 0.1);
          batch.cyl(mat(M, 'chrome', 'metalDark'), 0.02, 0.02, 0.95, 6, pOuter.x, stepY + 0.47, pOuter.z);
          // glass panel
          if (i > 0) {
            const pPrev = polar(arc.a0 + ((i - 3) / stepsPerFlight) * aSpan, rOuter - 0.1);
            const mx = (pOuter.x + pPrev.x) / 2;
            const mz = (pOuter.z + pPrev.z) / 2;
            const panW = Math.hypot(pOuter.x - pPrev.x, pOuter.z - pPrev.z);
            const panRy = Math.atan2(pOuter.x - pPrev.x, pOuter.z - pPrev.z);
            batch.box(glassMat, panW, 0.7, 0.01,
              mx, stepY + 0.35 - risePer, mz, panRy);
          }
          // wooden handrail
          const pHand = polar(a, rOuter - 0.05);
          batch.box(mat(M, 'wood'), 0.06, 0.04, 0.06, pHand.x, stepY + 0.95, pHand.z, ry);
        }
      }

      // stair collider
      colliders.push({
        type: 'arcStair',
        cx: 0, cz: 0,
        rInner, rOuter,
        a0: arc.a0, a1: arc.a1,
        y0: PODIUM + baseY, y1: PODIUM + baseY + 3.6,
        steps: stepsPerFlight,
      });
    }
  }
}

/* ============================================================ ELEVATOR SHAFT */
function buildElevator(batch, M, parentGroup, colliders) {
  const shaftR = R.core; // 1.85
  const shaftMat = mat(M, 'chrome', 'metalDark');
  const glassMat = mat(M, 'glass', 'glassTint');

  // Glass-chrome shaft frame from floor 1 to floor 3
  const shaftH = FLOOR[2] + WALL_H; // top of shaft
  // Outer glass cylinder
  const outerGlass = new THREE.CylinderGeometry(shaftR, shaftR, shaftH, 32, 1, true);
  batch.add(outerGlass, glassMat, new THREE.Matrix4().makeTranslation(0, shaftH / 2, 0));
  // Chrome mullions
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const p = polar(a, shaftR);
    batch.box(shaftMat, 0.06, shaftH, 0.08, p.x, shaftH / 2, p.z,
      Math.atan2(Math.sin(a), -Math.cos(a)));
  }
  // Horizontal rings
  for (let lv = 0; lv < 3; lv++) {
    const fy = FLOOR[lv];
    const ring = new THREE.TorusGeometry(shaftR + 0.02, 0.04, 8, 32);
    ring.rotateX(Math.PI / 2);
    batch.add(ring, shaftMat, new THREE.Matrix4().makeTranslation(0, fy, 0));
    batch.add(ring.clone(), shaftMat, new THREE.Matrix4().makeTranslation(0, fy + WALL_H, 0));
  }

  // Sliding doors on each floor (facing south +Z) — added to parentGroup so Y aligns with PODIUM!
  const doorParts = [];
  const elevDoorMat = cachedMaterial({ color: 0xd0d4dc, metalness: 0.75, roughness: 0.22 });
  const callBtnMat = cachedMaterial({ color: 0x00ff88, emissive: 0x00ff88, emissiveIntensity: 1.0 });
  for (let lv = 0; lv < 3; lv++) {
    const fy = FLOOR[lv];
    const leftDoor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.3, 0.04), elevDoorMat);
    leftDoor.position.set(-0.28, fy + 1.15, shaftR + 0.04);
    leftDoor.castShadow = true;
    const rightDoor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.3, 0.04), elevDoorMat);
    rightDoor.position.set(0.28, fy + 1.15, shaftR + 0.04);
    rightDoor.castShadow = true;
    parentGroup.add(leftDoor, rightDoor);
    doorParts.push({ left: leftDoor, right: rightDoor, level: lv, baseX: [-0.28, 0.28], open: 0 });

    // Floor indicator panel
    batch.box(getLabelMat(`${lv + 1}`, 128, 128, '#1a1a1a', '#00ff88'), 0.15, 0.15, 0.02, 0.65, fy + 2.5, shaftR + 0.08);

    // Call button
    batch.box(mat(M, 'chrome', 'metalDark'), 0.08, 0.08, 0.03, 0.65, fy + 1.1, shaftR + 0.08);
    batch.box(callBtnMat,
      0.04, 0.04, 0.01, 0.65, fy + 1.1, shaftR + 0.1);
  }

  // Elevator cabin
  const cabin = new THREE.Group();
  cabin.name = 'elevator-cabin';
  const cabinFloor = new THREE.Mesh(
    new THREE.CylinderGeometry(shaftR - 0.15, shaftR - 0.15, 0.08, 24),
    cachedMaterial({ color: 0xd0ccc0, roughness: 0.5 })
  );
  cabin.add(cabinFloor);
  const cabinLight = new THREE.PointLight(0xfff4e0, 2.2, 8, 1.4);
  cabinLight.position.y = 2.5;
  cabin.add(cabinLight);
  const railGeo = new THREE.TorusGeometry(shaftR - 0.25, 0.02, 8, 24, Math.PI);
  const railMat = cachedMaterial({ color: 0xc0c0c0, metalness: 0.8, roughness: 0.2 });
  const rail = new THREE.Mesh(railGeo, railMat);
  rail.rotation.x = Math.PI / 2;
  rail.position.set(0, 1.0, 0);
  cabin.add(rail);
  const mirrorGeo = new THREE.PlaneGeometry(1.0, 1.6);
  const mirrorMat = cachedMaterial({ color: 0xeeeef4, metalness: 0.9, roughness: 0.05 });
  const mirror = new THREE.Mesh(mirrorGeo, mirrorMat);
  mirror.position.set(0, 1.3, -(shaftR - 0.2));
  cabin.add(mirror);

  cabin.position.y = FLOOR[0];
  parentGroup.add(cabin);

  // Shaft collider (solid cylinder)
  colliders.push({ type: 'circle', x: 0, z: 0, r: shaftR + 0.1, y0: PODIUM, y1: PODIUM + shaftH });

  // Elevator collider for controls.js
  colliders.push({
    type: 'elevator',
    x: 0, z: shaftR + 0.6, r: 1.4,
    levels: [PODIUM + FLOOR[0], PODIUM + FLOOR[1], PODIUM + FLOOR[2]],
  });

  return { doorParts, cabin };
}

/* ============================================================ HALL (rotunda floors) */
function hall(batch, M, colliders) {
  const r = R.hall;
  const marbleMat = mat(M, 'marbleFloor', 'marble');

  for (let lv = 0; lv < 3; lv++) {
    const y = FLOOR[lv];
    // polished marble floor — annular ring on upper floors with stairwell cutouts (20°..160°, 200°..340°)
    if (lv === 0) {
      batch.add(new THREE.CylinderGeometry(r - 0.1, r - 0.1, 0.04, 72),
        marbleMat, new THREE.Matrix4().makeTranslation(0, y + 0.02, 0));
    } else {
      addRotundaRing(batch, marbleMat, R.core + 0.06, r - 0.1, y + 0.02, false, true);
    }
    // decorative concentric ring ornament (skip stairwell band on upper floors)
    const ringRadii = lv === 0 ? [r - 2.0, r - 1.5, 5.0, 3.0] : [r - 1.5, 3.0];
    for (const rr of ringRadii) {
      const ring = new THREE.TorusGeometry(rr, 0.03, 8, 64);
      ring.rotateX(Math.PI / 2);
      batch.add(ring, mat(M, 'graniteDark', 'granite'),
        new THREE.Matrix4().makeTranslation(0, y + 0.04, 0));
    }

    // Eight columns
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const p = polar(a, r - 1.1);
      batch.cyl(mat(M, 'stone'), 0.28, 0.34, 3.1, 14, p.x, y + 1.65, p.z);
      batch.box(mat(M, 'stone'), 0.72, 0.16, 0.72, p.x, y + 3.24, p.z, -a);
      batch.box(mat(M, 'stone'), 0.78, 0.2, 0.78, p.x, y + 0.12, p.z, -a);
      colliders.push({ type: 'circle', x: p.x, z: p.z, r: 0.4, y0: PODIUM + y, y1: PODIUM + y + WALL_H });
    }

    // Bright white Armstrong ceiling ring (with stairwell cutouts on levels 0 & 1) + recessed LED panels
    addRotundaRing(batch, mat(M, 'ceiling', 'stone'), R.core + 0.06, r - 0.1, y + 3.36, true, lv < 2);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const p = polar(a, r - 1.55);
      batch.box(mat(M, 'lampPanel', 'lampGlow'), 1.05, 0.04, 0.5, p.x, y + 3.33, p.z, -a);
    }
  }

  // Lobby chandelier globes around elevator core
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const p = polar(a, 3.2);
    batch.cyl(mat(M, 'chrome', 'metalWhite'), 0.015, 0.015, 1.0, 4, p.x, 2.85, p.z);
    batch.add(new THREE.SphereGeometry(0.14, 10, 8), mat(M, 'lampGlow'),
      new THREE.Matrix4().makeTranslation(p.x, 2.35, p.z));
  }
}

/* ============================================================ GUARD POST (left of entry) */
function guardPost(batch, M, colliders) {
  // Positioned left of the turnstiles (x = -3.85, z = 8.4) angled slightly toward entrance (+Z/+X)
  // so visitor/lobby camera clearly sees the guard behind the desk AND the glowing blue ICA banner!
  const gx = -3.85, gz = 8.4;
  const ry = 0.32;
  const m4 = new THREE.Matrix4().compose(
    new THREE.Vector3(gx, 0, gz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    new THREE.Vector3(1, 1, 1));
  const prev = batch.parent;
  batch.setParent(m4);

  // Two-tier light grey reception/security counter
  const deskMat = mat(M, 'guardDesk', 'stone');
  batch.box(deskMat, 2.4, 1.06, 0.72, 0, 0.53, 0);
  batch.box(deskMat, 2.5, 0.06, 0.86, 0, 1.09, 0.02);
  // Decorative front accent band
  batch.box(mat(M, 'signBlue', 'metalDark'), 2.36, 0.12, 0.03, 0, 0.82, 0.37);

  // CCTV monitor (angled toward guard)
  batch.box(mat(M, 'metalDark'), 0.46, 0.32, 0.03, -0.58, 1.38, -0.08);
  batch.box(mat(M, 'metalDark'), 0.08, 0.14, 0.08, -0.58, 1.20, -0.08);
  batch.box(mat(M, 'officeScreen', 'lampGlow'), 0.42, 0.28, 0.01, -0.58, 1.38, -0.06);

  // Phone + visitor logbook
  batch.box(mat(M, 'metalDark'), 0.22, 0.06, 0.14, 0.58, 1.15, 0.04);
  batch.box(mat(M, 'stone'), 0.34, 0.03, 0.42, 0.12, 1.135, 0.08);

  // Guard figure standing BEHIND the desk (local z = -0.42) FACING visitor (+Z)!
  const skinMat = cachedMaterial({ color: 0xd4a47e, roughness: 0.55 });
  const uniformMat = cachedMaterial({ color: 0x1b2b52, roughness: 0.68 });
  const shirtMat = cachedMaterial({ color: 0xeef2f8, roughness: 0.7 });
  const guardZ = -0.44;
  // Torso & white collar
  batch.box(uniformMat, 0.46, 0.56, 0.28, 0, 1.28, guardZ);
  batch.box(shirtMat, 0.16, 0.18, 0.29, 0, 1.48, guardZ + 0.01);
  // Badge on chest
  batch.box(cachedMaterial({ color: 0xe8c448, metalness: 0.8, roughness: 0.25 }),
    0.07, 0.07, 0.02, 0.12, 1.42, guardZ + 0.15);
  // Shoulders & arms reaching onto counter
  batch.box(uniformMat, 0.14, 0.36, 0.14, -0.28, 1.26, guardZ + 0.06);
  batch.box(uniformMat, 0.14, 0.36, 0.14, 0.28, 1.26, guardZ + 0.06);
  batch.box(skinMat, 0.10, 0.07, 0.12, -0.26, 1.14, guardZ + 0.24);
  batch.box(skinMat, 0.10, 0.07, 0.12, 0.26, 1.14, guardZ + 0.24);
  // Head & peaked cap facing +Z
  batch.box(skinMat, 0.19, 0.22, 0.19, 0, 1.68, guardZ);
  batch.box(uniformMat, 0.23, 0.09, 0.23, 0, 1.83, guardZ);
  batch.box(mat(M, 'metalDark'), 0.22, 0.025, 0.13, 0, 1.79, guardZ + 0.13);

  // Large glowing blue ICA corporate stand directly behind the guard (facing +Z toward visitor!)
  const standZ = -1.25;
  // Sleek metallic stand legs & frame
  batch.box(mat(M, 'chrome', 'metalDark'), 0.06, 2.95, 0.06, -1.58, 1.48, standZ);
  batch.box(mat(M, 'chrome', 'metalDark'), 0.06, 2.95, 0.06, 1.58, 1.48, standZ);
  batch.box(mat(M, 'metalDark'), 3.22, 1.72, 0.06, 0, 2.08, standZ);
  // Glowing ICA Banner front face
  batch.box(mat(M, 'icaBanner', 'signBlue'), 3.12, 1.62, 0.02, 0, 2.08, standZ + 0.035);

  batch.setParent(prev);

  // Collider for guard desk
  colliders.push({ type: 'rect', x0: gx - 1.3, x1: gx + 1.3, z0: gz - 0.6, z1: gz + 0.6,
    y0: PODIUM, y1: PODIUM + 1.2 });
}

/* ============================================================ WAITING AREA (right of entry) */
function waitingArea(batch, M) {
  const y = 0;
  const wx = 4.4, wz = 8.8;

  // Two leather sofas angled neatly facing the lobby
  sofa(batch, M, wx, y, wz - 1.1, -Math.PI / 2 - 0.25);
  sofa(batch, M, wx + 0.3, y, wz + 1.3, -Math.PI / 2 - 0.25);
  // Glass coffee table
  batch.box(mat(M, 'glass', 'glassTint'), 0.9, 0.04, 0.55, wx - 0.9, y + 0.42, wz + 0.1);
  batch.cyl(mat(M, 'chrome', 'metalDark'), 0.03, 0.03, 0.4, 6, wx - 1.2, y + 0.2, wz + 0.1);
  batch.cyl(mat(M, 'chrome', 'metalDark'), 0.03, 0.03, 0.4, 6, wx - 0.6, y + 0.2, wz + 0.1);

  // Large ficus
  plant(batch, M, wx + 0.8, y, wz - 2.3, 1.45);
  plant(batch, M, -6.2, y, 9.6, 1.35);

  // Coat rack
  batch.cyl(mat(M, 'metalDark'), 0.025, 0.025, 1.7, 8, wx + 1.2, y + 0.85, wz + 2.3);
  batch.cyl(mat(M, 'metalDark'), 0.2, 0.22, 0.04, 10, wx + 1.2, y + 0.02, wz + 2.3);
  for (let i = 0; i < 4; i++) {
    const ha = (i / 4) * Math.PI * 2;
    batch.box(mat(M, 'metalDark'), 0.14, 0.02, 0.02, wx + 1.2 + Math.sin(ha) * 0.12, y + 1.65, wz + 2.3 + Math.cos(ha) * 0.12, ha);
  }
}

/* ============================================================ BLOCK CORRIDORS + ROOMS */
function blockWing(batch, M, colliders) {
  const x0 = B.x0 + 0.4, x1 = B.x1 - 0.4;
  const z0 = B.z0 + 0.4, z1 = B.z1 - 0.4;
  const halfCorr = CORR_W / 2;
  const corrCZ = CORR_Z; // corridor center (-0.5)
  const wallH = 3.38;

  for (let lv = 0; lv < 3; lv++) {
    const y = FLOOR[lv];

    // Corridor floor — oak laminate
    batch.box(mat(M, 'oakLaminate', 'carpet'), x1 - x0, 0.02, CORR_W, (x0 + x1) / 2, y + 0.01, corrCZ);

    // Ceiling grid for corridor
    ceilingGrid(batch, M, x0, corrCZ - halfCorr, x1, corrCZ + halfCorr, y + WALL_H);

    // Corridor walls (north and south) — clean height 3.38m meeting Armstrong ceiling
    const wallMat = mat(M, 'plasterWall', 'stone');
    batch.box(wallMat, x1 - x0, wallH, PART_T, (x0 + x1) / 2, y + wallH / 2, corrCZ - halfCorr);
    batch.box(wallMat, x1 - x0, wallH, PART_T, (x0 + x1) / 2, y + wallH / 2, corrCZ + halfCorr);

    // Rooms: north side (corridor wall zNear = corrCZ - halfCorr, exterior window wall zFar = z0)
    const roomsNorth = getRoomLayoutBlock(lv, 'north');
    const roomsSouth = getRoomLayoutBlock(lv, 'south');

    buildBlockRooms(batch, M, colliders, roomsNorth, x0, x1,
      corrCZ - halfCorr, z0, y, lv, 0);

    buildBlockRooms(batch, M, colliders, roomsSouth, x0, x1,
      corrCZ + halfCorr, z1, y, lv, Math.PI);

    // Fire cabinets in corridor
    if (lv === 0) {
      fireCabinet(batch, M, (x0 + x1) / 2, y, corrCZ - halfCorr + 0.11, 0);
      fireCabinet(batch, M, x0 + 4, y, corrCZ + halfCorr - 0.11, Math.PI);
    }

    // Paintings in corridor
    for (let i = 0; i < 3; i++) {
      painting(batch, M, x0 + 5 + i * 7, y + 2.0, corrCZ + halfCorr - 0.09, Math.PI);
    }
  }
}

function getRoomLayoutBlock(level, side) {
  // Returns array of room definitions for the block wing
  const rooms = [];
  if (level === 0) {
    if (side === 'north') {
      rooms.push({ label: 'Диспетчерская УМГ', type: 'dispatch', span: 2, open: true });
      rooms.push({ label: 'АСУ ТП', type: 'office' });
      rooms.push({ label: 'Серверная', type: 'office' });
    } else {
      rooms.push({ label: 'Бухгалтерия', type: 'office', span: 2 });
      rooms.push({ label: 'Касса', type: 'office' });
      rooms.push({ label: 'Архив', type: 'office' });
    }
  } else if (level === 1) {
    if (side === 'north') {
      rooms.push({ label: 'Актовый зал', type: 'assembly', span: 4, open: true });
    } else {
      rooms.push({ label: 'ПТО', type: 'office' });
      rooms.push({ label: 'Кадры', type: 'office' });
      rooms.push({ label: 'Юридический', type: 'office' });
      rooms.push({ label: 'Снабжение', type: 'office' });
    }
  } else {
    if (side === 'north') {
      rooms.push({ label: 'Служба ЭХЗ', type: 'office', span: 2 });
      rooms.push({ label: 'Отдел ОТ и ТБ', type: 'office', span: 2 });
    } else {
      rooms.push({ label: 'Экология', type: 'office' });
      rooms.push({ label: 'Планирование', type: 'office' });
      rooms.push({ label: 'Экономика', type: 'office' });
      rooms.push({ label: 'Канцелярия', type: 'office' });
    }
  }
  return rooms;
}

function buildBlockRooms(batch, M, colliders, rooms, x0, x1, zNear, zFar, baseY, level, doorRy) {
  const totalSpan = rooms.reduce((s, r) => s + (r.span || 1), 0);
  const totalW = x1 - x0;
  const wallH = 3.38;
  let cx = x0;
  const isNorth = zFar < zNear;

  for (const room of rooms) {
    const sp = room.span || 1;
    const rw = (sp / totalSpan) * totalW;
    const rx0 = cx, rx1 = cx + rw;
    const rcx = (rx0 + rx1) / 2;
    const rcz = (zNear + zFar) / 2;
    const rd = Math.abs(zFar - zNear);

    // Room floor — bright warm oak laminate
    batch.box(mat(M, 'oakLaminate', 'carpet'), rw - 0.16, 0.02, rd - 0.16, rcx, baseY + 0.01, rcz);

    // Dividing walls between rooms
    if (cx > x0 + 0.1) {
      batch.box(mat(M, 'plasterWall', 'stone'), PART_T, wallH, rd, cx, baseY + wallH / 2, rcz);
    }

    // Ceiling with glowing LED panels
    ceilingGrid(batch, M, rx0 + 0.15, Math.min(zNear, zFar) + 0.15, rx1 - 0.15, Math.max(zNear, zFar) - 0.15, baseY + WALL_H);

    // Door in corridor wall at correct floor baseY
    door(batch, M, rcx, zNear, doorRy,
      { y: baseY, open: room.open || false, label: room.label, doubleLeaf: sp >= 2 && room.open,
        w: room.open ? 1.6 : 1.05 });

    // Blinds & radiator on exterior window wall (zFar)
    const extSign = isNorth ? 1 : -1;
    const extRy = isNorth ? 0 : Math.PI;
    if (room.type !== 'assembly' && room.type !== 'dispatch') {
      blinds(batch, M, rcx, baseY + 0.95, zFar + extSign * 0.08, Math.min(rw - 1.0, 1.5), 2.0, extRy);
      radiator(batch, M, rcx, baseY, zFar + extSign * 0.15, Math.min(rw - 1.5, 1.0), extRy);
    }

    // Furnish room by type
    if (room.type === 'dispatch' && level === 0) {
      buildDispatchRoom(batch, M, rx0, rx1, zNear, zFar, baseY);
    } else if (room.type === 'assembly' && level === 1) {
      buildAssemblyHall(batch, M, rx0, rx1, zNear, zFar, baseY, colliders);
    } else {
      buildOfficeRoom(batch, M, rx0, rx1, zNear, zFar, baseY, room.label);
    }

    cx += rw;
  }
}

/* ============================================================ DISPATCH ROOM (SCADA) */
function buildDispatchRoom(batch, M, x0, x1, zNear, zFar, y) {
  // Room bounds: x = -33.2..-21.5 (11.7m), z = -7.2..-1.9 (5.3m, cz = -4.55)
  const cz = (zNear + zFar) / 2;
  const zMin = Math.min(zNear, zFar), zMax = Math.max(zNear, zFar);

  // Curved 5-panel glowing SCADA video wall mounted prominently on the SOLID WEST END WALL (facing +X!)
  const scadaMat = mat(M, 'scadaScreen', 'lampGlow');
  const frameMat = mat(M, 'metalDark');
  const cyanAccent = cachedMaterial({ color: 0x00e8ff, emissive: 0x00d8ff, emissiveIntensity: 1.4, roughness: 0.3 });
  const wallX = x0 + 0.35; // -32.85
  const segs = 5;
  const totalArcW = 4.3;
  const panelW = totalArcW / segs;
  const panelH = 1.95;

  // Sleek dark video-wall backing housing & top/bottom cyan light rails
  batch.box(frameMat, 0.14, panelH + 0.24, totalArcW + 0.32, wallX - 0.1, y + 1.82, cz);
  batch.box(cyanAccent, 0.06, 0.04, totalArcW + 0.24, wallX + 0.02, y + 1.82 + panelH / 2 + 0.09, cz);
  batch.box(cyanAccent, 0.06, 0.04, totalArcW + 0.24, wallX + 0.02, y + 1.82 - panelH / 2 - 0.09, cz);

  // Main wide unified SCADA mnemonic display (crisp full-width readable schematic) + side angled telemetry wings
  batch.box(scadaMat, 2.85, panelH, 0.04, wallX + 0.06, y + 1.82, cz, Math.PI / 2);
  // Left & right slightly angled SCADA side screens (concave facing +X into room)
  for (const sgn of [-1, 1]) {
    const pz = cz + sgn * 1.92;
    const px = wallX + 0.24;
    const pry = Math.PI / 2 + sgn * 0.28;
    batch.box(frameMat, 1.12, panelH + 0.08, 0.07, px - 0.04, y + 1.82, pz, pry);
    batch.box(scadaMat, 1.04, panelH - 0.04, 0.03, px + 0.01, y + 1.82, pz, pry);
  }

  // 3 Operator Consoles facing the SCADA video wall (-X) in a clean ergonomic arc
  const consoleZs = [cz - 1.55, cz, cz + 1.55];
  for (let i = 0; i < 3; i++) {
    const dz = consoleZs[i];
    const dx = x0 + 3.85 + (i === 1 ? 0.25 : 0); // subtle arc
    const cry = i === 0 ? -0.14 : i === 2 ? 0.14 : 0;
    const m4 = new THREE.Matrix4().compose(
      new THREE.Vector3(dx, y, dz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2 + cry, 0)),
      new THREE.Vector3(1, 1, 1));
    const prev = pushParent(batch, m4);
    // Sleek dispatcher console desk
    batch.box(frameMat, 1.42, 0.72, 0.76, 0, 0.36, 0);
    batch.box(mat(M, 'woodLight', 'oakLaminate'), 1.48, 0.045, 0.82, 0, 0.745, 0);
    // Front modesty glow strip
    batch.box(cyanAccent, 1.25, 0.025, 0.02, 0, 0.64, -0.39);
    // Dual angled SCADA/telemetry monitors facing operator (+Z local -> +X world)
    for (const s of [-1, 1]) {
      batch.box(frameMat, 0.56, 0.34, 0.035, s * 0.31, 1.08, -0.18, -s * 0.14);
      batch.box(frameMat, 0.07, 0.18, 0.07, s * 0.31, 0.86, -0.18);
      batch.box(mat(M, 'scadaScreen', 'officeScreen'), 0.50, 0.28, 0.01, s * 0.31, 1.08, -0.16, -s * 0.14);
    }
    // Keyboard & mouse
    batch.box(frameMat, 0.42, 0.018, 0.14, -0.05, 0.775, 0.12);
    batch.box(frameMat, 0.07, 0.018, 0.11, 0.28, 0.775, 0.12);
    // Ergonomic operator chair behind console (local +Z)
    officeChair(batch, M, 0, 0, 0.78, 0);
    batch.setParent(prev);
  }

  // Server racks with blinking status LEDs along south corridor wall
  for (let r = 0; r < 2; r++) {
    const rx = x0 + 6.4 + r * 0.95;
    const rz = zMax - 0.55;
    batch.box(frameMat, 0.72, 2.05, 0.65, rx, y + 1.025, rz);
    for (let i = 0; i < 9; i++) {
      const ledColor = i % 3 === 0 ? 0x00ff66 : i % 3 === 1 ? 0x00d8ff : 0xffaa22;
      batch.box(cachedMaterial({ color: ledColor, emissive: ledColor, emissiveIntensity: 2.0 }),
        0.045, 0.025, 0.015, rx - 0.18 + (i % 3) * 0.16, y + 0.35 + i * 0.18, rz - 0.33);
    }
  }

  // Blinds & radiators on north exterior windows
  for (const bx of [x0 + 2.5, x0 + 6.2, x0 + 9.6]) {
    blinds(batch, M, bx, y + 0.95, zMin + 0.08, 1.45, 2.0, 0);
    radiator(batch, M, bx, y, zMin + 0.16, 1.0, 0);
  }

  // Digital clock above SCADA video wall
  batch.box(getLabelMat('14:35 · УМГ УРАЛЬСК', 512, 96, '#081b36', '#00f5ff'), 1.3, 0.24, 0.04, wallX + 0.06, y + 3.08, cz, Math.PI / 2);
}

/* ============================================================ ASSEMBLY HALL */
function buildAssemblyHall(batch, M, x0, x1, zNear, zFar, y, colliders) {
  // Longitudinal auditorium: x = -33.2..-9.8 (23.4m), z = -7.2..-1.9 (5.3m, cz = -4.55)
  // Stage & Presidium at solid West end (x = x0), audience rows facing -X!
  const cz = (zNear + zFar) / 2;
  const zMin = Math.min(zNear, zFar), zMax = Math.max(zNear, zFar);
  const wallH = 3.38;

  // White structural square columns flanking the auditorium colonnade
  for (const colx of [x0 + 6.8, x0 + 12.2, x0 + 17.6]) {
    for (const colz of [zMin + 0.45, zMax - 0.45]) {
      batch.box(mat(M, 'stone'), 0.44, wallH, 0.44, colx, y + wallH / 2, colz);
      batch.box(mat(M, 'stone'), 0.56, 0.14, 0.56, colx, y + wallH - 0.07, colz);
      batch.box(mat(M, 'stone'), 0.54, 0.14, 0.54, colx, y + 0.07, colz);
      colliders.push({ type: 'rect', x0: colx - 0.25, x1: colx + 0.25, z0: colz - 0.25, z1: colz + 0.25,
        y0: PODIUM + y, y1: PODIUM + y + wallH });
    }
  }

  // Raised warm-oak stage platform at West end
  batch.box(mat(M, 'woodLight', 'oakLaminate'), 4.4, 0.14, zMax - zMin - 0.4, x0 + 2.25, y + 0.07, cz);

  // Large glowing blue ICA banner centered on solid West wall (facing +X toward audience!)
  batch.box(mat(M, 'metalDark'), 0.06, 1.98, 3.88, x0 + 0.08, y + 2.08, cz);
  batch.box(mat(M, 'icaBanner', 'signBlue'), 3.76, 1.88, 0.03, x0 + 0.12, y + 2.08, cz, Math.PI / 2);

  // Flags flanking the ICA banner on stage (angled broadside toward audience!)
  flag(batch, M, x0 + 0.65, y + 0.14, zMin + 0.55, 0x00b4e8, -Math.PI / 2); // RK
  flag(batch, M, x0 + 0.65, y + 0.14, zMax - 1.05, 0x0055aa, Math.PI / 2);  // QazaqGaz
  flag(batch, M, x0 + 0.65, y + 0.14, zMax - 0.50, 0x1a4488, Math.PI / 2);  // ICA

  // Long walnut Presidium table (facing +X) + 4 executive chairs behind it
  const presX = x0 + 2.45;
  batch.box(mat(M, 'walnutDoor', 'wood'), 0.88, 0.06, 3.4, presX, y + 0.14 + 0.74, cz);
  batch.box(mat(M, 'walnutDoor', 'wood'), 0.06, 0.72, 3.32, presX + 0.40, y + 0.14 + 0.36, cz);
  batch.box(mat(M, 'walnutDoor', 'wood'), 0.84, 0.72, 0.06, presX, y + 0.14 + 0.36, cz - 1.66);
  batch.box(mat(M, 'walnutDoor', 'wood'), 0.84, 0.72, 0.06, presX, y + 0.14 + 0.36, cz + 1.66);
  // Desktop microphones on presidium table
  for (let i = 0; i < 4; i++) {
    const mz = cz - 1.15 + i * 0.76;
    batch.cyl(mat(M, 'metalDark'), 0.05, 0.06, 0.03, 8, presX + 0.18, y + 0.92, mz);
    batch.cyl(mat(M, 'chrome'), 0.008, 0.008, 0.24, 6, presX + 0.14, y + 1.04, mz);
    // Presidium chair behind table facing +X (ry = -Math.PI/2 -> backrest at -X!)
    officeChair(batch, M, presX - 0.72, y + 0.14, mz, -Math.PI / 2);
  }

  // Speaker tribune / podium on the right side of stage (facing +X)
  const podX = x0 + 3.85, podZ = cz - 1.65;
  batch.box(mat(M, 'walnutDoor', 'wood'), 0.56, 1.12, 0.74, podX, y + 0.14 + 0.56, podZ);
  batch.box(mat(M, 'woodLight', 'wood'), 0.64, 0.05, 0.80, podX + 0.02, y + 0.14 + 1.14, podZ, 0, 0, -0.18);
  batch.cyl(mat(M, 'chrome'), 0.01, 0.01, 0.26, 6, podX - 0.12, y + 0.14 + 1.28, podZ);

  // Central aisle carpet runner (deep corporate blue)
  batch.box(cachedMaterial({ color: 0x16427a, roughness: 0.9 }),
    10.8, 0.015, 0.92, x0 + 10.6, y + 0.025, cz);

  // 7 neat rows of conference chairs (3 left + 3 right of central aisle), facing -X toward stage!
  // In conferenceChair(), backrest is at local -Z -> ry = +Math.PI/2 puts backrest at +X so seat faces -X!
  for (let row = 0; row < 7; row++) {
    const rx = x0 + 6.0 + row * 1.32;
    for (const sz of [cz - 1.85, cz - 1.28, cz - 0.72, cz + 0.72, cz + 1.28, cz + 1.85]) {
      conferenceChair(batch, M, rx, y, sz, Math.PI / 2);
    }
  }

  // Whiteboard on south corridor wall
  batch.box(mat(M, 'metalDark'), 2.1, 1.24, 0.04, x0 + 8.5, y + 1.82, zMax - 0.12);
  batch.box(mat(M, 'stone'), 2.0, 1.14, 0.02, x0 + 8.5, y + 1.82, zMax - 0.14);

  // Blinds & radiators on north exterior windows
  for (let i = 0; i < 6; i++) {
    const bx = x0 + 2.0 + i * 3.8;
    blinds(batch, M, bx, y + 0.95, zMin + 0.08, 1.4, 2.0, 0);
    radiator(batch, M, bx, y, zMin + 0.16, 1.0, 0);
  }
}

/* ============================================================ MEETING ROOM (wing) */
function buildMeetingRoom(batch, M, cx, cy, cz, ry, roomD, roomL, colliders) {
  // Local frame: +Z along wing (length roomL ≈ 15m), -X toward SE exterior windows, +X toward NW corridor!
  const m4 = new THREE.Matrix4().compose(
    new THREE.Vector3(cx, cy, cz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    new THREE.Vector3(1, 1, 1));
  const prev = batch.parent;
  batch.setParent(m4);

  const wallH = 3.38;

  // Long warm-oak conference table oriented along local Z (length 7.6m, width 1.85m) with black center stripe
  const tableLen = Math.min(roomL - 4.8, 7.6);
  const tableW = 1.85;
  batch.box(mat(M, 'woodLight', 'oakLaminate'), tableW, 0.07, tableLen, 0, 0.74, -0.3);
  batch.box(mat(M, 'metalDark'), 0.28, 0.02, tableLen - 0.4, 0, 0.78, -0.3); // central tech stripe
  // Chrome pedestal legs
  for (const sz of [-tableLen / 2 + 0.6, 0, tableLen / 2 - 0.6]) {
    batch.box(mat(M, 'chrome', 'metalDark'), 1.15, 0.68, 0.09, 0, 0.37, sz - 0.3);
  }

  // 12 built-in flip-up monitors + 12 black leather executive chairs (6 per side along Z!)
  const seatsPerSide = 6;
  const seatSpacing = (tableLen - 1.0) / (seatsPerSide - 1);
  for (let i = 0; i < seatsPerSide; i++) {
    const sz = -0.3 - (tableLen - 1.0) / 2 + i * seatSpacing;
    for (const side of [-1, 1]) {
      // Built-in flip-up monitor facing seat (local side * X)
      batch.box(mat(M, 'metalDark'), 0.03, 0.24, 0.36, side * 0.44, 0.91, sz);
      batch.box(mat(M, 'officeScreen', 'lampGlow'), 0.012, 0.19, 0.31, side * 0.455, 0.91, sz);
      // Executive chair facing inward toward table (backrest at local +Z -> ry = side * Math.PI/2 puts backrest at +side*X!)
      officeChair(batch, M, side * 1.28, 0, sz, side * Math.PI / 2);
    }
  }
  // Head chair at far end facing the room
  officeChair(batch, M, 0, 0, -0.3 + tableLen / 2 + 0.72, 0);

  // Glowing blue Kazakhstan Map on the far solid NE end wall (local +Z, facing -Z toward camera!)
  const endZ = roomL / 2 - 0.16;
  const glowBack = cachedMaterial({
    color: 0x00aaff, emissive: 0x0088ff, emissiveIntensity: 1.5, roughness: 0.3,
  });
  batch.box(glowBack, 3.55, 1.92, 0.04, 0, 1.94, endZ + 0.04);
  batch.box(mat(M, 'metalDark'), 3.48, 1.86, 0.05, 0, 1.94, endZ + 0.01);
  batch.box(mat(M, 'kzMapGlow', 'signBlue'), 3.36, 1.74, 0.025, 0, 1.94, endZ - 0.03);

  // 3 flags flanking the glowing KZ map (RK cyan, QazaqGaz royal blue, ICA navy)
  flag(batch, M, -2.15, 0, endZ - 0.48, 0x00b8ec);
  flag(batch, M, 1.92, 0, endZ - 0.48, 0x0066cc);
  flag(batch, M, 2.22, 0, endZ - 0.85, 0x1a4488);

  // Frosted glass partition with horizontal matte stripes along the corridor side (local +X)
  const corrX = roomD / 2 - 0.08;
  const partGlass = mat(M, 'frostedGlass', 'glassTint');
  batch.box(partGlass, 0.03, wallH, roomL - 0.3, corrX, wallH / 2, 0);
  for (let i = 0; i < 6; i++) {
    batch.box(mat(M, 'stone'), 0.02, 0.07, roomL - 0.4, corrX, 0.45 + i * 0.5, 0);
  }

  // Open-front Trophy Display Cabinet with gleaming golden cups facing -X into the Meeting Room!
  const cabX = corrX - 0.34, cabZ = 4.2;
  const cabW = 0.42, cabH = 2.15, cabD = 1.6;
  // Back panel (against corridor +X), top, bottom, and side cheeks — OPEN toward -X (camera)!
  batch.box(mat(M, 'walnutDoor', 'wood'), 0.05, cabH, cabD, cabX + cabW / 2 - 0.025, cabH / 2, cabZ);
  batch.box(mat(M, 'walnutDoor', 'wood'), cabW, 0.06, cabD, cabX, cabH - 0.03, cabZ);
  batch.box(mat(M, 'walnutDoor', 'wood'), cabW, 0.08, cabD, cabX, 0.04, cabZ);
  batch.box(mat(M, 'walnutDoor', 'wood'), cabW, cabH, 0.05, cabX, cabH / 2, cabZ - cabD / 2 + 0.025);
  batch.box(mat(M, 'walnutDoor', 'wood'), cabW, cabH, 0.05, cabX, cabH / 2, cabZ + cabD / 2 - 0.025);
  // Light cream interior backing behind trophies so gold cups pop
  batch.box(mat(M, 'plasterWall', 'stone'), 0.02, cabH - 0.14, cabD - 0.12, cabX + cabW / 2 - 0.06, cabH / 2, cabZ);
  const goldMat = cachedMaterial({ color: 0xf6c945, metalness: 0.9, roughness: 0.16, emissive: 0x3a2600, emissiveIntensity: 0.25 });
  for (let sh = 0; sh < 4; sh++) {
    const sy = 0.42 + sh * 0.42;
    batch.box(mat(M, 'woodLight', 'wood'), cabW - 0.06, 0.03, cabD - 0.1, cabX - 0.01, sy, cabZ);
    for (let c = 0; c < 3; c++) {
      const cz2 = cabZ - 0.46 + c * 0.46;
      batch.cyl(goldMat, 0.075, 0.035, 0.20, 10, cabX - 0.02, sy + 0.14, cz2);
      batch.cyl(goldMat, 0.06, 0.06, 0.035, 10, cabX - 0.02, sy + 0.03, cz2);
    }
  }

  // Potted ficus in corners
  plant(batch, M, -roomD / 2 + 0.65, 0, endZ - 0.65, 1.25);

  // Blinds & radiators along SE exterior window wall (local -X)
  for (let bz = -roomL / 2 + 2.0; bz <= roomL / 2 - 1.8; bz += 3.6) {
    blinds(batch, M, -roomD / 2 + 0.14, 0.95, bz, 1.45, 2.0, Math.PI / 2);
    radiator(batch, M, -roomD / 2 + 0.22, 0, bz, 1.0, Math.PI / 2);
  }

  batch.setParent(prev);
}

/* ============================================================ DIRECTOR'S OFFICE (wing, floor 3) */
function buildDirectorOffice(batch, M, cx, cy, cz, ry, w, d) {
  const m4 = new THREE.Matrix4().compose(
    new THREE.Vector3(cx, cy, cz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    new THREE.Vector3(1, 1, 1));
  const prev = batch.parent;
  batch.setParent(m4);

  // Reception area (first part)
  // Secretary desk
  batch.box(mat(M, 'woodLight', 'wood'), 1.4, 0.74, 0.6, -w / 2 + 1.5, 0.37, d / 2 - 1.0);
  batch.box(mat(M, 'officeScreen', 'lampGlow'), 0.44, 0.26, 0.01, -w / 2 + 1.5, 0.98, d / 2 - 1.2);
  officeChair(batch, M, -w / 2 + 1.5, 0, d / 2 - 0.3, Math.PI);
  // Waiting sofa
  sofa(batch, M, -w / 2 + 1.5, 0, d / 2 - 2.5, Math.PI / 2);

  // Dividing wall
  batch.box(mat(M, 'plasterWall', 'stone'), PART_T, WALL_H, d * 0.6, 0, WALL_H / 2, 0);
  door(batch, M, 0, 0, Math.PI / 2, { open: true, label: 'Директор' });

  // Director's room (second part)
  // L-shaped executive desk (dark walnut)
  batch.box(mat(M, 'walnutDoor', 'wood'), 2.0, 0.76, 0.8, w / 4, 0.38, -d / 4);
  batch.box(mat(M, 'walnutDoor', 'wood'), 0.8, 0.76, 1.2, w / 4 + 1.0, 0.38, -d / 4 + 0.6);
  // Executive high-back chair
  batch.box(mat(M, 'leatherBlack', 'fabric'), 0.6, 0.1, 0.6, w / 4, 0.48, -d / 4 + 1.0);
  batch.box(mat(M, 'leatherBlack', 'fabric'), 0.6, 0.85, 0.08, w / 4, 0.9, -d / 4 + 1.3);
  batch.cyl(mat(M, 'chrome', 'metalDark'), 0.05, 0.06, 0.42, 8, w / 4, 0.22, -d / 4 + 1.0);

  // Briefing table for 6
  batch.box(mat(M, 'woodLight', 'wood'), 1.6, 0.06, 0.8, w / 4, 0.74, d / 4 - 0.5);
  for (let i = 0; i < 3; i++) {
    for (const s of [-1, 1]) {
      conferenceChair(batch, M, w / 4 - 0.5 + i * 0.5, 0, d / 4 - 0.5 + s * 0.7, s > 0 ? 0 : Math.PI);
    }
  }

  // Bookcase with glass doors
  batch.box(mat(M, 'walnutDoor', 'wood'), 2.0, 2.0, 0.4, w / 2 - 0.5, 1.0, -d / 2 + 0.3);
  batch.box(mat(M, 'frostedGlass', 'glassTint'), 0.9, 1.6, 0.02, w / 2 - 0.9, 1.1, -d / 2 + 0.5);
  batch.box(mat(M, 'frostedGlass', 'glassTint'), 0.9, 1.6, 0.02, w / 2 - 0.1, 1.1, -d / 2 + 0.5);

  // TV panel
  batch.box(mat(M, 'metalDark'), 1.1, 0.65, 0.04, w / 4, 2.0, -d / 2 + 0.12);
  batch.box(mat(M, 'officeScreen', 'lampGlow'), 1.0, 0.58, 0.01, w / 4, 2.0, -d / 2 + 0.1);

  // Coffee table + armchairs
  batch.box(mat(M, 'glass', 'glassTint'), 0.7, 0.04, 0.5, -w / 4, 0.42, -d / 4);
  sofa(batch, M, -w / 4, 0, -d / 4 - 1.2, 0);

  // Flags
  flag(batch, M, w / 2 - 0.4, 0, -d / 2 + 0.4, 0x0088cc);
  flag(batch, M, w / 2 - 0.4, 0, -d / 2 + 0.9, 0x1a4488);

  // Plants
  plant(batch, M, -w / 2 + 0.5, 0, -d / 2 + 0.5, 1.2);
  plant(batch, M, w / 2 - 0.5, 0, d / 2 - 0.5, 1.0);

  batch.setParent(prev);
}

/* ============================================================ GENERIC OFFICE */
function buildOfficeRoom(batch, M, x0, x1, z0, z1, y, label) {
  const w = x1 - x0, d = Math.abs(z1 - z0);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const rnd = mulberry32(Math.round(cx * 100 + cz * 37 + y * 11));

  // 2-4 desks depending on room width
  const nDesks = Math.min(4, Math.max(2, Math.round(w / 3.2)));
  for (let i = 0; i < nDesks; i++) {
    const dx = x0 + 1.2 + i * ((w - 2.4) / Math.max(1, nDesks - 1));
    const facing = i % 2 === 0 ? 0 : Math.PI;
    const dz = cz + (facing === 0 ? -d / 4 : d / 4);
    desk(batch, M, dx, y, dz, facing);
  }

  // File cabinet
  fileCabinet(batch, M, x1 - 0.6, y, Math.min(z0, z1) + 0.4, 0);

  // Printer (shared)
  if (rnd() > 0.4) {
    printer(batch, M, x0 + 0.6, y, Math.max(z0, z1) - 0.6);
  }

  // Water cooler
  if (rnd() > 0.5) {
    waterCooler(batch, M, x0 + 0.5, y, cz);
  }

  // Plant
  if (rnd() > 0.3) {
    plant(batch, M, x1 - 0.5, y, Math.max(z0, z1) - 0.6, 0.8 + rnd() * 0.4);
  }
}

/* ============================================================ WING CORRIDORS + ROOMS */
function wingInteriors(batch, M, colliders) {
  const a = W.az, ax = Math.sin(a), az = -Math.cos(a);
  const nx = Math.cos(a), nz = Math.sin(a);
  const half = W.half - 0.35; // inner half-width (~6.80)
  const halfCorr = 1.4;       // corridor t = -1.4..+1.4
  const wallH = 3.38;
  const sStart = 11.2, sEnd = W.s1 - 0.4; // cleanly outside rotunda drum (r = 10.3)
  const totalLen = sEnd - sStart; // 22.6 m

  const put = (s, t) => ({ x: ax * s + nx * t, z: az * s + nz * t });
  const ry = Math.atan2(ax, az);

  // Helper to place Armstrong LED ceiling panels in wing rotated space
  const wingCeilingLEDs = (s0, s1, t0, t1, y) => {
    const lampMat = mat(M, 'lampPanel', 'lampGlow');
    const lenS = s1 - s0, lenT = t1 - t0;
    const ns = Math.max(1, Math.round(lenS / 3.2));
    const nt = Math.max(1, Math.round(lenT / 3.0));
    const cy = y + 3.34;
    for (let i = 0; i < ns; i++) {
      for (let j = 0; j < nt; j++) {
        const p = put(s0 + (i + 0.5) * lenS / ns, t0 + (j + 0.5) * lenT / nt);
        batch.box(lampMat, 0.58, 0.03, 1.2, p.x, cy, p.z, ry);
      }
    }
  };

  for (let lv = 0; lv < 3; lv++) {
    const y = FLOOR[lv];
    const wallMat = mat(M, 'plasterWall', 'stone');

    // Corridor floor (from rotunda threshold s=8.4 to sEnd)
    const cMid = put((8.4 + sEnd) / 2, 0);
    batch.box(mat(M, 'oakLaminate', 'carpet'), halfCorr * 2, 0.02, sEnd - 8.4, cMid.x, y + 0.01, cMid.z, ry);
    // Corridor ceiling LEDs
    wingCeilingLEDs(9.2, sEnd - 0.4, -halfCorr + 0.2, halfCorr - 0.2, y);

    // Rooms along the wing
    const rooms = getWingRoomLayout(lv);
    const totalSpan = rooms.reduce((sum, r) => sum + (r.span || 1), 0);
    let s = sStart;

    for (let ri = 0; ri < rooms.length; ri++) {
      const room = rooms[ri];
      const sp = room.span || 1;
      const rl = (sp / totalSpan) * totalLen;
      const sMid = s + rl / 2;

      for (const side of [-1, 1]) {
        const roomD = half - halfCorr; // 5.40 m across wing
        const tMid = side * (halfCorr + roomD / 2); // ±4.10 m
        const p = put(sMid, tMid);

        // Room oak floor
        batch.box(mat(M, 'oakLaminate', 'carpet'), roomD - 0.1, 0.02, rl - 0.1, p.x, y + 0.01, p.z, ry);
        // Room recessed LED ceiling panels
        wingCeilingLEDs(s + 0.4, s + rl - 0.4,
          Math.min(side * halfCorr, side * half) + 0.3,
          Math.max(side * halfCorr, side * half) - 0.3, y);

        // Corridor partition wall (except Meeting Room which uses its own frosted striped glass partition!)
        const isMeeting = lv === 1 && side === 1 && room.type === 'meeting';
        if (!isMeeting) {
          const wp = put(sMid, side * halfCorr);
          batch.box(wallMat, PART_T, wallH, rl, wp.x, y + wallH / 2, wp.z, ry);
        }

        // Solid dividing walls at start & end of each room along wing (so Meeting Room has crisp white end walls!)
        for (const wsEdge of [s, s + rl]) {
          const ep = put(wsEdge, tMid);
          batch.box(wallMat, roomD, wallH, PART_T, ep.x, y + wallH / 2, ep.z, ry);
        }

        // Door from corridor at proper floor height y
        const dp = put(sMid, side * halfCorr);
        door(batch, M, dp.x, dp.z, ry + (side > 0 ? Math.PI / 2 : -Math.PI / 2),
          { y, open: room.open || false, label: side > 0 ? room.labelR || room.label : room.labelL || room.label });

        // Furnish special rooms
        if (isMeeting) {
          buildMeetingRoom(batch, M, p.x, y, p.z, ry, roomD, rl, colliders);
        } else if (lv === 2 && side === 1 && room.type === 'director') {
          buildDirectorOffice(batch, M, p.x, y, p.z, ry, roomD, rl);
        } else {
          const nDesks = Math.min(3, Math.max(1, Math.round(rl / 4.2)));
          for (let di = 0; di < nDesks; di++) {
            const ds = s + 1.6 + di * ((rl - 3.2) / Math.max(1, nDesks - 1));
            const dp2 = put(ds, tMid + (di % 2 === 0 ? -0.7 : 0.7) * side);
            desk(batch, M, dp2.x, y, dp2.z, ry + (di % 2) * Math.PI);
          }
          const cp = put(s + rl - 0.8, side * (half - 0.5));
          fileCabinet(batch, M, cp.x, y, cp.z, ry);
          const bp = put(sMid, side * (half - 0.1));
          blinds(batch, M, bp.x, y + 0.95, bp.z, 1.4, 2.0, ry + Math.PI / 2);
        }
      }

      s += rl;
    }
  }
}

function getWingRoomLayout(level) {
  if (level === 0) return [
    { label: 'Инженерная', labelL: 'Связь', labelR: 'Метрология', type: 'office' },
    { label: 'ЛИ', labelL: 'Лаборатория', labelR: 'ГРС-сервис', type: 'office' },
    { label: 'Склад', type: 'office' },
  ];
  if (level === 1) return [
    { label: 'Переговорная', labelR: 'Зал совещаний', type: 'meeting', span: 2, open: true },
    { label: 'Маркетинг', type: 'office' },
  ];
  return [
    { label: 'Директор', labelR: 'Кабинет директора', type: 'director', span: 2, open: true },
    { label: 'Секретариат', type: 'office' },
  ];
}

/* ============================================================ ASSEMBLY */
export function buildInteriors(scene, M, colliders) {
  // Create new materials (safe — won't overwrite existing)
  if (!M.plasterWall) M.plasterWall = new THREE.MeshStandardMaterial({ color: 0xf0e9dc, roughness: 0.95 });
  if (!M.blind) M.blind = new THREE.MeshStandardMaterial({ color: 0xded8cb, roughness: 0.9, side: THREE.DoubleSide });
  if (!M.lampPanel) M.lampPanel = new THREE.MeshStandardMaterial({ color: 0xfffdf4, emissive: 0xfff0d2, emissiveIntensity: 2.2, roughness: 0.6 });
  if (!M.plant) M.plant = new THREE.MeshStandardMaterial({ color: 0x3f6a3a, roughness: 0.9 });
  if (!M.walnutDoor) M.walnutDoor = new THREE.MeshStandardMaterial({ color: 0x4a2a1a, roughness: 0.5 });
  if (!M.frostedGlass) M.frostedGlass = new THREE.MeshPhysicalMaterial({
    color: 0xddeeff, transparent: true, opacity: 0.4, roughness: 0.5, side: THREE.DoubleSide, depthWrite: false });
  if (!M.guardDesk) M.guardDesk = new THREE.MeshStandardMaterial({ color: 0xd0d0d4, roughness: 0.6 });
  if (!M.leatherBlack) M.leatherBlack = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.5 });
  if (!M.oakLaminate) M.oakLaminate = new THREE.MeshStandardMaterial({ color: 0xc8a87a, roughness: 0.65 });
  if (!M.marbleFloor) M.marbleFloor = M.marble;
  if (!M.woodLight) M.woodLight = new THREE.MeshStandardMaterial({ color: 0xb8946a, roughness: 0.5 });
  if (!M.chrome) M.chrome = new THREE.MeshStandardMaterial({ color: 0xe0e0e4, metalness: 0.9, roughness: 0.15 });
  if (!M.fireRed) M.fireRed = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.7 });
  if (!M.officeScreen) M.officeScreen = new THREE.MeshStandardMaterial({ color: 0xd0e8ff, emissive: 0x88bbff, emissiveIntensity: 0.8, roughness: 0.4 });
  if (!M.kzMapGlow) M.kzMapGlow = new THREE.MeshStandardMaterial({ color: 0x1155cc, emissive: 0x1155cc, emissiveIntensity: 0.6, roughness: 0.5 });
  if (!M.scadaScreen) M.scadaScreen = new THREE.MeshStandardMaterial({ color: 0x0a1a2e, emissive: 0x00ff88, emissiveIntensity: 0.4, roughness: 0.3 });
  if (!M.painting) M.painting = new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.8 });
  if (!M.icaBanner) M.icaBanner = new THREE.MeshStandardMaterial({ color: 0x0a4080, roughness: 0.5 });

  const group = new THREE.Group();
  group.name = 'interiors';
  group.position.y = PODIUM;
  const batch = new Batch();

  // Central hall with marble floor, columns, ceiling
  hall(batch, M, colliders);

  // Grand semicircular stairs
  buildGrandStairs(batch, M, colliders);

  // Elevator shaft + cabin (added to `group` so Y aligns with PODIUM!)
  const elevator = buildElevator(batch, M, group, colliders);

  // Guard post and waiting area in lobby
  guardPost(batch, M, colliders);
  waitingArea(batch, M);

  // Block wing corridors + rooms (all 3 floors)
  blockWing(batch, M, colliders);

  // Diagonal wing corridors + rooms (all 3 floors)
  wingInteriors(batch, M, colliders);

  // Turnstiles (separate meshes for animation)
  const gates = buildTurnstiles(scene, PODIUM);

  batch.build(group, { cast: true, receive: true, name: 'interior' });

  // Strategic key PointLights (12 total instead of 26) paired with bright emissive fixtures
  const interiorLights = [];
  const addLight = (x, y, z, color = 0xfffaf2, weight = 0.42, dist = 20) => {
    const l = new THREE.PointLight(color, 12 * weight, dist, 1.35);
    l.userData.weight = weight;
    l.userData.dist = dist;
    l.position.set(x, PODIUM + y, z);
    scene.add(l);
    interiorLights.push(l);
  };

  // Entrance lobby (guard post, ICA banner, turnstiles, waiting area)
  addLight(0, 2.95, 9.6, 0xfffdf8, 0.44, 20);

  // Rotunda hall across 1st, 2nd, 3rd floors (staggered around central elevator shaft)
  addLight(0, FLOOR[0] + 2.95, 3.8, 0xfffaf0, 0.42, 20);
  addLight(0, FLOOR[1] + 2.95, -3.8, 0xfffaf0, 0.42, 20);
  addLight(0, FLOOR[2] + 2.95, 3.8, 0xfffaf0, 0.40, 20);

  // Floor 1 — Dispatch Center + Block corridor
  addLight(-27.0, 2.9, -4.55, 0xf2f8ff, 0.38, 18);
  addLight(-15.5, 2.9, CORR_Z, 0xfffaf0, 0.38, 18);

  // Floor 2 — Assembly Hall (2 key lights spanning 23m auditorium)
  addLight(-28.0, FLOOR[1] + 2.95, -4.55, 0xfffdf6, 0.42, 20);
  addLight(-17.5, FLOOR[1] + 2.95, -4.55, 0xfffdf6, 0.42, 20);

  // Floor 3 — Block offices & corridor
  addLight(-21.5, FLOOR[2] + 2.9, CORR_Z, 0xfffaf0, 0.40, 22);

  // Wing lights: Floor 1 corridor, Meeting Room (Floor 2), Director's Office (Floor 3)
  const wa = W.az, wax = Math.sin(wa), waz = -Math.cos(wa);
  const wnx = Math.cos(wa), wnz = Math.sin(wa);
  const wPt = (s, t) => ({ x: wax * s + wnx * t, z: waz * s + wnz * t });
  {
    const wp1 = wPt(20.5, 0);
    addLight(wp1.x, FLOOR[0] + 2.9, wp1.z, 0xfffaf0, 0.40, 22);
    const mp = wPt(19.0, 3.2);
    addLight(mp.x, FLOOR[1] + 2.95, mp.z, 0xfffdf8, 0.42, 20);
    const dp = wPt(19.5, 3.2);
    addLight(dp.x, FLOOR[2] + 2.95, dp.z, 0xfffaf2, 0.42, 20);
  }

  group.userData.lights = interiorLights;
  scene.add(group);

  // Update function for animations (turnstile gates + elevator doors)
  group.update = (dt, playerPos) => {
    if (!playerPos) return;
    const localY = playerPos.y - PODIUM;
    const onFirstFloor = Math.abs(playerPos.y - PODIUM) < 1.5;

    // Animate 1st-floor turnstile gates based on player proximity (floor-checked!)
    for (const g of gates) {
      const dx = playerPos.x - g.x;
      const pz = playerPos.z - g.z;
      const dist = Math.hypot(dx, pz);
      const targetOpen = (onFirstFloor && dist < 2.5) ? 1 : 0;
      g.open += (targetOpen - g.open) * Math.min(1, dt * 5);
      const off = g.open * 0.35;
      g.left.position.x = g.x - 0.2 - off;
      g.right.position.x = g.x + 0.2 + off;
    }

    // Elevator door animation based on cabin position and player proximity
    for (const dp of elevator.doorParts) {
      const floorY = FLOOR[dp.level];
      const cabinAtThisFloor = Math.abs(elevator.cabin.position.y - floorY) < 0.3;
      const playerNear = Math.hypot(playerPos.x, playerPos.z - (R.core + 0.6)) < 2.0
        && Math.abs(localY - floorY) < 1.0;
      const shouldOpen = cabinAtThisFloor && playerNear;
      dp.open += ((shouldOpen ? 1 : 0) - dp.open) * Math.min(1, dt * 3);
      const doorOff = dp.open * 0.5;
      dp.left.position.x = dp.baseX[0] - doorOff;
      dp.right.position.x = dp.baseX[1] + doorOff;
    }
  };

  // Expose elevator cabin for controls.js to move (world Y heights matching colliders)
  group.userData.elevator = {
    cabin: elevator.cabin,
    doorParts: elevator.doorParts,
    levels: [PODIUM + FLOOR[0], PODIUM + FLOOR[1], PODIUM + FLOOR[2]],
  };

  return group;
}
