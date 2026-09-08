// materials.js — Procedural floor material factory for the room designer.
// ES module. Self-hosts three via the import map declared in the host HTML.
//
// Exports buildFloorMaterial(type, baseColor, sizeMeters) which returns a
// THREE.MeshStandardMaterial. For "solid" the material is just a flat
// MeshStandardMaterial. For "wood", "tile" and "concrete" we paint a 2D canvas
// at a high resolution, wrap it as a THREE.CanvasTexture, and set RepeatWrapping
// so the procedural pattern tiles across the floor.

import * as THREE from "../../vendor/three.module.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
// Logical pixel size of the source canvas. Bigger = sharper, but more memory.
// 1024 keeps grain/tile detail clean without bloating GPU uploads.
const TEX_RES = 1024;

// How many procedural repeats make up one "real" metre. The factory below
// converts sizeMeters -> texture.repeat = sizeMeters / METER_REPEATS so the
// visual scale of the pattern stays roughly constant regardless of room size.
const METER_REPEATS = 2;

// Tiny helper: clamp a number to [0, 255] and round.
const clampByte = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

/**
 * Convert a THREE.Color (or anything the THREE.Color constructor accepts) to
 * an {r, g, b} triple in the 0..255 range. Falls back to mid-grey if the input
 * cannot be coerced.
 */
function toRgb(color) {
  const c = new THREE.Color();
  try {
    c.set(color);
  } catch (_) {
    c.set(0x808080);
  }
  return {
    r: (c.r * 255) | 0,
    g: (c.g * 255) | 0,
    b: (c.b * 255) | 0,
  };
}

/**
 * Return an rgba() string with a small per-channel jitter applied so successive
 * planks (or tiles, or concrete patches) don't all read as the exact same
 * colour. `amount` is in 0..255, `seed` is any number used to vary the offset.
 */
function jitteredRgba(rgb, amount, seed) {
  // Mulberry32 — small deterministic PRNG so the texture is stable across
  // reloads but still varies tile-to-tile.
  let t = (seed | 0) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;

  let t2 = (seed * 1664525 + 1013904223) | 0;
  t2 = Math.imul(t2 ^ (t2 >>> 15), t2 | 1);
  t2 ^= t2 + Math.imul(t2 ^ (t2 >>> 7), t2 | 61);
  const g = ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296;

  let t3 = (seed * 2147483647 + 11) | 0;
  t3 = Math.imul(t3 ^ (t3 >>> 15), t3 | 1);
  t3 ^= t3 + Math.imul(t3 ^ (t3 >>> 7), t3 | 61);
  const b = ((t3 ^ (t3 >>> 14)) >>> 0) / 4294967296;

  const dr = (r - 0.5) * 2 * amount;
  const dg = (g - 0.5) * 2 * amount;
  const db = (b - 0.5) * 2 * amount;

  return `rgba(${clampByte(rgb.r + dr)}, ${clampByte(rgb.g + dg)}, ${clampByte(rgb.b + db)}, 1)`;
}

// ---------------------------------------------------------------------------
// Texture wrapping helper
// ---------------------------------------------------------------------------

/**
 * Wrap a freshly painted HTMLCanvasElement as a Three.js texture, with
 * RepeatWrapping and an appropriate repeat count for the given room size.
 */
function wrapCanvas(canvas, sizeMeters) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // One procedural tile covers (METER_REPEATS) metres of real floor.
  // The total repeat count is therefore sizeMeters / METER_REPEATS.
  const repeat = Math.max(0.001, sizeMeters / METER_REPEATS);
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Material builders per type
// ---------------------------------------------------------------------------

/**
 * "solid" — no canvas, just a flat-coloured MeshStandardMaterial. Useful as a
 * default and as a fast path when the user hasn't picked a procedural finish.
 */
function buildSolid(baseColor) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color().set(baseColor),
    roughness: 0.85,
    metalness: 0.0,
  });
}

/**
 * "wood" — horizontal planks with alternating shade variants and subtle grain
 * lines. Painted onto an offscreen 2D canvas.
 *
 * Layout: 6 horizontal planks stacked top-to-bottom, separated by thin
 * shadow lines. Each plank gets a base colour from a small palette of warm
 * brown shades so adjacent planks don't match.
 */
