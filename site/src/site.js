/* Site: ground, street, forecourt paving pattern, kerbs, fence, gatehouse,
   parking with cars, blue spruces, hedges, flower beds, lamps and flags.
   Trees and lamps use instancing; everything static is merged. */

import * as THREE from 'three';
import { Batch, DEG, LAYOUT, TEX, mulberry32, polar, fbm } from './core.js';

const S = LAYOUT.site;

/* ---------------------------------------------------------------- ground */
function ground(scene, M) {
  const g = new THREE.PlaneGeometry(S.x1 - S.x0, S.z1 - S.z0, 96, 96);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + (S.x0 + S.x1) / 2;
    const z = pos.getZ(i) + (S.z0 + S.z1) / 2;
    const d = Math.hypot(x, z - 10);
    // keep the building pad flat, roll the ground away from it
    const roll = Math.max(0, d - 70) * 0.012 + (fbm(x * 0.02 + 5, z * 0.02, 3) - 0.5) * Math.max(0, d - 60) * 0.09;
    pos.setY(i, roll - 0.06);
  }
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, M.grass);
  mesh.receiveShadow = true;
  mesh.position.set((S.x0 + S.x1) / 2, 0, (S.z0 + S.z1) / 2);
  scene.add(mesh);
  return mesh;
}

/* ------------------------------------------------------------ forecourt */
function forecourt(batch, M) {
  // main paved apron in front of the stair
  batch.box(M.paving, 62, 0.1, 34, 0, 0.03, 26);
  // the pink brick inlay strip along the approach
  batch.box(M.brick, 16, 0.11, 26, 0, 0.04, 22);
  batch.box(M.paving, 12, 0.12, 26, 0, 0.045, 22);
  // kerbs
  for (const [x, z, w, d] of [[0, 43.5, 62, 0.5], [-31, 26, 0.5, 35], [31, 26, 0.5, 35]]) {
    batch.box(M.graniteDark, w, 0.26, d, x, 0.13, z);
  }
  // drive and parking to the north-east
  batch.box(M.asphalt, 70, 0.08, 26, 42, 0.02, -46);
  batch.box(M.paving, 6, 0.09, 26, 6, 0.025, -46);
  // parking bay markings
  for (let i = 0; i < 14; i++) {
    batch.box(M.stone, 0.12, 0.02, 5, 14 + i * 2.9, 0.07, -46);
  }
  // street along the south edge
  batch.box(M.asphalt, 260, 0.06, 14, 0, 0.0, 62);
  batch.box(M.paving, 260, 0.1, 3.2, 0, 0.04, 53.5);
  // dashed centre line
  for (let i = -11; i <= 11; i++) batch.box(M.stone, 3.4, 0.02, 0.22, i * 11, 0.04, 62);
}

/* --------------------------------------------------------------- fence */
function fence(batch, M) {
  const pts = [
    [-58, 46], [-58, -74], [70, -74], [70, 46],
  ];
  const h = 1.9;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.round(len / 3.2);
    const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
    const ry = Math.atan2(ux, uz);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      // leave the gate opening on the south side
      if (i === 3 && Math.abs(x) < 7) continue;
      batch.box(M.metalDark, 0.09, h, 0.09, x, h / 2, z, ry);
    }
    for (const y of [0.25, h - 0.12]) {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (i === 3) {
        // split the rail around the gate (x = -7..7, south fence runs x: 70 -> -58)
        const leftLen = 58 - 7;
        const rightLen = 70 - 7;
        batch.box(M.metalDark, leftLen, 0.07, 0.07, -7 - leftLen / 2, y, cz, 0);
        batch.box(M.metalDark, rightLen, 0.07, 0.07, 7 + rightLen / 2, y, cz, 0);
      } else {
        batch.box(M.metalDark, len, 0.07, 0.07, cx, y, cz, ry);
      }
    }
    // stone piers
    const piers = Math.round(len / 24);
    for (let k = 0; k <= piers; k++) {
      const t = k / piers;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      batch.box(M.stone, 0.62, 2.4, 0.62, x, 1.2, z);
      batch.box(M.stone, 0.8, 0.18, 0.8, x, 2.42, z);
    }
  }
  // gate leaves, open inward
  for (const sgn of [-1, 1]) {
    batch.box(M.metalDark, 6.6, 1.7, 0.08, sgn * 10.4, 0.9, 46, sgn * 0.35);
  }
}

