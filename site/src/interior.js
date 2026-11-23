/* interior.js — Full interior: lobby/turnstiles/guard/waiting area, semicircular grand
   stairs, panoramic elevator shaft, corridors with real walnut doors & Armstrong
   ceilings, Assembly Hall, Meeting Room (KZ map), Dispatch Center, Director's
   Office, department offices.  Every room matches real ICA reference photos.
   Safe material fallbacks: M.oakLaminate || M.carpet, M.marbleFloor || M.marble, etc.
   Exports buildInteriors(scene, M, colliders) which returns a group with
   .userData.lights and an .update(dt, playerPos) for animated turnstiles & lift doors. */

import * as THREE from 'three';
import {
  Batch, DEG, LAYOUT, FLOOR, PODIUM, polar, mulberry32, clamp, cachedMaterial, addRotundaRing,
  cloneGLB, loadGLB, prepareModel,
} from './core.js';

let _interiorGroup = null;
let _interiorPending = [];

function placeAsyncGLB(parentMatrix, url, x, y, z, ry = 0, opts = {}) {
  if (!_interiorGroup) return Promise.resolve(null);
  const anchor = new THREE.Group();
  const localM = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    new THREE.Vector3(1, 1, 1)
  );
  if (parentMatrix) localM.premultiply(parentMatrix);
  localM.decompose(anchor.position, anchor.quaternion, anchor.scale);
  _interiorGroup.add(anchor);
  const p = cloneGLB(url, opts)
    .then((model) => {
      anchor.add(model);
      return model;
    })
    .catch(() => null);
  _interiorPending.push(p);
  return p;
}

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
  placeAsyncGLB(batch.parent, './assets/models/sofa_03.glb', x, y, z, ry, {
    targetHeight: 0.86,
    groundY: 0,
    centerXZ: true,
    envMapIntensity: 0.55,
    onMesh(obj) {
      if (obj.material && obj.material.name && obj.material.name.includes('fringe')) {
        obj.material.alphaTest = 0.35;
        obj.material.side = THREE.DoubleSide;
        obj.material.roughness = 0.85;
      }
    },
  });
}

function armchair(batch, x, y, z, ry) {
  placeAsyncGLB(batch.parent, './assets/models/armchair_01.glb', x, y, z, ry, {
    targetHeight: 0.84,
    groundY: 0,
    centerXZ: true,
    envMapIntensity: 0.55,
  });
}

function coffeeTable(batch, x, y, z, ry) {
  placeAsyncGLB(batch.parent, './assets/models/coffeetable_01.glb', x, y, z, ry, {
    targetHeight: 0.44,
    groundY: 0,
    centerXZ: true,
    envMapIntensity: 0.65,
  });
}

function plant(batch, M, x, y, z, s = 1) {
  placeAsyncGLB(batch.parent, './assets/models/potted_plant_04.glb', x, y, z, 0, {
    targetHeight: 0.96 * s,
    groundY: 0,
    centerXZ: true,
    envMapIntensity: 0.45,
  });
}

function lobbyBin(batch, M, x, y, z) {
  const steelMat = mat(M, 'brushedSteel', 'chrome');
  const darkMat = mat(M, 'darkTitanium', 'metalDark');
  batch.cyl(darkMat, 0.175, 0.18, 0.03, 18, x, y + 0.015, z);
  batch.cyl(steelMat, 0.165, 0.165, 0.64, 20, x, y + 0.35, z);
  const rim = new THREE.TorusGeometry(0.158, 0.014, 8, 20);
  rim.rotateX(Math.PI / 2);
  batch.add(rim, steelMat, new THREE.Matrix4().makeTranslation(x, y + 0.67, z));
  batch.cyl(darkMat, 0.145, 0.145, 0.02, 16, x, y + 0.65, z);
}

function exitSign(batch, M, x, y, z, ry = 0) {
  const tex = makeExitSignTex();
  const signMat = cachedMaterial({
    map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.95,
    roughness: 0.4, toneMapped: false,
  });
  const m4 = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    new THREE.Vector3(1, 1, 1)
  );
  const prev = pushParent(batch, m4);
  batch.box(mat(M, 'brushedSteel', 'chrome'), 0.62, 0.22, 0.06, 0, 0, 0);
  batch.box(signMat, 0.56, 0.17, 0.015, 0, 0, 0.032);
  batch.box(signMat, 0.56, 0.17, 0.015, 0, 0, -0.032, Math.PI);
  batch.setParent(prev);
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

