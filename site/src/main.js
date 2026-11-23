/* Main entry point: WebGLRenderer (AgX + PMREM sky IBL + soft shadows + FogExp2),
   EffectComposer (UnrealBloomPass threshold 0.92 / strength 0.22 + SMAAPass + OutputPass),
   building/interior/site/character assembly, time-of-day presets, quality scaling,
   UI bindings, viewpoints and automation hooks. */

import * as THREE from 'three';
import {
  TIME_MODES, createSky, sunDirection, makeMaterials, updateCachedMaterialsEnv, PODIUM, LAYOUT, loadHDR,
} from './core.js';
import { buildBuilding, buildInteriorShell } from './building.js';
import { buildInteriors } from './interior.js';
import { buildSite } from './site.js';
import { buildCharacter } from './character.js';
import { createController, VIEWPOINTS } from './controls.js';

/* ---- Postprocessing ---- */
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { N8AOPass } from '../vendor/n8ao/N8AO.js';

const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = window.innerWidth <= 640 || /iPhone|Android|Mobile/i.test(navigator.userAgent);

const canvas = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false, // SMAA replaces native AA for better perf
  powerPreference: 'high-performance',
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping ?? THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xbcd0de, 0.0032);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.08, 2400);

/* --------------------------------------------------------------- sky & IBL */
const sky = createSky();
scene.add(sky.mesh);

const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileCubemapShader();
const envScene = new THREE.Scene();
const envSky = createSky();
envScene.add(envSky.mesh);
let currentEnvRT = null;
let outdoorHdrRT = null;
let indoorHdrRT = null;
let indoorProbeRT = null;
let lastIndoor = false;

const cubeRT = new THREE.WebGLCubeRenderTarget(256, {
  generateMipmaps: true,
  minFilter: THREE.LinearMipmapLinearFilter,
  type: THREE.HalfFloatType,
});
const indoorCubeCam = new THREE.CubeCamera(0.2, 120, cubeRT);
indoorCubeCam.position.set(0, PODIUM + 2.2, 4.2);

const _wingSin = Math.sin(LAYOUT.wing.az);
const _wingCos = Math.cos(LAYOUT.wing.az);
function isCameraIndoors(pos) {
  if (!pos) return false;
  const { x, y, z } = pos;
  if (y < PODIUM - 0.5 || y > PODIUM + 16.5) return false;
  const r = Math.hypot(x, z);
  if (r <= 10.8) return true;
  if (r <= 18.6 && z > -2 && y <= PODIUM + 4.8) return true;
  const B = LAYOUT.block;
  if (x >= B.x0 - 0.4 && x <= B.x1 + 0.4 && z >= B.z0 - 0.4 && z <= B.z1 + 0.4) return true;
  const s = x * _wingSin - z * _wingCos;
  const t = x * _wingCos + z * _wingSin;
  const W = LAYOUT.wing;
  return s >= W.s0 - 0.4 && s <= W.s1 + 0.4 && Math.abs(t) <= W.half + 0.4;
}

function setMaterialsEnv(envTex) {
  scene.environment = envTex;
  for (const k of Object.keys(M)) {
    if (M[k] && (M[k].isMeshStandardMaterial || M[k].isMeshPhysicalMaterial)) {
      M[k].envMap = envTex;
    }
  }
  updateCachedMaterialsEnv(envTex);
}

function applyEnvironment() {
  const indoor = isCameraIndoors(camera.position);
  lastIndoor = indoor;
  const mode = TIME_MODES[timeKey || 'day'];
  const isNight = !!mode.night;
  const isGolden = timeKey === 'golden';
  let envTex = currentEnvRT ? currentEnvRT.texture : null;
  if (indoor) {
    envTex = indoorProbeRT ? indoorProbeRT.texture : (indoorHdrRT ? indoorHdrRT.texture : envTex);
  } else if (timeKey === 'day' && outdoorHdrRT) {
    envTex = outdoorHdrRT.texture;
  }
  if ('environmentIntensity' in scene) {
    scene.environmentIntensity = indoor ? (isNight ? 0.45 : 0.72) : 1.0;
  }
  if (typeof hemiLight !== 'undefined') {
    hemiLight.intensity = indoor ? (isNight ? 0.14 : isGolden ? 0.18 : 0.26) : mode.ambI;
  }
  if (typeof n8aoPass !== 'undefined') {
    n8aoPass.configuration.intensity = indoor ? 2.9 : 2.5;
  }
  if (envTex) setMaterialsEnv(envTex);
}