function gatehouse(batch, M) {
  const x = 12.5, z = 43.5;
  batch.box(M.plasterWarm, 4.6, 3.0, 3.4, x, 1.5, z);
  batch.box(M.stone, 5.0, 0.3, 3.8, x, 3.1, z);
  batch.box(M.roof, 5.2, 0.18, 4.0, x, 3.32, z);
  batch.box(M.glassTint, 3.2, 1.4, 0.1, x, 1.85, z - 1.72);
  batch.box(M.glassTint, 0.1, 1.4, 2.2, x + 2.32, 1.85, z);
  batch.box(M.graniteDark, 5.2, 0.16, 1.2, x, 0.08, z + 2.2);
  // boom barrier
  batch.cyl(M.metalWhite, 0.09, 0.09, 1.1, 8, x - 3.4, 0.55, z - 2.2);
  batch.box(M.metalWhite, 5.4, 0.1, 0.1, x - 6.2, 1.02, z - 2.2, 0, 0, 0.03);
}

/* ---------------------------------------------------------------- trees */
function spruceGeometry() {
  // layered cone tree, merged into a single geometry per LOD group
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.09, 0.16, 3.2, 6);
  trunk.translate(0, 1.6, 0);
  parts.push(trunk);
  const layers = 7;
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    const r = 1.75 * (1 - t * 0.82);
    const h = 1.9 * (1 - t * 0.35);
    const c = new THREE.ConeGeometry(r, h, 9, 1, true);
    c.translate(0, 2.1 + i * 1.05 + h / 2, 0);
    parts.push(c);
  }
  return parts;
}

function trees(scene, M) {
  const geoms = spruceGeometry();
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x6a5544, roughness: 0.95, map: TEX.bark().map, bumpMap: TEX.bark().bump, bumpScale: 0.3,
  });
  const needleMat = new THREE.MeshStandardMaterial({
    color: 0x3f6d5c, roughness: 0.92, map: TEX.needle().map, bumpMap: TEX.needle().bump, bumpScale: 0.5,
  });

  const spots = [];
  const rnd = mulberry32(4242);
  // avenue along the forecourt edges
  for (let i = 0; i < 7; i++) {
    spots.push({ x: -26 + i * 0.4, z: 36 - i * 0.6, s: 1.05 });
    spots.push({ x: 26 - i * 0.4, z: 36 - i * 0.6, s: 1.05 });
  }
  // rows flanking the building (kept outside the curved entrance gallery)
  for (let i = 0; i < 4; i++) {
    spots.push({ x: -34 + i * 4.4, z: 16.5, s: 0.9 + rnd() * 0.25 });
    spots.push({ x: 21 + i * 4.2, z: 18.5, s: 0.95 + rnd() * 0.2 });
  }
  for (let i = 0; i < 6; i++) spots.push({ x: -46 + i * 7, z: 40, s: 1.0 + rnd() * 0.3 });
  for (let i = 0; i < 8; i++) spots.push({ x: -48 + i * 9, z: -60 + rnd() * 4, s: 1.1 + rnd() * 0.4 });
  for (let i = 0; i < 6; i++) spots.push({ x: 58, z: -30 + i * 11, s: 1.0 + rnd() * 0.35 });

  // filter out any tree colliding with the rotunda/gallery/stair footprint
  const filteredSpots = spots.filter((sp) => Math.hypot(sp.x, sp.z) > 21.8);
  spots.length = 0;
  spots.push(...filteredSpots);

  // trunks
  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.18, 3.2, 6);
  trunkGeo.translate(0, 1.6, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  trunks.castShadow = true; trunks.receiveShadow = true;

  const needleParts = geoms.slice(1);
  const counts = needleParts.length;
  const foliage = new THREE.InstancedMesh(mergeSimple(needleParts), needleMat, spots.length);
  foliage.castShadow = true; foliage.receiveShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  spots.forEach((sp, i) => {
    const sc = sp.s * (0.9 + rnd() * 0.2);
    q.setFromEuler(new THREE.Euler(0, rnd() * Math.PI * 2, 0));
    m.compose(new THREE.Vector3(sp.x, 0, sp.z), q, new THREE.Vector3(sc, sc * (0.95 + rnd() * 0.15), sc));
    trunks.setMatrixAt(i, m);
    foliage.setMatrixAt(i, m);
  });
  trunks.instanceMatrix.needsUpdate = true;
  foliage.instanceMatrix.needsUpdate = true;
  scene.add(trunks, foliage);

  // flower beds and clipped hedges
  const beds = [];
  for (let i = 0; i < 4; i++) {
    beds.push({ x: -16 + i * 11, z: 40.5, w: 8, d: 3 });
  }
  const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x4b6b45, roughness: 0.95, map: TEX.needle().map });
  const bedMat = new THREE.MeshStandardMaterial({ color: 0x8a6b58, roughness: 1 });
  const flowerMat = new THREE.MeshStandardMaterial({ color: 0xb8475e, roughness: 0.9 });
  const batch = new Batch();
  for (const b of beds) {
    batch.box(bedMat, b.w, 0.34, b.d, b.x, 0.17, b.z);
    batch.box(hedgeMat, b.w - 1.0, 0.5, b.d - 1.1, b.x, 0.55, b.z);
    batch.box(flowerMat, b.w - 1.6, 0.16, b.d - 1.7, b.x, 0.84, b.z);
  }
  batch.build(scene, { cast: true, receive: true, name: 'beds' });
  return { trunks, foliage };
}

