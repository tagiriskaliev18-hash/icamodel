/* Site: ground, street, terracotta forecourt paving, kerbs, fence, gatehouse,
   parking with realistic car silhouettes, lush multi-tier blue & green spruces,
   deciduous trees behind the building, clipped hedges, rose flower beds,
   wooden benches on cast-iron legs, classic park lamps with white glass globes,
   flagpoles with animated fabric.
   Trees and lamps use instancing; everything static is merged.
   Rewritten to match REAL photos of UMG Uralsk territory. */

import * as THREE from 'three';
import { Batch, DEG, LAYOUT, TEX, mulberry32, polar, fbm, clamp, smoothstep } from './core.js';

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
  // Terracotta-pink brick paved plaza (as in the photos)
  batch.box(M.paver, 62, 0.11, 34, 0, 0.04, 26);
  // Inner walkway with slightly different paver tone
  batch.box(M.brick, 16, 0.12, 26, 0, 0.045, 22);
  // Kerbs — dark granite
  for (const [x, z, w, d] of [[0, 43.5, 62, 0.5], [-31, 26, 0.5, 35], [31, 26, 0.5, 35]]) {
    batch.box(M.graniteDark, w, 0.26, d, x, 0.13, z);
  }
  // Drive and parking area
  batch.box(M.asphalt, 70, 0.08, 26, 42, 0.02, -46);
  batch.box(M.paver, 6, 0.09, 26, 6, 0.025, -46);
  // Parking bay markings
  for (let i = 0; i < 14; i++) {
    batch.box(M.stone, 0.12, 0.02, 5, 14 + i * 2.9, 0.07, -46);
  }
  // Street
  batch.box(M.asphalt, 260, 0.06, 14, 0, 0.0, 62);
  batch.box(M.paver, 260, 0.1, 3.2, 0, 0.04, 53.5);
  // Dashed centre line
  for (let i = -11; i <= 11; i++) batch.box(M.stone, 3.4, 0.02, 0.22, i * 11, 0.04, 62);
}

/* --------------------------------------------------------------- fence */
function fence(batch, M) {
  const pts = [[-58, 46], [-58, -74], [70, -74], [70, 46]];
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
      if (i === 3 && Math.abs(x) < 7) continue;
      batch.box(M.metalDark, 0.09, h, 0.09, x, h / 2, z, ry);
    }
    for (const y of [0.25, h - 0.12]) {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (i === 3) {
        const leftLen = 58 - 7, rightLen = 70 - 7;
        batch.box(M.metalDark, leftLen, 0.07, 0.07, -7 - leftLen / 2, y, cz, 0);
        batch.box(M.metalDark, rightLen, 0.07, 0.07, 7 + rightLen / 2, y, cz, 0);
      } else {
        batch.box(M.metalDark, len, 0.07, 0.07, cx, y, cz, ry);
      }
    }
    // Stone piers
    const piers = Math.round(len / 24);
    for (let k = 0; k <= piers; k++) {
      const t = k / piers;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      batch.box(M.stone, 0.62, 2.4, 0.62, x, 1.2, z);
      batch.box(M.stone, 0.8, 0.18, 0.8, x, 2.42, z);
    }
  }
  // Gate leaves
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
  // Boom barrier
  batch.cyl(M.metalWhite, 0.09, 0.09, 1.1, 8, x - 3.4, 0.55, z - 2.2);
  batch.box(M.metalWhite, 5.4, 0.1, 0.1, x - 6.2, 1.02, z - 2.2, 0, 0, 0.03);
}

/* ---------------------------------------------------------------- trees */
/* Lush multi-tier procedural spruce with layered conical branches,
   color variation and irregular silhouette (NOT plastic cones!) */
