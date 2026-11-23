/* First-person body. Built low-poly but with the details that matter when you look
   down: black tuxedo jacket with satin peak lapels, white dress shirt front with
   mother-of-pearl studs, black silk bow tie, cummerbund, dress trousers with satin
   side stripes (tuxedo lampas), and polished patent leather Oxford shoes that
   alternate on a real walk cycle. The rig is parented to the camera yaw, so the body
   turns with the view and the legs stay planted under the head.

   Improved for natural look when looking down: visible shirt placket, cummerbund,
   proper button spacing, defined shoe toe-caps and heels, clean trouser creases. */

import * as THREE from 'three';
import { mulberry32 } from './core.js';

const MAT = {};

function materials() {
  if (MAT.done) return MAT;
  // Tuxedo wool — midnight black, slight warm cast
  MAT.wool = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.82, metalness: 0.02 });
  // Satin — deep black with sheen for lapels, trouser stripe, bow tie
  MAT.satin = new THREE.MeshStandardMaterial({ color: 0x0a0b0f, roughness: 0.22, metalness: 0.35, envMapIntensity: 1.1 });
  // White dress shirt
  MAT.shirt = new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.72 });
  // Skin tone
  MAT.skin = new THREE.MeshStandardMaterial({ color: 0xc79a78, roughness: 0.62, metalness: 0 });
  // Patent leather shoes — high gloss
  MAT.shoe = new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.12, metalness: 0.25, envMapIntensity: 1.6 });
  // Leather sole
  MAT.sole = new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.9 });
  // Gold studs and cufflinks
  MAT.gold = new THREE.MeshStandardMaterial({ color: 0xd8b56a, roughness: 0.28, metalness: 0.95 });
  // Cummerbund — silk satin, slightly different sheen
  MAT.cummerbund = new THREE.MeshStandardMaterial({ color: 0x0c0c12, roughness: 0.3, metalness: 0.2 });
  MAT.done = true;
  return MAT;
}

function box(mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  return m;
}