function buildWood(baseColor, sizeMeters) {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_RES;
  canvas.height = TEX_RES;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return buildSolid(baseColor);
  }

  // Use the user's base colour to derive a wood-tone palette. If the base
  // colour is dark (e.g. a deep walnut) we shift lighter; if it's light
  // (e.g. a pale pine) we stay near it.
  const rgb = toRgb(baseColor);
  const lum = (rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114) / 255;

  // 5 plank shades: base, base * 0.85, base * 1.1, base * 0.92, base * 1.05.
  // Multipliers are clamped so the wood never goes pure black or pure white.
  const shades = [
    { r: rgb.r * 0.78, g: rgb.g * 0.74, b: rgb.b * 0.7 },
    { r: rgb.r * 0.9, g: rgb.g * 0.88, b: rgb.b * 0.85 },
    { r: rgb.r * 1.05, g: rgb.g * 1.0, b: rgb.b * 0.92 },
    { r: rgb.r * 0.85, g: rgb.g * 0.82, b: rgb.b * 0.78 },
    { r: rgb.r * 1.0, g: rgb.g * 0.95, b: rgb.b * 0.88 },
  ].map((c) => ({ r: clampByte(c.r), g: clampByte(c.g), b: clampByte(c.b) }));

  // Background fill = darkest shade, so plank edges never expose raw canvas.
  ctx.fillStyle = `rgb(${shades[0].r}, ${shades[0].g}, ${shades[0].b})`;
  ctx.fillRect(0, 0, TEX_RES, TEX_RES);

  // 6 planks stacked vertically. Each plank is ~167px tall on a 1024 canvas.
  const plankCount = 6;
  const plankH = TEX_RES / plankCount;
  const plankSeedBase = 1337;

  for (let i = 0; i < plankCount; i++) {
    const y = i * plankH;
    const shade = shades[i % shades.length];
    // Per-plank shade jitter so the same shade index never looks identical
    // when it reappears further down the stack.
    const fill = jitteredRgba(shade, 14, plankSeedBase + i * 91);
    ctx.fillStyle = fill;
    ctx.fillRect(0, y, TEX_RES, plankH);

    // Subtle grain: a few thin, slightly-darker horizontal lines per plank.
    // 4..7 lines, randomly placed, with a faint shadow tint.
    const grainLines = 4 + (i * 3) % 4;
    for (let g = 0; g < grainLines; g++) {
      const ly = y + ((g + 0.5) / grainLines) * plankH + ((i * 17 + g * 53) % 7) - 3;
      const alpha = 0.05 + (((i * 11 + g * 7) % 10) / 100); // 0.05..0.15
      ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
      // Lines are 1-2px tall, broken into short dashes so they read as grain
      // rather than ruled paper.
      let lx = ((i * 23 + g * 41) % 64);
      while (lx < TEX_RES) {
        const segLen = 18 + ((lx * 37) % 64);
        ctx.fillRect(lx, ly, segLen, 1);
        lx += segLen + 8 + ((lx * 13) % 24);
      }
    }

    // Plank separator: dark groove between planks.
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, y + plankH - 2, TEX_RES, 2);
  }

  // Soft top-light bias: a faint vertical gradient that brightens the top
  // plank a touch, mimicking overhead lighting landing on the floor.
  const grad = ctx.createLinearGradient(0, 0, 0, TEX_RES);
  grad.addColorStop(0, "rgba(255, 255, 255, 0.05)");
  grad.addColorStop(0.5, "rgba(255, 255, 255, 0.0)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0.06)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TEX_RES, TEX_RES);

  const tex = wrapCanvas(canvas, sizeMeters);
  return new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    roughness: 0.75,
    metalness: 0.0,
  });
}

/**
 * "tile" — 4x4 grid of square tiles separated by grout lines. Painted onto an
 * offscreen 2D canvas.
 */