function proceduralSpruceGeometry(rnd, isBlue) {
  const parts = [];
  // Trunk
  const trunk = new THREE.CylinderGeometry(0.08, 0.16, 3.6, 6);
  trunk.translate(0, 1.8, 0);
  parts.push({ geo: trunk, isTrunk: true });

  // Multiple branch tiers with varying radius, droop and irregularity
  const tiers = 8 + Math.floor(rnd() * 3);
  for (let t = 0; t < tiers; t++) {
    const frac = t / tiers;
    const baseR = (2.0 - frac * 1.5) * (0.9 + rnd() * 0.2);
    const tierY = 2.4 + t * 0.95;
    const tierH = 1.3 * (1 - frac * 0.25);
    // Each tier has 2-3 sub-cones for lush fullness
    const nSub = 2 + Math.floor(rnd() * 2);
    for (let s = 0; s < nSub; s++) {
      const r = baseR * (0.85 + s * 0.12) * (0.9 + rnd() * 0.2);
      const h = tierH * (0.8 + rnd() * 0.4);
      const seg = 7 + Math.floor(rnd() * 4);
      const cone = new THREE.ConeGeometry(r, h, seg, 1, true);
      // Slight random offset for natural look
      const dx = (rnd() - 0.5) * 0.15;
      const dz = (rnd() - 0.5) * 0.15;
      const dy = tierY + s * 0.2 + h / 2;
      cone.translate(dx, dy, dz);
      parts.push({ geo: cone, isTrunk: false });
    }
  }
  return parts;
}

/* Deciduous tree (simpler sphere-ish canopy) */
function deciduousTreeGeometry(rnd) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.1, 0.2, 4.5, 6);
  trunk.translate(0, 2.25, 0);
  parts.push({ geo: trunk, isTrunk: true });
  // 3-4 sphere clusters for canopy
  const nBlobs = 3 + Math.floor(rnd() * 2);
  for (let b = 0; b < nBlobs; b++) {
    const r = 1.8 + rnd() * 1.2;
    const sphere = new THREE.SphereGeometry(r, 8, 6);
    sphere.translate(
      (rnd() - 0.5) * 1.5,
      5.5 + rnd() * 2.0,
      (rnd() - 0.5) * 1.5
    );
    parts.push({ geo: sphere, isTrunk: false });
  }
  return parts;
}

function mergeTreeParts(parts) {
  const trunkGeos = [], foliageGeos = [];
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    if (!g.attributes.uv) {
      const n = g.attributes.position.count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    (p.isTrunk ? trunkGeos : foliageGeos).push(g);
  }
  return { trunk: mergeSimple(trunkGeos), foliage: mergeSimple(foliageGeos) };
}