function cyl(mat, rt, rb, h, seg, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/* One leg: thigh, shin, shoe, all hinged so the walk reads naturally */
function makeLeg(M, side) {
  const hip = new THREE.Group();
  hip.position.set(side * 0.115, 0, 0);

  const thigh = new THREE.Group();
  hip.add(thigh);
  // Trouser thigh — slightly tapered
  thigh.add(box(M.wool, 0.175, 0.46, 0.2, 0, -0.23, 0));
  // Satin tuxedo trouser stripe (lampas)
  thigh.add(box(M.satin, 0.016, 0.44, 0.028, side * 0.088, -0.23, 0.002));
  // Trouser crease (front)
  thigh.add(box(M.wool, 0.008, 0.44, 0.01, 0, -0.23, 0.1));

  const knee = new THREE.Group();
  knee.position.set(0, -0.46, 0);
  thigh.add(knee);
  // Shin
  knee.add(box(M.wool, 0.16, 0.44, 0.185, 0, -0.22, 0));
  // Satin stripe (shin segment)
  knee.add(box(M.satin, 0.016, 0.42, 0.028, side * 0.082, -0.22, 0.002));
  // Trouser crease (shin)
  knee.add(box(M.wool, 0.008, 0.42, 0.01, 0, -0.22, 0.092));

  const ankle = new THREE.Group();
  ankle.position.set(0, -0.44, 0);
  knee.add(ankle);
  // Patent leather Oxford shoe — refined shape
  // Main body
  ankle.add(box(M.shoe, 0.15, 0.072, 0.28, 0, -0.03, 0.04));
  // Heel block
  ankle.add(box(M.shoe, 0.13, 0.06, 0.1, 0, -0.005, -0.1));
  // Collar (around the ankle opening)
  ankle.add(box(M.shoe, 0.14, 0.05, 0.11, 0, 0.0, -0.07));
  // Toe cap with slight profile
  ankle.add(box(M.shoe, 0.14, 0.048, 0.06, 0, -0.012, 0.165));
  // Sole — slightly wider than upper
  ankle.add(box(M.sole, 0.158, 0.02, 0.3, 0, -0.072, 0.04));
  // Heel lift
  ankle.add(box(M.sole, 0.12, 0.025, 0.08, 0, -0.065, -0.1));
  // Lace detail (subtle ridge)
  ankle.add(box(M.shoe, 0.08, 0.01, 0.1, 0, 0.03, 0.02));

  return { hip, thigh, knee, ankle };
}

export function buildCharacter() {
  const M = materials();
  const root = new THREE.Group();
  root.name = 'character';

  /* hips / pelvis */
  const pelvis = new THREE.Group();
  pelvis.position.y = 0.94;
  root.add(pelvis);
  pelvis.add(box(M.wool, 0.32, 0.2, 0.21, 0, 0.0, 0));

  const legL = makeLeg(M, -1);
  const legR = makeLeg(M, 1);
  legL.hip.position.y = -0.02;
  legR.hip.position.y = -0.02;
  pelvis.add(legL.hip, legR.hip);

  /* torso: jacket with a slight taper, lapels and a white front */
  const torso = new THREE.Group();
  torso.position.y = 0.06;
  pelvis.add(torso);

  // Chest — jacket body
  torso.add(box(M.wool, 0.4, 0.5, 0.24, 0, 0.25, 0));
  // Waist taper
  torso.add(box(M.wool, 0.36, 0.12, 0.22, 0, 0.0, 0));
  // Shirt front — visible placket
  torso.add(box(M.shirt, 0.16, 0.42, 0.02, 0, 0.28, 0.122));
  // Shirt placket (center ridge)
  torso.add(box(M.shirt, 0.028, 0.38, 0.008, 0, 0.28, 0.136));

  // Satin peak lapels — angled thin plates
  const lapL = box(M.satin, 0.09, 0.34, 0.015, -0.085, 0.31, 0.128, 0, 0, 0.16);
  const lapR = box(M.satin, 0.09, 0.34, 0.015, 0.085, 0.31, 0.128, 0, 0, -0.16);
  torso.add(lapL, lapR);
  // Lapel notch detail (top corners)
  torso.add(box(M.satin, 0.035, 0.05, 0.01, -0.11, 0.48, 0.13, 0, 0, 0.3));
  torso.add(box(M.satin, 0.035, 0.05, 0.01, 0.11, 0.48, 0.13, 0, 0, -0.3));

  // Collar
  torso.add(box(M.wool, 0.3, 0.05, 0.2, 0, 0.505, 0));

  // Bow tie — three-part butterfly
  torso.add(box(M.satin, 0.055, 0.035, 0.03, -0.035, 0.47, 0.135, 0, 0, 0.25));
  torso.add(box(M.satin, 0.055, 0.035, 0.03, 0.035, 0.47, 0.135, 0, 0, -0.25));
  torso.add(box(M.satin, 0.022, 0.028, 0.025, 0, 0.47, 0.14)); // center knot

  // Shirt studs (mother-of-pearl effect — gold material)
  for (let i = 0; i < 4; i++) {
    torso.add(box(M.gold, 0.014, 0.014, 0.008, 0, 0.42 - i * 0.065, 0.14));
  }

  // Pocket square — white silk, slight fold
  torso.add(box(M.shirt, 0.065, 0.032, 0.008, -0.14, 0.36, 0.125, 0, 0, 0.1));
  torso.add(box(M.shirt, 0.06, 0.02, 0.006, -0.14, 0.38, 0.126, 0, 0, -0.05));

  // Cummerbund — pleated silk band at the waist
  torso.add(box(M.cummerbund, 0.3, 0.1, 0.19, 0, 0.0, 0.03));
  // Cummerbund pleats (3 horizontal ridges)
  for (let i = 0; i < 3; i++) {
    torso.add(box(M.cummerbund, 0.28, 0.008, 0.01, 0, -0.03 + i * 0.04, 0.125));
  }

  // Jacket buttons (covered — tuxedo style, two)
  for (let i = 0; i < 2; i++) {
    torso.add(box(M.wool, 0.018, 0.018, 0.012, 0.075, 0.12 - i * 0.08, 0.13));
  }

  /* arms, hanging with a slight bend */
  function makeArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.225, 0.44, 0);
    torso.add(shoulder);
    // Upper arm
    shoulder.add(box(M.wool, 0.11, 0.34, 0.14, 0, -0.17, 0));
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.34, 0);
    shoulder.add(elbow);
    // Forearm
    elbow.add(box(M.wool, 0.1, 0.3, 0.12, 0, -0.15, 0));
    // French cuff — wider, with a fold
    elbow.add(box(M.shirt, 0.11, 0.045, 0.13, 0, -0.3, 0));
    // Cufflink
    elbow.add(box(M.gold, 0.012, 0.012, 0.008, side * 0.055, -0.3, 0));
    // Hand
    elbow.add(box(M.skin, 0.085, 0.11, 0.1, 0, -0.37, 0));
    // Fingers hint
    elbow.add(box(M.skin, 0.075, 0.03, 0.06, 0, -0.44, 0.02));
    shoulder.rotation.z = side * 0.06;
    elbow.rotation.x = -0.12;
    return { shoulder, elbow };
  }
  const armL = makeArm(-1), armR = makeArm(1);

  /* head is left out on purpose: it would sit inside the camera. */

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  const st = { phase: 0, speed: 0 };

  return {
    root,
    legs: [legL, legR],
    arms: [armL, armR],
    torso,
    pelvis,
    update(dt, speed, airborne) {
      st.speed += (speed - st.speed) * Math.min(1, dt * 9);
      const s = st.speed;
      if (s > 0.15) st.phase += dt * (2.1 + s * 0.55) * Math.PI;
      const amp = Math.min(0.72, s * 0.16);
      const a = st.phase;
      const swingL = Math.sin(a) * amp;
      const swingR = Math.sin(a + Math.PI) * amp;
      if (airborne) {
        legL.thigh.rotation.x = -0.35; legR.thigh.rotation.x = 0.18;
        legL.knee.rotation.x = 0.5; legR.knee.rotation.x = 0.25;
        legL.ankle.rotation.x = 0.2; legR.ankle.rotation.x = -0.1;
      } else {
        legL.thigh.rotation.x = swingL;
        legR.thigh.rotation.x = swingR;
        legL.knee.rotation.x = Math.max(0, -Math.sin(a - 0.7)) * amp * 1.5;
        legR.knee.rotation.x = Math.max(0, -Math.sin(a + Math.PI - 0.7)) * amp * 1.5;
        legL.ankle.rotation.x = -swingL * 0.35;
        legR.ankle.rotation.x = -swingR * 0.35;
      }
      // arms counter-swing
      armL.shoulder.rotation.x = -swingR * 0.55;
      armR.shoulder.rotation.x = -swingL * 0.55;
      // torso bob and lean
      const bob = Math.cos(a * 2) * amp * 0.022;
      pelvis.position.y = 0.94 + (airborne ? 0 : bob);
      torso.rotation.x = Math.min(0.12, s * 0.02);
      torso.rotation.z = Math.sin(a) * amp * 0.03;
      pelvis.rotation.z = -Math.sin(a) * amp * 0.04;
    },
  };
}