function captureIndoorProbe() {
  const probeBase = indoorHdrRT ? indoorHdrRT.texture : (currentEnvRT ? currentEnvRT.texture : null);
  const prevCharVis = character.root.visible;
  character.root.visible = false;
  if (probeBase) setMaterialsEnv(probeBase);
  indoorCubeCam.update(renderer, scene);
  const nextProbe = pmrem.fromCubemap(cubeRT.texture);
  if (indoorProbeRT) indoorProbeRT.dispose();
  indoorProbeRT = nextProbe;
  character.root.visible = prevCharVis;
  applyEnvironment();
}

function rebuildEnv(mode) {
  const sdir = sunDirection(mode);
  for (const s of [sky, envSky]) {
    s.uniforms.uZenith.value.setHex(mode.zenith);
    s.uniforms.uHorizon.value.setHex(mode.horizon);
    s.uniforms.uGround.value.setHex(mode.ground);
    s.uniforms.uSunColor.value.setHex(mode.sun);
    s.uniforms.uSunDir.value.copy(sdir);
    s.uniforms.uCloud.value = mode.cloud;
    s.uniforms.uHaze.value = mode.haze;
  }
  const nextRT = pmrem.fromScene(envScene, 0.04);
  if (currentEnvRT) currentEnvRT.dispose();
  currentEnvRT = nextRT;
  scene.environment = currentEnvRT.texture;
  return currentEnvRT.texture;
}

/* ------------------------------------------------------------------ lights */
const sunLight = new THREE.DirectionalLight(0xfff2dc, 3.4);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 10;
sunLight.shadow.camera.far = 260;
const D = 72;
sunLight.shadow.camera.left = -D;
sunLight.shadow.camera.right = D;
sunLight.shadow.camera.top = D;
sunLight.shadow.camera.bottom = -D;
sunLight.shadow.bias = -0.00045;
sunLight.shadow.normalBias = 0.04;
scene.add(sunLight);

const hemiLight = new THREE.HemisphereLight(0x9fc0e0, 0x6b6458, 0.85);
scene.add(hemiLight);

// Architectural uplights
const nightLights = [];
for (const [x, y, z, col, dist] of [
  [0, PODIUM + 2.6, 17.2, 0xffe4b8, 24],
  [-11, PODIUM + 2.4, 13.5, 0xffe0aa, 22],
  [11, PODIUM + 2.4, 13.5, 0xffe0aa, 22],
  [0, PODIUM + 18.2, 11.2, 0x4aa8ff, 22],
]) {
  const l = new THREE.PointLight(col, 0, dist, 1.8);
  l.position.set(x, y, z);
  scene.add(l);
  nightLights.push(l);
}

/* ------------------------------------------------------------------- world */
const initialEnv = rebuildEnv(TIME_MODES.day);
const M = makeMaterials(initialEnv);
const colliders = [];

buildBuilding(scene, M, colliders);
buildInteriorShell(scene, M);
const interior = buildInteriors(scene, M, colliders);
const { flagGroup } = buildSite(scene, M, nightLights);

const character = buildCharacter();
character.root.visible = false;
scene.add(character.root);

/* ---- Resolve interior return contract (Group, or {group, lights, update}) ---- */
const interiorGroup = interior instanceof THREE.Group ? interior : (interior && interior.group ? interior.group : interior);
const interiorLights = (interior && interior.lights) ? interior.lights : (interiorGroup && interiorGroup.userData && interiorGroup.userData.lights) || [];
const interiorUpdate = (interior && typeof interior.update === 'function') ? interior.update : (interiorGroup && interiorGroup.userData && typeof interiorGroup.userData.update === 'function') ? interiorGroup.userData.update : null;