function trees(scene, M) {
  const rndSeed = mulberry32(4242);

  /* ---- Generate spruce prototype geometries (blue and green variants) ---- */
  const blueProto = mergeTreeParts(proceduralSpruceGeometry(mulberry32(1001), true));
  const greenProto = mergeTreeParts(proceduralSpruceGeometry(mulberry32(2002), false));
  const deciduousProto = mergeTreeParts(deciduousTreeGeometry(mulberry32(3003)));

  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x6a5544, roughness: 0.95, map: TEX.bark().map, bumpMap: TEX.bark().bump, bumpScale: 0.3,
  });
  const decidTrunkMat = new THREE.MeshStandardMaterial({
    color: 0x5a4836, roughness: 0.95, map: TEX.bark().map, bumpMap: TEX.bark().bump, bumpScale: 0.3,
  });
  const decidFoliageMat = new THREE.MeshStandardMaterial({
    color: 0x558844, roughness: 0.9, map: TEX.needle().map, bumpMap: TEX.needle().bump, bumpScale: 0.3,
  });

  /* ---- Place blue spruces ---- */
  const blueSpots = [];
  const rnd = mulberry32(4242);
  // Avenue along the forecourt edges (as in photos)
  for (let i = 0; i < 7; i++) {
    blueSpots.push({ x: -26 + i * 0.4, z: 36 - i * 0.6, s: 1.1 + rnd() * 0.15 });
    blueSpots.push({ x: 26 - i * 0.4, z: 36 - i * 0.6, s: 1.1 + rnd() * 0.15 });
  }
  // Rows flanking the building
  for (let i = 0; i < 4; i++) {
    blueSpots.push({ x: -34 + i * 4.4, z: 16.5, s: 0.95 + rnd() * 0.2 });
    blueSpots.push({ x: 21 + i * 4.2, z: 18.5, s: 1.0 + rnd() * 0.2 });
  }
  for (let i = 0; i < 6; i++) blueSpots.push({ x: -46 + i * 7, z: 40, s: 1.05 + rnd() * 0.25 });

  /* ---- Place green spruces ---- */
  const greenSpots = [];
  for (let i = 0; i < 8; i++) greenSpots.push({ x: -48 + i * 9, z: -60 + rnd() * 4, s: 1.15 + rnd() * 0.3 });
  for (let i = 0; i < 6; i++) greenSpots.push({ x: 58, z: -30 + i * 11, s: 1.0 + rnd() * 0.3 });

  /* ---- Place deciduous trees behind building ---- */
  const decidSpots = [];
  for (let i = 0; i < 8; i++) {
    decidSpots.push({ x: -40 + rnd() * 80, z: -72 + rnd() * 10, s: 0.9 + rnd() * 0.4 });
  }
  for (let i = 0; i < 5; i++) {
    decidSpots.push({ x: -55 + rnd() * 10, z: -20 + rnd() * 50, s: 1.0 + rnd() * 0.3 });
    decidSpots.push({ x: 55 + rnd() * 10, z: -20 + rnd() * 50, s: 1.0 + rnd() * 0.3 });
  }

  // Filter out trees colliding with buildings
  const filter = (sp) => Math.hypot(sp.x, sp.z) > 22.0;
  const filteredBlue = blueSpots.filter(filter);
  const filteredGreen = greenSpots.filter(filter);
  const filteredDecid = decidSpots.filter(filter);

  // Create instanced meshes for each tree type
  function placeInstances(spots, trunkGeo, foliageGeo, tMat, fMat) {
    if (!spots.length) return;
    const trunks = new THREE.InstancedMesh(trunkGeo, tMat, spots.length);
    const foliage = new THREE.InstancedMesh(foliageGeo, fMat, spots.length);
    trunks.castShadow = true; trunks.receiveShadow = true;
    foliage.castShadow = true; foliage.receiveShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    spots.forEach((sp, i) => {
      const sc = sp.s * (0.9 + rnd() * 0.2);
      q.setFromEuler(new THREE.Euler(0, rnd() * Math.PI * 2, 0));
      m.compose(new THREE.Vector3(sp.x, 0, sp.z), q, new THREE.Vector3(sc, sc * (0.95 + rnd() * 0.1), sc));
      trunks.setMatrixAt(i, m);
      foliage.setMatrixAt(i, m);
    });
    trunks.instanceMatrix.needsUpdate = true;
    foliage.instanceMatrix.needsUpdate = true;
    scene.add(trunks, foliage);
  }

  placeInstances(filteredBlue, blueProto.trunk, blueProto.foliage, trunkMat, M.spruceBlue);
  placeInstances(filteredGreen, greenProto.trunk, greenProto.foliage, trunkMat, M.spruceGreen);
  placeInstances(filteredDecid, deciduousProto.trunk, deciduousProto.foliage, decidTrunkMat, decidFoliageMat);

  /* ---- Clipped hedges ---- */
  const hedgeBatch = new Batch();
  // Hedges along the front walkway edges
  for (const [hx, hz, hw, hd] of [
    [-18, 32, 12, 1.0], [18, 32, 12, 1.0],
    [-22, 25, 8, 0.8], [22, 25, 8, 0.8],
    [-10, 44, 16, 0.9], [10, 44, 16, 0.9],
  ]) {
    hedgeBatch.box(M.hedge, hw, 0.85, hd, hx, 0.5, hz);
    // Trimmed top (slightly rounded — approximate with slightly smaller box)
    hedgeBatch.box(M.hedge, hw - 0.1, 0.1, hd - 0.1, hx, 0.95, hz);
  }

  /* ---- Flower beds with bright red roses ---- */
  const bedMat = new THREE.MeshStandardMaterial({ color: 0x8a6b58, roughness: 1 });
  const beds = [
    { x: -16, z: 40.5, w: 8, d: 3 }, { x: -5, z: 40.5, w: 8, d: 3 },
    { x: 6, z: 40.5, w: 8, d: 3 }, { x: 17, z: 40.5, w: 8, d: 3 },
  ];
  for (const b of beds) {
    hedgeBatch.box(bedMat, b.w, 0.34, b.d, b.x, 0.17, b.z);
    hedgeBatch.box(M.hedge, b.w - 0.6, 0.3, b.d - 0.6, b.x, 0.46, b.z);
    // Rose clusters (bright red)
    const nRoses = 8;
    const rr = mulberry32(b.x * 100 + b.z);
    for (let r = 0; r < nRoses; r++) {
      const rx = b.x + (rr() - 0.5) * (b.w - 1.4);
      const rz = b.z + (rr() - 0.5) * (b.d - 1.4);
      hedgeBatch.cyl(M.roseRed, 0.12 + rr() * 0.08, 0.08, 0.14, 7, rx, 0.72, rz);
    }
  }

  /* ---- Wooden benches on cast-iron legs ---- */
  const benchWoodMat = new THREE.MeshStandardMaterial({
    color: 0x8a6a44, roughness: 0.7, map: TEX.wood().map, bumpMap: TEX.wood().bump, bumpScale: 0.2,
  });
  const castIronMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.75, metalness: 0.6 });
  const benchPositions = [
    [-20, 38, 0], [-8, 38, 0], [4, 38, 0], [16, 38, 0],
    [-26, 28, Math.PI / 2], [26, 28, -Math.PI / 2],
  ];
  for (const [bx, bz, bry] of benchPositions) {
    // Seat (wooden slats)
    hedgeBatch.box(benchWoodMat, 1.6, 0.06, 0.5, bx, 0.46, bz, bry);
    hedgeBatch.box(benchWoodMat, 1.6, 0.06, 0.5, bx, 0.46, bz + 0.12, bry);
    // Backrest
    hedgeBatch.box(benchWoodMat, 1.6, 0.06, 0.4, bx, 0.78, bz - 0.26, bry, 0.15);
    // Cast-iron legs
    for (const lx of [-0.6, 0.6]) {
      const rlx = bx + lx * Math.cos(bry), rlz = bz + lx * Math.sin(bry);
      hedgeBatch.box(castIronMat, 0.06, 0.44, 0.52, rlx, 0.22, rlz, bry);
      // Decorative scroll (simplified)
      hedgeBatch.box(castIronMat, 0.06, 0.08, 0.12, rlx, 0.04, rlz, bry);
    }
  }

  hedgeBatch.build(scene, { cast: true, receive: true, name: 'landscaping' });
}