/* ============================================================ PROCEDURAL PHOTOREALISTIC TEXTURES */
const _procTexCache = new Map();
function cachedProcTex(key, w, h, drawFn, srgb = true) {
  if (_procTexCache.has(key)) return _procTexCache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  drawFn(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  _procTexCache.set(key, t);
  return t;
}

function makeTurnstileReaderTex() {
  return cachedProcTex('tsReader', 256, 256, (x, w, h) => {
    x.fillStyle = '#090d14';
    x.fillRect(0, 0, w, h);
    // Subtle dark brushed ring groove
    x.strokeStyle = '#1b2430';
    x.lineWidth = 10;
    x.beginPath(); x.arc(w / 2, h / 2, 98, 0, Math.PI * 2); x.stroke();
    // Illuminated outer ring LED
    x.shadowColor = '#00f5ff';
    x.shadowBlur = 14;
    x.strokeStyle = '#12e8d8';
    x.lineWidth = 4;
    x.beginPath(); x.arc(w / 2, h / 2, 86, 0, Math.PI * 2); x.stroke();
    // Contactless card silhouette + NFC waves
    x.shadowBlur = 10;
    x.strokeStyle = '#7cf8ff';
    x.lineWidth = 4;
    x.strokeRect(w * 0.25, h * 0.38, w * 0.28, h * 0.32);
    x.fillStyle = 'rgba(0, 245, 255, 0.22)';
    x.fillRect(w * 0.25, h * 0.38, w * 0.28, h * 0.32);
    for (let i = 0; i < 3; i++) {
      x.beginPath();
      x.arc(w * 0.56, h * 0.54, 18 + i * 16, -0.85, 0.85);
      x.stroke();
    }
    x.shadowBlur = 0;
    x.fillStyle = '#8beeff';
    x.font = '700 18px "Segoe UI", Arial, sans-serif';
    x.textAlign = 'center';
    x.fillText('RFID · PASS', w / 2, h * 0.86);
  });
}

function makeTurnstileArrowTex(active = false) {
  return cachedProcTex(`tsArrow_${active ? 'on' : 'idle'}`, 256, 160, (x, w, h) => {
    x.fillStyle = '#05080c';
    x.fillRect(0, 0, w, h);
    // Subtle bezel border + micro red/amber status detail pips
    x.strokeStyle = '#1a232e';
    x.lineWidth = 6;
    x.strokeRect(6, 6, w - 12, h - 12);
    x.fillStyle = '#ff3b30';
    x.beginPath(); x.arc(24, 22, 4.5, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#ffaa22';
    x.beginPath(); x.arc(w - 24, 22, 4.5, 0, Math.PI * 2); x.fill();
    // Sharp glowing forward arrow + chevron >>
    const col = active ? '#00f5ff' : '#00ff88';
    x.shadowColor = col;
    x.shadowBlur = active ? 22 : 16;
    x.strokeStyle = col;
    x.fillStyle = col;
    x.lineWidth = 10;
    x.lineCap = 'round';
    x.lineJoin = 'round';
    // Double forward chevron pointing up/forward into lane
    for (const dy of [0, 34]) {
      x.beginPath();
      x.moveTo(w * 0.28, h * 0.52 + dy);
      x.lineTo(w * 0.50, h * 0.28 + dy);
      x.lineTo(w * 0.72, h * 0.52 + dy);
      x.stroke();
    }
    x.shadowBlur = 0;
  });
}

function makeGlassStripeTextures() {
  const key = 'glassStripePair';
  if (_procTexCache.has(key)) return _procTexCache.get(key);
  const S = 512;
  const mc = document.createElement('canvas'); mc.width = S; mc.height = S;
  const mx = mc.getContext('2d');
  mx.fillStyle = '#f6faff';
  mx.fillRect(0, 0, S, S);
  const map = new THREE.CanvasTexture(mc);
  map.colorSpace = THREE.SRGBColorSpace;

  const ac = document.createElement('canvas'); ac.width = S; ac.height = S;
  const ax = ac.getContext('2d');
  ax.fillStyle = '#000000';
  ax.fillRect(0, 0, S, S);
  // Subtle perimeter laser-frosted border halo
  ax.strokeStyle = '#555555';
  ax.lineWidth = 8;
  ax.strokeRect(4, 4, S - 8, S - 8);
  // Crisp horizontal frosted safety stripes across middle safety band
  ax.fillStyle = '#e0e0e0';
  ax.fillRect(16, 178, S - 32, 8);
  ax.fillRect(16, 326, S - 32, 8);
  for (let row = 0; row < 3; row++) {
    const ry = 212 + row * 38;
    for (let col = 0; col < 10; col++) {
      ax.fillStyle = '#cccccc';
      ax.fillRect(24 + col * 47, ry, 34, 14);
    }
  }
  // Central geometric corporate diamond mark
  ax.fillStyle = '#f0f0f0';
  ax.save();
  ax.translate(S / 2, S / 2);
  ax.rotate(Math.PI / 4);
  ax.fillRect(-20, -20, 40, 40);
  ax.fillStyle = '#000000';
  ax.fillRect(-10, -10, 20, 20);
  ax.restore();
  const alphaMap = new THREE.CanvasTexture(ac);
  alphaMap.anisotropy = 8;
  const pair = { map, alphaMap };
  _procTexCache.set(key, pair);
  return pair;
}

function makeGuardFaceTex() {
  return cachedProcTex('guardFace', 512, 512, (x, w, h) => {
    // Base warm Central Asian complexion
    x.fillStyle = '#d7a57f';
    x.fillRect(0, 0, w, h);

    // Sculpted facial lighting gradient across center front (u = 0.5 -> x = 256)
    const faceGrad = x.createRadialGradient(256, 250, 22, 256, 258, 130);
    faceGrad.addColorStop(0, '#e8bc99');
    faceGrad.addColorStop(0.58, '#d9a680');
    faceGrad.addColorStop(1, '#ba8360');
    x.fillStyle = faceGrad;
    x.fillRect(130, 90, 252, 340);

    // Dark sculpted hair covering sides, temples & back of skull
    x.fillStyle = '#1b1817';
    x.fillRect(0, 0, 152, h);
    x.fillRect(360, 0, 152, h);
    x.fillRect(0, 0, w, 132);
    // Natural hairline arch and sideburns
    x.beginPath();
    x.moveTo(148, 132);
    x.quadraticCurveTo(256, 98, 364, 132);
    x.lineTo(364, 0);
    x.lineTo(148, 0);
    x.closePath();
    x.fill();
    for (const sgn of [-1, 1]) {
      const sx = 256 + sgn * 104;
      x.beginPath();
      x.moveTo(sx, 128);
      x.lineTo(sx + sgn * 20, 128);
      x.lineTo(sx + sgn * 14, 286);
      x.lineTo(sx - sgn * 4, 252);
      x.closePath();
      x.fill();
    }

    // Subtle cheekbone warmth & eye-socket ambient shadow
    for (const sgn of [-1, 1]) {
      const ex = 256 + sgn * 28.5;
      const sock = x.createRadialGradient(ex, 246, 2, ex, 248, 22);
      sock.addColorStop(0, 'rgba(130, 82, 58, 0.34)');
      sock.addColorStop(1, 'rgba(130, 82, 58, 0.0)');
      x.fillStyle = sock;
      x.beginPath(); x.arc(ex, 248, 22, 0, Math.PI * 2); x.fill();

      const cheek = x.createRadialGradient(256 + sgn * 42, 294, 4, 256 + sgn * 42, 294, 26);
      cheek.addColorStop(0, 'rgba(202, 118, 96, 0.24)');
      cheek.addColorStop(1, 'rgba(202, 118, 96, 0.0)');
      x.fillStyle = cheek;
      x.beginPath(); x.arc(256 + sgn * 42, 294, 26, 0, Math.PI * 2); x.fill();
    }

    // Calm expressive eyebrows
    x.strokeStyle = '#1d1612';
    x.lineCap = 'round';
    x.lineWidth = 5.5;
    for (const sgn of [-1, 1]) {
      x.beginPath();
      x.moveTo(256 + sgn * 15, 226);
      x.quadraticCurveTo(256 + sgn * 29, 217, 256 + sgn * 44, 224);
      x.stroke();
    }

    // Realistic eyes (sclera, dark iris, pupil, catchlight, upper lid)
    for (const sgn of [-1, 1]) {
      const ex = 256 + sgn * 28.5;
      const ey = 246;
      x.fillStyle = '#efe9e2';
      x.beginPath();
      x.ellipse(ex, ey, 11.5, 6.2, 0, 0, Math.PI * 2);
      x.fill();
      // Iris
      x.fillStyle = '#2d1c12';
      x.beginPath();
      x.arc(ex, ey, 5.4, 0, Math.PI * 2);
      x.fill();
      // Pupil
      x.fillStyle = '#0d0907';
      x.beginPath();
      x.arc(ex, ey, 2.7, 0, Math.PI * 2);
      x.fill();
      // Specular catchlight
      x.fillStyle = '#ffffff';
      x.beginPath();
      x.arc(ex - 1.6, ey - 1.6, 1.3, 0, Math.PI * 2);
      x.fill();
      // Upper eyelid crease & lash line
      x.strokeStyle = '#3b241a';
      x.lineWidth = 2.6;
      x.beginPath();
      x.moveTo(ex - 12, ey);
      x.quadraticCurveTo(ex, ey - 7.5, ex + 12, ey);
      x.stroke();
    }

    // Nose bridge highlight & soft nostril shadow
    const noseGrad = x.createLinearGradient(246, 250, 266, 250);
    noseGrad.addColorStop(0, 'rgba(150,100,72,0.18)');
    noseGrad.addColorStop(0.5, 'rgba(248,215,186,0.38)');
    noseGrad.addColorStop(1, 'rgba(150,100,72,0.18)');
    x.fillStyle = noseGrad;
    x.fillRect(247, 246, 18, 46);
    x.fillStyle = 'rgba(110, 66, 46, 0.42)';
    x.beginPath(); x.ellipse(249, 294, 4.2, 2.6, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(263, 294, 4.2, 2.6, 0, 0, Math.PI * 2); x.fill();

    // Dignified calm lips & chin shadow
    x.fillStyle = '#b46e60';
    x.beginPath();
    x.moveTo(238, 333);
    x.quadraticCurveTo(256, 325, 274, 333);
    x.quadraticCurveTo(256, 337, 238, 333);
    x.fill();
    x.fillStyle = '#c88070';
    x.beginPath();
    x.moveTo(239, 334);
    x.quadraticCurveTo(256, 344, 273, 334);
    x.closePath();
    x.fill();
    x.strokeStyle = 'rgba(92, 48, 38, 0.65)';
    x.lineWidth = 1.8;
    x.beginPath();
    x.moveTo(238, 333.5);
    x.quadraticCurveTo(256, 335, 274, 333.5);
    x.stroke();
    // Subtle chin & neck jaw shadow
    const jawShade = x.createLinearGradient(0, 365, 0, 460);
    jawShade.addColorStop(0, 'rgba(130, 82, 58, 0.0)');
    jawShade.addColorStop(1, 'rgba(105, 64, 44, 0.45)');
    x.fillStyle = jawShade;
    x.fillRect(150, 365, 212, 95);
  });
}

function makeCCTVQuadTex() {
  return cachedProcTex('cctvQuad', 1024, 512, (x, w, h) => {
    x.fillStyle = '#070c14';
    x.fillRect(0, 0, w, h);
    const cams = [
      { ox: 0, oy: 0, id: 'CAM-01 ФАСАД', sky: '#183454', accent: '#62d4ff', mode: 'facade' },
      { ox: w / 2, oy: 0, id: 'CAM-02 ХОЛЛ', sky: '#1b2638', accent: '#00ff99', mode: 'lobby' },
      { ox: 0, oy: h / 2, id: 'CAM-03 ЛИФТ', sky: '#172334', accent: '#ffd56a', mode: 'lift' },
      { ox: w / 2, oy: h / 2, id: 'CAM-04 ВЪЕЗД', sky: '#13263d', accent: '#66eeff', mode: 'gate' },
    ];
    const cw = w / 2, ch = h / 2;
    for (const c of cams) {
      x.save();
      x.beginPath(); x.rect(c.ox + 4, c.oy + 4, cw - 8, ch - 8); x.clip();
      const bg = x.createLinearGradient(c.ox, c.oy, c.ox, c.oy + ch);
      bg.addColorStop(0, c.sky);
      bg.addColorStop(1, '#0b1018');
      x.fillStyle = bg;
      x.fillRect(c.ox, c.oy, cw, ch);

      // Stylized camera feed scene geometry
      if (c.mode === 'facade') {
        x.fillStyle = '#334558';
        x.fillRect(c.ox + 90, c.oy + 65, 320, 125);
        x.fillStyle = '#0e478a';
        x.fillRect(c.ox + 155, c.oy + 56, 190, 18);
        x.fillStyle = '#5a728a';
        for (let i = 0; i < 4; i++) x.fillRect(c.ox + 150 + i * 62, c.oy + 78, 12, 110);
        x.fillStyle = '#2a2220';
        x.fillRect(c.ox + 20, c.oy + 190, cw - 40, 62);
      } else if (c.mode === 'lobby') {
        x.fillStyle = '#2b3648';
        x.fillRect(c.ox + 10, c.oy + 150, cw - 20, 100);
        x.strokeStyle = 'rgba(130, 190, 255, 0.35)';
        x.lineWidth = 2;
        x.beginPath(); x.ellipse(c.ox + cw / 2, c.oy + 200, 180, 40, 0, 0, Math.PI * 2); x.stroke();
        // Turnstiles silhouette
        x.fillStyle = '#8aa0b8';
        for (let i = 0; i < 4; i++) x.fillRect(c.ox + 150 + i * 66, c.oy + 125, 16, 65);
        x.fillStyle = '#00ff88';
        for (let i = 0; i < 4; i++) x.fillRect(c.ox + 153 + i * 66, c.oy + 132, 10, 5);
      } else if (c.mode === 'lift') {
        x.strokeStyle = '#88b8d8';
        x.lineWidth = 3;
        x.strokeRect(c.ox + 195, c.oy + 36, 120, 195);
        x.fillStyle = 'rgba(90, 180, 240, 0.22)';
        x.fillRect(c.ox + 195, c.oy + 36, 120, 195);
        x.fillStyle = '#ffe4a8';
        x.fillRect(c.ox + 215, c.oy + 115, 80, 105);
      } else {
        x.fillStyle = '#202b36';
        x.fillRect(c.ox + 10, c.oy + 145, cw - 20, 105);
        x.strokeStyle = '#ff6644';
        x.lineWidth = 4;
        x.beginPath(); x.moveTo(c.ox + 110, c.oy + 155); x.lineTo(c.ox + 370, c.oy + 155); x.stroke();
        x.fillStyle = '#405872';
        x.fillRect(c.ox + 340, c.oy + 90, 95, 78);
      }

      // Subtle scanlines
      x.fillStyle = 'rgba(0, 0, 0, 0.16)';
      for (let sy = c.oy; sy < c.oy + ch; sy += 4) x.fillRect(c.ox, sy, cw, 1);

      // HUD overlay bar + live REC + timestamp
      x.fillStyle = 'rgba(6, 12, 20, 0.72)';
      x.fillRect(c.ox + 6, c.oy + 6, cw - 12, 28);
      x.fillStyle = c.accent;
      x.font = '700 15px monospace';
      x.textAlign = 'left';
      x.fillText(c.id, c.ox + 16, c.oy + 25);

      // Red REC dot
      x.fillStyle = '#ff2d20';
      x.beginPath(); x.arc(c.ox + cw - 68, c.oy + 20, 5.5, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#ffffff';
      x.font = '700 13px monospace';
      x.fillText('REC', c.ox + cw - 56, c.oy + 24);

      // Bottom timestamp
      x.fillStyle = 'rgba(6, 12, 20, 0.65)';
      x.fillRect(c.ox + 8, c.oy + ch - 28, 215, 20);
      x.fillStyle = '#d4e8ff';
      x.font = '600 13px monospace';
      x.fillText('23.11.2026 14:35:42', c.ox + 14, c.oy + ch - 13);
      x.restore();
    }
    // Crisp dark divider grid
    x.strokeStyle = '#0e1724';
    x.lineWidth = 6;
    x.beginPath();
    x.moveTo(w / 2, 0); x.lineTo(w / 2, h);
    x.moveTo(0, h / 2); x.lineTo(w, h / 2);
    x.stroke();
    x.strokeRect(2, 2, w - 4, h - 4);
  });
}

function makeRFIDScannerTex() {
  return cachedProcTex('rfidScanner', 256, 192, (x, w, h) => {
    x.fillStyle = '#07131f';
    x.fillRect(0, 0, w, h);
    x.strokeStyle = '#00d8ff';
    x.lineWidth = 4;
    x.strokeRect(6, 6, w - 12, h - 12);
    x.fillStyle = '#00f5ff';
    x.font = '700 20px "Segoe UI", Arial';
    x.textAlign = 'center';
    x.fillText('СКУД · ПРОПУСК', w / 2, 34);
    x.strokeStyle = '#00ff88';
    x.lineWidth = 5;
    x.beginPath(); x.arc(w / 2, 102, 36, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.moveTo(w / 2 - 16, 102); x.lineTo(w / 2 - 4, 114); x.lineTo(w / 2 + 18, 90); x.stroke();
    x.fillStyle = '#9cffc8';
    x.font = '700 16px monospace';
    x.fillText('ДОСТУП ОК', w / 2, 168);
  });
}

function makeLogbookTex() {
  return cachedProcTex('logbook', 512, 256, (x, w, h) => {
    x.fillStyle = '#f5f1e6';
    x.fillRect(0, 0, w, h);
    // Center binding shadow
    const bg = x.createLinearGradient(w / 2 - 18, 0, w / 2 + 18, 0);
    bg.addColorStop(0, 'rgba(0,0,0,0)');
    bg.addColorStop(0.5, 'rgba(30,24,18,0.28)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = bg;
    x.fillRect(w / 2 - 18, 0, 36, h);
    // Ruled ledger lines
    x.strokeStyle = 'rgba(70, 105, 160, 0.35)';
    x.lineWidth = 1.5;
    for (let y = 42; y < h - 16; y += 22) {
      x.beginPath(); x.moveTo(18, y); x.lineTo(w / 2 - 12, y); x.stroke();
      x.beginPath(); x.moveTo(w / 2 + 12, y); x.lineTo(w - 18, y); x.stroke();
    }
    x.fillStyle = '#1b355c';
    x.font = '700 14px "Segoe UI", Arial';
    x.fillText('ЖУРНАЛ ПОСЕТИТЕЛЕЙ', 24, 28);
    x.fillText('ВРЕМЯ · ПОДПИСЬ', w / 2 + 24, 28);
    // Simulated neat ink entries
    x.strokeStyle = '#1a2b4c';
    x.lineWidth = 2;
    for (let r = 0; r < 6; r++) {
      const ry = 56 + r * 22;
      x.beginPath(); x.moveTo(26, ry); x.lineTo(150 + (r % 3) * 20, ry - 1); x.stroke();
      x.beginPath(); x.moveTo(w / 2 + 26, ry); x.lineTo(w / 2 + 115 + (r % 2) * 35, ry - 2); x.stroke();
    }
  });
}

function makeMagazineTex(title, sub, bgHex, accentHex) {
  return cachedProcTex(`mag_${title}`, 256, 384, (x, w, h) => {
    x.fillStyle = bgHex;
    x.fillRect(0, 0, w, h);
    x.fillStyle = accentHex;
    x.fillRect(0, 0, w, 16);
    x.fillRect(24, 150, w - 48, 120);
    x.fillStyle = '#ffffff';
    x.font = '800 28px "Segoe UI", Arial';
    x.fillText(title, 24, 72);
    x.font = '600 18px "Segoe UI", Arial';
    x.fillStyle = 'rgba(255,255,255,0.82)';
    x.fillText(sub, 24, 108);
  });
}

function makeExitSignTex() {
  return cachedProcTex('exitSign', 256, 96, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#076b37');
    g.addColorStop(1, '#0b8c48');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    x.strokeStyle = '#b4ffd6';
    x.lineWidth = 4;
    x.strokeRect(4, 4, w - 8, h - 8);
    x.fillStyle = '#f2fff8';
    x.font = '800 42px "Segoe UI", Arial';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('ВЫХОД ➔', w / 2, h / 2 + 2);
  });
}

function makeBadgeTex() {
  return cachedProcTex('secBadge', 128, 128, (x, w, h) => {
    x.fillStyle = '#d9b456';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#0c3e7e';
    x.beginPath(); x.arc(w / 2, h / 2, 42, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#f7df8c';
    x.lineWidth = 6;
    x.stroke();
    x.fillStyle = '#ffd740';
    x.beginPath(); x.arc(w / 2, h / 2, 16, 0, Math.PI * 2); x.fill();
  });
}

function makeFaceIDTerminalTex() {
  return cachedProcTex('faceIdTerminalTex', 192, 288, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#071422');
    g.addColorStop(1, '#0c233a');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(56,216,255,0.45)';
    x.lineWidth = 4;
    x.strokeRect(8, 8, w - 16, h - 16);
    // Camera lens ring at top
    x.fillStyle = '#05080d';
    x.beginPath(); x.arc(w / 2, 26, 10, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#2288ff';
    x.beginPath(); x.arc(w / 2, 26, 4, 0, Math.PI * 2); x.fill();
    // Face scan reticle
    x.strokeStyle = '#00f0ff';
    x.lineWidth = 4;
    const rx = 44, ry = 56, rw = w - 88, rh = 110, c = 18;
    for (const [cx, cy, sx, sy] of [
      [rx, ry, 1, 1], [rx + rw, ry, -1, 1], [rx, ry + rh, 1, -1], [rx + rw, ry + rh, -1, -1],
    ]) {
      x.beginPath();
      x.moveTo(cx + sx * c, cy); x.lineTo(cx, cy); x.lineTo(cx, cy + sy * c);
      x.stroke();
    }
    x.fillStyle = 'rgba(0,224,255,0.18)';
    x.beginPath(); x.arc(w / 2, 104, 24, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.arc(w / 2, 152, 34, Math.PI, Math.PI * 2); x.fill();
    // Status banner
    x.fillStyle = '#00e68a';
    x.font = '700 22px "Segoe UI", Arial';
    x.textAlign = 'center';
    x.fillText('СКУД · FACE ID', w / 2, 212);
    x.fillStyle = '#9cd8ff';
    x.font = '600 16px "Segoe UI", Arial';
    x.fillText('КАРТА / ПРОПУСК', w / 2, 244);
  });
}

/* ============================================================ TURNSTILES */
function buildTurnstiles(scene, y, M, colliders) {
  const group = new THREE.Group();
  group.name = 'turnstiles';
  group.position.y = y;

  const floorY = 0.04; // flush on top of ground-floor marble slab
  const turnstileZ = 8.2;
  const positions = [-1.30, 0, 1.30]; // 3 wide clear lanes
  const cabinetXs = [-1.95, -0.65, 0.65, 1.95];
  const gates = [];

  const steelMat = mat(M, 'brushedSteel', 'chrome');
  const titanMat = mat(M, 'darkTitanium', 'metalDark');
  const chromeMat = mat(M, 'chrome', 'brushedSteel');
  const glassWingMat = cachedMaterial({
    type: 'physical', color: 0xe6f7ff, transparent: true, opacity: 0.16,
    roughness: 0.02, metalness: 0.02, ior: 1.52, reflectivity: 0.96,
    clearcoat: 1.0, clearcoatRoughness: 0.02, envMapIntensity: 1.45,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const stripeTex = makeGlassStripeTextures();
  const glassStripeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: stripeTex.map, alphaMap: stripeTex.alphaMap,
    transparent: true, opacity: 0.24, roughness: 0.4, metalness: 0.05,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const readerTex = makeTurnstileReaderTex();
  const readerMat = new THREE.MeshStandardMaterial({
    map: readerTex, emissive: 0xffffff, emissiveMap: readerTex, emissiveIntensity: 0.72,
    roughness: 0.25, metalness: 0.1,
  });
  const faceIdTex = makeFaceIDTerminalTex();
  const faceIdMat = new THREE.MeshStandardMaterial({
    map: faceIdTex, emissive: 0xffffff, emissiveMap: faceIdTex, emissiveIntensity: 0.68,
    roughness: 0.22, metalness: 0.05,
  });
  const arrowIdleTex = makeTurnstileArrowTex(false);
  const arrowActiveTex = makeTurnstileArrowTex(true);
  const ledStripIdleMat = cachedMaterial({ color: 0x00e68a, emissive: 0x00c878, emissiveIntensity: 0.7, roughness: 0.3 });
  const lensMat = cachedMaterial({ color: 0x080a0f, roughness: 0.1, metalness: 0.3, envMapIntensity: 1.4 });

  const readerPadGeo = new THREE.PlaneGeometry(0.115, 0.115);
  readerPadGeo.rotateX(-Math.PI / 2);
  const bezelHousingGeo = new THREE.BoxGeometry(0.105, 0.068, 0.026);
  const indicatorGeo = new THREE.PlaneGeometry(0.090, 0.054);
  const ledStripGeo = new THREE.BoxGeometry(0.14, 0.008, 0.012);
  const faceStemGeo = new THREE.CylinderGeometry(0.014, 0.016, 0.24, 10);
  const faceBodyGeo = new THREE.BoxGeometry(0.11, 0.16, 0.022);
  const faceScreenGeo = new THREE.PlaneGeometry(0.094, 0.142);
  const sensorBarGeo = new THREE.BoxGeometry(0.006, 0.042, 0.74);
  const sensorLensGeo = new THREE.CylinderGeometry(0.010, 0.010, 0.008, 12);
  sensorLensGeo.rotateZ(Math.PI / 2);

  // Per-cabinet indicator materials so adjacent housings highlight smoothly per lane
  const cabinetIndicators = [];
  const tsBatch = new Batch();

  for (let i = 0; i < cabinetXs.length; i++) {
    const bx = cabinetXs[i];
    const cabM = new THREE.Matrix4().makeTranslation(bx, floorY, turnstileZ);
    const prevP = pushParent(tsBatch, cabM);

    // Illuminated RFID contactless pass card-reader pads on front & rear ends of top deck
    for (const rz of [0.39, -0.39]) {
      const rm = new THREE.Matrix4().makeTranslation(0, 0.948, rz);
      if (rz < 0) rm.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
      tsBatch.add(readerPadGeo, readerMat, rm);
    }

    // Upright Hikvision/PERCo-style Face-ID biometric terminal on entry end of each СКУД pedestal
    if (i < cabinetXs.length - 1) {
      const fx = 0.035, fz = 0.24;
      tsBatch.add(faceStemGeo, chromeMat, new THREE.Matrix4().makeTranslation(fx, 1.06, fz));
      const tiltQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.18, -0.15, 0, 'YXZ'));
      tsBatch.add(faceBodyGeo, titanMat, new THREE.Matrix4().compose(new THREE.Vector3(fx, 1.24, fz), tiltQ, new THREE.Vector3(1, 1, 1)));
      const scrM = new THREE.Matrix4().compose(new THREE.Vector3(fx, 1.24, fz), tiltQ, new THREE.Vector3(1, 1, 1))
        .multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.012));
      tsBatch.add(faceScreenGeo, faceIdMat, scrM);
    }

    // Recessed angled front & rear LED directional lane-status indicators + green СКУД trim strip
    const indMat = new THREE.MeshStandardMaterial({
      map: arrowIdleTex, emissive: 0xffffff, emissiveMap: arrowIdleTex, emissiveIntensity: 0.85,
      roughness: 0.18, metalness: 0.1,
    });
    cabinetIndicators.push(indMat);
    for (const dirZ of [1, -1]) {
      const bezQ = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(dirZ * -0.34, dirZ < 0 ? Math.PI : 0, 0, 'YXZ')
      );
      const bezM = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.78, dirZ * 0.585), bezQ, new THREE.Vector3(1, 1, 1));
      tsBatch.add(bezelHousingGeo, titanMat, bezM);
      tsBatch.add(ledStripGeo, ledStripIdleMat, new THREE.Matrix4().makeTranslation(0, 0.90, dirZ * 0.57));

      const face = new THREE.Mesh(indicatorGeo, indMat);
      face.position.set(bx, floorY + 0.78, turnstileZ + dirZ * 0.585);
      face.quaternion.copy(bezQ);
      face.translateZ(0.014);
      group.add(face);
    }

    // Recessed black infrared optical sensor bars & lenses along inner lane faces
    const sensorSides = i === 0 ? [1] : i === cabinetXs.length - 1 ? [-1] : [-1, 1];
    for (const sgn of sensorSides) {
      for (const sy of [0.36, 0.66]) {
        tsBatch.add(sensorBarGeo, titanMat, new THREE.Matrix4().makeTranslation(sgn * 0.084, sy, 0));
        for (const lz of [-0.30, -0.10, 0.10, 0.30]) {
          tsBatch.add(sensorLensGeo, lensMat, new THREE.Matrix4().makeTranslation(sgn * 0.087, sy, lz));
        }
      }
    }

    tsBatch.setParent(prevP);

    // Compact collider for each solid cabinet footprint (never blocks the 3 lanes!)
    if (colliders) {
      colliders.push({
        type: 'rect', x0: bx - 0.095, x1: bx + 0.095,
        z0: turnstileZ - 0.62, z1: turnstileZ + 0.62,
        y0: PODIUM, y1: PODIUM + 1.15,
      });
    }
  }

  // Load compact brushed stainless speedgate.glb СКУД housings
  const sgPromise = loadGLB('./assets/models/speedgate.glb')
    .then((gltf) => {
      for (const bx of cabinetXs) {
        const cab = prepareModel(gltf.scene.clone(true), {
          groundY: null,
          centerXZ: true,
          envMapIntensity: 1.35,
          onMesh(obj) {
            const m = obj.material;
            if (!m) return;
            if (m.name === 'GateSteel') {
              m.metalness = 0.94;
              m.roughness = 0.18;
              m.envMapIntensity = 1.45;
            } else if (m.name === 'GateObsidian') {
              m.color.setHex(0x090c12);
              m.metalness = 0.22;
              m.roughness = 0.05;
              m.envMapIntensity = 1.65;
            } else if (m.name === 'GatePlinth') {
              m.metalness = 0.60;
              m.roughness = 0.42;
              m.envMapIntensity = 0.9;
            }
          },
        });
        cab.scale.set(0.84, 0.96, 0.88);
        cab.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(cab);
        cab.position.x = bx;
        cab.position.y += floorY - box.min.y;
        cab.position.z = turnstileZ;
        group.add(cab);
      }
    })
    .catch(() => {});
  _interiorPending.push(sgPromise);

  // Tempered-glass swing barrier wings with rotary chrome hinge posts & crisp safety stripes
  const hingeGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.84, 16);
  const clampGeo = new THREE.BoxGeometry(0.084, 0.052, 0.030);
  const wingGeo = new THREE.BoxGeometry(0.49, 0.76, 0.011);
  const stripeGeo = new THREE.PlaneGeometry(0.45, 0.12);

  const makeWing = (pivotX, sideSign) => {
    const pivot = new THREE.Group();
    pivot.position.set(pivotX, floorY + 0.49, turnstileZ);

    const hinge = new THREE.Mesh(hingeGeo, chromeMat);
    pivot.add(hinge);

    for (const cy of [-0.33, 0.33]) {
      const clampMesh = new THREE.Mesh(clampGeo, steelMat);
      clampMesh.position.set(sideSign * 0.048, cy, 0);
      pivot.add(clampMesh);
    }

    const wing = new THREE.Mesh(wingGeo, glassWingMat);
    wing.position.set(sideSign * 0.268, 0, 0);
    const stripe = new THREE.Mesh(stripeGeo, glassStripeMat);
    stripe.position.set(sideSign * 0.268, 0, 0);
    stripe.renderOrder = 1;
    pivot.add(wing, stripe);
    group.add(pivot);
    return pivot;
  };

  for (let idx = 0; idx < positions.length; idx++) {
    const px = positions[idx];
    const leftPivot = makeWing(px - 0.542, 1);
    const rightPivot = makeWing(px + 0.542, -1);
    gates.push({
      leftPivot,
      rightPivot,
      leftIndMat: cabinetIndicators[idx],
      rightIndMat: cabinetIndicators[idx + 1],
      arrowIdleTex,
      arrowActiveTex,
      x: px,
      z: turnstileZ,
      open: 0,
      dir: 1,
      active: false,
    });
  }

  // Brushed-chrome tubular guide stanchion rails flanking outer left & right turnstiles
  const postGeo = new THREE.CylinderGeometry(0.023, 0.023, 0.90, 14);
  const flangeGeo = new THREE.CylinderGeometry(0.045, 0.115, 0.036, 16);
  const capGeo = new THREE.SphereGeometry(0.024, 12, 8);

  const addStanchionSegment = (x0, z0, x1, z1, withGlass = false) => {
    for (const [sx, sz] of [[x0, z0], [x1, z1]]) {
      tsBatch.add(flangeGeo, chromeMat, new THREE.Matrix4().makeTranslation(sx, floorY + 0.018, sz));
      tsBatch.add(postGeo, chromeMat, new THREE.Matrix4().makeTranslation(sx, floorY + 0.47, sz));
      tsBatch.add(capGeo, chromeMat, new THREE.Matrix4().makeTranslation(sx, floorY + 0.92, sz));
    }
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const ry = Math.atan2(dx, dz);
    for (const railY of [floorY + 0.86, floorY + 0.46]) {
      const rGeo = new THREE.CylinderGeometry(0.015, 0.015, len, 10);
      rGeo.rotateX(Math.PI / 2);
      const rm = new THREE.Matrix4().compose(
        new THREE.Vector3((x0 + x1) / 2, railY, (z0 + z1) / 2),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
        new THREE.Vector3(1, 1, 1)
      );
      tsBatch.add(rGeo, chromeMat, rm);
    }
    if (withGlass && len > 0.25) {
      tsBatch.box(glassWingMat, 0.010, 0.34, len - 0.06, (x0 + x1) / 2, floorY + 0.66, (z0 + z1) / 2, ry);
    }
  };

  addStanchionSegment(2.04, turnstileZ, 4.10, turnstileZ, true);
  addStanchionSegment(-2.04, turnstileZ, -3.72, turnstileZ, true);
  if (colliders) {
    colliders.push({ type: 'rect', x0: 2.02, x1: 4.12, z0: turnstileZ - 0.08, z1: turnstileZ + 0.08, y0: PODIUM, y1: PODIUM + 1.05 });
    colliders.push({ type: 'rect', x0: -3.74, x1: -2.02, z0: turnstileZ - 0.08, z1: turnstileZ + 0.08, y0: PODIUM, y1: PODIUM + 1.05 });
  }

  tsBatch.build(group, { cast: true, receive: true, name: 'turnstiles-static' });
  scene.add(group);
  return gates;
}

/* ============================================================ SEMICIRCULAR STAIRS */
const _stairUp = new THREE.Vector3(0, 1, 0);
function addStairRailSeg(batch, railMat, x0, y0, z0, x1, y1, z1, radius = 0.032) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return;
  const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
  const q = new THREE.Quaternion().setFromUnitVectors(_stairUp, dir);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
    q,
    new THREE.Vector3(1, 1, 1)
  );
  batch.add(new THREE.CylinderGeometry(radius, radius, len + 0.022, 10), railMat, m);
}

