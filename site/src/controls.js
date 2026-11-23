/* Camera & movement controller:
   - Drone mode: free 6-DOF flight (WASD + Q/E + Shift + mouse drag / pointer-lock)
     + smooth cinematic spline auto-orbit tour + instant camera presets.
   - Human mode: first-person walking with gravity, arcStair (semicircular grand stair)
     climbing, elevator ride (E key), wall/column collisions, turnstile pass-through,
     free corridors into both wings and open rooms.
   Exports VIEWPOINTS, createController. */

import * as THREE from 'three';
import { clamp, easeInOut, PODIUM, LAYOUT } from './core.js';

const _wingPt = (s, t, y) => {
  const a = LAYOUT.wing.az;
  return [
    Math.sin(a) * s + Math.cos(a) * t,
    y,
    -Math.cos(a) * s + Math.sin(a) * t,
  ];
};

export const VIEWPOINTS = {
  facade: {
    label: 'Фасад',
    pos: [24, 13.5, 52],
    target: [-3, 9.5, 2],
  },
  aerial: {
    label: 'Сверху',
    pos: [-48, 42, 62],
    target: [0, 6, -4],
  },
  lobby: {
    label: 'Холл',
    pos: [0.9, PODIUM + 1.82, 13.1],
    target: [-0.9, PODIUM + 1.60, 5.0],
  },
  lift: {
    label: 'Лифт',
    pos: [5, PODIUM + 5.5, 6],
    target: [0, PODIUM + 4.5, 0],
  },
  hall: {
    label: 'Актовый зал',
    pos: [-16.6, PODIUM + 3.6 + 1.95, -4.35],
    target: [-32.8, PODIUM + 3.6 + 1.55, -4.55],
  },
  meeting: {
    label: 'Переговорная',
    pos: _wingPt(12.2, 4.35, PODIUM + 3.6 + 1.92),
    target: _wingPt(26.0, 4.05, PODIUM + 3.6 + 1.52),
  },
  dispatch: {
    label: 'Диспетчерская',
    pos: [-23.4, PODIUM + 2.15, -4.55],
    target: [-32.8, PODIUM + 1.55, -4.55],
  },
};

const TOUR_KEYS = [
  { pos: new THREE.Vector3(26, 13.5, 52), target: new THREE.Vector3(-2, 9.5, 2) },
  { pos: new THREE.Vector3(-28, 17, 46), target: new THREE.Vector3(-4, 10, 0) },
  { pos: new THREE.Vector3(-54, 34, 24), target: new THREE.Vector3(0, 7, -4) },
  { pos: new THREE.Vector3(-12, 36, -54), target: new THREE.Vector3(4, 7, -4) },
  { pos: new THREE.Vector3(48, 22, -16), target: new THREE.Vector3(4, 8, -2) },
  { pos: new THREE.Vector3(44, 11, 34), target: new THREE.Vector3(0, 9.5, 4) },
];

const EYE_H = 1.68;
const BODY_RADIUS = 0.38;
const GRAVITY = 20.0;
const JUMP_V = 6.2;

