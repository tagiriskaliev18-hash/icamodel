/* Site: ground, street, terracotta forecourt paving, kerbs, fence, gatehouse,
   parking with realistic car silhouettes, lush multi-tier blue & green spruces,
   deciduous trees behind the building, clipped hedges, rose flower beds,
   wooden benches on cast-iron legs, classic park lamps with white glass globes,
   flagpoles with animated fabric.
   Trees and lamps use instancing; everything static is merged.
   Rewritten to match REAL photos of UMG Uralsk territory. */

import * as THREE from 'three';
import { Batch, DEG, LAYOUT, TEX, mulberry32, fbm, cachedMaterial, loadGLB, prepareModel } from './core.js';

const S = LAYOUT.site;

function groundY(x, z) {
  const d = Math.hypot(x, z - 10);
  const roll = Math.max(0, d - 70) * 0.012 + (fbm(x * 0.02 + 5, z * 0.02, 3) - 0.5) * Math.max(0, d - 60) * 0.09;
  return roll - 0.06;
}

/* ---------------------------------------------------------------- ground */
function ground(scene, M) {
  const g = new THREE.PlaneGeometry(S.x1 - S.x0, S.z1 - S.z0, 96, 96);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + (S.x0 + S.x1) / 2;
    const z = pos.getZ(i) + (S.z0 + S.z1) / 2;
    pos.setY(i, groundY(x, z));
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
function placeGLBTreeInstances(scene, gltf, spots, rnd, { targetHeight = 9.2, foliageTint = null } = {}) {
  if (!spots.length || !gltf || !gltf.scene) return;

  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const fullBox = new THREE.Box3().setFromObject(root);
  const fullSize = new THREE.Vector3();
  fullBox.getSize(fullSize);
  const normScale = fullSize.y > 1e-4 ? targetHeight / fullSize.y : 1;
  const minY = fullBox.min.y;

  const parts = [];
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    const geom = obj.geometry.clone();
    geom.applyMatrix4(obj.matrixWorld);
    const srcMat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    const mat = srcMat ? srcMat.clone() : new THREE.MeshStandardMaterial({ color: 0x3f6d5c });
    const isFoliage = (mat.name && /foliage|leaf|needle/i.test(mat.name)) || mat.transparent || !!mat.alphaMap;
    if (isFoliage) {
      mat.transparent = false;
      mat.alphaTest = 0.45;
      mat.side = THREE.DoubleSide;
      mat.roughness = Math.max(mat.roughness ?? 0.88, 0.88);
      mat.metalness = 0.0;
      mat.envMapIntensity = 0.34;
      if (foliageTint) mat.color.multiply(new THREE.Color(foliageTint));
    } else {
      mat.roughness = Math.max(mat.roughness ?? 0.92, 0.92);
      mat.metalness = 0.0;
      mat.envMapIntensity = 0.28;
    }
    mat.needsUpdate = true;
    parts.push({ geom, mat });
  });

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  for (const { geom, mat } of parts) {
    const inst = new THREE.InstancedMesh(geom, mat, spots.length);
    inst.castShadow = true;
    inst.receiveShadow = true;
    for (let i = 0; i < spots.length; i++) {
      const sp = spots[i];
      const scXZ = normScale * sp.s * (0.92 + rnd() * 0.16);
      const scY = scXZ * (0.94 + rnd() * 0.12);
      euler.set(0, sp.rot ?? (rnd() * Math.PI * 2), 0);
      q.setFromEuler(euler);
      const gy = sp.x > -34 && sp.x < 34 && sp.z > 8 && sp.z < 45 ? 0 : groundY(sp.x, sp.z);
      pos.set(sp.x, gy - minY * scY - 0.05, sp.z);
      scl.set(scXZ, scY, scXZ);
      m.compose(pos, q, scl);
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
  }
}