function buildOrientedQuadGeometry(quads) {
  const pos = [];
  const uv = [];
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), cr = new THREE.Vector3();
  const pushTri = (p0, p1, p2, uv0, uv1, uv2) => {
    pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    uv.push(uv0[0], uv0[1], uv1[0], uv1[1], uv2[0], uv2[1]);
  };
  for (const q of quads) {
    const [A, B, C, D, nTarget, u0 = 0, v0 = 0, u1 = 1, v1 = 1] = q;
    vA.copy(A); vB.copy(B); vC.copy(C);
    e1.subVectors(vB, vA);
    e2.subVectors(vC, vA);
    cr.crossVectors(e1, e2);
    if (cr.dot(nTarget) >= 0) {
      pushTri(A, B, C, [u0, v0], [u1, v0], [u1, v1]);
      pushTri(A, C, D, [u0, v0], [u1, v1], [u0, v1]);
    } else {
      pushTri(A, C, B, [u0, v0], [u1, v1], [u1, v0]);
      pushTri(A, D, C, [u0, v0], [u0, v1], [u1, v1]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}

function buildSpiralStairStructure(batch, matBody, rInner, rOuter, a0, a1, baseY, height, segs = 28) {
  const aSpan = a1 - a0;
  const sW = 0.10; // solid inner & outer stringer thickness
  const quads = [];

  const ySlope = (t) => baseY + 0.02 + t * height;
  const ySoffit = (t) => {
    const raw = ySlope(t) - 0.34;
    // Taper smoothly into lower slab at t=0 and upper slab soffit (baseY + 3.44) at t=1
    if (t < 0.08) return THREE.MathUtils.lerp(baseY - 0.06, raw, t / 0.08);
    if (t > 0.90) return THREE.MathUtils.lerp(raw, baseY + height - 0.18, (t - 0.90) / 0.10);
    return raw;
  };
  const yTopStringer = (t) => ySlope(t) + 0.075;

  const pt = (a, r, y) => {
    const p = polar(a, r);
    return new THREE.Vector3(p.x, y, p.z);
  };
  const radVec = (a, sgn) => {
    const p = polar(a, 1);
    return new THREE.Vector3(p.x * sgn, 0, p.z * sgn);
  };

  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const am0 = a0 + t0 * aSpan, am1 = a0 + t1 * aSpan;
    const amMid = (am0 + am1) / 2;
    const yb0 = ySoffit(t0), yb1 = ySoffit(t1);
    const yt0 = yTopStringer(t0), yt1 = yTopStringer(t1);

    // 1. Continuous curved marble/plaster structural soffit underside (facing -Y)
    quads.push([
      pt(am0, rInner, yb0), pt(am0, rOuter, yb0), pt(am1, rOuter, yb1), pt(am1, rInner, yb1),
      new THREE.Vector3(0, -1, 0), t0 * 6, 0, t1 * 6, 1,
    ]);

    // 2. Solid inner curved stringer (rInner .. rInner + sW)
    const rI2 = rInner + sW;
    quads.push([
      pt(am0, rInner, yb0), pt(am1, rInner, yb1), pt(am1, rInner, yt1), pt(am0, rInner, yt0),
      radVec(amMid, -1), t0 * 6, 0, t1 * 6, 1,
    ]);
    quads.push([
      pt(am0, rI2, yb0), pt(am1, rI2, yb1), pt(am1, rI2, yt1), pt(am0, rI2, yt0),
      radVec(amMid, 1), t0 * 6, 0, t1 * 6, 1,
    ]);
    quads.push([
      pt(am0, rInner, yt0), pt(am0, rI2, yt0), pt(am1, rI2, yt1), pt(am1, rInner, yt1),
      new THREE.Vector3(0, 1, 0), t0 * 6, 0, t1 * 6, 1,
    ]);

    // 3. Solid outer curved stringer (rOuter - sW .. rOuter)
    const rO1 = rOuter - sW;
    quads.push([
      pt(am0, rOuter, yb0), pt(am1, rOuter, yb1), pt(am1, rOuter, yt1), pt(am0, rOuter, yt0),
      radVec(amMid, 1), t0 * 6, 0, t1 * 6, 1,
    ]);
    quads.push([
      pt(am0, rO1, yb0), pt(am1, rO1, yb1), pt(am1, rO1, yt1), pt(am0, rO1, yt0),
      radVec(amMid, -1), t0 * 6, 0, t1 * 6, 1,
    ]);
    quads.push([
      pt(am0, rO1, yt0), pt(am0, rOuter, yt0), pt(am1, rOuter, yt1), pt(am1, rO1, yt1),
      new THREE.Vector3(0, 1, 0), t0 * 6, 0, t1 * 6, 1,
    ]);
  }

  // End cap seals at t=0 and t=1
  for (const tCap of [0, 1]) {
    const ac = a0 + tCap * aSpan;
    const tanSign = (tCap === 0 ? -1 : 1) * Math.sign(aSpan);
    const pC = polar(ac, 1);
    const nTan = new THREE.Vector3(pC.z * -tanSign, 0, pC.x * tanSign);
    const yb = ySoffit(tCap), yt = yTopStringer(tCap);
    quads.push([
      pt(ac, rInner, yb), pt(ac, rInner + sW, yb), pt(ac, rInner + sW, yt), pt(ac, rInner, yt),
      nTan, 0, 0, 1, 1,
    ]);
    quads.push([
      pt(ac, rOuter - sW, yb), pt(ac, rOuter, yb), pt(ac, rOuter, yt), pt(ac, rOuter - sW, yt),
      nTan, 0, 0, 1, 1,
    ]);
  }

  batch.add(buildOrientedQuadGeometry(quads), matBody);
}

function buildSpiralGlassPanel(batch, glassMat, rEdge, a0, aSpan, t0, t1, baseY, height = 3.6, yBotOff = 0.14, yTopOff = 0.88, thickness = 0.016) {
  const sub = 3;
  const halfT = thickness / 2;
  const rIn = rEdge - halfT, rOut = rEdge + halfT;
  const quads = [];
  const pt = (a, r, y) => {
    const p = polar(a, r);
    return new THREE.Vector3(p.x, y, p.z);
  };
  const radVec = (a, sgn) => {
    const p = polar(a, 1);
    return new THREE.Vector3(p.x * sgn, 0, p.z * sgn);
  };

  for (let i = 0; i < sub; i++) {
    const st0 = t0 + ((t1 - t0) * i) / sub;
    const st1 = t0 + ((t1 - t0) * (i + 1)) / sub;
    const aA = a0 + st0 * aSpan, aB = a0 + st1 * aSpan;
    const aM = (aA + aB) / 2;
    const yb0 = baseY + 0.02 + st0 * height + yBotOff;
    const yt0 = baseY + 0.02 + st0 * height + yTopOff;
    const yb1 = baseY + 0.02 + st1 * height + yBotOff;
    const yt1 = baseY + 0.02 + st1 * height + yTopOff;

    quads.push([pt(aA, rOut, yb0), pt(aB, rOut, yb1), pt(aB, rOut, yt1), pt(aA, rOut, yt0), radVec(aM, 1), 0, 0, 1, 1]);
    quads.push([pt(aA, rIn, yb0), pt(aB, rIn, yb1), pt(aB, rIn, yt1), pt(aA, rIn, yt0), radVec(aM, -1), 0, 0, 1, 1]);
    quads.push([pt(aA, rIn, yt0), pt(aA, rOut, yt0), pt(aB, rOut, yt1), pt(aB, rIn, yt1), new THREE.Vector3(0, 1, 0), 0, 0, 1, 1]);
    quads.push([pt(aA, rIn, yb0), pt(aA, rOut, yb0), pt(aB, rOut, yb1), pt(aB, rIn, yb1), new THREE.Vector3(0, -1, 0), 0, 0, 1, 1]);
  }
  batch.add(buildOrientedQuadGeometry(quads), glassMat);
}

function buildGrandStairs(batch, M, colliders) {
  const rInner = 4.6, rOuter = 6.6;
  const stairW = rOuter - rInner;
  const rMid = (rInner + rOuter) / 2;
  const stepsPerFlight = 20;
  const risePer = 3.6 / stepsPerFlight;
  const treadT = 0.052;
  const marbleMat = mat(M, 'marbleFloor', 'marble');
  const stoneMat = mat(M, 'stone');
  const glassMat = mat(M, 'glass', 'glassTint');
  const chromeMat = mat(M, 'chrome', 'brushedSteel');
  const brassMat = mat(M, 'brushedBrass', 'chrome');
  const railMat = mat(M, 'walnutDoor', 'woodLight');
  const treadLedMat = cachedMaterial({
    color: 0xffe4b8, emissive: 0xffce84, emissiveIntensity: 0.78, roughness: 0.4,
  });

  for (let level = 0; level < 3; level++) {
    const baseY = FLOOR[level];
    const arcs = [
      { a0: 200 * DEG, a1: 340 * DEG },
      { a0: 20 * DEG, a1: 160 * DEG },
    ];

    for (const arc of arcs) {
      const aSpan = arc.a1 - arc.a0;
      const stepAng = aSpan / stepsPerFlight;

      // Continuous structural curved marble/stone soffit + solid inner/outer stringers
      buildSpiralStairStructure(batch, stoneMat, rInner, rOuter, arc.a0, arc.a1, baseY, 3.6, 28);

      for (let i = 0; i < stepsPerFlight; i++) {
        const a = arc.a0 + (i + 0.5) * stepAng;
        const stepY = baseY + 0.02 + (i + 1) * risePer;
        const p = polar(a, rMid);
        const ry = Math.atan2(Math.sin(a), -Math.cos(a));
        const w = Math.max(0.56, (2 * Math.PI * rMid * Math.abs(aSpan)) / stepsPerFlight);
        const yEps = (i % 2) * 0.0012;

        // Marble tread nestled cleanly between solid inner & outer stringers
        batch.box(marbleMat, w * 1.03, treadT, stairW - 0.18, p.x, stepY - treadT / 2 + yEps, p.z, ry);

        // Solid stone riser descending cleanly down into structural soffit
        const aLead = arc.a0 + i * stepAng;
        const pLead = polar(aLead, rMid);
        const ryLead = Math.atan2(Math.sin(aLead), -Math.cos(aLead));
        const riserH = risePer + 0.14;
        batch.box(stoneMat, 0.045, riserH, stairW - 0.18, pLead.x, stepY - treadT - riserH / 2 + 0.01, pLead.z, ryLead);

        // Brushed-brass anti-slip tread nosing strip on leading lip
        const noseAng = arc.a0 + (i + 0.08) * stepAng;
        const pNose = polar(noseAng, rMid);
        const ryNose = Math.atan2(Math.sin(noseAng), -Math.cos(noseAng));
        batch.box(brassMat, 0.034, 0.008, stairW - 0.22, pNose.x, stepY + 0.003 + yEps, pNose.z, ryNose);

        // Subtle warm under-tread LED wash strip beneath alternate steps
        if (i % 2 === 1) {
          const ledAng = arc.a0 + (i + 0.04) * stepAng;
          const pLed = polar(ledAng, rMid);
          const ryLed = Math.atan2(Math.sin(ledAng), -Math.cos(ledAng));
          batch.box(treadLedMat, 0.016, 0.012, stairW - 0.36, pLed.x, stepY - treadT - 0.008, pLed.z, ryLed);
        }
      }

      // Sloped spiral tempered-glass balustrades + chrome spider-clamp spigots + walnut handrails
      const bays = 10;
      const railSegs = 32;
      for (const edgeR of [rInner + 0.05, rOuter - 0.05]) {
        for (let k = 0; k <= bays; k++) {
          const t = k / bays;
          const a = arc.a0 + t * aSpan;
          const pEdge = polar(a, edgeR);
          const baseH = baseY + 0.02 + t * 3.6 + 0.075; // anchored on top of solid stringer cap

          // Base anchor rosette + vertical brushed-chrome post
          batch.cyl(chromeMat, 0.044, 0.048, 0.022, 10, pEdge.x, baseH + 0.011, pEdge.z);
          batch.cyl(chromeMat, 0.020, 0.020, 0.88, 10, pEdge.x, baseH + 0.44, pEdge.z);

          // Upper & lower chrome spider-clamp spigots gripping glass panels
          const ryPost = Math.atan2(Math.sin(a), -Math.cos(a));
          for (const cy of [baseH + 0.14, baseH + 0.72]) {
            batch.box(chromeMat, 0.055, 0.026, 0.046, pEdge.x, cy, pEdge.z, ryPost);
          }

          if (k < bays) {
            buildSpiralGlassPanel(batch, glassMat, edgeR, arc.a0, aSpan, k / bays, (k + 1) / bays, baseY, 3.6, 0.14, 0.87, 0.016);
          }
        }

        // Continuous smooth curved walnut handrail
        for (let k = 0; k < railSegs; k++) {
          const t0 = k / railSegs, t1 = (k + 1) / railSegs;
          const p0 = polar(arc.a0 + t0 * aSpan, edgeR);
          const p1 = polar(arc.a0 + t1 * aSpan, edgeR);
          const y0 = baseY + 0.02 + t0 * 3.6 + 0.96;
          const y1 = baseY + 0.02 + t1 * 3.6 + 0.96;
          addStairRailSeg(batch, railMat, p0.x, y0, p0.z, p1.x, y1, p1.z, 0.032);
        }
      }

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
  const shaftMat = mat(M, 'brushedSteel', 'chrome');
  const titanMat = mat(M, 'darkTitanium', 'metalDark');
  const glassMat = mat(M, 'glass', 'glassTint');
  const brassMat = mat(M, 'brushedBrass', 'chrome');

  const shaftH = FLOOR[3] + WALL_H;
  const outerGlass = new THREE.CylinderGeometry(shaftR, shaftR, shaftH, 36, 1, true);
  batch.add(outerGlass, glassMat, new THREE.Matrix4().makeTranslation(0, shaftH / 2, 0));

  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const p = polar(a, shaftR);
    batch.box(shaftMat, 0.06, shaftH, 0.08, p.x, shaftH / 2, p.z, Math.atan2(Math.sin(a), -Math.cos(a)));
  }

  for (let lv = 0; lv < 4; lv++) {
    const fy = FLOOR[lv];
    const ring = new THREE.TorusGeometry(shaftR + 0.02, 0.04, 10, 36);
    ring.rotateX(Math.PI / 2);
    batch.add(ring, shaftMat, new THREE.Matrix4().makeTranslation(0, fy, 0));
    batch.add(ring.clone(), shaftMat, new THREE.Matrix4().makeTranslation(0, fy + WALL_H, 0));
  }

  // Sliding brushed-steel doors + portal frames + hall call panels on each landing
  const doorParts = [];
  const elevDoorMat = mat(M, 'brushedSteel', 'chrome');
  const callBtnMat = cachedMaterial({ color: 0x00ff88, emissive: 0x00ff88, emissiveIntensity: 0.75 });
  for (let lv = 0; lv < 4; lv++) {
    const fy = FLOOR[lv];
    const floorOff = lv === 0 ? 0.04 : 0.02;
    // Door portal jambs & header transom
    batch.box(titanMat, 0.08, 2.38, 0.12, -0.58, fy + floorOff + 1.19, shaftR + 0.05);
    batch.box(titanMat, 0.08, 2.38, 0.12, 0.58, fy + floorOff + 1.19, shaftR + 0.05);
    batch.box(shaftMat, 1.24, 0.14, 0.14, 0, fy + floorOff + 2.42, shaftR + 0.05);

    const leftDoor = new THREE.Mesh(new THREE.BoxGeometry(0.51, 2.30, 0.04), elevDoorMat);
    leftDoor.position.set(-0.265, fy + floorOff + 1.15, shaftR + 0.04);
    leftDoor.castShadow = true;
    const rightDoor = new THREE.Mesh(new THREE.BoxGeometry(0.51, 2.30, 0.04), elevDoorMat);
    rightDoor.position.set(0.265, fy + floorOff + 1.15, shaftR + 0.04);
    rightDoor.castShadow = true;
    parentGroup.add(leftDoor, rightDoor);
    doorParts.push({ left: leftDoor, right: rightDoor, level: lv, baseX: [-0.265, 0.265], open: 0 });

    // Digital floor indicator above portal header
    batch.box(titanMat, 0.34, 0.14, 0.03, 0, fy + floorOff + 2.58, shaftR + 0.09);
    batch.box(getLabelMat(`▲  ${lv + 1}`, 256, 96, '#0d131a', '#00ff88'), 0.28, 0.10, 0.015, 0, fy + floorOff + 2.58, shaftR + 0.105);

    // Stainless hall call-button panel beside right jamb
    batch.box(shaftMat, 0.12, 0.26, 0.03, 0.72, fy + floorOff + 1.12, shaftR + 0.08);
    const btnGeo1 = new THREE.CylinderGeometry(0.022, 0.022, 0.012, 14);
    btnGeo1.rotateX(Math.PI / 2);
    batch.add(btnGeo1, callBtnMat, new THREE.Matrix4().makeTranslation(0.72, fy + floorOff + 1.16, shaftR + 0.10));
    const btnGeo2 = new THREE.CylinderGeometry(0.016, 0.016, 0.012, 14);
    btnGeo2.rotateX(Math.PI / 2);
    batch.add(btnGeo2, titanMat, new THREE.Matrix4().makeTranslation(0.72, fy + floorOff + 1.07, shaftR + 0.10));
  }

  // Refined panoramic glass & walnut-slat cabin
  const cabin = new THREE.Group();
  cabin.name = 'elevator-cabin';
  const cabR = shaftR - 0.14;

  // Marble + Nero Marquina inlaid cabin floor
  const cabinFloor = new THREE.Mesh(
    new THREE.CylinderGeometry(cabR, cabR, 0.06, 28),
    mat(M, 'marbleFloor', 'marble')
  );
  cabinFloor.position.y = 0.02;
  const floorTrim = new THREE.Mesh(new THREE.RingGeometry(cabR - 0.16, cabR - 0.04, 28), mat(M, 'neroMarble', 'graniteDark'));
  floorTrim.rotation.x = -Math.PI / 2;
  floorTrim.position.y = 0.052;
  cabin.add(cabinFloor, floorTrim);

  // Curved warm walnut rear feature wall (back ~140°) + brass framing
  const rearArcGeo = new THREE.CylinderGeometry(cabR - 0.03, cabR - 0.03, 2.42, 20, 1, true, Math.PI * 0.62, Math.PI * 0.76);
  const rearWall = new THREE.Mesh(rearArcGeo, mat(M, 'walnutSlat', 'walnutDoor'));
  rearWall.position.y = 1.26;
  cabin.add(rearWall);

  // Backlit beveled mirror panel centered on rear wall
  const mirrorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.96, 1.66, 0.03), brassMat);
  mirrorFrame.position.set(0, 1.32, -(cabR - 0.08));
  const mirrorMat = cachedMaterial({ color: 0xebeef4, metalness: 0.94, roughness: 0.04, envMapIntensity: 1.8 });
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 1.58), mirrorMat);
  mirror.position.set(0, 1.32, -(cabR - 0.10));
  cabin.add(mirrorFrame, mirror);

  // Curved panoramic clear glass cabin enclosure around front/sides meeting walnut rear wall
  const cabGlassGeo = new THREE.CylinderGeometry(cabR - 0.02, cabR - 0.02, 2.40, 28, 1, true, -Math.PI * 0.62, Math.PI * 1.24);
  const cabGlass = new THREE.Mesh(cabGlassGeo, glassMat);
  cabGlass.position.y = 1.25;
  cabin.add(cabGlass);

  // Brushed-chrome protective handrail inside cabin
  const railGeo = new THREE.TorusGeometry(cabR - 0.12, 0.020, 8, 28, Math.PI * 1.15);
  const rail = new THREE.Mesh(railGeo, shaftMat);
  rail.rotation.x = Math.PI / 2;
  rail.rotation.z = -Math.PI * 0.075;
  rail.position.set(0, 0.98, 0);
  cabin.add(rail);

  // Illuminated coffered ceiling light panel + rooftop mechanical crown
  const cabCeil = new THREE.Mesh(new THREE.CylinderGeometry(cabR, cabR, 0.08, 28), shaftMat);
  cabCeil.position.y = 2.48;
  const cabLightRing = new THREE.Mesh(
    new THREE.CylinderGeometry(cabR - 0.28, cabR - 0.28, 0.03, 24),
    mat(M, 'lampPanel', 'lampGlow')
  );
  cabLightRing.position.y = 2.43;
  const cabCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.95, 0.28, 18), titanMat);
  cabCrown.position.y = 2.66;
  cabin.add(cabCeil, cabLightRing, cabCrown);

  const cabinLight = new THREE.PointLight(0xfff0d4, 1.4, 8, 1.4);
  cabinLight.position.y = 2.25;
  cabin.add(cabinLight);

  cabin.position.y = FLOOR[0];
  parentGroup.add(cabin);

  colliders.push({ type: 'circle', x: 0, z: 0, r: shaftR + 0.1, y0: PODIUM, y1: PODIUM + shaftH });
  colliders.push({
    type: 'elevator',
    x: 0, z: shaftR + 0.6, r: 1.4,
    levels: [PODIUM + FLOOR[0], PODIUM + FLOOR[1], PODIUM + FLOOR[2], PODIUM + FLOOR[3]],
  });

  return { doorParts, cabin };
}