function buildTile(baseColor, sizeMeters) {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_RES;
  canvas.height = TEX_RES;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return buildSolid(baseColor);
  }

  // Derive a slightly lighter "tile face" colour and a darker "grout" colour
  // from the user's base colour. Tiles are typically 1-2 shades lighter than
  // the grout between them, so the grout reads as a recess.
  const rgb = toRgb(baseColor);
  const tile = {
    r: clampByte(rgb.r * 1.05 + 8),
    g: clampByte(rgb.g * 1.05 + 8),
    b: clampByte(rgb.b * 1.05 + 8),
  };
  const grout = {
    r: clampByte(rgb.r * 0.45),
    g: clampByte(rgb.g * 0.45),
    b: clampByte(rgb.b * 0.45),
  };

  // Grout background fills the whole canvas. The tile faces are drawn on top.
  ctx.fillStyle = `rgb(${grout.r}, ${grout.g}, ${grout.b})`;
  ctx.fillRect(0, 0, TEX_RES, TEX_RES);

  // 4x4 grid of square tiles. Each tile has a small inset so the grout shows
  // as a cross-shaped gap.
  const grid = 4;
  const tileSize = TEX_RES / grid;
  const gap = Math.max(4, tileSize * 0.06); // ~6% of tile size, min 4px

  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const x = gx * tileSize + gap / 2;
      const y = gy * tileSize + gap / 2;
      const w = tileSize - gap;
      const h = tileSize - gap;

      // Per-tile shade jitter so the field doesn't read as a single colour.
      const seed = gy * 31 + gx * 17 + 7;
      const fill = jitteredRgba(tile, 10, seed);
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, w, h);

      // Soft inner highlight along the top-left edge to suggest a bevel.
      const hl = ctx.createLinearGradient(x, y, x, y + h);
      hl.addColorStop(0, "rgba(255, 255, 255, 0.08)");
      hl.addColorStop(0.5, "rgba(255, 255, 255, 0.0)");
      hl.addColorStop(1, "rgba(0, 0, 0, 0.06)");
      ctx.fillStyle = hl;
      ctx.fillRect(x, y, w, h);
    }
  }

  // Light noise speckle on the grout so it isn't a dead flat colour.
  for (let i = 0; i < 1200; i++) {
    const x = Math.random() * TEX_RES;
    const y = Math.random() * TEX_RES;
    const a = Math.random() * 0.12;
    ctx.fillStyle = `rgba(0, 0, 0, ${a})`;
    ctx.fillRect(x, y, 1, 1);
  }

  const tex = wrapCanvas(canvas, sizeMeters);
  return new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    roughness: 0.65,
    metalness: 0.05,
  });
}

/**
 * "concrete" — soft noise dots with a subtle vertical gradient so the floor
 * reads as a poured slab rather than a flat colour.
 */