/* --------------------------------------------------------- postprocessing */
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const n8aoPass = new N8AOPass(scene, camera, window.innerWidth, window.innerHeight);
n8aoPass.configuration.aoRadius = 1.6;
n8aoPass.configuration.distanceFalloff = 0.8;
n8aoPass.configuration.intensity = 2.6;
n8aoPass.configuration.halfRes = false;
n8aoPass.configuration.aoSamples = 16;
n8aoPass.configuration.denoiseSamples = 8;
n8aoPass.configuration.denoiseRadius = 8;
n8aoPass.configuration.gammaCorrection = false;
composer.addPass(n8aoPass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.22,   // strength — subtle, only on bright emissives
  0.55,   // softer radius
  1.05    // threshold — avoid sunlit white/glass blowout
);
composer.addPass(bloomPass);

const smaaPass = new SMAAPass(window.innerWidth, window.innerHeight);
composer.addPass(smaaPass);

const outputPass = new OutputPass();
composer.addPass(outputPass);

/* ----------------------------------------------------------------- quality */
let quality = isMobile ? 'med' : 'high';
function setQuality(q) {
  if (q !== 'high' && q !== 'med' && q !== 'low') return;
  quality = q;
  const maxDpr = q === 'high' ? 2 : q === 'med' ? 1.5 : 1;
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.setPixelRatio(dpr);

  n8aoPass.enabled = q !== 'low';
  n8aoPass.configuration.halfRes = q === 'med';
  n8aoPass.configuration.aoSamples = q === 'high' ? 16 : 12;
  renderPass.enabled = !n8aoPass.enabled;

  bloomPass.resolution.set(Math.round(window.innerWidth * dpr), Math.round(window.innerHeight * dpr));

  const shadowRes = q === 'high' ? 2048 : q === 'med' ? 1024 : 512;
  if (sunLight.shadow.mapSize.x !== shadowRes) {
    sunLight.shadow.mapSize.set(shadowRes, shadowRes);
    if (sunLight.shadow.map) {
      sunLight.shadow.map.dispose();
      sunLight.shadow.map = null;
    }
  }
  syncUI();
}

/* ------------------------------------------------------------- time of day */
let timeKey = null;
function setTime(key) {
  const mode = TIME_MODES[key];
  if (!mode) return;
  const skipEnv = (timeKey === null && key === 'day' && currentEnvRT);
  timeKey = key;
  if (!skipEnv) rebuildEnv(mode);
  const sdir = sunDirection(mode);
  sunLight.position.copy(sdir).multiplyScalar(135);
  sunLight.color.setHex(mode.sun);
  sunLight.intensity = mode.sunI;

  hemiLight.color.setHex(mode.amb);
  hemiLight.groundColor.setHex(mode.ground);
  hemiLight.intensity = mode.ambI;
  applyEnvironment();

  scene.fog.color.setHex(mode.fog);
  scene.fog.density = mode.fogD;
  renderer.toneMappingExposure = mode.exposure;

  const isNight = !!mode.night;
  const isGolden = key === 'golden';
  const lampPower = isNight ? 18 : isGolden ? 5 : 0;
  for (const l of nightLights) {
    l.intensity = lampPower;
    l.visible = lampPower > 0;
  }

  const intPower = isNight ? 18 : isGolden ? 14 : 12;
  for (const l of interiorLights) {
    l.intensity = intPower * (l.userData.weight ?? 0.40);
    l.distance = l.userData.dist ?? 20;
    l.decay = 1.6;
  }

  if (M.lampGlow) M.lampGlow.emissiveIntensity = isNight ? 1.85 : isGolden ? 1.25 : 0.95;
  if (M.parkLampGlobe) M.parkLampGlobe.emissiveIntensity = isNight ? 1.9 : isGolden ? 1.15 : 0.25;
  if (M.lampPanel) M.lampPanel.emissiveIntensity = isNight ? 1.55 : 1.12;

  // Adjust bloom for time of day
  bloomPass.strength = isNight ? 0.30 : isGolden ? 0.25 : 0.22;

  syncUI();
}