/* ============================================================ HALL (rotunda floors) */
function hall(batch, M, colliders) {
  const r = R.hall;
  const marbleMat = mat(M, 'marbleFloor', 'marble');
  const neroMat = mat(M, 'neroMarble', 'graniteDark');
  const brassMat = mat(M, 'brushedBrass', 'chrome');
  const stoneMat = mat(M, 'stone');
  const steelMat = mat(M, 'brushedSteel', 'chrome');

  // Attic base & classical capital LatheGeometry profiles for atrium columns
  const basePts = [
    new THREE.Vector2(0.01, 0), new THREE.Vector2(0.41, 0), new THREE.Vector2(0.43, 0.03),
    new THREE.Vector2(0.39, 0.06), new THREE.Vector2(0.36, 0.10), new THREE.Vector2(0.39, 0.14),
    new THREE.Vector2(0.34, 0.18), new THREE.Vector2(0.33, 0.22),
  ];
  const baseGeo = new THREE.LatheGeometry(basePts, 20);
  const capPts = [
    new THREE.Vector2(0.285, 0), new THREE.Vector2(0.30, 0.05), new THREE.Vector2(0.36, 0.16),
    new THREE.Vector2(0.42, 0.24), new THREE.Vector2(0.43, 0.28), new THREE.Vector2(0.01, 0.28),
  ];
  const capGeo = new THREE.LatheGeometry(capPts, 20);
  const collarTorus = new THREE.TorusGeometry(0.30, 0.020, 10, 24);
  collarTorus.rotateX(Math.PI / 2);

  const glassMat = mat(M, 'glass', 'glassTint');
  const railMat = mat(M, 'walnutDoor', 'woodLight');

  for (let lv = 0; lv < 4; lv++) {
    const y = FLOOR[lv];
    const floorTop = lv === 0 ? y + 0.04 : y + 0.02;

    if (lv === 0) {
      batch.add(new THREE.CylinderGeometry(r - 0.1, r - 0.1, 0.04, 72),
        marbleMat, new THREE.Matrix4().makeTranslation(0, y + 0.02, 0));
    } else {
      addRotundaRing(batch, marbleMat, R.core + 0.06, r - 0.1, y + 0.02, false, true);

      // Finished stairwell cutout fascia + glass/chrome/walnut gallery guardrails on upper floors
      const cutoutArcs = [
        { a0: 20 * DEG, a1: 160 * DEG },
        { a0: 200 * DEG, a1: 340 * DEG },
      ];
      for (const arc of cutoutArcs) {
        const aSpan = arc.a1 - arc.a0;
        for (const edgeR of [4.48, 6.72]) {
          // Vertical stone fascia sealing slab-to-ceiling thickness around stairwell opening
          const fSegs = 20;
          for (let s = 0; s < fSegs; s++) {
            const am = arc.a0 + ((s + 0.5) / fSegs) * aSpan;
            const pf = polar(am, edgeR);
            const segW = (2 * Math.PI * edgeR * (aSpan / (Math.PI * 2))) / fSegs * 1.04;
            batch.box(stoneMat, segW, 0.24, 0.06, pf.x, y - 0.10, pf.z, Math.atan2(Math.sin(am), -Math.cos(am)));
          }
          // Upper-gallery tempered glass balustrade + chrome posts + walnut top rail
          const bays = 8;
          for (let k = 0; k <= bays; k++) {
            const a = arc.a0 + (k / bays) * aSpan;
            const pe = polar(a, edgeR);
            batch.cyl(steelMat, 0.04, 0.044, 0.02, 10, pe.x, floorTop + 0.01, pe.z);
            batch.cyl(steelMat, 0.018, 0.018, 0.90, 10, pe.x, floorTop + 0.46, pe.z);
            if (k < bays) {
              buildSpiralGlassPanel(batch, glassMat, edgeR, arc.a0, aSpan, k / bays, (k + 1) / bays, y, 0, 0.10, 0.88, 0.016);
            }
          }
          const railSegs = 24;
          for (let k = 0; k < railSegs; k++) {
            const p0 = polar(arc.a0 + (k / railSegs) * aSpan, edgeR);
            const p1 = polar(arc.a0 + ((k + 1) / railSegs) * aSpan, edgeR);
            addStairRailSeg(batch, railMat, p0.x, floorTop + 0.94, p0.z, p1.x, floorTop + 0.94, p1.z, 0.030);
          }
        }
      }
    }

    // Flush inlaid Nero Marquina stone & brushed-brass pinstripe floor bands
    const bandSpecs = lv === 0
      ? [[2.78, 3.04], [6.88, 7.12]]
      : [[2.78, 2.98]];
    for (const [bIn, bOut] of bandSpecs) {
      const band = new THREE.RingGeometry(bIn, bOut, 72);
      band.rotateX(-Math.PI / 2);
      batch.add(band, neroMat, new THREE.Matrix4().makeTranslation(0, floorTop + 0.002, 0));
      for (const br of [bIn - 0.025, bOut + 0.025]) {
        const trim = new THREE.RingGeometry(br - 0.014, br + 0.014, 72);
        trim.rotateX(-Math.PI / 2);
        batch.add(trim, brassMat, new THREE.Matrix4().makeTranslation(0, floorTop + 0.0025, 0));
      }
    }

    // Eight classical marble columns with Attic bases, brass collars & capitals
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const p = polar(a, r - 1.1);
      // Stepped square marble plinth
      batch.box(stoneMat, 0.84, 0.12, 0.84, p.x, floorTop + 0.06, p.z, -a);
      // Attic torus/scotia base molding
      batch.add(baseGeo, stoneMat, new THREE.Matrix4().makeTranslation(p.x, floorTop + 0.12, p.z));
      // Smooth tapered column shaft
      const shaftBot = floorTop + 0.34;
      const shaftTop = y + 3.00;
      const shaftH = shaftTop - shaftBot;
      batch.cyl(stoneMat, 0.285, 0.33, shaftH, 20, p.x, shaftBot + shaftH / 2, p.z);
      // Brushed-brass necking collar ring
      batch.add(collarTorus, brassMat, new THREE.Matrix4().makeTranslation(p.x, shaftTop, p.z));
      // Flared classical capital + stepped square abacus meeting ceiling
      batch.add(capGeo, stoneMat, new THREE.Matrix4().makeTranslation(p.x, shaftTop + 0.01, p.z));
      batch.box(stoneMat, 0.82, 0.10, 0.82, p.x, y + 3.31, p.z, -a);

      colliders.push({ type: 'circle', x: p.x, z: p.z, r: 0.42, y0: PODIUM + y, y1: PODIUM + y + WALL_H });
    }

    // Bright white Armstrong ceiling ring + recessed LED panels in slim brushed-aluminum bezels
    addRotundaRing(batch, mat(M, 'ceiling', 'stone'), R.core + 0.06, r - 0.1, y + 3.36, true, lv < 3);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const p = polar(a, r - 1.55);
      batch.box(steelMat, 1.12, 0.032, 0.57, p.x, y + 3.345, p.z, -a);
      batch.box(mat(M, 'lampPanel', 'lampGlow'), 1.04, 0.036, 0.49, p.x, y + 3.332, p.z, -a);
    }
  }

  // Lobby brass-and-opal glass chandelier globes around elevator core
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const p = polar(a, 3.2);
    batch.cyl(brassMat, 0.055, 0.055, 0.025, 12, p.x, 3.35, p.z);
    batch.cyl(brassMat, 0.012, 0.012, 1.0, 6, p.x, 2.85, p.z);
    batch.cyl(brassMat, 0.04, 0.03, 0.05, 10, p.x, 2.47, p.z);
    batch.add(new THREE.SphereGeometry(0.145, 14, 10), mat(M, 'lampGlow'),
      new THREE.Matrix4().makeTranslation(p.x, 2.34, p.z));
  }
}