function mergeSimple(geoms) {
  if (!geoms.length) return new THREE.BufferGeometry();
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
/* Classic park lamps with white glass globe (as in ext_c.jpg photos!) */
function lamps(scene, M, nightLights) {
  const pts = [];
  for (let i = 0; i < 5; i++) { pts.push([-24 + i * 12, 44]); pts.push([-24 + i * 12, 34]); }
  pts.push([-34, 12], [34, 12], [-40, -20], [40, -20], [-40, -50], [40, -50]);

  const globeMat = new THREE.MeshStandardMaterial({
    color: 0xfff8ee, emissive: 0xfff0d0, emissiveIntensity: 0.8,
    roughness: 0.3, transparent: true, opacity: 0.85,
  });

  const batch = new Batch();
  for (const [x, z] of pts) {
    // Lamp post (dark metal, tapered)
    batch.cyl(M.metalDark, 0.055, 0.1, 4.0, 8, x, 2.0, z);
    // Base pedestal
    batch.cyl(M.metalDark, 0.22, 0.28, 0.3, 10, x, 0.15, z);
    batch.box(M.metalDark, 0.4, 0.08, 0.4, x, 0.04, z);
    // Decorative cap under globe
    batch.cyl(M.metalDark, 0.14, 0.18, 0.12, 8, x, 4.06, z);
    // White glass globe
    const sphere = new THREE.SphereGeometry(0.22, 12, 8);
    batch.add(sphere, globeMat, new THREE.Matrix4().makeTranslation(x, 4.28, z));
    // Top finial
    batch.cyl(M.metalDark, 0.03, 0.06, 0.1, 6, x, 4.55, z);
  }
  batch.build(scene, { cast: true, receive: false, name: 'lamps' });

  // A few real point lights for illumination
  for (let i = 0; i < 4; i++) {
    const [x, z] = pts[i * 3] || pts[0];
    const l = new THREE.PointLight(0xffd9a0, 0, 18, 2);
    l.position.set(x, 4.2, z);
    scene.add(l);
    nightLights.push(l);
  }
}

/* ----------------------------------------------------------------- cars */
function parking(scene, M) {
  const colors = [0x2b2f36, 0x8f9296, 0xb5b9bd, 0x1e2a38, 0x6b1f22, 0xe8e8e6, 0x1a4060, 0x4a4a4a];
  const rnd = mulberry32(9);
  const group = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const x = 14.5 + i * 2.9 + 1.45, z = -46 + (rnd() - 0.5) * 0.5;
    const sub = new Batch();
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.02 + rnd() * 0.03, 0)), new THREE.Vector3(1, 1, 1));
    sub.setParent(m);
    const col = colors[Math.floor(rnd() * colors.length)];
    const body = new THREE.MeshStandardMaterial({ color: col, metalness: 0.65, roughness: 0.28, envMapIntensity: 1.3 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x1a2028, metalness: 0.6, roughness: 0.08, envMapIntensity: 1.3 });
    // Modern sedan silhouette (more detailed)
    sub.box(body, 1.85, 0.52, 4.5, 0, 0.56, 0);       // Lower body
    sub.box(body, 1.82, 0.14, 4.3, 0, 0.88, 0);       // Belt line
    sub.box(body, 1.72, 0.48, 2.5, 0, 1.12, -0.2);    // Cabin
    sub.box(glass, 1.66, 0.42, 2.25, 0, 1.14, -0.2);  // Windows
    sub.box(M.metalDark, 1.9, 0.18, 4.6, 0, 0.36, 0); // Underbody
    // Wheels
    for (const [wx, wz] of [[-0.86, 1.4], [0.86, 1.4], [-0.86, -1.4], [0.86, -1.4]]) {
      sub.cyl(M.metalDark, 0.32, 0.32, 0.22, 12, wx, 0.32, wz);
      // Chrome rims
      sub.cyl(M.chrome, 0.2, 0.2, 0.06, 8, wx, 0.32, wz);
    }
    // Headlights / taillights
    for (const [dx, dz] of [[-0.72, 2.24], [0.72, 2.24]]) sub.box(M.lampGlow, 0.36, 0.1, 0.06, dx, 0.72, dz);
    for (const [dx, dz] of [[-0.72, -2.24], [0.72, -2.24]]) {
      const tailMat = new THREE.MeshStandardMaterial({ color: 0xcc2020, emissive: 0x880000, emissiveIntensity: 0.3, roughness: 0.5 });
      sub.box(tailMat, 0.3, 0.08, 0.04, dx, 0.72, dz);
    }
    sub.build(group, { cast: true, receive: true, name: 'car' });
  }
  scene.add(group);
  return group;
}