function trees(scene, M) {
  const rnd = mulberry32(4242);

  /* ---- Place blue spruces ---- */
  const blueSpots = [];
  // Avenue along the forecourt edges (as in photos)
  for (let i = 0; i < 7; i++) {
    blueSpots.push({ x: -26 + i * 0.4, z: 36 - i * 0.6, s: 0.92 + rnd() * 0.14, rot: rnd() * Math.PI * 2 });
    blueSpots.push({ x: 26 - i * 0.4, z: 36 - i * 0.6, s: 0.92 + rnd() * 0.14, rot: rnd() * Math.PI * 2 });
  }
  // Rows flanking the building
  for (let i = 0; i < 4; i++) {
    blueSpots.push({ x: -34 + i * 4.4, z: 16.5, s: 0.85 + rnd() * 0.16, rot: rnd() * Math.PI * 2 });
    blueSpots.push({ x: 21 + i * 4.2, z: 18.5, s: 0.88 + rnd() * 0.16, rot: rnd() * Math.PI * 2 });
  }
  for (let i = 0; i < 6; i++) blueSpots.push({ x: -46 + i * 7, z: 40, s: 0.92 + rnd() * 0.2, rot: rnd() * Math.PI * 2 });

  /* ---- Place green spruces ---- */
  const greenSpots = [];
  for (let i = 0; i < 8; i++) greenSpots.push({ x: -48 + i * 9, z: -60 + rnd() * 4, s: 1.0 + rnd() * 0.25, rot: rnd() * Math.PI * 2 });
  for (let i = 0; i < 6; i++) greenSpots.push({ x: 58, z: -30 + i * 11, s: 0.9 + rnd() * 0.24, rot: rnd() * Math.PI * 2 });

  /* ---- Place birch trees behind & flanking building ---- */
  const birchSpots = [];
  for (let i = 0; i < 8; i++) {
    birchSpots.push({ x: -40 + rnd() * 80, z: -72 + rnd() * 10, s: 0.92 + rnd() * 0.3, rot: rnd() * Math.PI * 2 });
  }
  for (let i = 0; i < 5; i++) {
    birchSpots.push({ x: -55 + rnd() * 10, z: -20 + rnd() * 50, s: 0.95 + rnd() * 0.25, rot: rnd() * Math.PI * 2 });
    birchSpots.push({ x: 55 + rnd() * 10, z: -20 + rnd() * 50, s: 0.95 + rnd() * 0.25, rot: rnd() * Math.PI * 2 });
  }

  // Filter out trees colliding with buildings
  const filter = (sp) => Math.hypot(sp.x, sp.z) > 22.0;
  const filteredBlue = blueSpots.filter(filter);
  const filteredGreen = greenSpots.filter(filter);
  const filteredBirch = birchSpots.filter(filter);

  loadGLB('./assets/models/tree_spruce.glb')
    .then((spruceGltf) => {
      placeGLBTreeInstances(scene, spruceGltf, filteredBlue, mulberry32(1101), { targetHeight: 8.6, foliageTint: 0x8db8c8 });
      placeGLBTreeInstances(scene, spruceGltf, filteredGreen, mulberry32(2202), { targetHeight: 9.6, foliageTint: 0xa4c09c });
    })
    .catch(() => {});

  loadGLB('./assets/models/tree_birch.glb')
    .then((birchGltf) => {
      placeGLBTreeInstances(scene, birchGltf, filteredBirch, mulberry32(3303), { targetHeight: 9.8 });
    })
    .catch(() => {});

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
  const bedMat = cachedMaterial({ color: 0x8a6b58, roughness: 1 });
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
  const benchWoodMat = cachedMaterial({
    color: 0x8a6a44, roughness: 0.7, map: TEX.wood().map, bumpMap: TEX.wood().bump, bumpScale: 0.2,
  });
  const castIronMat = cachedMaterial({ color: 0x1a1a1e, roughness: 0.75, metalness: 0.6 });
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

/* ---------------------------------------------------------------- lamps */
/* Classic park lamps with white glass globe */
function lamps(scene, M, nightLights) {
  const pts = [];
  for (let i = 0; i < 5; i++) { pts.push([-24 + i * 12, 44]); pts.push([-24 + i * 12, 34]); }
  pts.push([-34, 12], [34, 12], [-40, -20], [40, -20], [-40, -50], [40, -50]);

  const globeMat = M.parkLampGlobe || cachedMaterial({
    color: 0xfff8ee, emissive: 0xfff0d0, emissiveIntensity: 0.25,
    roughness: 0.3, transparent: true, opacity: 0.85,
  });
  if (!M.parkLampGlobe) M.parkLampGlobe = globeMat;

  const batch = new Batch();
  for (const [x, z] of pts) {
    batch.cyl(M.metalDark, 0.055, 0.1, 4.0, 8, x, 2.0, z);
    batch.cyl(M.metalDark, 0.22, 0.28, 0.3, 10, x, 0.15, z);
    batch.box(M.metalDark, 0.4, 0.08, 0.4, x, 0.04, z);
    batch.cyl(M.metalDark, 0.14, 0.18, 0.12, 8, x, 4.06, z);
    const sphere = new THREE.SphereGeometry(0.22, 12, 8);
    batch.add(sphere, globeMat, new THREE.Matrix4().makeTranslation(x, 4.28, z));
    batch.cyl(M.metalDark, 0.03, 0.06, 0.1, 6, x, 4.55, z);
  }
  batch.build(scene, { cast: true, receive: false, name: 'lamps' });

  for (let i = 0; i < 4; i++) {
    const [x, z] = pts[i * 3] || pts[0];
    const l = new THREE.PointLight(0xffd9a0, 0, 18, 2);
    l.position.set(x, 4.2, z);
    scene.add(l);
    nightLights.push(l);
  }
}

/* ----------------------------------------------------------------- cars */
function parking(scene) {
  const colors = [0x242830, 0x9aa0a8, 0xc8ccd2, 0x1b2b3d, 0x5c1a1e, 0xebebe8, 0x26435e, 0x45494e];
  const rnd = mulberry32(9);
  const group = new THREE.Group();
  group.name = 'cars';
  scene.add(group);

  Promise.all([
    loadGLB('./assets/models/car_sedan.glb'),
    loadGLB('./assets/models/car_suv.glb'),
  ]).then(([sedanGltf, suvGltf]) => {
    for (let i = 0; i < 10; i++) {
      if (i === 5) continue; // leave one open stall naturally
      const isSUV = rnd() > 0.45;
      const gltf = isSUV ? suvGltf : sedanGltf;
      const col = colors[Math.floor(rnd() * colors.length)];
      const car = prepareModel(gltf.scene.clone(true), {
        groundY: 0.06,
        centerXZ: true,
        cloneMaterials: true,
        envMapIntensity: 1.15,
        onMesh(obj) {
          const mat = obj.material;
          if (!mat) return;
          if (mat.name === 'CarPaint') {
            mat.color.setHex(col);
            mat.metalness = 0.65;
            mat.roughness = 0.24;
            mat.envMapIntensity = 1.35;
          } else if (mat.name === 'CarGlass') {
            mat.color.setHex(0x18202a);
            mat.metalness = 0.25;
            mat.roughness = 0.06;
            mat.envMapIntensity = 1.5;
          } else if (mat.name === 'CarRim') {
            mat.metalness = 0.9;
            mat.roughness = 0.18;
            mat.envMapIntensity = 1.45;
          } else if (mat.name === 'Headlight' || mat.name === 'Taillight') {
            mat.emissiveIntensity = 0.25;
          }
        },
      });
      const x = 14 + i * 2.9 + 1.45;
      const z = -46 + (rnd() - 0.5) * 0.45;
      car.position.x = x;
      car.position.z = z;
      car.rotation.y = (rnd() > 0.25 ? 0 : Math.PI) + (rnd() - 0.5) * 0.06;
      group.add(car);
    }
  }).catch(() => {});

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
  const bgMat = cachedMaterial({ color: 0x4b535e, roughness: 0.96, metalness: 0 });
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