/* ============================================================ SCULPTED SECURITY OFFICER */
function buildSecurityOfficer(batch, M, parentGroup, gx, floorY, gz, ry) {
  const localOrigin = new THREE.Matrix4().compose(
    new THREE.Vector3(gx, floorY, gz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    new THREE.Vector3(1, 1, 1)
  );
  const prev = pushParent(batch, localOrigin);

  const leatherMat = mat(M, 'leatherBlack', 'fabric');
  const chromeMat = mat(M, 'chrome', 'brushedSteel');
  const titanMat = mat(M, 'darkTitanium', 'metalDark');
  const brassMat = mat(M, 'brushedBrass', 'chrome');
  const uniformMat = cachedMaterial({ color: 0x162447, roughness: 0.68, metalness: 0.04, envMapIntensity: 0.35 });
  const shirtMat = cachedMaterial({ color: 0xf4f6fa, roughness: 0.72, metalness: 0 });
  const tieMat = cachedMaterial({ color: 0x0e1830, roughness: 0.42, metalness: 0.08 });
  const skinMat = cachedMaterial({ color: 0xd7a57f, roughness: 0.56, metalness: 0 });
  const shoeMat = cachedMaterial({ color: 0x111318, roughness: 0.20, metalness: 0.15, envMapIntensity: 1.1 });
  const hairMat = cachedMaterial({ color: 0x1b1817, roughness: 0.85, metalness: 0.02 });
  const visorMat = cachedMaterial({
    type: 'physical', color: 0x0b0d12, roughness: 0.08, metalness: 0.25,
    clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.8,
  });

  const cx = 0.04, cz = -0.54;

  // --- Static Ergonomic High-Back Ribbed Leather Executive Swivel Chair ---
  // 5-star brushed-chrome base + dual-wheel casters touching floor
  batch.cyl(chromeMat, 0.042, 0.052, 0.12, 12, cx, 0.11, cz);
  batch.cyl(titanMat, 0.026, 0.026, 0.26, 10, cx, 0.28, cz);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const lx = cx + Math.sin(a) * 0.15;
    const lz = cz + Math.cos(a) * 0.15;
    const legM = new THREE.Matrix4().compose(
      new THREE.Vector3(lx, 0.068, lz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.18, a, 0, 'YXZ')),
      new THREE.Vector3(1, 1, 1)
    );
    batch.add(new THREE.BoxGeometry(0.032, 0.024, 0.29), chromeMat, legM);
    const wx = cx + Math.sin(a) * 0.275;
    const wz = cz + Math.cos(a) * 0.275;
    batch.cyl(chromeMat, 0.010, 0.010, 0.03, 8, wx, 0.042, wz);
    const wheelGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.036, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    batch.add(wheelGeo, titanMat, new THREE.Matrix4().compose(
      new THREE.Vector3(wx, 0.024, wz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0)),
      new THREE.Vector3(1, 1, 1)
    ));
  }
  // Contoured seat base + padded leather seat cushion + bolsters
  batch.box(titanMat, 0.44, 0.04, 0.44, cx, 0.43, cz);
  const seatGeo = new THREE.CapsuleGeometry(0.048, 0.36, 6, 12);
  seatGeo.rotateZ(Math.PI / 2);
  batch.add(seatGeo, leatherMat, new THREE.Matrix4().compose(
    new THREE.Vector3(cx, 0.49, cz + 0.02), new THREE.Quaternion(), new THREE.Vector3(1, 0.85, 2.4)
  ));
  // High contoured ergonomic backrest with 7 horizontal quilted leather ribs
  const backTilt = -0.11;
  const backFrameM = new THREE.Matrix4().compose(
    new THREE.Vector3(cx, 0.91, cz - 0.22),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(backTilt, 0, 0)),
    new THREE.Vector3(1, 1, 1)
  );
  batch.add(new THREE.BoxGeometry(0.44, 0.74, 0.05), titanMat, backFrameM);
  const ribGeo = new THREE.CapsuleGeometry(0.030, 0.34, 6, 12);
  ribGeo.rotateZ(Math.PI / 2);
  for (let r = 0; r < 7; r++) {
    const ryOff = -0.26 + r * 0.088;
    const rm = new THREE.Matrix4().compose(
      new THREE.Vector3(cx, 0.90 + ryOff * Math.cos(backTilt), cz - 0.185 - ryOff * Math.sin(backTilt)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(backTilt, 0, 0)),
      new THREE.Vector3(1, 1, 0.85)
    );
    batch.add(ribGeo, leatherMat, rm);
  }
  // Sculpted chair headrest pad + brushed-chrome loop armrests
  const headRestGeo = new THREE.CapsuleGeometry(0.042, 0.24, 6, 12);
  headRestGeo.rotateZ(Math.PI / 2);
  batch.add(headRestGeo, leatherMat, new THREE.Matrix4().compose(
    new THREE.Vector3(cx, 1.32, cz - 0.21),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, 0, 0)),
    new THREE.Vector3(1, 1.2, 0.85)
  ));
  for (const s of [-1, 1]) {
    batch.box(chromeMat, 0.028, 0.20, 0.032, cx + s * 0.245, 0.56, cz + 0.02);
    batch.box(leatherMat, 0.056, 0.030, 0.26, cx + s * 0.245, 0.67, cz + 0.04);
  }

  // --- Static Officer Seated Lower Body (pelvis, thighs, shins, Oxford shoes under desk) ---
  for (const s of [-1, 1]) {
    const lx = cx + s * 0.105;
    const thighGeo = new THREE.CapsuleGeometry(0.072, 0.26, 6, 12);
    thighGeo.rotateX(Math.PI / 2);
    batch.add(thighGeo, uniformMat, new THREE.Matrix4().makeTranslation(lx, 0.565, cz + 0.14));
    const shinGeo = new THREE.CapsuleGeometry(0.058, 0.34, 6, 12);
    batch.add(shinGeo, uniformMat, new THREE.Matrix4().makeTranslation(lx, 0.31, cz + 0.30));
    const shoeGeo = new THREE.CapsuleGeometry(0.044, 0.13, 6, 10);
    shoeGeo.rotateX(Math.PI / 2);
    batch.add(shoeGeo, shoeMat, new THREE.Matrix4().compose(
      new THREE.Vector3(lx, 0.036, cz + 0.36), new THREE.Quaternion(), new THREE.Vector3(1, 0.72, 1.1)
    ));
  }
  batch.setParent(prev);

  // --- GLB Security Officer Seated Behind Reception Desk ---
  const officerRoot = new THREE.Group();
  officerRoot.name = 'security-officer';
  officerRoot.position.set(gx, floorY, gz);
  officerRoot.rotation.y = ry;

  const seatAnchor = new THREE.Group();
  seatAnchor.position.set(cx, 0, cz);
  officerRoot.add(seatAnchor);
  parentGroup.add(officerRoot);

  let officerModel = null;
  let headTarget = null;
  const offPromise = loadGLB('./assets/models/officer.glb')
    .then((gltf) => {
      const m = gltf.scene.clone(true);
      m.scale.setScalar(1.04); // ~1.78m adult stature in seated desk posture
      prepareModel(m, {
        groundY: null,
        envMapIntensity: 0.45,
        onMesh(obj) {
          const mt = obj.material;
          if (!mt) return;
          if (mt.name === 'OfficerGold') {
            mt.metalness = 0.9;
            mt.roughness = 0.22;
            mt.envMapIntensity = 1.35;
          } else if (mt.name === 'OfficerVisor') {
            mt.roughness = 0.06;
            mt.envMapIntensity = 1.5;
          } else if (mt.name === 'OfficerSkin') {
            mt.roughness = 0.58;
            mt.envMapIntensity = 0.28;
          }
        },
      });
      // Verify Box3 at load time and ground seated hips cleanly onto executive chair seat (y = 0.50)
      const box = new THREE.Box3().setFromObject(m);
      m.position.y += 0.50 - box.min.y;
      seatAnchor.add(m);
      officerModel = m;
      headTarget = m.getObjectByName('LeePerrySmith') || null;
      return m;
    })
    .catch(() => null);
  _interiorPending.push(offPromise);

  // World position of guard desk for proximity glance
  const worldGuardPos = new THREE.Vector3(gx, PODIUM, gz);

  return {
    update(dt, elapsed, playerPos) {
      if (!officerModel) return;
      const breath = Math.sin(elapsed * 1.65);
      seatAnchor.scale.set(1 + breath * 0.004, 1 + breath * 0.006, 1 + breath * 0.009);

      let targetYaw = Math.sin(elapsed * 0.38) * 0.14;
      if (playerPos && Math.abs(playerPos.y - PODIUM) < 1.5) {
        const dx = playerPos.x - worldGuardPos.x;
        const dz = playerPos.z - worldGuardPos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 4.8 && dz > 0.2) {
          const worldAngle = Math.atan2(dx, dz);
          const localRel = Math.max(-0.45, Math.min(0.45, worldAngle - ry));
          const blend = 1 - dist / 4.8;
          targetYaw = THREE.MathUtils.lerp(targetYaw, localRel, blend * 0.68);
        }
      }
      if (headTarget) {
        headTarget.rotation.y += (targetYaw - headTarget.rotation.y) * Math.min(1, dt * 3.0);
      } else {
        seatAnchor.rotation.y += (targetYaw * 0.45 - seatAnchor.rotation.y) * Math.min(1, dt * 2.5);
      }
    },
  };
}