function pointInPoly(px, pz, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1];
    const xj = pts[j][0], zj = pts[j][1];
    const intersect = ((zi > pz) !== (zj > pz)) &&
      (px < ((xj - xi) * (pz - zi)) / (zj - zi + 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pushOutSegment(px, pz, ax, az, bx, bz, rad) {
  const vx = bx - ax, vz = bz - az;
  const len2 = vx * vx + vz * vz;
  if (len2 < 1e-8) return { x: px, z: pz };
  const t = clamp(((px - ax) * vx + (pz - az) * vz) / len2, 0, 1);
  const cx = ax + vx * t, cz = az + vz * t;
  const dx = px - cx, dz = pz - cz;
  const d = Math.hypot(dx, dz);
  if (d < rad && d > 1e-6) {
    const push = (rad - d) / d;
    return { x: px + dx * push, z: pz + dz * push };
  }
  return { x: px, z: pz };
}

export function createController(camera, domElement, colliders, character, opts = {}) {
  const reducedMotion = !!opts.reducedMotion;
  const onStateChange = opts.onStateChange || (() => {});

  const posCurve = new THREE.CatmullRomCurve3(TOUR_KEYS.map((k) => k.pos), true, 'catmullrom', 0.5);
  const tgtCurve = new THREE.CatmullRomCurve3(TOUR_KEYS.map((k) => k.target), true, 'catmullrom', 0.5);

  const state = {
    mode: 'drone',
    tour: !reducedMotion,
    tourT: 0,
    yaw: 0,
    pitch: -0.1,
    vel: new THREE.Vector3(),
    feet: new THREE.Vector3(0, 0, 27.5),
    vy: 0,
    grounded: true,
    spiralAngle: 0,
    onSpiral: false,
    trans: null,
    pointerLocked: false,
    dragging: false,
    lastX: 0,
    lastY: 0,
    lastDownX: 0,
    lastDownY: 0,
    downType: 'mouse',
    touchId: null,
    keys: new Set(),
    mobileMove: { x: 0, y: 0 },
    // elevator
    elevatorRiding: false,
    elevatorCurrentLevel: 0,
    elevatorAnimT: 0,
    elevatorFromY: 0,
    elevatorToY: 0,
    elevatorCabin: null,
    elevatorDoors: null,
    elevatorLevels: null,
    elevatorHudVisible: false,
    elevatorHudTimer: null,
  };

  const _tmpPos = new THREE.Vector3();
  const _tmpTgt = new THREE.Vector3();
  const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

  function syncAnglesFromLook(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const horiz = Math.hypot(dx, dz) || 1e-5;
    state.yaw = Math.atan2(-dx, -dz);
    state.pitch = clamp(Math.atan2(dy, horiz), -1.48, 1.42);
  }

  function applyCameraAngles() {
    _euler.set(state.pitch, state.yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(_euler);
  }

  function floorHeightAt(x, z, curY) {
    let h = 0;

    for (const c of colliders) {
      if (c.type === 'ramp') {
        const dirX = Math.sin(c.az), dirZ = -Math.cos(c.az);
        const sideX = -dirZ, sideZ = dirX;
        const rAlong = x * dirX + z * dirZ;
        const rSide = Math.abs((x * sideX + z * sideZ) - (c.sideOffset || 0));
        if (rSide <= c.width * 0.52 && rAlong >= c.r0 - 0.5 && rAlong <= c.r1 + 0.5) {
          const t = clamp((c.r1 - rAlong) / (c.r1 - c.r0), 0, 1);
          const rampY = c.y0 + t * (c.y1 - c.y0);
          if (rampY <= curY + 0.85) h = Math.max(h, rampY);
        }
      } else if (c.type === 'floorCircle') {
        if (Math.hypot(x - c.x, z - c.z) <= c.r) {
          if (c.y <= curY + 0.65) h = Math.max(h, c.y);
        }
      } else if (c.type === 'floorRect') {
        if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1) {
          if (c.y <= curY + 0.65) h = Math.max(h, c.y);
        }
      } else if (c.type === 'spiral') {
        const r = Math.hypot(x, z);
        if (r >= c.rMin && r <= c.rMax && curY >= c.y0 - 0.5 && curY <= c.y1 + 0.8) {
          let a = Math.atan2(x, -z);
          if (a < 0) a += Math.PI * 2;
          const totalRad = c.turns * Math.PI * 2;
          const estTurn = Math.round(((curY - c.y0) / (c.y1 - c.y0) * totalRad - a) / (Math.PI * 2));
          const fullA = clamp(a + estTurn * Math.PI * 2, 0, totalRad);
          const sy = c.y0 + (fullA / totalRad) * (c.y1 - c.y0);
          if (Math.abs(sy - curY) < 0.95) {
            h = Math.max(h, sy);
          }
        }
      } else if (c.type === 'arcStair') {
        // Semicircular grand stair: test if player is within the arc sector
        const r = Math.hypot(x - c.cx, z - c.cz);
        if (r >= c.rInner && r <= c.rOuter) {
          let angle = Math.atan2(x - c.cx, -(z - c.cz));
          if (angle < 0) angle += Math.PI * 2;
          // Normalize a0, a1 to [0, 2pi]
          let a0 = ((c.a0 % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          let a1 = ((c.a1 % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          // Check if angle is within the arc
          let inArc = false;
          if (a0 < a1) {
            inArc = angle >= a0 && angle <= a1;
          } else {
            inArc = angle >= a0 || angle <= a1;
          }
          if (inArc) {
            // Calculate progress along the arc
            let progress;
            if (a0 < a1) {
              progress = (angle - a0) / (a1 - a0);
            } else {
              const span = (Math.PI * 2 - a0) + a1;
              const off = angle >= a0 ? (angle - a0) : (Math.PI * 2 - a0 + angle);
              progress = off / span;
            }
            progress = clamp(progress, 0, 1);
            const stairY = c.y0 + progress * (c.y1 - c.y0);
            if (stairY <= curY + 0.85 && curY >= c.y0 - 0.5 && curY <= c.y1 + 0.5) {
              h = Math.max(h, stairY);
            }
          }
        }
      }
    }

    // Upper floor rings inside the rotunda hall (exclude grand staircase cutouts 20°..160°, 200°..340°)
    const rCenter = Math.hypot(x, z);
    let rotAng = Math.atan2(x, -z) * 180 / Math.PI;
    if (rotAng < 0) rotAng += 360;
    const inStairWell = rCenter >= 4.55 && rCenter <= 6.65 &&
      ((rotAng >= 20 && rotAng <= 160) || (rotAng >= 200 && rotAng <= 340));
    if (rCenter >= LAYOUT.rotunda.core && rCenter <= LAYOUT.rotunda.hall && !inStairWell) {
      for (const lv of [3.6, 7.2]) {
        const fy = PODIUM + lv;
        if (curY >= fy - 0.55) h = Math.max(h, fy);
      }
    }

    // Block wing floors (only active levels 0, 1, 2 — exclude non-existent FLOOR[3])
    const B = LAYOUT.block;
    if (x >= B.x0 && x <= B.x1 && z >= B.z0 && z <= B.z1) {
      for (const lv of [0, 3.6, 7.2]) {
        const fy = PODIUM + lv;
        if (curY >= fy - 0.55) h = Math.max(h, fy);
      }
    }

    // Block-to-rotunda corridor threshold bridge (closes x = -9.4..-8.55 gap)
    if (x >= -9.5 && x <= -8.1 && z >= -2.3 && z <= 1.3) {
      for (const lv of [0, 3.6, 7.2]) {
        const fy = PODIUM + lv;
        if (curY >= fy - 0.55) h = Math.max(h, fy);
      }
    }

    // Wing floors (only active levels 0, 1, 2 — exclude non-existent FLOOR[3])
    const W = LAYOUT.wing;
    const wa = W.az, wax = Math.sin(wa), waz = -Math.cos(wa);
    const wnx = Math.cos(wa), wnz = Math.sin(wa);
    const ws = x * wax + z * waz; // along axis
    const wt = Math.abs(x * wnx + z * wnz); // across axis
    if (ws >= W.s0 && ws <= W.s1 && wt <= W.half) {
      for (const lv of [0, 3.6, 7.2]) {
        const fy = PODIUM + lv;
        if (curY >= fy - 0.55) h = Math.max(h, fy);
      }
    }

    return h;
  }

  function resolveCollisions(pos, feetY) {
    let px = pos.x, pz = pos.z;
    const headY = feetY + EYE_H;

    px = clamp(px, -55, 67);
    pz = clamp(pz, -71, 58);

    for (let iter = 0; iter < 2; iter++) {
      for (const c of colliders) {
        // Skip elevator shaft collider when riding
        if (c.type === 'elevator') continue;

        if (c.type === 'circle') {
          if (headY < c.y0 || feetY > c.y1) continue;
          const dx = px - c.x, dz = pz - c.z;
          const d = Math.hypot(dx, dz);
          const minD = c.r + BODY_RADIUS;
          if (d < minD && d > 1e-5) {
            const k = minD / d;
            px = c.x + dx * k;
            pz = c.z + dz * k;
          }
        } else if (c.type === 'rect') {
          if (headY < c.y0 || feetY > c.y1) continue;
          const cx = clamp(px, c.x0, c.x1);
          const cz = clamp(pz, c.z0, c.z1);
          const dx = px - cx, dz = pz - cz;
          const d = Math.hypot(dx, dz);
          if (d < BODY_RADIUS) {
            if (d > 1e-5) {
              const push = (BODY_RADIUS - d) / d;
              px += dx * push;
              pz += dz * push;
            } else {
              const dl = Math.abs(px - c.x0), dr = Math.abs(c.x1 - px);
              const dt = Math.abs(pz - c.z0), db = Math.abs(c.z1 - pz);
              const m = Math.min(dl, dr, dt, db);
              if (m === dl) px = c.x0 - BODY_RADIUS;
              else if (m === dr) px = c.x1 + BODY_RADIUS;
              else if (m === dt) pz = c.z0 - BODY_RADIUS;
              else pz = c.z1 + BODY_RADIUS;
            }
          }
        } else if (c.type === 'obb') {
          if (headY < c.y0 || feetY > c.y1) continue;
          const dx = px - c.cx, dz = pz - c.cz;
          const nx = -c.uz, nz = c.ux;
          const lu = dx * c.ux + dz * c.uz;
          const lv = dx * nx + dz * nz;
          const cu = clamp(lu, -c.halfW, c.halfW);
          const cv = clamp(lv, -c.halfD, c.halfD);
          const du = lu - cu, dv = lv - cv;
          const d = Math.hypot(du, dv);
          if (d < BODY_RADIUS) {
            if (d > 1e-5) {
              const push = (BODY_RADIUS - d) / d;
              const pu = du * push, pv = dv * push;
              px += c.ux * pu + nx * pv;
              pz += c.uz * pu + nz * pv;
            } else {
              const dl = Math.abs(lu + c.halfW), dr = Math.abs(c.halfW - lu);
              const dt2 = Math.abs(lv + c.halfD), db = Math.abs(c.halfD - lv);
              const m = Math.min(dl, dr, dt2, db);
              let pu = 0, pv = 0;
              if (m === dl) pu = -(c.halfW + BODY_RADIUS) - lu;
              else if (m === dr) pu = (c.halfW + BODY_RADIUS) - lu;
              else if (m === dt2) pv = -(c.halfD + BODY_RADIUS) - lv;
              else pv = (c.halfD + BODY_RADIUS) - lv;
              px += c.ux * pu + nx * pv;
              pz += c.uz * pu + nz * pv;
            }
          }
        } else if (c.type === 'poly') {
          if (headY < c.y0 || feetY > c.y1) continue;
          if (pointInPoly(px, pz, c.pts)) {
            let bestDist = Infinity, bestX = px, bestZ = pz;
            for (let i = 0; i < c.pts.length; i++) {
              const a = c.pts[i], b = c.pts[(i + 1) % c.pts.length];
              const vx = b[0] - a[0], vz = b[1] - a[1];
              const l2 = vx * vx + vz * vz;
              const t = clamp(((px - a[0]) * vx + (pz - a[1]) * vz) / l2, 0, 1);
              const cx2 = a[0] + vx * t, cz2 = a[1] + vz * t;
              const d = Math.hypot(px - cx2, pz - cz2);
              if (d < bestDist) {
                bestDist = d;
                const nx = d > 1e-5 ? (cx2 - px) / d : -(vz) / Math.sqrt(l2);
                const nz2 = d > 1e-5 ? (cz2 - pz) / d : vx / Math.sqrt(l2);
                bestX = cx2 + nx * BODY_RADIUS;
                bestZ = cz2 + nz2 * BODY_RADIUS;
              }
            }
            px = bestX; pz = bestZ;
          } else {
            for (let i = 0; i < c.pts.length; i++) {
              const a = c.pts[i], b = c.pts[(i + 1) % c.pts.length];
              const out = pushOutSegment(px, pz, a[0], a[1], b[0], b[1], BODY_RADIUS);
              px = out.x; pz = out.z;
            }
          }
        }
      }
    }
    pos.x = px;
    pos.z = pz;
  }

  function updateCharacterTransform(dt, horizSpeed, airborne) {
    if (!character) return;
    const isHuman = state.mode === 'human';
    character.root.visible = isHuman;
    if (!isHuman) return;
    const fwdX = -Math.sin(state.yaw);
    const fwdZ = -Math.cos(state.yaw);
    const backOffset = 0.16;
    character.root.position.set(
      state.feet.x - fwdX * backOffset,
      state.feet.y,
      state.feet.z - fwdZ * backOffset
    );
    character.root.rotation.y = state.yaw + Math.PI;
    character.update(dt, horizSpeed, airborne);
  }

  // Find elevator data from colliders/scene
  function findElevatorData() {
    if (state.elevatorCabin) return;
    for (const c of colliders) {
      if (c.type === 'elevator') {
        state.elevatorLevels = c.levels;
        break;
      }
    }
  }

  function setElevatorRef(cabin, doorParts, levels) {
    state.elevatorCabin = cabin;
    state.elevatorDoors = doorParts;
    state.elevatorLevels = levels;
  }

  function tryUseElevator() {
    if (state.mode !== 'human' || state.elevatorRiding) return;
    findElevatorData();
    if (!state.elevatorLevels) return;

    // Check if player is near any elevator door
    const ex = 0, ez = LAYOUT.rotunda.core + 0.6;
    const dist = Math.hypot(state.feet.x - ex, state.feet.z - ez);
    if (dist > 2.5) return;

    // Find current level
    let closestLevel = 0;
    let closestDist = Infinity;
    for (let i = 0; i < state.elevatorLevels.length; i++) {
      const d = Math.abs(state.feet.y - state.elevatorLevels[i]);
      if (d < closestDist) { closestDist = d; closestLevel = i; }
    }
    if (closestDist > 1.5) return;

    // Cycle to next level
    const nextLevel = (closestLevel + 1) % state.elevatorLevels.length;
    state.elevatorRiding = true;
    state.elevatorCurrentLevel = closestLevel;
    state.elevatorFromY = state.elevatorLevels[closestLevel];
    state.elevatorToY = state.elevatorLevels[nextLevel];
    state.elevatorAnimT = 0;
    state.elevatorHudVisible = true;

    // Show elevator HUD indicator
    showElevatorHUD(nextLevel + 1);
  }

  function showElevatorHUD(floorNum) {
    let hud = document.getElementById('elevator-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'elevator-hud';
      hud.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
        'background:rgba(0,0,0,0.8);color:#00ff88;padding:20px 40px;border-radius:8px;' +
        'font:600 24px "Segoe UI",sans-serif;z-index:1000;pointer-events:none;' +
        'transition:opacity 0.3s;border:1px solid #00ff88;';
      document.body.appendChild(hud);
    }
    hud.textContent = `🔼 Этаж ${floorNum}`;
    hud.style.opacity = '1';
    if (state.elevatorHudTimer) clearTimeout(state.elevatorHudTimer);
    state.elevatorHudTimer = setTimeout(() => {
      if (hud) hud.style.opacity = '0';
      state.elevatorHudTimer = null;
    }, 2000);
  }

  function updateElevator(dt) {
    if (!state.elevatorRiding) return;
    const dur = 2.0; // seconds to travel between floors
    state.elevatorAnimT += dt / dur;
    if (state.elevatorAnimT >= 1) {
      state.elevatorAnimT = 1;
      state.elevatorRiding = false;
      state.vy = 0;
      state.grounded = true;
    }
    const t = easeInOut(clamp(state.elevatorAnimT, 0, 1));
    const newY = state.elevatorFromY + (state.elevatorToY - state.elevatorFromY) * t;
    state.feet.y = newY;

    // Move cabin mesh if available (local Y relative to PODIUM)
    if (state.elevatorCabin) {
      state.elevatorCabin.position.y = newY - PODIUM;
    }
  }

  function setMode(mode, spawnOpts) {
    if (mode !== 'drone' && mode !== 'human') return;
    state.mode = mode;
    state.trans = null;
    state.vel.set(0, 0, 0);
    state.elevatorRiding = false;
    camera.fov = mode === 'human' ? 68 : 48;
    camera.updateProjectionMatrix();
    if (mode === 'human') {
      state.tour = false;
      if (spawnOpts && spawnOpts.pos) {
        state.feet.set(spawnOpts.pos[0], spawnOpts.pos[1], spawnOpts.pos[2]);
        if (spawnOpts.yaw !== undefined) state.yaw = spawnOpts.yaw;
        if (spawnOpts.pitch !== undefined) state.pitch = spawnOpts.pitch;
      } else {
        const nearHall = Math.hypot(camera.position.x, camera.position.z) < 8.0 && camera.position.y < PODIUM + 4.5;
        if (nearHall) {
          state.feet.set(camera.position.x, PODIUM, camera.position.z);
          state.pitch = clamp(state.pitch, -1.45, 1.2);
        } else {
          state.feet.set(0, 0, 27.5);
          state.yaw = 0;
          state.pitch = 0.04;
        }
      }
      resolveCollisions(state.feet, state.feet.y);
      state.feet.y = floorHeightAt(state.feet.x, state.feet.z, state.feet.y + 0.5);
      state.vy = 0;
      state.grounded = true;
      camera.position.set(state.feet.x, state.feet.y + EYE_H, state.feet.z);
      applyCameraAngles();
      updateCharacterTransform(0.016, 0, false);
    } else {
      if (character) character.root.visible = false;
      if (document.pointerLockElement === domElement) {
        try { document.exitPointerLock(); } catch { /* ignore */ }
      }
      if (camera.position.y < 3.0) camera.position.y = 4.5;
    }
    onStateChange(getState());
  }

  function setTour(enabled) {
    state.tour = !!enabled;
    if (state.tour) {
      if (state.mode !== 'drone') setMode('drone');
      state.trans = null;
    }
    onStateChange(getState());
  }

  function goToViewpoint(id, instant = false) {
    const vp = VIEWPOINTS[id];
    if (!vp) return;
    if (state.mode !== 'drone') setMode('drone');
    state.tour = false;
    const toPos = new THREE.Vector3(...vp.pos);
    const toTgt = new THREE.Vector3(...vp.target);
    if (instant || reducedMotion) {
      camera.position.copy(toPos);
      syncAnglesFromLook(toPos, toTgt);
      applyCameraAngles();
      state.trans = null;
    } else {
      const curDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const fromTgt = camera.position.clone().addScaledVector(curDir, 18);
      state.trans = {
        t: 0,
        dur: 1.05,
        fromPos: camera.position.clone(),
        fromTgt,
        toPos,
        toTgt,
      };
    }
    onStateChange(getState());
  }

  function lookAt(px, py, pz, tx, ty, tz) {
    state.tour = false;
    state.trans = null;
    camera.position.set(px, py, pz);
    syncAnglesFromLook(camera.position, new THREE.Vector3(tx, ty, tz));
    applyCameraAngles();
  }

  function setHumanPose(x, y, z, yaw, pitch, speed = 0) {
    if (state.mode !== 'human') setMode('human');
    state.feet.set(x, y, z);
    state.yaw = yaw;
    state.pitch = clamp(pitch, -1.48, 1.42);
    state.vy = 0;
    state.grounded = true;
    camera.position.set(x, y + EYE_H, z);
    applyCameraAngles();
    if (speed > 0 && character) {
      for (let i = 0; i < 8; i++) character.update(0.05, speed, false);
    }
    updateCharacterTransform(0.016, speed, false);
  }

  function getState() {
    return {
      mode: state.mode,
      tour: state.tour,
      pointerLocked: state.pointerLocked,
    };
  }

  function getPlayerPos() {
    return state.feet.clone();
  }

  /* --------------------------------------------------------------- events */
  function onKeyDown(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const code = e.code;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) {
      if (code === 'KeyE' && state.mode === 'human') {
        // Try using elevator
        tryUseElevator();
        return;
      }
      state.keys.add(code);
      if (state.tour) {
        state.tour = false;
        onStateChange(getState());
      }
      if (state.trans) state.trans = null;
      if (code === 'Space' && state.mode === 'human' && state.grounded) {
        state.vy = JUMP_V;
        state.grounded = false;
      }
    }
    if (code === 'ShiftLeft' || code === 'ShiftRight') state.keys.add('Shift');
    if (code === 'Digit1') goToViewpoint('facade');
    if (code === 'Digit2') goToViewpoint('aerial');
    if (code === 'Digit3') goToViewpoint('lobby');
    if (code === 'Digit4') goToViewpoint('lift');
    if (code === 'Digit5') goToViewpoint('hall');
    if (code === 'Digit6') goToViewpoint('meeting');
    if (code === 'Digit7') goToViewpoint('dispatch');
    if (code === 'KeyV') setMode(state.mode === 'drone' ? 'human' : 'drone');
    if (code === 'KeyT') setTour(!state.tour);
  }

  function onKeyUp(e) {
    state.keys.delete(e.code);
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') state.keys.delete('Shift');
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    if (state.tour) {
      state.tour = false;
      onStateChange(getState());
    }
    if (state.trans) state.trans = null;
    state.dragging = true;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    state.lastDownX = e.clientX;
    state.lastDownY = e.clientY;
    state.downType = e.pointerType || 'mouse';
    if (e.pointerType === 'touch') state.touchId = e.pointerId;
  }

  function onCanvasClick(e) {
    if (state.mode !== 'human' || state.pointerLocked) return;
    if (state.downType === 'touch') return;
    if (Math.hypot(e.clientX - state.lastDownX, e.clientY - state.lastDownY) > 6) return;
    requestPointerLockSafe();
  }

  function requestPointerLockSafe() {
    if (!domElement.requestPointerLock) return;
    try {
      const res = domElement.requestPointerLock();
      if (res && typeof res.catch === 'function') res.catch(() => {});
    } catch { /* ignore */ }
  }

  function onPointerMove(e) {
    if (state.pointerLocked) {
      const sens = 0.0022;
      state.yaw -= e.movementX * sens;
      state.pitch = clamp(state.pitch - e.movementY * sens, -1.48, 1.42);
      return;
    }
    if (!state.dragging) return;
    const dx = e.clientX - state.lastX;
    const dy = e.clientY - state.lastY;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    const sens = e.pointerType === 'touch' ? 0.0045 : 0.0032;
    state.yaw -= dx * sens;
    state.pitch = clamp(state.pitch - dy * sens, -1.48, 1.42);
  }

  function onPointerUp(e) {
    if (e.pointerType === 'touch' && e.pointerId !== state.touchId) return;
    state.dragging = false;
    state.touchId = null;
  }

  function onWheel(e) {
    if (state.mode !== 'drone') return;
    if (state.tour) {
      state.tour = false;
      onStateChange(getState());
    }
    if (state.trans) state.trans = null;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const step = clamp(-e.deltaY * 0.025, -8, 8);
    camera.position.addScaledVector(fwd, step);
    camera.position.y = Math.max(1.2, camera.position.y);
  }

  function onPointerLockChange() {
    state.pointerLocked = document.pointerLockElement === domElement;
    onStateChange(getState());
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('click', onCanvasClick);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  domElement.addEventListener('wheel', onWheel, { passive: true });
  document.addEventListener('pointerlockchange', onPointerLockChange);

  goToViewpoint('facade', true);
  state.tour = !reducedMotion;

  /* --------------------------------------------------------------- update */
  function update(dt) {
    dt = clamp(dt, 0, 0.05);

    if (state.mode === 'drone') {
      if (state.trans) {
        const tr = state.trans;
        tr.t = Math.min(1, tr.t + dt / tr.dur);
        const k = easeInOut(tr.t);
        _tmpPos.lerpVectors(tr.fromPos, tr.toPos, k);
        _tmpTgt.lerpVectors(tr.fromTgt, tr.toTgt, k);
        camera.position.copy(_tmpPos);
        syncAnglesFromLook(_tmpPos, _tmpTgt);
        applyCameraAngles();
        if (tr.t >= 1) state.trans = null;
      } else if (state.tour) {
        state.tourT = ((state.tourT + dt * 0.022) % 1 + 1) % 1;
        posCurve.getPointAt(state.tourT, _tmpPos);
        tgtCurve.getPointAt(state.tourT, _tmpTgt);
        camera.position.lerp(_tmpPos, Math.min(1, dt * 3.5));
        syncAnglesFromLook(camera.position, _tmpTgt);
        applyCameraAngles();
      } else {
        applyCameraAngles();
        const speed = state.keys.has('Shift') ? 32 : 14;
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const move = new THREE.Vector3();
        if (state.keys.has('KeyW') || state.keys.has('ArrowUp')) move.add(fwd);
        if (state.keys.has('KeyS') || state.keys.has('ArrowDown')) move.sub(fwd);
        if (state.keys.has('KeyD') || state.keys.has('ArrowRight')) move.add(right);
        if (state.keys.has('KeyA') || state.keys.has('ArrowLeft')) move.sub(right);
        if (state.keys.has('KeyE')) move.y += 1;
        if (state.keys.has('KeyQ')) move.y -= 1;
        if (state.mobileMove.x || state.mobileMove.y) {
          move.addScaledVector(fwd, state.mobileMove.y);
          move.addScaledVector(right, state.mobileMove.x);
        }
        if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed);
        state.vel.lerp(move, Math.min(1, dt * 8));
        camera.position.addScaledVector(state.vel, dt);
        camera.position.x = clamp(camera.position.x, -110, 110);
        camera.position.z = clamp(camera.position.z, -100, 110);
        camera.position.y = clamp(camera.position.y, 1.2, 95);
      }
      updateCharacterTransform(dt, 0, false);
      return;
    }

    /* Human mode */
    // Elevator ride overrides normal movement
    if (state.elevatorRiding) {
      updateElevator(dt);
      camera.position.set(state.feet.x, state.feet.y + EYE_H, state.feet.z);
      applyCameraAngles();
      updateCharacterTransform(dt, 0, false);
      return;
    }

    applyCameraAngles();
    const walkSpeed = state.keys.has('Shift') ? 6.2 : 3.4;
    const fwdX = -Math.sin(state.yaw), fwdZ = -Math.cos(state.yaw);
    const rightX = Math.cos(state.yaw), rightZ = -Math.sin(state.yaw);
    let mx = 0, mz = 0;
    if (state.keys.has('KeyW') || state.keys.has('ArrowUp')) { mx += fwdX; mz += fwdZ; }
    if (state.keys.has('KeyS') || state.keys.has('ArrowDown')) { mx -= fwdX; mz -= fwdZ; }
    if (state.keys.has('KeyD') || state.keys.has('ArrowRight')) { mx += rightX; mz += rightZ; }
    if (state.keys.has('KeyA') || state.keys.has('ArrowLeft')) { mx -= rightX; mz -= rightZ; }
    if (state.mobileMove.x || state.mobileMove.y) {
      mx += fwdX * state.mobileMove.y + rightX * state.mobileMove.x;
      mz += fwdZ * state.mobileMove.y + rightZ * state.mobileMove.x;
    }
    const mlen = Math.hypot(mx, mz);
    if (mlen > 1e-4) { mx = (mx / mlen) * walkSpeed; mz = (mz / mlen) * walkSpeed; }

    state.vel.x += (mx - state.vel.x) * Math.min(1, dt * 12);
    state.vel.z += (mz - state.vel.z) * Math.min(1, dt * 12);
    state.feet.x += state.vel.x * dt;
    state.feet.z += state.vel.z * dt;

    resolveCollisions(state.feet, state.feet.y);

    const floorY = floorHeightAt(state.feet.x, state.feet.z, state.feet.y);
    state.vy -= GRAVITY * dt;
    state.feet.y += state.vy * dt;
    if (state.feet.y <= floorY) {
      state.feet.y = floorY;
      state.vy = 0;
      state.grounded = true;
    } else if (state.feet.y - floorY < 0.25 && state.vy <= 0) {
      state.feet.y = floorY;
      state.vy = 0;
      state.grounded = true;
    } else {
      state.grounded = false;
    }

    const horizSpeed = Math.hypot(state.vel.x, state.vel.z);
    const bobY = state.grounded && horizSpeed > 0.2
      ? Math.sin(performance.now() * 0.011) * Math.min(0.035, horizSpeed * 0.008)
      : 0;
    camera.position.set(state.feet.x, state.feet.y + EYE_H + bobY, state.feet.z);
    updateCharacterTransform(dt, horizSpeed, !state.grounded);
  }

  function setMobileMove(x, y) {
    state.mobileMove.x = clamp(x, -1, 1);
    state.mobileMove.y = clamp(y, -1, 1);
    if ((x || y) && state.tour) {
      state.tour = false;
      onStateChange(getState());
    }
  }

  function jump() {
    if (state.mode === 'human' && state.grounded && !state.elevatorRiding) {
      state.vy = JUMP_V;
      state.grounded = false;
    }
  }

  return {
    update,
    setMode,
    setTour,
    goToViewpoint,
    lookAt,
    setHumanPose,
    setMobileMove,
    jump,
    useElevator: tryUseElevator,
    getState,
    getPlayerPos,
    setElevatorRef,
    requestPointerLock: requestPointerLockSafe,
  };
}
