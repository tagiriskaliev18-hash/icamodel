/* First-person body. Built low-poly but with the details that matter when you look
   down: black tuxedo jacket with satin lapels, white shirt front, bow tie, dress
   trousers with a satin side stripe, and patent leather shoes that alternate on a
   real walk cycle. The rig is parented to the camera yaw, so the body turns with
   the view and the legs stay planted under the head. */

import * as THREE from 'three';
import { mulberry32 } from './core.js';

const MAT = {};

function materials() {
  if (MAT.done) return MAT;
  MAT.wool = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.82, metalness: 0.02 });
  MAT.satin = new THREE.MeshStandardMaterial({ color: 0x0a0b0f, roughness: 0.22, metalness: 0.35, envMapIntensity: 1.1 });
  MAT.shirt = new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.72 });
  MAT.skin = new THREE.MeshStandardMaterial({ color: 0xc79a78, roughness: 0.62, metalness: 0 });
  MAT.shoe = new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.16, metalness: 0.2, envMapIntensity: 1.4 });
  MAT.sole = new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.9 });
  MAT.gold = new THREE.MeshStandardMaterial({ color: 0xd8b56a, roughness: 0.28, metalness: 0.95 });
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

/* one leg: thigh, shin, shoe, all hinged so the walk reads naturally */
function makeLeg(M, side) {
  const hip = new THREE.Group();
  hip.position.set(side * 0.115, 0, 0);

  const thigh = new THREE.Group();
  hip.add(thigh);
  thigh.add(box(M.wool, 0.175, 0.46, 0.2, 0, -0.23, 0));
  // satin tuxedo trouser stripe (thigh segment)
  thigh.add(box(M.satin, 0.014, 0.44, 0.032, side * 0.088, -0.23, 0.002));

  const knee = new THREE.Group();
  knee.position.set(0, -0.46, 0);
  thigh.add(knee);
  knee.add(box(M.wool, 0.16, 0.44, 0.185, 0, -0.22, 0));
  // satin stripe (shin segment)
  knee.add(box(M.satin, 0.014, 0.42, 0.032, side * 0.082, -0.22, 0.002));

  const ankle = new THREE.Group();
  ankle.position.set(0, -0.44, 0);
  knee.add(ankle);
  // patent leather oxford
  ankle.add(box(M.shoe, 0.155, 0.075, 0.30, 0, -0.03, 0.045));
  ankle.add(box(M.shoe, 0.145, 0.05, 0.12, 0, 0.0, -0.075));
  ankle.add(box(M.sole, 0.16, 0.022, 0.31, 0, -0.072, 0.045));
  // toe cap
  ankle.add(box(M.shoe, 0.15, 0.05, 0.07, 0, -0.012, 0.17));

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

  torso.add(box(M.wool, 0.4, 0.5, 0.24, 0, 0.25, 0));       // chest
  torso.add(box(M.wool, 0.36, 0.12, 0.22, 0, 0.0, 0));      // waist
  // shirt front
  torso.add(box(M.shirt, 0.16, 0.42, 0.02, 0, 0.28, 0.122));
  // satin lapels as thin angled plates
  const lapL = box(M.satin, 0.09, 0.34, 0.015, -0.085, 0.31, 0.128, 0, 0, 0.16);
  const lapR = box(M.satin, 0.09, 0.34, 0.015, 0.085, 0.31, 0.128, 0, 0, -0.16);
  torso.add(lapL, lapR);
  // collar
  torso.add(box(M.wool, 0.3, 0.05, 0.2, 0, 0.505, 0));
  // bow tie
  torso.add(box(M.satin, 0.055, 0.035, 0.03, -0.035, 0.47, 0.135, 0, 0, 0.25));
  torso.add(box(M.satin, 0.055, 0.035, 0.03, 0.035, 0.47, 0.135, 0, 0, -0.25));
  torso.add(box(M.satin, 0.022, 0.028, 0.025, 0, 0.47, 0.14));
  // studs and buttons
  for (let i = 0; i < 3; i++) torso.add(box(M.gold, 0.016, 0.016, 0.01, 0, 0.4 - i * 0.075, 0.137));
  // pocket square
  torso.add(box(M.shirt, 0.07, 0.035, 0.01, -0.14, 0.36, 0.125, 0, 0, 0.1));
  // waistcoat hint below the jacket closure
  torso.add(box(M.wool, 0.2, 0.1, 0.19, 0, -0.02, 0.01));

  /* arms, hanging with a slight bend */
  function makeArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.225, 0.44, 0);
    torso.add(shoulder);
    shoulder.add(box(M.wool, 0.11, 0.34, 0.14, 0, -0.17, 0));
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.34, 0);
    shoulder.add(elbow);
    elbow.add(box(M.wool, 0.1, 0.3, 0.12, 0, -0.15, 0));
    // cuff + hand
    elbow.add(box(M.shirt, 0.105, 0.04, 0.125, 0, -0.3, 0));
    elbow.add(box(M.skin, 0.085, 0.11, 0.1, 0, -0.37, 0));
    shoulder.rotation.z = side * 0.06;
    elbow.rotation.x = -0.12;
    return { shoulder, elbow };
  }
  const armL = makeArm(-1), armR = makeArm(1);

  /* head is left out on purpose: it would sit inside the camera. A shadow of a
     collar and the shoulders is all you can see looking down, which is right. */

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  const state = { phase: 0, speed: 0 };

  return {
    root,
    legs: [legL, legR],
    arms: [armL, armR],
    torso,
    pelvis,
    /* speed in m/s, dt in seconds, airborne to freeze the cycle */
    update(dt, speed, airborne) {
      state.speed += (speed - state.speed) * Math.min(1, dt * 9);
      const s = state.speed;
      if (s > 0.15) state.phase += dt * (2.1 + s * 0.55) * Math.PI;
      const amp = Math.min(0.72, s * 0.16);
      const a = state.phase;
      const swingL = Math.sin(a) * amp;
      const swingR = Math.sin(a + Math.PI) * amp;
      if (airborne) {
        legL.thigh.rotation.x = -0.35; legR.thigh.rotation.x = 0.18;
        legL.knee.rotation.x = 0.5; legR.knee.rotation.x = 0.25;
        legL.ankle.rotation.x = 0.2; legR.ankle.rotation.x = -0.1;
      } else {
        legL.thigh.rotation.x = swingL;
        legR.thigh.rotation.x = swingR;
        // knee only bends backwards, strongest as the leg passes under the body
        legL.knee.rotation.x = Math.max(0, -Math.sin(a - 0.7)) * amp * 1.5;
        legR.knee.rotation.x = Math.max(0, -Math.sin(a + Math.PI - 0.7)) * amp * 1.5;
        legL.ankle.rotation.x = -swingL * 0.35;
        legR.ankle.rotation.x = -swingR * 0.35;
      }
      // arms counter-swing, gentler
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