/* ============================================================ GUARD POST (left of entry, rotated sideways facing +X) */
function guardPost(batch, M, colliders, parentGroup) {
  const gx = -4.25, gz = 10.65;
  const floorY = 0.04;
  const ry = Math.PI / 2;
  const m4 = new THREE.Matrix4().compose(
    new THREE.Vector3(gx, floorY, gz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    new THREE.Vector3(1, 1, 1));
  const prev = pushParent(batch, m4);

  const neroMat = mat(M, 'neroMarble', 'graniteDark');
  const slatMat = mat(M, 'walnutSlat', 'walnutDoor');
  const brassMat = mat(M, 'brushedBrass', 'chrome');
  const chromeMat = mat(M, 'chrome', 'brushedSteel');
  const titanMat = mat(M, 'darkTitanium', 'metalDark');
  const frostedMat = mat(M, 'frostedGlass', 'glass');
  const coveLedMat = cachedMaterial({ color: 0xffe4b4, emissive: 0xffc870, emissiveIntensity: 0.95, roughness: 0.3 });
  const haloLedMat = cachedMaterial({ color: 0x70e0ff, emissive: 0x35b8ff, emissiveIntensity: 0.85, roughness: 0.35 });

  // 1. Chamfered/curved two-tier luxury Nero Marquina & walnut-slat reception counter
  // Recessed dark toe-kick plinth + warm under-plinth LED cove glow
  batch.box(titanMat, 2.48, 0.065, 0.72, 0, 0.0325, 0.02);
  batch.box(coveLedMat, 2.42, 0.020, 0.02, 0, 0.045, 0.39);

  // Curved 5-segment lower front apron (walnut slats recessed between Nero Marquina marble piers + brass strips)
  const frontSegs = 5;
  const segW = 2.02 / frontSegs;
  for (let i = 0; i < frontSegs; i++) {
    const sx = -1.01 + (i + 0.5) * segW;
    const curveZ = 0.38 + Math.cos((i - 2) * 0.45) * 0.045;
    const segRy = -(i - 2) * 0.055;
    batch.box(slatMat, segW + 0.01, 0.68, 0.06, sx, 0.46, curveZ, segRy);
    batch.box(brassMat, segW + 0.015, 0.018, 0.072, sx, 0.12, curveZ + 0.006, segRy);
    batch.box(brassMat, segW + 0.015, 0.018, 0.072, sx, 0.80, curveZ + 0.006, segRy);
  }
  // Chamfered Nero Marquina marble end piers & side returns
  for (const sgn of [-1, 1]) {
    batch.box(neroMat, 0.28, 0.86, 0.78, sgn * 1.15, 0.495, 0.01);
    batch.box(brassMat, 0.016, 0.84, 0.02, sgn * 1.015, 0.495, 0.39);
  }
  // Operator inner marble worktop (y = 0.74..0.78) + front marble transaction fascia (y = 0.82..0.92)
  batch.box(neroMat, 2.52, 0.042, 0.72, 0, 0.76, -0.02);
  batch.box(neroMat, 2.56, 0.11, 0.22, 0, 0.885, 0.33);
  // Warm recessed under-counter LED cove strip tucked under overhanging marble cap
  batch.box(coveLedMat, 2.42, 0.018, 0.02, 0, 0.825, 0.435);

  // Frosted tempered-glass upper visitor transaction ledge on brushed-chrome cylindrical standoffs
  // Placed along visitor pass-check right wing so sightline to seated officer stays open!
  const ledgeX = 0.42, ledgeZ = 0.34;
  for (const [sx, sz] of [[-0.58, -0.08], [0.58, -0.08], [-0.58, 0.08], [0.58, 0.08]]) {
    batch.cyl(chromeMat, 0.016, 0.016, 0.095, 10, ledgeX + sx, 0.985, ledgeZ + sz);
  }
  batch.box(frostedMat, 1.34, 0.018, 0.26, ledgeX, 1.04, ledgeZ);

  // 2. Dual thin-bezel widescreen CCTV monitors on articulated chrome monitor arms
  const cctvMat = cachedMaterial({
    map: makeCCTVQuadTex(), emissive: 0xffffff, emissiveMap: makeCCTVQuadTex(),
    emissiveIntensity: 0.78, roughness: 0.35, metalness: 0.05, envMapIntensity: 0.2,
  });
  const monGroupM = new THREE.Matrix4().compose(
    new THREE.Vector3(-0.74, 0.78, 0.04),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 2.05, 0)),
    new THREE.Vector3(1, 1, 1)
  );
  const prevMon = pushParent(batch, monGroupM);
  batch.cyl(chromeMat, 0.022, 0.026, 0.40, 10, 0, 0.20, -0.08);
  batch.cyl(titanMat, 0.06, 0.07, 0.016, 12, 0, 0.008, -0.08);
  for (const s of [-1, 1]) {
    batch.box(chromeMat, 0.22, 0.022, 0.022, s * 0.11, 0.32, -0.05, -s * 0.15);
    const sx = s * 0.235, sy = 0.32, sz = 0.02;
    const sRy = -s * 0.18;
    batch.box(titanMat, 0.44, 0.26, 0.016, sx, sy, sz, sRy);
    batch.box(cctvMat, 0.41, 0.23, 0.006, sx + Math.sin(sRy) * 0.009, sy, sz + Math.cos(sRy) * 0.009, sRy);
  }
  batch.setParent(prevMon);

  // 3. Desk accessories: blotter pad, keyboard & mouse, VoIP phone, RFID scanner, open logbook, pen stand, brass lamp
  batch.box(mat(M, 'leatherBlack'), 0.68, 0.008, 0.34, 0.04, 0.785, -0.10);
  batch.box(titanMat, 0.34, 0.014, 0.12, 0.02, 0.796, -0.08);
  batch.box(titanMat, 0.058, 0.018, 0.095, 0.24, 0.796, -0.12);

  // Open printed visitor logbook + pen stand
  const logMat = cachedMaterial({ map: makeLogbookTex(), roughness: 0.85, metalness: 0 });
  batch.box(cachedMaterial({ color: 0x4b1c20, roughness: 0.6 }), 0.34, 0.016, 0.24, -0.22, 0.789, -0.02, -0.10);
  batch.box(logMat, 0.32, 0.008, 0.22, -0.22, 0.798, -0.02, -0.10);
  batch.cyl(brassMat, 0.028, 0.032, 0.016, 10, -0.02, 0.789, 0.12);
  const penM = new THREE.Matrix4().compose(
    new THREE.Vector3(-0.01, 0.84, 0.12),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.22, 0, -0.18)),
    new THREE.Vector3(1, 1, 1)
  );
  batch.add(new THREE.CylinderGeometry(0.005, 0.004, 0.14, 6), chromeMat, penM);

  // VoIP desk phone
  batch.box(titanMat, 0.19, 0.045, 0.17, 0.56, 0.805, -0.10, -0.25);
  batch.box(cachedMaterial({ color: 0x164a78, emissive: 0x3088cc, emissiveIntensity: 0.7 }), 0.08, 0.01, 0.05, 0.54, 0.832, -0.12, -0.25);
  batch.box(titanMat, 0.045, 0.035, 0.16, 0.62, 0.835, -0.10, -0.25);

  // Contactless RFID visitor-badge scanner/printer
  const rfidMat = cachedMaterial({
    map: makeRFIDScannerTex(), emissive: 0xffffff, emissiveMap: makeRFIDScannerTex(),
    emissiveIntensity: 0.75, roughness: 0.3,
  });
  batch.box(titanMat, 0.18, 0.09, 0.15, 0.82, 0.825, 0.08, -0.20);
  batch.box(rfidMat, 0.13, 0.01, 0.10, 0.82, 0.873, 0.08, -0.20);
  batch.box(cachedMaterial({ color: 0xf4f6fa, roughness: 0.45 }), 0.085, 0.005, 0.055, 0.84, 0.80, 0.18, -0.20);

  // Brushed-brass architectural desk lamp on left wing
  batch.cyl(brassMat, 0.085, 0.095, 0.022, 16, -1.04, 0.792, -0.08);
  batch.cyl(brassMat, 0.012, 0.014, 0.34, 10, -1.04, 0.96, -0.08);
  batch.box(brassMat, 0.18, 0.014, 0.014, -0.96, 1.12, -0.08, 0, 0, -0.22);
  batch.cyl(brassMat, 0.045, 0.075, 0.075, 14, -0.89, 1.08, -0.08);
  batch.cyl(coveLedMat, 0.055, 0.055, 0.012, 12, -0.89, 1.045, -0.08);

  // 4. Framed halo-backlit ICA architectural feature wall directly behind the officer
  const standZ = -0.96;
  batch.box(titanMat, 2.66, 0.08, 0.24, 0, 0.04, standZ);
  batch.box(slatMat, 2.60, 3.12, 0.10, 0, 1.60, standZ);
  for (const sgn of [-1, 1]) {
    batch.box(neroMat, 0.12, 3.14, 0.14, sgn * 1.26, 1.61, standZ);
    batch.box(brassMat, 0.018, 3.12, 0.15, sgn * 1.19, 1.60, standZ);
  }
  // Soft perimeter halo backlight + chamfered brushed-aluminum bezel framing ICA display
  batch.box(haloLedMat, 2.38, 1.28, 0.03, 0, 2.24, standZ + 0.055);
  batch.box(chromeMat, 2.32, 1.22, 0.05, 0, 2.24, standZ + 0.075);
  batch.box(mat(M, 'icaBanner', 'signBlue'), 2.22, 1.12, 0.02, 0, 2.24, standZ + 0.102);

  batch.setParent(prev);

  // Sculpted live-animated Security Officer + Executive Chair
  const guardRig = buildSecurityOfficer(batch, M, parentGroup, gx, floorY, gz, ry);

  colliders.push({
    type: 'rect', x0: gx - 1.08, x1: gx + 0.52, z0: gz - 1.35, z1: gz + 1.35,
    y0: PODIUM, y1: PODIUM + 1.6,
  });

  return guardRig;
}