/* ---------------------------------------------------------------------- UI */
const $ = (id) => document.getElementById(id);
const modeBtns = document.querySelectorAll('[data-mode]');
const timeBtns = document.querySelectorAll('[data-time]');
const viewBtns = document.querySelectorAll('[data-view]');
const tourBtn = $('btn-tour');
const qualBtn = $('btn-quality');
const helpBtn = $('btn-help');
const helpCard = $('help-card');
const helpText = $('help-text');
const mobilePad = $('mobile-pad');
const mobileActions = $('mobile-actions');
const mobileJumpBtn = $('btn-mobile-jump');
const mobileElevatorBtn = $('btn-mobile-elevator');

if (isMobile && helpCard) helpCard.classList.add('hidden');

let controller = null;

function syncUI(passedState) {
  const st = passedState || (controller ? controller.getState() : null);
  if (!st) return;
  modeBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === st.mode));
  timeBtns.forEach((b) => b.classList.toggle('active', b.dataset.time === timeKey));
  if (tourBtn) tourBtn.classList.toggle('active', st.tour && st.mode === 'drone');
  if (qualBtn) {
    qualBtn.textContent = quality === 'high' ? 'HD' : quality === 'med' ? 'STD' : 'ECO';
    qualBtn.title = `Качество графики: ${quality.toUpperCase()}`;
  }
  if (helpText) {
    helpText.innerHTML = st.mode === 'drone'
      ? '<b>Дрон:</b> WASD — пролёт · Q/E — высота · Shift — быстрее · Мышь — обзор · Колесо — зум'
      : '<b>Человек:</b> WASD — шаг · Shift — быстрее · Space — прыжок · E — лифт · Клик — захват мыши';
  }
  if (mobilePad) {
    mobilePad.classList.toggle('visible', isMobile && st.mode === 'human');
  }
  if (mobileActions) {
    mobileActions.classList.toggle('visible', isMobile && st.mode === 'human');
  }
}

/* -------------------------------------------------------------- controller */
controller = createController(camera, canvas, colliders, character, {
  reducedMotion,
  onStateChange: (st) => syncUI(st),
});
if (interiorGroup && interiorGroup.userData && interiorGroup.userData.elevator && controller.setElevatorRef) {
  const ev = interiorGroup.userData.elevator;
  controller.setElevatorRef(ev.cabin, ev.doorParts, ev.levels);
}

modeBtns.forEach((b) => b.addEventListener('click', () => controller.setMode(b.dataset.mode)));
timeBtns.forEach((b) => b.addEventListener('click', () => setTime(b.dataset.time)));
viewBtns.forEach((b) => b.addEventListener('click', () => {
  viewBtns.forEach((x) => x.classList.remove('active'));
  b.classList.add('active');
  controller.goToViewpoint(b.dataset.view);
}));
if (tourBtn) tourBtn.addEventListener('click', () => controller.setTour(!controller.getState().tour));
if (qualBtn) qualBtn.addEventListener('click', () => {
  const order = ['high', 'med', 'low'];
  setQuality(order[(order.indexOf(quality) + 1) % order.length]);
});
if (helpBtn && helpCard) {
  helpBtn.addEventListener('click', () => helpCard.classList.toggle('hidden'));
}

// Mobile virtual joystick
if (mobilePad) {
  const knob = mobilePad.querySelector('.pad-knob');
  let padTouch = null;
  let cx = 0, cy = 0;
  const maxR = 32;
  mobilePad.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    padTouch = e.pointerId;
    const r = mobilePad.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    mobilePad.setPointerCapture(e.pointerId);
  });
  mobilePad.addEventListener('pointermove', (e) => {
    if (e.pointerId !== padTouch) return;
    e.stopPropagation();
    const dx = Math.max(-maxR, Math.min(maxR, e.clientX - cx));
    const dy = Math.max(-maxR, Math.min(maxR, e.clientY - cy));
    if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
    controller.setMobileMove(dx / maxR, -dy / maxR);
  });
  const endPad = (e) => {
    if (e.pointerId !== padTouch) return;
    padTouch = null;
    if (knob) knob.style.transform = 'translate(0px, 0px)';
    controller.setMobileMove(0, 0);
  };
  mobilePad.addEventListener('pointerup', endPad);
  mobilePad.addEventListener('pointercancel', endPad);
}

