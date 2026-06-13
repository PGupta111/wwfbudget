// West Windsor 2026 Budget Visualizer — interactive 3D centerpiece.
//
// Renders the municipal budget as a ring of glowing columns (one per spending
// category, height proportional to spending) around a luminous core that
// represents the pooled budget, with continuous particle streams flowing from
// the core out to each column. Built on a locally-vendored Three.js with
// shadows, fog, and UnrealBloom post-processing. Falls back gracefully when
// WebGL is unavailable — the caller keeps the 2D donut/Sankey views below.

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
  getDepartmentBreakdown,
  GROUP_DETAILS,
} from "./helpers.js";

const BG_TOP = "#0c1730";
const BG_BOTTOM = "#060b18";

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

/** Resolve a CSS custom-property color (e.g. "var(--grp-9)") to a hex int. */
function resolveColorHex(cssColor) {
  let value = cssColor;
  if (typeof cssColor === "string" && cssColor.startsWith("var(")) {
    const name = cssColor.slice(4, -1).trim();
    value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  return new THREE.Color(value || "#64748b");
}

/** Build a vertical gradient background texture for the scene. */
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

export function initBudget3D(data, opts = {}) {
  const canvas = document.getElementById(opts.canvasId || "budget-3d");
  if (!canvas || !isWebGLAvailable()) return null;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const groups = getSpendingByGroup(data);
  const total = data.headline.total_budget.amount;
  const maxAmount = Math.max(...groups.map((g) => g.amount));

  // ---- Renderer / scene / camera -----------------------------------------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = makeBackgroundTexture(BG_TOP, BG_BOTTOM);
  scene.fog = new THREE.FogExp2(0x070d1c, 0.018);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
  const HOME_POS = new THREE.Vector3(0.5, 12, 23);
  const HOME_TARGET = new THREE.Vector3(0, 3.6, 0);
  camera.position.copy(HOME_POS);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(HOME_TARGET);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 12;
  controls.maxDistance = 42;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.55;

  // ---- Lighting ------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0x9ecbff, 0x0a1020, 0.55));
  scene.add(new THREE.AmbientLight(0xffffff, 0.18));

  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(10, 20, 12);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 80;
  key.shadow.camera.left = -22;
  key.shadow.camera.right = 22;
  key.shadow.camera.top = 22;
  key.shadow.camera.bottom = -22;
  key.shadow.bias = -0.0004;
  scene.add(key);

  const rimCyan = new THREE.PointLight(0x22d3ee, 80, 60);
  rimCyan.position.set(-16, 6, -10);
  scene.add(rimCyan);
  const rimViolet = new THREE.PointLight(0x8b5cf6, 70, 60);
  rimViolet.position.set(15, 5, -14);
  scene.add(rimViolet);

  // ---- Ground --------------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(60, 96),
    new THREE.MeshStandardMaterial({ color: 0x0a1224, roughness: 0.82, metalness: 0.2 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.PolarGridHelper(20, 16, 8, 96, 0x1f3a63, 0x152844);
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  grid.position.y = 0.01;
  scene.add(grid);

  // ---- Central core (pooled budget) ---------------------------------------
  const coreGroup = new THREE.Group();
  scene.add(coreGroup);
  const coreHeight = 3.0;
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.3, 2),
    new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.05,
      roughness: 0.25,
      metalness: 0.4,
    })
  );
  core.position.y = coreHeight;
  core.castShadow = true;
  coreGroup.add(core);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.6, 0.06, 16, 120),
    new THREE.MeshStandardMaterial({ color: 0x7dd3fc, emissive: 0x38bdf8, emissiveIntensity: 1.55, roughness: 0.3 })
  );
  ring.position.y = coreHeight;
  ring.rotation.x = Math.PI / 2;
  coreGroup.add(ring);
  const ring2 = ring.clone();
  ring2.scale.setScalar(1.35);
  ring2.rotation.x = Math.PI / 2.6;
  coreGroup.add(ring2);

  const coreTop = new THREE.Vector3(0, coreHeight + 1.6, 0);

  // ---- Category columns ----------------------------------------------------
  const ringRadius = 9.2;
  const columns = [];
  const colGeoCache = new Map();

  groups.forEach((g, i) => {
    const angle = (i / groups.length) * Math.PI * 2;
    const cx = Math.cos(angle) * ringRadius;
    const cz = Math.sin(angle) * ringRadius;
    const h = 0.6 + Math.sqrt(g.amount / maxAmount) * 8.2; // sqrt keeps small ones visible

    const w = 1.7;
    const key2 = h.toFixed(2);
    let geo = colGeoCache.get(key2);
    if (!geo) {
      geo = new RoundedBoxGeometry(w, h, w, 4, 0.18);
      geo.translate(0, h / 2, 0); // base sits on the ground so it grows upward
      colGeoCache.set(key2, geo);
    }
    const color = resolveColorHex(g.color);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color.clone().multiplyScalar(0.6),
      emissiveIntensity: 0.35,
      roughness: 0.32,
      metalness: 0.55,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, 0, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.scale.y = reduceMotion ? 1 : 0.0001;
    scene.add(mesh);

    // Glowing pad beneath each column.
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12 })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(cx, 0.02, cz);
    scene.add(pad);

    columns.push({
      group: g.group,
      amount: g.amount,
      pct: (g.amount / total) * 100,
      blurb: GROUP_DETAILS[g.group] || g.blurb || "",
      color,
      mesh,
      mat,
      height: h,
      top: new THREE.Vector3(cx, h, cz),
      baseEmissive: 0.35,
      hovered: false,
      selected: false,
    });
  });

  // ---- Particle money-flow -------------------------------------------------
  const PARTICLES = reduceMotion ? 0 : Math.min(1600, 110 * columns.length);
  let points = null;
  const particles = [];
  if (PARTICLES > 0) {
    const positions = new Float32Array(PARTICLES * 3);
    const colors = new Float32Array(PARTICLES * 3);
    const totalCol = columns.reduce((s, c) => s + c.amount, 0);
    let p = 0;
    for (const col of columns) {
      const count = Math.max(8, Math.round((col.amount / totalCol) * PARTICLES));
      const ctrl = new THREE.Vector3(
        col.top.x * 0.45,
        coreHeight + 6 + Math.random() * 2,
        col.top.z * 0.45
      );
      for (let k = 0; k < count && p < PARTICLES; k++, p++) {
        particles.push({
          col,
          ctrl,
          t: Math.random(),
          speed: 0.12 + Math.random() * 0.16,
        });
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
    scene.add(points);
  }

  const _v = new THREE.Vector3();
  function quadBezier(out, p0, p1, p2, t) {
    const u = 1 - t;
    out.set(
      u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
      u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z
    );
    return out;
  }

  // ---- Post-processing (bloom) --------------------------------------------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.62, 0.55, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---- Raycasting / interaction -------------------------------------------
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

  function pickColumn() {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(columns.map((c) => c.mesh), false);
    if (!hits.length) return null;
    return columns.find((c) => c.mesh === hits[0].object) || null;
  }

  function showTooltip(col) {
    if (!tooltip || !col) return;
    tooltip.innerHTML = `
      <span class="t3d-swatch" style="background:#${col.color.getHexString()}"></span>
      <span class="t3d-name">${col.group}</span>
      <span class="t3d-amount">${dollars(col.amount, 0)} · ${col.pct.toFixed(1)}% of budget</span>`;
    tooltip.style.left = `${pointerClient.x}px`;
    tooltip.style.top = `${pointerClient.y}px`;
    tooltip.classList.add("visible");
  }
  function hideTooltip() {
    if (tooltip) tooltip.classList.remove("visible");
  }

  function setHover(col) {
    if (hovered === col) return;
    hovered = col;
    canvas.style.cursor = col ? "pointer" : "grab";
    if (!col) hideTooltip();
  }

  function onPointerMove(e) {
    setPointerFromEvent(e);
    const col = pickColumn();
    setHover(col);
    if (col) showTooltip(col);
  }

  function selectColumn(col) {
    selected = col;
    columns.forEach((c) => (c.selected = c === col));
    if (opts.onSelect) opts.onSelect(col ? buildDetail(col) : null);
    if (col) {
      // Ease the camera to frame the chosen column.
      flyTo(
        new THREE.Vector3(col.top.x * 1.7, col.height + 6, col.top.z * 1.7 + 2),
        new THREE.Vector3(col.top.x * 0.6, col.height * 0.55, col.top.z * 0.6)
      );
    }
  }

  function buildDetail(col) {
    return {
      group: col.group,
      amount: col.amount,
      pct: col.pct,
      blurb: col.blurb,
      colorHex: `#${col.color.getHexString()}`,
      breakdown: getDepartmentBreakdown(data, col.group).slice(0, 8),
    };
  }

  function onClick(e) {
    setPointerFromEvent(e);
    const col = pickColumn();
    if (col) selectColumn(col === selected ? null : col);
    else selectColumn(null);
  }

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", () => (canvas.style.cursor = "grabbing"));
  canvas.addEventListener("pointerup", () => (canvas.style.cursor = hovered ? "pointer" : "grab"));
  canvas.addEventListener("click", onClick);
  canvas.addEventListener("pointerleave", () => {
    setHover(null);
    hideTooltip();
  });

  // ---- Camera fly-to -------------------------------------------------------
  let fly = null;
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
  function resetView() {
    selectColumn(null);
    flyTo(HOME_POS, HOME_TARGET);
    if (!reduceMotion) setTimeout(() => (controls.autoRotate = rotateOn), 950);
  }

  // ---- Public-ish controls -------------------------------------------------
  let rotateOn = !reduceMotion;
  const api = {
    toggleRotate() {
      rotateOn = !rotateOn;
      controls.autoRotate = rotateOn;
      return rotateOn;
    },
    resetView,
    focusGroup(name) {
      const col = columns.find((c) => c.group === name);
      if (col) selectColumn(col);
    },
    hoverGroup(name) {
      const col = name ? columns.find((c) => c.group === name) : null;
      setHover(col);
    },
    columns,
    dispose,
  };

  // ---- Labels (HTML, projected each frame) --------------------------------
  const labelLayer = opts.labelLayer || document.getElementById("stage-labels");
  const labelEls = [];
  if (labelLayer) {
    columns.forEach((col) => {
      const el = document.createElement("div");
      el.className = "stage-label";
      el.innerHTML = `<span>${compactDollars(col.amount)}</span>`;
      el.style.borderColor = `#${col.color.getHexString()}`;
      labelLayer.appendChild(el);
      labelEls.push(el);
    });
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
  resize();

  // ---- Animation loop ------------------------------------------------------
  const clock = new THREE.Clock();
  let introT = reduceMotion ? 1 : 0;
  let running = false;
  let rafId = null;

  function ease(x) {
    return 1 - Math.pow(1 - x, 3);
  }

  function tick() {
    rafId = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;

    // Intro: columns rise with a stagger.
    if (introT < 1) {
      introT = Math.min(1, introT + dt / 1.6);
      columns.forEach((col, i) => {
        const local = THREE.MathUtils.clamp((introT - i * 0.045) / 0.5, 0, 1);
        col.mesh.scale.y = Math.max(0.0001, ease(local));
      });
    }

    // Core pulse + ring spin.
    const pulse = 1 + Math.sin(time * 1.6) * 0.04;
    core.scale.setScalar(pulse);
    core.rotation.y += dt * 0.25;
    ring.rotation.z += dt * 0.6;
    ring2.rotation.z -= dt * 0.4;

    // Hover / selection emphasis.
    columns.forEach((col) => {
      const active = col === hovered || col.selected;
      const targetEmissive = active ? 1.25 : col.baseEmissive;
      col.mat.emissiveIntensity += (targetEmissive - col.mat.emissiveIntensity) * 0.18;
      const targetLift = col.selected ? 0.6 : 0;
      col.mesh.position.y += (targetLift - col.mesh.position.y) * 0.15;
    });

    // Particles flow along core -> column arcs.
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

    // Camera fly-to interpolation.
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
    columns.forEach((col, i) => {
      const el = labelEls[i];
      _v.copy(col.top).add(new THREE.Vector3(0, 0.9, 0));
      _v.project(camera);
      const behind = _v.z > 1;
      if (behind) {
        el.style.opacity = "0";
        return;
      }
      const x = (_v.x * 0.5 + 0.5) * rect.width;
      const y = (-_v.y * 0.5 + 0.5) * rect.height;
      // Fade columns on the far side of the ring for legibility.
      const camDist = camera.position.distanceTo(col.top);
      const near = THREE.MathUtils.clamp(1 - (camDist - controls.minDistance) / 34, 0.25, 1);
      el.style.transform = `translate(-50%,-50%) translate(${x}px, ${y}px)`;
      el.style.opacity = String((col === hovered || col.selected ? 1 : 0.55 * near));
      el.classList.toggle("is-active", col === hovered || col.selected);
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
    ro.disconnect();
    renderer.dispose();
    composer.dispose?.();
  }

  // Only animate while the stage is on screen (saves battery / GPU).
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => (e.isIntersecting ? start() : stop())),
      { threshold: 0.05 }
    );
    io.observe(canvas);
  } else {
    start();
  }

  api.start = start;
  api.stop = stop;
  return api;
}