function mergeSimple(geoms) {
  const nonIdx = geoms.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of nonIdx) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let o = 0;
  for (const gg of nonIdx) {
    pos.set(gg.attributes.position.array, o * 3);
    nor.set(gg.attributes.normal.array, o * 3);
    if (gg.attributes.uv) uv.set(gg.attributes.uv.array, o * 2);
    o += gg.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

/* ---------------------------------------------------------------- lamps */
function lamps(scene, M, nightLights) {
  const pts = [];
  for (let i = 0; i < 5; i++) { pts.push([-24 + i * 12, 44]); pts.push([-24 + i * 12, 34]); }
  pts.push([-34, 12], [34, 12], [-40, -20], [40, -20], [-40, -50], [40, -50]);

  const batch = new Batch();
  for (const [x, z] of pts) {
    batch.cyl(M.metalDark, 0.07, 0.1, 4.4, 8, x, 2.2, z);
    batch.cyl(M.metalDark, 0.2, 0.26, 0.24, 10, x, 0.12, z);
    batch.box(M.metalDark, 0.5, 0.1, 0.5, x, 4.45, z);
    batch.box(M.lampGlow, 0.42, 0.16, 0.42, x, 4.35, z);
  }
  batch.build(scene, { cast: true, receive: false, name: 'lamps' });

  // a handful of real lights only, so the shader cost stays sane
  for (let i = 0; i < 4; i++) {
    const [x, z] = pts[i * 3] || pts[0];
    const l = new THREE.PointLight(0xffd9a0, 0, 18, 2);
    l.position.set(x, 4.2, z);
    scene.add(l);
    nightLights.push(l);
  }
}

/* ----------------------------------------------------------------- cars */
function car(x, z, ry, color, batch, M) {
  const body = new THREE.MeshStandardMaterial({ color, metalness: 0.65, roughness: 0.32, envMapIntensity: 1.2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1c242c, metalness: 0.5, roughness: 0.1 });
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));
  const b = new Batch();
  b.setParent(m);
  b.box(body, 1.85, 0.62, 4.4, 0, 0.62, 0);
  b.box(body, 1.78, 0.5, 2.3, 0, 1.12, -0.1);
  b.box(glass, 1.72, 0.44, 2.05, 0, 1.16, -0.1);
  b.box(M.metalDark, 1.9, 0.2, 4.5, 0, 0.38, 0);
  for (const [wx, wz] of [[-0.86, 1.4], [0.86, 1.4], [-0.86, -1.4], [0.86, -1.4]]) {
    b.cyl(M.metalDark, 0.32, 0.32, 0.22, 12, wx, 0.32, wz);
  }
  b.build(batch.group || (batch.group = new THREE.Group()), { cast: true, receive: true });
  // merge into the shared batch by re-adding
  return b;
}