/* ============================================================ WAITING AREA (right of entry) */
function waitingArea(batch, M) {
  const y = 0.04; // flush on top of ground-floor marble slab
  const wx = 4.4, wz = 8.8;

  // GLB designer lounge seating + armchairs + coffee table
  sofa(batch, M, wx + 0.15, y, wz - 1.20, -Math.PI / 2 - 0.25);
  armchair(batch, wx + 0.45, y, wz + 0.95, -Math.PI / 2 - 0.45);
  armchair(batch, wx - 0.30, y, wz + 1.70, -Math.PI * 0.82);
  coffeeTable(batch, wx - 0.92, y, wz + 0.08, -0.25);

  // GLB botanical planters
  plant(batch, M, wx + 0.8, y, wz - 2.35, 1.42);
  plant(batch, M, -3.85, y, 12.65, 1.32);

  // Brushed-steel lobby waste/recycling bins
  lobbyBin(batch, M, wx + 1.15, y, wz + 2.25);
  lobbyBin(batch, M, -3.85, y, 8.95);
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
  coffeeTable(batch, -w / 4, 0, -d / 4, 0);
  armchair(batch, -w / 4 + 0.9, 0, -d / 4, -Math.PI / 2);
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
  _interiorGroup = group;
  _interiorPending = [];
  const batch = new Batch();

  // Central hall with marble floor, columns, ceiling
  hall(batch, M, colliders);

  // Grand semicircular stairs
  buildGrandStairs(batch, M, colliders);

  // Elevator shaft + cabin (added to `group` so Y aligns with PODIUM!)
  const elevator = buildElevator(batch, M, group, colliders);

  // Guard post (with live-animated sculpted officer) and waiting area in lobby
  const guardRig = guardPost(batch, M, colliders, group);
  waitingArea(batch, M);

  // Glowing green ВЫХОД exit signage suspended cleanly at lobby passages & vestibule doors
  const chromeMat = mat(M, 'chrome', 'brushedSteel');
  const addSuspendedExitSign = (x, y, z, ry) => {
    exitSign(batch, M, x, y, z, ry);
    batch.cyl(chromeMat, 0.008, 0.008, 0.36, 6, x - Math.cos(ry) * 0.22, y + 0.28, z + Math.sin(ry) * 0.22);
    batch.cyl(chromeMat, 0.008, 0.008, 0.36, 6, x + Math.cos(ry) * 0.22, y + 0.28, z - Math.sin(ry) * 0.22);
  };
  for (let lv = 0; lv < 2; lv++) {
    const fy = FLOOR[lv];
    addSuspendedExitSign(-9.4, fy + 2.92, CORR_Z, Math.PI / 2);
    const ne = polar(41 * DEG, 8.65);
    addSuspendedExitSign(ne.x, fy + 2.92, ne.z, -41 * DEG);
  }
  addSuspendedExitSign(0, 3.55, 17.95, 0);

  // Block wing corridors + rooms (all 3 floors)
  blockWing(batch, M, colliders);

  // Diagonal wing corridors + rooms (all 3 floors)
  wingInteriors(batch, M, colliders);

  // Turnstiles (sleek optical speed gates with rotary glass wings)
  const gates = buildTurnstiles(scene, PODIUM, M, colliders);

  batch.build(group, { cast: true, receive: true, name: 'interior' });

  // Balanced warm/cool architectural PointLights paired with emissive fixtures
  const interiorLights = [];
  const addLight = (x, y, z, color = 0xfffaf2, weight = 0.42, dist = 20) => {
    const l = new THREE.PointLight(color, 12 * weight, dist, 1.35);
    l.userData.weight = weight;
    l.userData.dist = dist;
    l.position.set(x, PODIUM + y, z);
    scene.add(l);
    interiorLights.push(l);
  };

  // Entrance lobby: warm reception desk pool, turnstiles/chandelier center, vestibule soffit pool
  addLight(-3.4, 2.75, 10.65, 0xffebd0, 0.36, 12);
  addLight(0, 2.95, 9.6, 0xfff3de, 0.42, 18);
  addLight(0, 3.25, 16.6, 0xffe8c8, 0.36, 12);

  // Rotunda hall across 1st, 2nd, 3rd, 4th floors (staggered around central elevator shaft)
  addLight(0, FLOOR[0] + 2.95, 3.8, 0xfff1dc, 0.40, 18);
  addLight(0, FLOOR[1] + 2.95, -3.8, 0xfff2de, 0.40, 18);
  addLight(0, FLOOR[2] + 2.95, 3.8, 0xfff4e2, 0.38, 18);
  addLight(0, FLOOR[3] + 2.95, -3.8, 0xfff4e2, 0.36, 18);

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

  // Update function for animations (officer idle breathing/scan, rotary 78° turnstile wings, elevator doors)
  let elapsed = 0;
  const maxWingAngle = 78 * DEG;
  group.update = (dt, playerPos) => {
    elapsed += dt;

    // Subtle live chest breathing & calm head scan on the security officer
    if (guardRig) {
      guardRig.update(dt, elapsed, playerPos);
    }

    if (!playerPos) return;
    const localY = playerPos.y - PODIUM;
    const onFirstFloor = Math.abs(playerPos.y - PODIUM) < 1.5;

    // Reset cabinet indicator textures before checking active lanes
    for (const g of gates) {
      for (const im of [g.leftIndMat, g.rightIndMat]) {
        if (im.map !== g.arrowIdleTex) {
          im.map = g.arrowIdleTex;
          im.emissiveMap = g.arrowIdleTex;
          im.needsUpdate = true;
        }
        im.emissiveIntensity = 0.88;
      }
    }

    // Animate 1st-floor rotary optical speed-gate wings (±78° pivot) & pulsing cyan lane indicators
    for (const g of gates) {
      const dx = playerPos.x - g.x;
      const pz = playerPos.z - g.z;
      const dist = Math.hypot(dx, pz);
      const trigger = onFirstFloor && dist < 2.6 && Math.abs(dx) < 0.72;
      if (trigger && g.open < 0.15) {
        g.dir = pz >= 0 ? 1 : -1;
      }
      const targetOpen = trigger ? 1 : 0;
      const rate = trigger ? 7.2 : 4.2;
      g.open += (targetOpen - g.open) * Math.min(1, dt * rate);

      const swing = g.dir * g.open * maxWingAngle;
      g.leftPivot.rotation.y = swing;
      g.rightPivot.rotation.y = -swing;

      if (trigger || g.open > 0.25) {
        const pulse = 1.05 + 0.25 * Math.sin(elapsed * 6.5);
        for (const im of [g.leftIndMat, g.rightIndMat]) {
          if (im.map !== g.arrowActiveTex) {
            im.map = g.arrowActiveTex;
            im.emissiveMap = g.arrowActiveTex;
            im.needsUpdate = true;
          }
          im.emissiveIntensity = pulse;
        }
      }
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
    levels: [PODIUM + FLOOR[0], PODIUM + FLOOR[1], PODIUM + FLOOR[2], PODIUM + FLOOR[3]],
  };
  group.userData.ready = Promise.all(_interiorPending);

  return group;
}