if (mobileJumpBtn) {
  mobileJumpBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    controller.jump();
  });
}
if (mobileElevatorBtn) {
  mobileElevatorBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    controller.useElevator();
  });
}

/* ------------------------------------------------------------------ resize */
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  setQuality(quality);
}
window.addEventListener('resize', onResize);

setQuality(quality);
setTime('day');

// Async dual PMREM HDRI loading + indoor CubeCamera probe capture
loadHDR('./assets/hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr', pmrem)
  .then((hdr) => {
    outdoorHdrRT = hdr.renderTarget;
    applyEnvironment();
  })
  .catch(() => {});

const interiorReady = (interiorGroup && interiorGroup.userData && interiorGroup.userData.ready) || Promise.resolve();
Promise.all([
  loadHDR('./assets/hdri/newman_lobby_1k.hdr', pmrem).catch(() => null),
  interiorReady,
]).then(([hdr]) => {
  if (hdr) indoorHdrRT = hdr.renderTarget;
  captureIndoorProbe();
});

/* -------------------------------------------------------------------- loop */
const flagMeshes = [];
if (flagGroup) {
  flagGroup.traverse((o) => {
    if (o.isMesh && o.userData.wave !== undefined) {
      o.userData.baseZ = Float32Array.from(o.geometry.attributes.position.array);
      flagMeshes.push(o);
    }
  });
}

let lastT = performance.now();
let elapsed = 0;

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.max(0, Math.min(0.05, (now - lastT) / 1000));
  lastT = now;
  elapsed += dt;

  controller.update(dt);

  const nowIndoor = isCameraIndoors(camera.position);
  if (nowIndoor !== lastIndoor) applyEnvironment();

  // Interior update (pass player position for proximity interactions)
  if (interiorUpdate) {
    const playerPos = controller.getPlayerPos ? controller.getPlayerPos() : null;
    interiorUpdate(dt, playerPos);
  }

  // Subtle cloth wave on flags
  if (!reducedMotion && flagMeshes.length) {
    for (const f of flagMeshes) {
      const pos = f.geometry.attributes.position;
      const base = f.userData.baseZ;
      const ph = f.userData.wave + elapsed * 3.1;
      for (let i = 0; i < pos.count; i++) {
        const u = (pos.getX(i) + 1.3) / 2.6;
        pos.setZ(i, base[i * 3 + 2] + Math.sin(u * 6.2 - ph) * 0.14 * u);
      }
      pos.needsUpdate = true;
      f.geometry.computeVertexNormals();
    }
  }

  // Render through the postprocessing composer
  composer.render(dt);
}

// Hide preloader smoothly
const loader = $('loader');
if (loader) {
  requestAnimationFrame(() => {
    loader.classList.add('done');
    setTimeout(() => loader.remove(), 450);
  });
}

// Expose automation & diagnostic API
window.__app = {
  setMode: (m, o) => controller.setMode(m, o),
  setTime: (k) => setTime(k),
  setQuality: (q) => setQuality(q),
  setTour: (v) => controller.setTour(v),
  goTo: (id, instant = true) => controller.goToViewpoint(id, instant),
  look: (px, py, pz, tx, ty, tz) => controller.lookAt(px, py, pz, tx, ty, tz),
  setHumanPose: (x, y, z, yaw, pitch, speed = 0) => controller.setHumanPose(x, y, z, yaw, pitch, speed),
  viewpoints: Object.keys(VIEWPOINTS),
  stats: () => ({
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    mode: controller.getState().mode,
    time: timeKey,
    quality,
  }),
};

requestAnimationFrame(animate);
window.__ready = true;