function parking(scene, M) {
  const colors = [0x2b2f36, 0x8f9296, 0xb5b9bd, 0x1e2a38, 0x6b1f22, 0xe8e8e6];
  const rnd = mulberry32(9);
  const group = new THREE.Group();
  const batch = new Batch();
  for (let i = 0; i < 9; i++) {
    const x = 14.5 + i * 2.9 + 1.45, z = -46 + (rnd() - 0.5) * 0.5;
    const sub = new Batch();
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.02 + rnd() * 0.03, 0)), new THREE.Vector3(1, 1, 1));
    sub.setParent(m);
    const col = colors[Math.floor(rnd() * colors.length)];
    const body = new THREE.MeshStandardMaterial({ color: col, metalness: 0.6, roughness: 0.3, envMapIntensity: 1.1 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x1a2028, metalness: 0.6, roughness: 0.08, envMapIntensity: 1.2 });
    sub.box(body, 1.85, 0.66, 4.4, 0, 0.64, 0);
    sub.box(body, 1.76, 0.52, 2.35, 0, 1.18, -0.15);
    sub.box(glass, 1.7, 0.44, 2.1, 0, 1.2, -0.15);
    sub.box(M.metalDark, 1.9, 0.2, 4.5, 0, 0.4, 0);
    for (const [wx, wz] of [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]]) {
      sub.cyl(M.metalDark, 0.31, 0.31, 0.2, 10, wx, 0.33, wz);
    }
    for (const [dx, dz] of [[-0.72, 2.21], [0.72, 2.21]]) sub.box(M.lampGlow, 0.4, 0.14, 0.08, dx, 0.78, dz);
    sub.build(group, { cast: true, receive: true, name: 'car' });
  }
  scene.add(group);
  return group;
}

/* --------------------------------------------------------------- flags */
function flags(scene, M) {
  const group = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 512; c.height = 320;
  const x = c.getContext('2d');
  // Kazakhstan flag
  x.fillStyle = '#00afca'; x.fillRect(0, 0, 512, 320);
  x.fillStyle = '#f4c430';
  x.beginPath(); x.arc(256, 120, 52, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#00afca';
  x.beginPath(); x.arc(278, 104, 46, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#f4c430';
  x.fillRect(0, 268, 512, 10);
  // ornament strip
  for (let i = 0; i < 16; i++) {
    x.beginPath(); x.arc(20 + i * 31, 292, 9, 0, Math.PI * 2); x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  const flagMat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85 });
  const poleMat = M.metalWhite;
  for (let i = 0; i < 3; i++) {
    const px = -26 + i * 5.4, pz = 33.5;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 10, 10), poleMat);
    pole.position.set(px, 5, pz);
    pole.castShadow = true;
    group.add(pole);
    const geo = new THREE.PlaneGeometry(2.6, 1.65, 16, 8);
    // give the cloth a gentle curl
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const u = (p.getX(k) + 1.3) / 2.6;
      p.setZ(k, Math.sin(u * Math.PI * 2.2) * 0.16 * u);
    }
    geo.computeVertexNormals();
    const flag = new THREE.Mesh(geo, flagMat);
    flag.position.set(px + 1.32, 8.9, pz);
    flag.castShadow = true;
    flag.userData.wave = i * 1.7;
    group.add(flag);
  }
  scene.add(group);
  return group;
}

/* --------------------------------------------------------------- assemble */
export function buildSite(scene, M, nightLights) {
  ground(scene, M);
  const batch = new Batch();
  forecourt(batch, M);
  fence(batch, M);
  gatehouse(batch, M);
  batch.build(scene, { cast: true, receive: true, name: 'site' });

  trees(scene, M);
  lamps(scene, M, nightLights);
  parking(scene, M);
  const flagGroup = flags(scene, M);

  // low neighbourhood buildings seated cleanly on the outer terrain
  const bg = new Batch();
  const bgMat = new THREE.MeshStandardMaterial({ color: 0x4b535e, roughness: 0.96, metalness: 0 });
  const rnd = mulberry32(313);
  for (let i = 0; i < 18; i++) {
    const a = rnd() * Math.PI * 2, r = 92 + rnd() * 20;
    const x = Math.sin(a) * r, z = -Math.cos(a) * r;
    const w = 10 + rnd() * 14, d = 10 + rnd() * 12, h = 5 + rnd() * 9;
    bg.box(bgMat, w, h, d, x, h / 2 - 0.5, z, rnd() * Math.PI);
  }
  bg.build(scene, { cast: false, receive: true, name: 'skyline' });

  return { flagGroup };
}