/* --------------------------------------------------------------- flags */
function flags(scene, M) {
  const group = new THREE.Group();

  // 3 different flag textures: RK, QazaqGaz, ICA
  function makeFlagTex(drawFn) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 320;
    const x = c.getContext('2d');
    drawFn(x, c.width, c.height);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  const rkTex = makeFlagTex((x, w, h) => {
    // Kazakhstan flag (turquoise with sun and eagle)
    x.fillStyle = '#00afca'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#f4c430';
    x.beginPath(); x.arc(256, 120, 52, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#00afca';
    x.beginPath(); x.arc(278, 104, 46, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#f4c430';
    x.fillRect(0, 268, w, 10);
    for (let i = 0; i < 16; i++) {
      x.beginPath(); x.arc(20 + i * 31, 292, 9, 0, Math.PI * 2); x.fill();
    }
  });

  const qgTex = makeFlagTex((x, w, h) => {
    // QazaqGaz corporate flag
    x.fillStyle = '#004a8a'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold 56px Arial'; x.fillText('QazaqGaz', w / 2, h / 2 - 20);
    x.font = '28px Arial'; x.fillText('ҚазМұнайГаз', w / 2, h / 2 + 30);
  });

  const icaTex = makeFlagTex((x, w, h) => {
    // ICA corporate flag
    x.fillStyle = '#0066aa'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold 72px Arial'; x.fillText('ICA', w / 2, h / 2 - 10);
    x.font = '24px Arial'; x.fillText('Интергаз Центральная Азия', w / 2, h / 2 + 40);
  });

  const textures = [rkTex, qgTex, icaTex];
  const poleMat = M.metalWhite;

  for (let i = 0; i < 3; i++) {
    const px = -26 + i * 5.4, pz = 33.5;
    const flagMat = new THREE.MeshStandardMaterial({ map: textures[i], side: THREE.DoubleSide, roughness: 0.85 });

    // Pole
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 10, 10), poleMat);
    pole.position.set(px, 5, pz);
    pole.castShadow = true;
    group.add(pole);
    // Pole base
    const poleBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.4, 10), M.stone);
    poleBase.position.set(px, 0.2, pz);
    group.add(poleBase);
    // Pole finial (ball top)
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), M.chrome);
    finial.position.set(px, 10.08, pz);
    group.add(finial);

    // Flag cloth with gentle curl
    const geo = new THREE.PlaneGeometry(2.6, 1.65, 16, 8);
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

  // Low neighbourhood buildings
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
