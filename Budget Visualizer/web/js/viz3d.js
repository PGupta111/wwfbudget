// West Windsor 2026 Budget Visualizer — interactive 3D engine.
//
// One cinematic WebGL stage with several switchable views of the same verified
// data:
//   • "bars"     — a ring of glowing columns (height ∝ spending) around a
//                  luminous budget core, with particle streams flowing out.
//   • "pie"      — a 3D pie of spending categories (angle ∝ spending).
//   • "revenue"  — a 3D pie of where the money comes from.
// Plus a guided camera tour, a cinematic load reveal, hover tooltips, a
// click-to-focus detail panel, and a graceful no-WebGL fallback.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import {
  compactDollars,
  dollars,
  getSpendingByGroup,
  getRevenueSources,
  getDepartmentBreakdown,
  getMiscRevenueBreakdown,
  GROUP_DETAILS,
  REVENUE_DETAILS,
} from "./helpers.js";

const BG_TOP = "#3c618f";
const BG_BOTTOM = "#16294a";

export function isWebGLAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl2") || canvas.getContext("webgl"))
    );
  } catch (e) {
    return false;
  }
}

function resolveColorHex(cssColor) {
  let value = cssColor;
  if (typeof cssColor === "string" && cssColor.startsWith("var(")) {
    const name = cssColor.slice(4, -1).trim();
    value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  return new THREE.Color(value || "#64748b");
}

function makeBackgroundTexture(top, bottom) {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const ease = (x) => 1 - Math.pow(1 - x, 3);

export function initBudget3D(data, opts = {}) {
  const canvas = document.getElementById(opts.canvasId || "budget-3d");
  if (!canvas || !isWebGLAvailable()) return null;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- Data views ----------------------------------------------------------
  const totalBudget = data.headline.total_budget.amount;
  const spending = getSpendingByGroup(data);
  const revenue = getRevenueSources(data);
  const spendingTotal = spending.reduce((s, g) => s + g.amount, 0);
  const revenueTotal = revenue.reduce((s, r) => s + r.amount, 0);

  function spendingItems() {
    return spending.map((g) => ({
      name: g.group,
      amount: g.amount,
      pct: (g.amount / totalBudget) * 100,
      color: resolveColorHex(g.color),
      blurb: GROUP_DETAILS[g.group] || g.blurb || "",
      kind: "Spending category",
      getBreakdown: () => getDepartmentBreakdown(data, g.group).slice(0, 8),
    }));
  }
  function revenueItems() {
    return revenue.map((r) => ({
      name: r.label,
      amount: r.amount,
      pct: (r.amount / revenueTotal) * 100,
      color: resolveColorHex(r.color),
      blurb: REVENUE_DETAILS[r.label] || "",
      kind: "Revenue source",
      getBreakdown: () =>
        r.label === "Fees, state aid & other revenue"
          ? getMiscRevenueBreakdown(data).slice(0, 8)
          : [],
    }));
  }

  // ---- Renderer / scene / camera -------------------------------------------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = makeBackgroundTexture(BG_TOP, BG_BOTTOM);
  scene.fog = new THREE.FogExp2(0x21406e, 0.012);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
  // Per-mode "home" camera framing.
  const HOMES = {
    bars: { pos: new THREE.Vector3(0.5, 12, 23), target: new THREE.Vector3(0, 3.6, 0) },
    pie: { pos: new THREE.Vector3(0, 17, 17), target: new THREE.Vector3(0, 0.8, 0) },
    revenue: { pos: new THREE.Vector3(0, 16, 16), target: new THREE.Vector3(0, 0.8, 0) },
  };

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.enableZoom = false; // custom wheel handling below (so the page can scroll at the zoom limits)
  controls.minDistance = 11;
  controls.maxDistance = 46;
  controls.maxPolarAngle = Math.PI * 0.46; // stay off a dead-on horizon to avoid plane shimmer
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.5;

  // Custom wheel zoom: zoom within range, but once fully zoomed out (or in),
  // release the wheel so the page scrolls instead of trapping the user.
  canvas.addEventListener(
    "wheel",
    (e) => {
      const offset = camera.position.clone().sub(controls.target);
      const dist = offset.length();
      const out = e.deltaY > 0;
      if ((out && dist >= controls.maxDistance - 0.05) || (!out && dist <= controls.minDistance + 0.05)) {
        return; // at the limit in the scroll direction — let the page scroll
      }
      e.preventDefault();
      const next = THREE.MathUtils.clamp(dist * Math.exp(e.deltaY * 0.0012), controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(offset.setLength(next));
    },
    { passive: false }
  );

  // ---- Lighting / ground (persistent) --------------------------------------
  scene.add(new THREE.HemisphereLight(0xd2e6ff, 0x16294a, 0.8));
  scene.add(new THREE.AmbientLight(0xffffff, 0.32));

  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(10, 20, 12);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 80;
  key.shadow.camera.left = -24;
  key.shadow.camera.right = 24;
  key.shadow.camera.top = 24;
  key.shadow.camera.bottom = -24;
  key.shadow.bias = -0.0004;
  scene.add(key);

  const rimCyan = new THREE.PointLight(0x22d3ee, 80, 60);
  rimCyan.position.set(-16, 6, -10);
  scene.add(rimCyan);
  const rimViolet = new THREE.PointLight(0x8b5cf6, 70, 60);
  rimViolet.position.set(15, 5, -14);
  scene.add(rimViolet);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(60, 96),
    // polygonOffset pushes the ground slightly back in the depth buffer so the
    // grid lines drawn just above it never z-fight (the flicker at grazing angles).
    new THREE.MeshStandardMaterial({
      color: 0x223d68,
      roughness: 0.8,
      metalness: 0.18,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.PolarGridHelper(20, 16, 8, 96, 0x5a82b8, 0x3a5887);
  grid.material.transparent = true;
  grid.material.opacity = 0.45;
  // Lift the grid clear of the ground and stop it writing depth, so the two
  // coplanar surfaces can't fight for the same pixels as the camera orbits.
  grid.material.depthWrite = false;
  grid.position.y = 0.06;
  grid.renderOrder = 1;
  scene.add(grid);

  // ---- Content group (mode-specific) ---------------------------------------
  const content = new THREE.Group();
  scene.add(content);

  let mode = "bars";
  let interactives = []; // { mesh, name, amount, pct, blurb, color, kind, top, midDir, getBreakdown }
  let particles = [];
  let points = null;
  let core = null;
  let rings = [];
  let introT = 0;
  const _v = new THREE.Vector3();
  const coreTop = new THREE.Vector3(0, 4.6, 0);

  function disposeMesh(obj) {
    obj.traverse?.((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => m.dispose());
      }
    });
  }

  function clearContent() {
    hovered = null;
    selected = null;
    hideTooltip();
    while (content.children.length) {
      const c = content.children.pop();
      disposeMesh(c);
    }
    if (points) {
      points.geometry.dispose();
      points.material.dispose();
      points = null;
    }
    particles = [];
    interactives = [];
    core = null;
    rings = [];
    // remove labels
    labelEls.forEach((el) => el.remove());
    labelEls.length = 0;
  }

  // ---- Builders ------------------------------------------------------------
  function buildBars() {
    const maxAmount = Math.max(...spending.map((g) => g.amount));
    const ringRadius = 9.2;
    const items = spendingItems();
    const geoCache = new Map();

    items.forEach((it, i) => {
      const angle = (i / items.length) * Math.PI * 2;
      const cx = Math.cos(angle) * ringRadius;
      const cz = Math.sin(angle) * ringRadius;
      const h = 0.6 + Math.sqrt(it.amount / maxAmount) * 8.2;
      const w = 1.7;
      const cacheKey = h.toFixed(2);
      let geo = geoCache.get(cacheKey);
      if (!geo) {
        geo = new RoundedBoxGeometry(w, h, w, 4, 0.18);
        geo.translate(0, h / 2, 0);
        geoCache.set(cacheKey, geo);
      }
      const mat = new THREE.MeshStandardMaterial({
        color: it.color,
        emissive: it.color.clone().multiplyScalar(0.6),
        emissiveIntensity: 0.35,
        roughness: 0.32,
        metalness: 0.55,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(cx, 0, cz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.scale.y = reduceMotion ? 1 : 0.0001;
      content.add(mesh);

      const pad = new THREE.Mesh(
        new THREE.CircleGeometry(1.5, 40),
        new THREE.MeshBasicMaterial({ color: it.color, transparent: true, opacity: 0.12 })
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(cx, 0.02, cz);
      content.add(pad);

      interactives.push({
        ...it,
        mesh,
        mat,
        baseEmissive: 0.35,
        height: h,
        top: new THREE.Vector3(cx, h, cz),
        homePos: new THREE.Vector3(cx, 0, cz),
        midDir: new THREE.Vector3(cx, 0, cz).normalize(),
      });
    });

    // Core + rings.
    core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.3, 2),
      new THREE.MeshStandardMaterial({
        color: 0x0ea5e9,
        emissive: 0x38bdf8,
        emissiveIntensity: 1.05,
        roughness: 0.25,
        metalness: 0.4,
      })
    );
    core.position.y = 3.0;
    core.castShadow = true;
    content.add(core);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.55,
      roughness: 0.3,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.06, 16, 120), ringMat);
    ring.position.y = 3.0;
    ring.rotation.x = Math.PI / 2;
    content.add(ring);
    const ring2 = ring.clone();
    ring2.scale.setScalar(1.35);
    ring2.rotation.x = Math.PI / 2.6;
    content.add(ring2);
    rings = [ring, ring2];

    buildParticles();
    buildLabels((it) => it.top.clone().add(new THREE.Vector3(0, 0.9, 0)));
  }

  function buildParticles() {
    const PARTICLES = reduceMotion ? 0 : Math.min(1600, 110 * interactives.length);
    if (PARTICLES <= 0) return;
    const positions = new Float32Array(PARTICLES * 3);
    const colors = new Float32Array(PARTICLES * 3);
    const totalCol = interactives.reduce((s, c) => s + c.amount, 0);
    let p = 0;
    for (const col of interactives) {
      const count = Math.max(8, Math.round((col.amount / totalCol) * PARTICLES));
      const ctrl = new THREE.Vector3(col.top.x * 0.45, 9 + Math.random() * 2, col.top.z * 0.45);
      for (let k = 0; k < count && p < PARTICLES; k++, p++) {
        particles.push({ col, ctrl, t: Math.random(), speed: 0.12 + Math.random() * 0.16 });
        colors[p * 3] = col.color.r;
        colors[p * 3 + 1] = col.color.g;
        colors[p * 3 + 2] = col.color.b;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors.subarray(0, particles.length * 3), 3));
    geo.setDrawRange(0, particles.length);
    points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.16,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      })
    );
    content.add(points);
  }

  function buildPie(items, total, { radius = 6.6, height = 1.7 } = {}) {
    let a0 = -Math.PI / 2;
    items.forEach((it) => {
      const frac = it.amount / total;
      const span = Math.max(frac * Math.PI * 2, 0.012);
      const a1 = a0 + span;
      const mid = (a0 + a1) / 2;
      const geo = new THREE.CylinderGeometry(radius, radius, height, 64, 1, false, a0, span);
      geo.translate(0, height / 2, 0);
      const mat = new THREE.MeshStandardMaterial({
        color: it.color,
        emissive: it.color.clone().multiplyScalar(0.55),
        emissiveIntensity: 0.32,
        roughness: 0.34,
        metalness: 0.5,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const midDir = new THREE.Vector3(Math.cos(mid), 0, Math.sin(mid));
      mesh.scale.setScalar(reduceMotion ? 1 : 0.0001);
      content.add(mesh);

      interactives.push({
        ...it,
        mesh,
        mat,
        baseEmissive: 0.32,
        height,
        midDir,
        homePos: new THREE.Vector3(0, 0, 0),
        top: midDir.clone().multiplyScalar(radius * 0.62).setY(height + 0.15),
      });
      a0 = a1;
    });
    buildLabels((it) => it.midDir.clone().multiplyScalar(radius * 0.66).setY(height + 0.5));
  }

  // ---- Labels (HTML projected) ---------------------------------------------
  const labelLayer = opts.labelLayer || document.getElementById("stage-labels");
  const labelEls = [];
  let labelAnchor = () => new THREE.Vector3();
  function buildLabels(anchorFn) {
    labelAnchor = anchorFn;
    if (!labelLayer) return;
    interactives.forEach((it) => {
      const el = document.createElement("div");
      el.className = "stage-label";
      el.innerHTML = `<span>${compactDollars(it.amount)}</span>`;
      el.style.borderColor = `#${it.color.getHexString()}`;
      labelLayer.appendChild(el);
      labelEls.push(el);
      it.labelEl = el;
    });
  }

  // ---- Post-processing -----------------------------------------------------
  // Render into a multisampled target so edges keep their antialiasing through
  // the bloom pass (otherwise thin bars/grid lines crawl and shimmer — read as
  // "flicker" — while the scene auto-rotates). `samples` is a no-op on WebGL1.
  const composerTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, composerTarget);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.5, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---- Interaction ---------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered = null;
  let selected = null;
  const tooltip = opts.tooltip || document.getElementById("stage-tooltip");
  let pointerClient = { x: 0, y: 0 };

  function setPointerFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    pointerClient = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    pointer.x = (pointerClient.x / rect.width) * 2 - 1;
    pointer.y = -(pointerClient.y / rect.height) * 2 + 1;
  }
  function pick() {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(interactives.map((c) => c.mesh), false);
    if (!hits.length) return null;
    return interactives.find((c) => c.mesh === hits[0].object) || null;
  }
  function showTooltip(it) {
    if (!tooltip || !it) return;
    tooltip.innerHTML = `
      <span class="t3d-swatch" style="background:#${it.color.getHexString()}"></span>
      <span class="t3d-name">${it.name}</span>
      <span class="t3d-amount">${dollars(it.amount, 0)} · ${it.pct.toFixed(1)}%</span>`;
    tooltip.style.left = `${pointerClient.x}px`;
    tooltip.style.top = `${pointerClient.y}px`;
    tooltip.classList.add("visible");
  }
  function hideTooltip() {
    if (tooltip) tooltip.classList.remove("visible");
  }
  function setHover(it) {
    if (hovered === it) return;
    hovered = it;
    canvas.style.cursor = it ? "pointer" : "grab";
    if (!it) hideTooltip();
  }
  function onPointerMove(e) {
    setPointerFromEvent(e);
    const it = pick();
    setHover(it);
    if (it) showTooltip(it);
  }
  function buildDetail(it) {
    return {
      group: it.name,
      kind: it.kind,
      amount: it.amount,
      pct: it.pct,
      blurb: it.blurb,
      colorHex: `#${it.color.getHexString()}`,
      breakdown: it.getBreakdown ? it.getBreakdown() : [],
    };
  }
  function selectItem(it, flyDur = 900) {
    selected = it;
    interactives.forEach((c) => (c.selectedFlag = c === it));
    if (opts.onSelect) opts.onSelect(it ? buildDetail(it) : null);
    if (it) {
      const off = it.midDir.clone().multiplyScalar(mode === "bars" ? 4 : 9);
      flyTo(
        new THREE.Vector3(off.x + it.midDir.x * 6, (it.height || 4) + 6, off.z + it.midDir.z * 6 + 2),
        new THREE.Vector3(it.midDir.x * (mode === "bars" ? 5 : 3), (it.height || 3) * 0.5, it.midDir.z * (mode === "bars" ? 5 : 3)),
        flyDur
      );
    }
  }
  function onClick(e) {
    cancelTour();
    setPointerFromEvent(e);
    const it = pick();
    selectItem(it && it === selected ? null : it);
  }

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", () => {
    canvas.style.cursor = "grabbing";
    cancelTour();
  });
  canvas.addEventListener("pointerup", () => (canvas.style.cursor = hovered ? "pointer" : "grab"));
  canvas.addEventListener("click", onClick);
  canvas.addEventListener("pointerleave", () => {
    setHover(null);
    hideTooltip();
  });

  // ---- Camera fly-to + tour ------------------------------------------------
  let fly = null;
  let rotateOn = !reduceMotion;
  function flyTo(pos, target, dur = 900) {
    fly = {
      fromPos: camera.position.clone(),
      toPos: pos.clone(),
      fromTgt: controls.target.clone(),
      toTgt: target.clone(),
      start: performance.now(),
      dur,
    };
    controls.autoRotate = false;
  }

  let tourTimers = [];
  let touring = false;
  function cancelTour() {
    if (!touring) return;
    touring = false;
    tourTimers.forEach((t) => clearTimeout(t));
    tourTimers = [];
    controls.autoRotate = rotateOn;
    opts.onTour?.(false);
  }
  function startTour() {
    cancelTour();
    if (!interactives.length) return;
    touring = true;
    opts.onTour?.(true);
    selectItem(null);
    controls.autoRotate = false;
    // Visit the four largest items, then return home — slow and cinematic.
    const sorted = [...interactives].sort((a, b) => b.amount - a.amount).slice(0, 4);
    let delay = 600;
    const step = 4600;
    sorted.forEach((it) => {
      tourTimers.push(setTimeout(() => touring && selectItem(it, 1600), delay));
      delay += step;
    });
    tourTimers.push(
      setTimeout(() => {
        if (!touring) return;
        selectItem(null);
        flyTo(HOMES[mode].pos, HOMES[mode].target, 2200);
        touring = false;
        opts.onTour?.(false);
        if (!reduceMotion) setTimeout(() => (controls.autoRotate = rotateOn), 2300);
      }, delay + 600)
    );
  }

  function resetView() {
    cancelTour();
    selectItem(null);
    flyTo(HOMES[mode].pos, HOMES[mode].target);
    if (!reduceMotion) setTimeout(() => (controls.autoRotate = rotateOn), 950);
  }

  // ---- Mode switching ------------------------------------------------------
  function setMode(next, { animateCamera = true } = {}) {
    if (next === mode && interactives.length) return;
    cancelTour();
    mode = next;
    clearContent();
    if (mode === "bars") buildBars();
    else if (mode === "pie") buildPie(spendingItems(), spendingTotal, { radius: 6.6, height: 1.7 });
    else if (mode === "revenue") buildPie(revenueItems(), revenueTotal, { radius: 6.8, height: 2.2 });
    introT = reduceMotion ? 1 : 0;
    if (animateCamera && !reduceMotion) {
      camera.position.copy(HOMES[mode].pos).multiplyScalar(1.25);
      flyTo(HOMES[mode].pos, HOMES[mode].target, 1300);
    } else {
      camera.position.copy(HOMES[mode].pos);
      controls.target.copy(HOMES[mode].target);
    }
    if (!reduceMotion) {
      controls.autoRotate = false;
      setTimeout(() => !touring && (controls.autoRotate = rotateOn), 1400);
    }
    opts.onItems?.(
      interactives.map((it) => ({ name: it.name, colorHex: `#${it.color.getHexString()}` })),
      mode
    );
  }

  // ---- Resize --------------------------------------------------------------
  function resize() {
    const w = canvas.clientWidth || canvas.parentElement.clientWidth;
    const h = canvas.clientHeight || canvas.parentElement.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  // ---- Loop ----------------------------------------------------------------
  const clock = new THREE.Clock();
  let running = false;
  let rafId = null;

  function quadBezier(out, p0, p1, p2, t) {
    const u = 1 - t;
    out.set(
      u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
      u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z
    );
    return out;
  }

  function tick() {
    rafId = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;

    if (introT < 1) {
      introT = Math.min(1, introT + dt / 1.5);
      interactives.forEach((it, i) => {
        const local = THREE.MathUtils.clamp((introT - i * 0.04) / 0.5, 0, 1);
        const e = ease(local);
        if (mode === "bars") it.mesh.scale.y = Math.max(0.0001, e);
        else it.mesh.scale.setScalar(Math.max(0.0001, e));
      });
    }

    if (core) {
      const pulse = 1 + Math.sin(time * 1.6) * 0.04;
      core.scale.setScalar(pulse);
      core.rotation.y += dt * 0.25;
      if (rings[0]) rings[0].rotation.z += dt * 0.6;
      if (rings[1]) rings[1].rotation.z -= dt * 0.4;
    }

    interactives.forEach((it) => {
      const active = it === hovered || it.selectedFlag;
      const targetEmissive = active ? 1.2 : it.baseEmissive;
      it.mat.emissiveIntensity += (targetEmissive - it.mat.emissiveIntensity) * 0.18;
      if (mode === "bars") {
        const lift = it.selectedFlag ? 0.6 : 0;
        it.mesh.position.y += (lift - it.mesh.position.y) * 0.15;
      } else {
        // Explode the slice outward when active.
        const out = active ? 0.7 : 0;
        const tx = it.midDir.x * out;
        const tz = it.midDir.z * out;
        it.mesh.position.x += (tx - it.mesh.position.x) * 0.15;
        it.mesh.position.z += (tz - it.mesh.position.z) * 0.15;
      }
    });

    if (points && introT > 0.15) {
      const arr = points.geometry.attributes.position.array;
      for (let i = 0; i < particles.length; i++) {
        const pt = particles[i];
        pt.t += pt.speed * dt;
        if (pt.t >= 1) pt.t -= 1;
        quadBezier(_v, coreTop, pt.ctrl, pt.col.top, pt.t);
        arr[i * 3] = _v.x;
        arr[i * 3 + 1] = _v.y;
        arr[i * 3 + 2] = _v.z;
      }
      points.geometry.attributes.position.needsUpdate = true;
    }

    if (fly) {
      const k = ease(THREE.MathUtils.clamp((performance.now() - fly.start) / fly.dur, 0, 1));
      camera.position.lerpVectors(fly.fromPos, fly.toPos, k);
      controls.target.lerpVectors(fly.fromTgt, fly.toTgt, k);
      if (k >= 1) fly = null;
    }

    controls.update();
    updateLabels();
    composer.render();
  }

  function updateLabels() {
    if (!labelEls.length) return;
    const rect = canvas.getBoundingClientRect();
    interactives.forEach((it) => {
      const el = it.labelEl;
      if (!el) return;
      // Anchor is the home position; for pie slices add the live explode offset
      // so labels track slices as they slide outward.
      _v.copy(labelAnchor(it));
      if (mode !== "bars") _v.add(new THREE.Vector3(it.mesh.position.x, 0, it.mesh.position.z));
      _v.project(camera);
      if (_v.z > 1) {
        el.style.opacity = "0";
        return;
      }
      const x = (_v.x * 0.5 + 0.5) * rect.width;
      const y = (-_v.y * 0.5 + 0.5) * rect.height;
      const active = it === hovered || it.selectedFlag;
      el.style.transform = `translate(-50%,-50%) translate(${x}px, ${y}px)`;
      el.style.opacity = String(active ? 1 : 0.62);
      el.classList.toggle("is-active", active);
    });
  }

  function start() {
    if (!running) {
      running = true;
      clock.start();
      tick();
    }
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }
  function dispose() {
    stop();
    cancelTour();
    ro.disconnect();
    clearContent();
    renderer.dispose();
    composer.dispose?.();
  }

  // ---- Boot ----------------------------------------------------------------
  setMode("bars", { animateCamera: false });
  resize();
  // Cinematic reveal: ease the camera in from farther out on first load.
  if (!reduceMotion) {
    camera.position.set(0, 24, 44);
    controls.autoRotate = false;
    flyTo(HOMES.bars.pos, HOMES.bars.target, 2200);
    setTimeout(() => !touring && (controls.autoRotate = rotateOn), 2300);
  }

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => (e.isIntersecting ? start() : stop())),
      { threshold: 0.05 }
    );
    io.observe(canvas);
  } else {
    start();
  }

  return {
    setMode,
    getMode: () => mode,
    toggleRotate() {
      rotateOn = !rotateOn;
      controls.autoRotate = rotateOn;
      cancelTour();
      return rotateOn;
    },
    startTour,
    cancelTour,
    resetView,
    focusItem(name) {
      const it = interactives.find((c) => c.name === name);
      if (it) selectItem(it);
    },
    hoverItem(name) {
      setHover(name ? interactives.find((c) => c.name === name) : null);
    },
    start,
    stop,
    dispose,
  };
}