function buildConcrete(baseColor, sizeMeters) {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_RES;
  canvas.height = TEX_RES;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return buildSolid(baseColor);
  }

  const rgb = toRgb(baseColor);

  // Base fill.
  ctx.fillStyle = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  ctx.fillRect(0, 0, TEX_RES, TEX_RES);

  // Vertical gradient: a touch lighter at the top (overhead light falloff)
  // and a touch darker at the bottom.
  const grad = ctx.createLinearGradient(0, 0, 0, TEX_RES);
  grad.addColorStop(0, "rgba(255, 255, 255, 0.08)");
  grad.addColorStop(0.5, "rgba(255, 255, 255, 0.0)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0.1)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TEX_RES, TEX_RES);

  // Speckle: ~6000 tiny dots, alternating between lighter and darker than the
  // base. The dots are 1x1 or 2x2 px so the noise reads as fine grain even at
  // a distance.
  const dotCount = 6000;
  for (let i = 0; i < dotCount; i++) {
    const x = Math.random() * TEX_RES;
    const y = Math.random() * TEX_RES;
    const light = Math.random() < 0.5;
    const a = 0.04 + Math.random() * 0.12;
    if (light) {
      ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
    } else {
      ctx.fillStyle = `rgba(0, 0, 0, ${a})`;
    }
    const size = Math.random() < 0.85 ? 1 : 2;
    ctx.fillRect(x, y, size, size);
  }

  // A few larger faint blotches for "weathering" — low-opacity radial blobs
  // that suggest staining without dominating the texture.
  const blotches = 12;
  for (let i = 0; i < blotches; i++) {
    const x = Math.random() * TEX_RES;
    const y = Math.random() * TEX_RES;
    const r = 40 + Math.random() * 90;
    const dark = Math.random() < 0.5;
    const radial = ctx.createRadialGradient(x, y, 0, x, y, r);
    if (dark) {
      radial.addColorStop(0, "rgba(0, 0, 0, 0.06)");
      radial.addColorStop(1, "rgba(0, 0, 0, 0.0)");
    } else {
      radial.addColorStop(0, "rgba(255, 255, 255, 0.05)");
      radial.addColorStop(1, "rgba(255, 255, 255, 0.0)");
    }
    ctx.fillStyle = radial;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = wrapCanvas(canvas, sizeMeters);
  return new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    roughness: 0.95,
    metalness: 0.0,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * buildFloorMaterial(type, baseColor, sizeMeters = 20) -> THREE.MeshStandardMaterial
 *
 * type:        "solid" | "wood" | "tile" | "concrete"
 * baseColor:   any colour accepted by THREE.Color (hex int, "#rrggbb", "red",
 *              THREE.Color, etc.). Used as the starting tint; procedural
 *              variants then derive their palette from it.
 * sizeMeters:  total side length of the room in metres. The procedural
 *              texture's repeat count is computed from this so the visual
 *              scale of planks/tiles/etc. stays roughly constant across
 *              room sizes. Default = 20.
 *
 * Falls back to "solid" if `type` is unknown.
 */
export function buildFloorMaterial(type, baseColor, sizeMeters = 20) {
  const safeSize = Number.isFinite(sizeMeters) && sizeMeters > 0 ? sizeMeters : 20;

  switch (type) {
    case "solid":
      return buildSolid(baseColor);
    case "wood":
      return buildWood(baseColor, safeSize);
    case "tile":
      return buildTile(baseColor, safeSize);
    case "concrete":
      return buildConcrete(baseColor, safeSize);
    default:
      // Unknown type — degrade to a solid material so the caller still gets
      // something renderable rather than an exception.
      return buildSolid(baseColor);
  }
}

/**
 * rebuildFloor(scene, options) — Rebuild the floor group in an existing
 * Three.js scene. Removes the existing floor and creates a new one using
 * the supplied type, base colour, and room size.
 *
 * @param {THREE.Scene} scene
 * @param {Object} options
 * @param {string} options.type - "solid" | "wood" | "tile" | "concrete"
 * @param {*} options.baseColor - any colour accepted by THREE.Color
 * @param {number} [options.sizeMeters=20] - total side length of the room in metres
 */
export function rebuildFloor(scene, options = {}) {
  const { type = "solid", baseColor, sizeMeters = 20, gridW = 20, gridH = 20 } = options;
  const safeSize = Number.isFinite(sizeMeters) && sizeMeters > 0 ? sizeMeters : 20;

  // Remove existing floor group.
  const existingFloor = scene.getObjectByName("floor");
  if (existingFloor) {
    existingFloor.traverse((child) => {
      if (child.isMesh) {
        child.geometry.dispose?.();
        child.material.dispose?.();
        scene.remove(child);
      }
    });
    scene.remove(existingFloor);
  }

  // Build new floor material.
  const material = buildFloorMaterial(type, baseColor, safeSize);

  // Re-create floor tiles.
  const tileGeo = new THREE.PlaneGeometry(1, 1);
  tileGeo.rotateX(-Math.PI / 2); // lie flat on XZ

  const tileCountX = Math.max(1, gridW); // tile columns = grid width
  const tileCountZ = Math.max(1, gridH); // tile rows = grid height
  const halfW = (tileCountX - 1) / 2;
  const halfH = (tileCountZ - 1) / 2;

  const floor = new THREE.Group();
  floor.name = "floor";

  for (let ix = 0; ix < tileCountX; ix++) {
    for (let iz = 0; iz < tileCountZ; iz++) {
      const tile = new THREE.Mesh(tileGeo, material);
      tile.position.set(ix - halfW, 0, iz - halfH);
      tile.receiveShadow = true;
      tile.name = `floorTile_${ix}_${iz}`;
      floor.add(tile);
    }
  }
  scene.add(floor);
}

// Default export exposes both buildFloorMaterial and rebuildFloor
export default {
  buildFloorMaterial,
  rebuildFloor,
};