// scene.js — Three.js scene factory for the room designer.
// ES module. Self-hosts three via the import map declared in the host HTML.

import * as THREE from "../../vendor/three.module.js";
import { OrbitControls } from "../../vendor/three/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "../../vendor/three/jsm/environments/RoomEnvironment.js";

window.THREE = THREE;

// ---------------------------------------------------------------------------
// IIFE: module-scope constants and shared helpers.
// ---------------------------------------------------------------------------
const IIFE = (() => {
  // Default grid dimensions. The host page can override by calling
  // createScene(container, { gridW, gridH, floorColor }) before any renderer
  // work happens; defaults below keep the module usable on its own.
  const DEFAULTS = Object.freeze({
    gridW: 20,
    gridH: 20,
    floorColor: 0xc8c8c8,
  });

  // Re-usable dispose helper. Detaches every geometry / material / texture
  // reachable from the supplied object, and recursively walks children.
  function deepDispose(obj) {
    if (!obj) return;
    obj.traverse((node) => {
      if (node.geometry) node.geometry.dispose?.();
      if (node.material) {
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        for (const m of mats) {
          for (const key of Object.keys(m)) {
            const v = m[key];
            if (v && typeof v === "object" && "minFilter" in v) v.dispose?.();
          }
          m.dispose?.();
        }
      }
    });
  }

  return { DEFAULTS, deepDispose };
})();

const { DEFAULTS, deepDispose } = IIFE;

// Named exports for public API accessors.
// Module-level references stored after createScene() runs.
let _renderer, _camera, _controls, _canvas;

// ---------------------------------------------------------------------------
// createScene(container, options?) -> { scene, camera, renderer, controls, floor, dispose }
//
// Builds a fully wired Three.js scene with:
//   - PerspectiveCamera (fov 50) framed over the grid
//   - WebGLRenderer (antialias, alpha, high-performance, PCFSoftShadowMap)
//   - OrbitControls (damped, clamped polar angle so the camera never dips
//     below the floor plane)
//   - Hemisphere + Directional (shadow-casting) + Ambient lights
//   - RoomEnvironment IBL so PBR materials read correctly
//   - Tiled floor built from a single 1x1 PlaneGeometry repeated gridW*gridH
//   - ResizeObserver that re-syncs renderer / camera to the container
// ---------------------------------------------------------------------------
export function createScene(container, options = {}) {
  const { gridW = DEFAULTS.gridW, gridH = DEFAULTS.gridH, floorColor = DEFAULTS.floorColor } = options;

  if (!container || !(container instanceof HTMLElement)) {
    throw new Error("createScene: a valid DOM container element is required");
  }

  // ---- Scene ---------------------------------------------------------------
  const scene = new THREE.Scene();
  scene.background = null; // alpha canvas lets the host page CSS show through

  // ---- Camera --------------------------------------------------------------
  const camera = new THREE.PerspectiveCamera(
    50,
    Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
    0.1,
    5000
  );
  camera.position.set(gridW * 0.6, gridH * 0.6, gridW * 0.6);
  camera.lookAt(0, 0, 0);

  // ---- Renderer ------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth, container.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";

  // ---- IBL: RoomEnvironment via PMREM -------------------------------------
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new RoomEnvironment();
  const envRT = pmrem.fromScene(envScene, 0.04);
  scene.environment = envRT.texture;
  pmrem.dispose();

  // ---- Controls ------------------------------------------------------------
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0, 0);
  controls.minDistance = 2;
  controls.maxDistance = gridW * 3;
  controls.maxPolarAngle = Math.PI * 0.45; // never look under the floor
  controls.update();

  // ---- Lights --------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(10, 20, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 200;
  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  const ambient = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambient);

  // ---- Floor ---------------------------------------------------------------
  // Build the floor as a gridW * gridH grid of 1x1 PlaneGeometry tiles so each
  // cell can later be replaced (e.g. a placed rug or a hole) without touching
  // neighbouring cells. We start with one shared geometry and instance it.
  const tileGeo = new THREE.PlaneGeometry(1, 1);
  tileGeo.rotateX(-Math.PI / 2); // lie flat on XZ
  const tileMat = new THREE.MeshStandardMaterial({ color: floorColor, roughness: 0.85, metalness: 0.0 });

  const floor = new THREE.Group();
  floor.name = "floor";

  const tileCountX = Math.max(1, gridW);
  const tileCountZ = Math.max(1, gridH);
  const halfW = (tileCountX - 1) / 2;
  const halfH = (tileCountZ - 1) / 2;

  for (let ix = 0; ix < tileCountX; ix++) {
    for (let iz = 0; iz < tileCountZ; iz++) {
      const tile = new THREE.Mesh(tileGeo, tileMat);
      tile.position.set(ix - halfW, 0, iz - halfH);
      tile.receiveShadow = true;
      tile.name = `floorTile_${ix}_${iz}`;
      floor.add(tile);
    }
  }
  scene.add(floor);

  // ---- Resize handling -----------------------------------------------------
  function applySize() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  applySize();

  let ro = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(applySize);
    ro.observe(container);
  } else {
    window.addEventListener("resize", applySize);
  }

  // ---- Dispose -------------------------------------------------------------
  function dispose() {
    if (ro) {
      ro.disconnect();
      ro = null;
    } else {
      window.removeEventListener("resize", applySize);
    }
    controls.dispose();
    if (scene.environment && scene.environment.dispose) scene.environment.dispose();
    if (scene.background && scene.background.dispose) scene.background.dispose();
    deepDispose(scene);
    if (renderer.renderTarget) renderer.renderTarget.dispose?.();
    renderer.dispose();
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }
  }

  // Store references for getter exports
  _renderer = renderer;
  _camera = camera;
  _controls = controls;
  // canvas is the DOM element, not a THREE object
  _canvas = renderer.domElement;

  return { scene, camera, renderer, controls, floor, dispose };
}

// Default export mirrors the named export so consumers can `import createScene
// from "./scene.js"` if they prefer the default-import form.
export default createScene;

// ---------------------------------------------------------------------------
// Getter exports — exposed so editor.js can access scene internals.
// ---------------------------------------------------------------------------
export function getRenderer() {
  return _renderer;
}

export function getCamera() {
  return _camera;
}

export function getCanvas() {
  return _canvas;
}

export function getControls() {
  return _controls;
}