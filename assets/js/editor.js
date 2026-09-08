// assets/js/editor.js
// Editor controller. The scene itself lives in ./three/scene.js.

import { createScene } from './three/scene.js';
import { createMeshForAsset, disposeMesh } from './three/furniture.js';
import { rebuildFloor } from './three/materials.js';
import { attachRaycaster, raycastFloorPoint, raycastObject } from './three/raycast.js';
import { initDrawers } from './ui/drawers.js';
import { renderAssetPanel } from './ui/assetpanel.js';
import { renderProperties } from './ui/properties.js';
import { initKeyboard, showShortcutsModal } from './ui/keyboard.js';
import { getAssets, getDesign, saveDesign as apiSaveDesign, getTemplate } from './api.js';
import { applyTheme, getCurrentTheme } from './theme.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  objects: [], // [{ id, assetId, assetName, category, x, z, rotation, mesh }]
  gridWidth: 12,
  gridHeight: 10,
  floorColor: '#8B7355',
  floorMaterial: 'solid',
  currentDesignId: null,
  currentTemplateId: null,
  history: [],
  historyIndex: -1,
  selected: new Set(),
  clipboard: [],
  pendingAsset: null, // asset waiting for a floor click, or null
};

// Module-scoped Three.js handles (captured from createScene).
let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let canvas = null;
let drawer = null;

// All catalogue assets loaded from the API (used for undo/redo + templates).
let allAssets = [];

// Drag bookkeeping for move-gesture.
let dragInfo = null;
let pointerDownAt = null;

const HISTORY_LIMIT = 50;

function uid() {
  return 'obj_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function toast(message) {
  const host = document.getElementById('toastContainer');
  if (!host) return;
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  host.appendChild(node);
  setTimeout(() => node.remove(), 2600);
}

function setSaveState(msg, kind) {
  const el = document.querySelector('[data-save-state]');
  if (!el) return;
  el.textContent = msg || '';
  el.dataset.state = kind || '';
}

function snapshot() {
  return {
    objects: state.objects.map((o) => ({
      id: o.id,
      assetId: o.assetId,
      assetName: o.assetName,
      category: o.category,
      x: o.x,
      z: o.z,
      rotation: o.rotation,
    })),
    gridWidth: state.gridWidth,
    gridHeight: state.gridHeight,
    floorColor: state.floorColor,
    floorMaterial: state.floorMaterial,
  };
}

function saveState() {
  if (state.historyIndex < state.history.length - 1) {
    state.history.length = state.historyIndex + 1;
  }
  state.history.push(snapshot());
  if (state.history.length > HISTORY_LIMIT) {
    state.history.shift();
  } else {
    state.historyIndex += 1;
  }
}

function clearHelpers() {
  if (!scene) return;
  const toRemove = [];
  scene.traverse((obj) => {
    if (obj.userData && obj.userData.isSelectionHelper) toRemove.push(obj);
  });
  toRemove.forEach((h) => scene.remove(h));
}

function highlightSelected() {
  clearHelpers();
  if (!state.selected.size) return;
  const THREE = window.THREE;
  if (!THREE || !THREE.BoxHelper || !scene) return;
  state.selected.forEach((id) => {
    const obj = state.objects.find((o) => o.id === id);
    if (!obj || !obj.mesh) return;
    const helper = new THREE.BoxHelper(obj.mesh, 0x4f9eff);
    helper.userData.isSelectionHelper = true;
    scene.add(helper);
  });
}

function rebuildFloorFromState() {
  if (!scene) return;
  rebuildFloor(scene, {
    type: state.floorMaterial,
    baseColor: state.floorColor,
    sizeMeters: Math.max(state.gridWidth, state.gridHeight),
    gridW: state.gridWidth,
    gridH: state.gridHeight,
  });
}

function assetById(id) {
  return allAssets.find((a) => String(a.id) === String(id)) || null;
}

function findObjectId(obj3d) {
  let cur = obj3d;
  while (cur) {
    if (cur.userData && cur.userData.objectId) return cur.userData.objectId;
    cur = cur.parent;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public state accessors (for UI modules / debugging)
// ---------------------------------------------------------------------------
export function getState() {
  return state;
}

export function getSelected() {
  return Array.from(state.selected);
}

// ---------------------------------------------------------------------------
// Toolbar helpers
// ---------------------------------------------------------------------------
function renderPropsPanel() {
  const ids = Array.from(state.selected);
  const objs = ids.map((id) => state.objects.find((o) => o.id === id)).filter(Boolean);
  renderProperties(null, objs[0] || null, {
    onChange: onPropChanged,
    onDelete: deleteSelected,
  });
}

function updateToolbarState() {
  document.querySelectorAll('[data-action="undo"]').forEach((b) => {
    b.disabled = state.historyIndex <= 0;
  });
  document.querySelectorAll('[data-action="redo"]').forEach((b) => {
    b.disabled = state.historyIndex >= state.history.length - 1;
  });
  document.querySelectorAll('[data-action="delete-selection"]').forEach((b) => {
    b.hidden = state.selected.size === 0;
  });
}

function render() {
  highlightSelected();
  renderPropsPanel();
  updateToolbarState();
  window.dispatchEvent(new CustomEvent('editor:render', { detail: { state } }));
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
async function bootstrap() {
  const container = document.getElementById('viewport');
  if (!container) throw new Error('Missing #viewport container');

  applyTheme(getCurrentTheme());

  const created = createScene(container, {
    gridW: state.gridWidth,
    gridH: state.gridHeight,
    floorColor: state.floorColor,
  });
  scene = created.scene;
  camera = created.camera;
  renderer = created.renderer;
  controls = created.controls;
  canvas = renderer.domElement;

  window.__roomDesignerScene = scene;
  window.__roomCamera = camera;
  window.__roomRenderer = renderer;
  window.__roomControls = controls;

  const sidebarEl = document.getElementById('editorSidebar');
  if (sidebarEl) {
    drawer = initDrawers(sidebarEl, { side: 'left', breakpoint: 900 });
  }

  wireInteractions();
  wireToolbar();
  startRenderLoop();
}

// ---------------------------------------------------------------------------
// Asset loading
// ---------------------------------------------------------------------------
async function loadAssets() {
  try {
    const resp = await getAssets();
    allAssets = Array.isArray(resp && resp.assets) ? resp.assets : [];
    const panelEl = document.querySelector('[data-sidebar-content="assets"]');
    if (panelEl) {
      renderAssetPanel(panelEl, allAssets, handleAssetPick);
    } else {
      renderAssetPanel(document.querySelector('#editorSidebar') || document.body, allAssets, handleAssetPick);
    }
  } catch (err) {
    console.error('Failed to load assets', err);
    toast('Failed to load asset library');
  }
  const loading = document.querySelector('[data-loading]');
  if (loading) loading.hidden = true;
}

function handleAssetPick(asset) {
  state.pendingAsset = asset;
  document.body.classList.add('placement-active');
  toast(`Click on the floor to place ${(asset && asset.name) || 'item'} (Esc to cancel)`);
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------
export function placeAsset(asset, x, z, rotation) {
  const mesh = createMeshForAsset(asset, x, z);
  if (!mesh) return null;

  const entry = {
    id: uid(),
    assetId: asset.id,
    assetName: asset.name || asset.id,
    category: asset.category || 'misc',
    x,
    z,
    rotation: rotation || 0,
    mesh,
  };
  mesh.userData.objectId = entry.id;
  if (scene) scene.add(mesh);
  mesh.rotation.y = ((rotation || 0) * Math.PI) / 180;

  state.objects.push(entry);
  saveState();
  render();
  return entry;
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------
export function selectObject(id, additive = false) {
  if (!additive) state.selected.clear();
  if (id == null) {
    render();
    return;
  }
  if (state.selected.has(id)) {
    state.selected.delete(id);
  } else {
    state.selected.add(id);
  }
  render();
}

export function clearSelection() {
  state.selected.clear();
  render();
}

export function selectAll() {
  state.objects.forEach((o) => state.selected.add(o.id));
  render();
}

// ---------------------------------------------------------------------------
// Delete / rotate / reorder
// ---------------------------------------------------------------------------
export function deleteSelected() {
  if (!state.selected.size) return;
  const toRemoveIds = new Set(state.selected);
  state.objects = state.objects.filter((o) => {
    if (toRemoveIds.has(o.id)) {
      if (scene && o.mesh) scene.remove(o.mesh);
      disposeMesh(o.mesh);
      return false;
    }
    return true;
  });
  state.selected.clear();
  saveState();
  render();
}

export function rotateSelected(deg) {
  if (!state.selected.size) return;
  state.objects.forEach((o) => {
    if (!state.selected.has(o.id) || !o.mesh) return;
    o.rotation = (o.rotation + deg) % 360;
    o.mesh.rotation.y = (o.rotation * Math.PI) / 180;
  });
  saveState();
  render();
}

function firstSelectedId() {
  return Array.from(state.selected)[0] || null;
}

export function reorderLayer(id, direction) {
  const idx = state.objects.findIndex((o) => o.id === id);
  if (idx === -1) return;
  const target = direction === 'up' ? idx + 1 : idx - 1;
  if (target < 0 || target >= state.objects.length) return;
  const tmp = state.objects[target];
  state.objects[target] = state.objects[idx];
  state.objects[idx] = tmp;
  saveState();
  render();
}

// ---------------------------------------------------------------------------
// Copy / paste
// ---------------------------------------------------------------------------
export function copySelected() {
  state.clipboard = state.objects
    .filter((o) => state.selected.has(o.id))
    .map((o) => ({
      assetId: o.assetId,
      assetName: o.assetName,
      category: o.category,
      rotation: o.rotation,
    }));
}

export function pasteClipboard() {
  if (!state.clipboard.length) return;
  state.clipboard.forEach((clip) => {
    const asset = assetById(clip.assetId);
    if (!asset) return;
    const last = state.objects[state.objects.length - 1];
    const x = (last?.x ?? 0) + 0.5;
    const z = (last?.z ?? 0) + 0.5;
    placeAsset(asset, x, z, clip.rotation || 0);
  });
}

// ---------------------------------------------------------------------------
// Undo / redo
// ---------------------------------------------------------------------------
export function undo() {
  if (state.historyIndex <= 0) return;
  state.historyIndex -= 1;
  applySnapshot(state.history[state.historyIndex]);
}

export function redo() {
  if (state.historyIndex >= state.history.length - 1) return;
  state.historyIndex += 1;
  applySnapshot(state.history[state.historyIndex]);
}

function applySnapshot(snap) {
  if (!scene) return;

  state.objects.forEach((o) => {
    if (o.mesh) {
      scene.remove(o.mesh);
      disposeMesh(o.mesh);
    }
  });
  state.objects = [];

  state.gridWidth = snap.gridWidth;
  state.gridHeight = snap.gridHeight;
  state.floorColor = snap.floorColor;
  state.floorMaterial = snap.floorMaterial;
  rebuildFloorFromState();

  snap.objects.forEach((o) => {
    const asset = assetById(o.assetId);
    if (!asset) return;
    const mesh = createMeshForAsset(asset, o.x, o.z);
    if (!mesh) return;
    mesh.rotation.y = (o.rotation * Math.PI) / 180;
    const entry = {
      id: o.id,
      assetId: o.assetId,
      assetName: o.assetName,
      category: o.category,
      x: o.x,
      z: o.z,
      rotation: o.rotation,
      mesh,
    };
    mesh.userData.objectId = o.id;
    scene.add(mesh);
    state.objects.push(entry);
  });

  state.selected.clear();
  render();
}

// ---------------------------------------------------------------------------
// Floor / grid mutations
// ---------------------------------------------------------------------------
export function resizeGrid(width, height) {
  state.gridWidth = Math.max(2, Math.min(64, width | 0));
  state.gridHeight = Math.max(2, Math.min(64, height | 0));
  rebuildFloorFromState();
  saveState();
  render();
}

export function changeFloorColor(color) {
  state.floorColor = color;
  rebuildFloorFromState();
  saveState();
  render();
}

export function changeFloorMaterial(material) {
  state.floorMaterial = material;
  rebuildFloorFromState();
  saveState();
  render();
}

// ---------------------------------------------------------------------------
// Persistence / export
// ---------------------------------------------------------------------------
function captureThumbnail() {
  if (!renderer || !scene || !camera) return null;
  const prevBg = scene.background;
  scene.background = new window.THREE.Color(0xf0f0f0);
  renderer.render(scene, camera);
  let dataUrl = renderer.domElement.toDataURL('image/webp', 0.7);
  let quality = 0.7;
  while (approxBytes(dataUrl) > 256 * 1024 && quality > 0.3) {
    quality -= 0.1;
    dataUrl = renderer.domElement.toDataURL('image/webp', quality);
  }
  scene.background = prevBg;
  renderer.render(scene, camera);
  return dataUrl;
}

function approxBytes(dataUrl) {
  const b64 = dataUrl.split(',')[1] || '';
  return Math.floor(b64.length * 0.75);
}

export async function saveDesign(name) {
  let thumbnail = null;
  try {
    thumbnail = captureThumbnail();
  } catch (_) {
    thumbnail = null;
  }
  const payload = {
    id: state.currentDesignId,
    name: name || 'Untitled room',
    grid_width: state.gridWidth,
    grid_height: state.gridHeight,
    floor_color: state.floorColor,
    floor_material: state.floorMaterial,
    template_id: state.currentTemplateId,
    objects: state.objects.map((o) => ({
      assetId: o.assetId,
      x: o.x,
      z: o.z,
      rotation: o.rotation,
    })),
    thumbnail,
  };
  const res = await apiSaveDesign(payload);
  if (res && res.id) {
    state.currentDesignId = res.id;
    state.currentTemplateId = null;
  }
  return res;
}

export function exportPng() {
  if (!renderer || !scene || !camera) return;
  const prevBg = scene.background;
  scene.background = new window.THREE.Color(0xf0f0f0);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.background = prevBg;
  renderer.render(scene, camera);
  const a = document.createElement('a');
  a.href = url;
  a.download = `room-${state.currentDesignId || Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ---------------------------------------------------------------------------
// Interaction wiring (pointer pick + drag)
// ---------------------------------------------------------------------------
function wireInteractions() {
  attachRaycaster(camera, canvas, scene, {
    onPick(mesh) {
      if (state.pendingAsset) return;
      const id = findObjectId(mesh);
      if (id) selectObject(id);
      else clearSelection();
    },
    onDragStart(mesh) {
      if (state.pendingAsset) return;
      const id = findObjectId(mesh);
      if (!id) return;
      if (!state.selected.has(id)) selectObject(id);
      if (controls) controls.enabled = false;
      const orig = new Map();
      state.objects
        .filter((o) => state.selected.has(o.id))
        .forEach((o) => orig.set(o.id, { x: o.x, z: o.z }));
      const anchor = orig.get(id) || { x: 0, z: 0 };
      dragInfo = { orig, startRef: { x: anchor.x, z: anchor.z } };
    },
    onDragMove(worldPos) {
      if (!dragInfo || !worldPos) return;
      const dx = worldPos.x - dragInfo.startRef.x;
      const dz = worldPos.z - dragInfo.startRef.z;
      dragInfo.orig.forEach(({ x, z }, oid) => {
        const o = state.objects.find((obj) => obj.id === oid);
        if (!o || !o.mesh) return;
        o.x = x + dx;
        o.z = z + dz;
        o.mesh.position.set(o.x, 0, o.z);
      });
    },
    onDragEnd() {
      if (!dragInfo) return;
      dragInfo = null;
      if (controls) controls.enabled = true;
      saveState();
      render();
    },
  });

  canvas.addEventListener('pointerdown', (e) => {
    pointerDownAt = { x: e.clientX, y: e.clientY };
    if (state.pendingAsset) return;
    if (e.button !== 0 && e.pointerType !== 'touch') return;
    const hit = raycastObject(camera, canvas, scene, e);
    if (hit && findObjectId(hit)) {
      controls.enabled = false;
    }
  });

  canvas.addEventListener('pointerup', () => {
    if (!dragInfo && !state.pendingAsset) controls.enabled = true;
  });

  canvas.addEventListener('click', (e) => {
    const down = pointerDownAt;
    pointerDownAt = null;
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
    if (!state.pendingAsset) return;
    const p = raycastFloorPoint(camera, canvas, scene, e);
    if (!p) return;
    const asset = state.pendingAsset;
    state.pendingAsset = null;
    document.body.classList.remove('placement-active');
    placeAsset(asset, p.x, p.z, 0);
    toast(`Placed ${asset.name || 'item'}`);
  });
}

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------
function isTypingTarget(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
}

function cancelPlacement() {
  if (state.pendingAsset) {
    state.pendingAsset = null;
    document.body.classList.remove('placement-active');
  }
}

// ---------------------------------------------------------------------------
// Toolbar + page wiring
// ---------------------------------------------------------------------------
function setCameraView(position, target) {
  if (!camera || !controls) return;
  camera.position.set(position[0], position[1], position[2]);
  controls.target.set(target[0], target[1], target[2]);
  controls.update();
  renderer.render(scene, camera);
}

function toggleGrid() {
  if (!scene) return;
  const floor = scene.getObjectByName('floor');
  if (floor) floor.visible = !floor.visible;
  document.querySelectorAll('[data-action="toggle-grid"]').forEach((b) => {
    b.classList.toggle('is-active', !!(floor && floor.visible));
  });
}

function toggleLights() {
  if (!scene) return;
  scene.traverse((o) => {
    if (o.isLight) o.visible = !o.visible;
  });
  document.querySelectorAll('[data-action="toggle-lights"]').forEach((b) => {
    b.classList.toggle('is-active', false);
  });
}

function wireToolbar() {
  const on = (sel, fn) => {
    document.querySelectorAll(sel).forEach((el) => el.addEventListener('click', fn));
  };

  on('[data-action="save"]', () => {
    const nameEl = document.querySelector('[data-action="rename-design"]');
    const name = (nameEl ? nameEl.textContent : '').trim() || 'Untitled design';
    setSaveState('Saving…', 'saving');
    saveDesign(name)
      .then(() => {
        setSaveState('Saved', 'saved');
        toast('Design saved');
        setTimeout(() => setSaveState('', ''), 2500);
      })
      .catch((err) => {
        setSaveState('Save failed', 'error');
        toast('Save failed: ' + (err && err.message ? err.message : 'unknown error'));
      });
  });

  on('[data-action="toggle-sidebar"]', () => {
    if (drawer) drawer.toggle();
  });

  on('[data-action="undo"]', () => {
    undo();
  });
  on('[data-action="redo"]', () => {
    redo();
  });
  on('[data-action="delete-selection"]', () => {
    deleteSelected();
  });
  on('[data-action="screenshot"]', () => {
    exportPng();
  });
  on('[data-action="help"]', () => {
    showShortcutsModal();
  });
  on('[data-action="toggle-grid"]', toggleGrid);
  on('[data-action="toggle-lights"]', toggleLights);
  on('[data-action="toggle-shadows"]', () => {
    if (!renderer) return;
    renderer.shadowMap.enabled = !renderer.shadowMap.enabled;
    renderer.render(scene, camera);
  });
  on('[data-action="view-top"]', () => setCameraView([0, 16, 0.001], [0, 0, 0]));
  on('[data-action="view-front"]', () => setCameraView([0, 1, 16], [0, 0, 0]));
  on('[data-action="view-perspective"]', () => setCameraView([7, 7, 7], [0, 0, 0]));
  on('[data-action="reset-camera"]', () => setCameraView([state.gridWidth * 0.6, state.gridHeight * 0.6, state.gridWidth * 0.6], [0, 0, 0]));

  on('[data-tool]', (e) => {
    const btn = e.currentTarget;
    const tool = btn.dataset.tool;
    document.querySelectorAll('[data-tool]').forEach((b) => {
      b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
    });
    if (tool === 'select') {
      // default interaction mode (no-op)
    }
  });

  const nameEl = document.querySelector('[data-action="rename-design"]');
  const rename = () => {
    const name = (nameEl ? nameEl.textContent : '').trim();
    if (name) setSaveState('Unsaved', 'dirty');
  };
  if (nameEl) {
    nameEl.addEventListener('input', rename);
    nameEl.addEventListener('blur', rename);
  }

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      document.querySelector('[data-action="save"]')?.click();
    }
    if (isTypingTarget(e.target)) return;
    if (e.key === 'Escape') cancelPlacement();
  });
}

function startRenderLoop() {
  const frame = () => {
    requestAnimationFrame(frame);
    try {
      if (controls) controls.update();
      if (renderer && scene && camera) renderer.render(scene, camera);
    } catch (err) {
      // ignore transient render errors
    }
  };
  frame();
}

// ---------------------------------------------------------------------------
// Properties panel callback wiring
// ---------------------------------------------------------------------------
function onPropChanged(name, value) {
  const id = firstSelectedId();
  const target = id ? state.objects.find((o) => o.id === id) : null;
  if (!target) return;
  if (name === 'name') {
    target.assetName = String(value == null ? '' : value);
    return;
  }
  if (name === 'col') {
    target.x = Number(value) || 0;
    if (target.mesh) target.mesh.position.x = target.x;
  } else if (name === 'row') {
    target.z = Number(value) || 0;
    if (target.mesh) target.mesh.position.z = target.z;
  } else if (name === 'rotation') {
    target.rotation = Number(value) || 0;
    if (target.mesh) target.mesh.rotation.y = (target.rotation * Math.PI) / 180;
  } else if (name === 'category') {
    target.category = String(value == null ? '' : value);
  }
  saveState();
  render();
}

// ---------------------------------------------------------------------------
// Initial design / template loading
// ---------------------------------------------------------------------------
function applyItemList(items) {
  if (!Array.isArray(items)) return;
  items.forEach((it) => {
    if (!it || it.assetId == null) return;
    const asset = assetById(it.assetId);
    if (!asset) return;
    const x = Number(it.x) || 0;
    const z = Number(it.z) || 0;
    const rot = Number(it.rotation) || 0;
    placeAsset(asset, x, z, rot);
  });
}

async function maybeLoadInitial() {
  const designId = window.DESIGN_ID;
  const templateId = window.TEMPLATE_ID;
  try {
    if (designId) {
      state.currentDesignId = designId;
      const resp = await getDesign(designId);
      const d = resp && resp.design ? resp.design : null;
      if (d) {
        const w = parseInt(d.grid_width, 10);
        const h = parseInt(d.grid_height, 10);
        if (w >= 4 && h >= 4) {
          state.gridWidth = w;
          state.gridHeight = h;
        }
        if (d.floor_color) state.floorColor = d.floor_color;
        if (d.floor_material) state.floorMaterial = d.floor_material;
        state.currentTemplateId = d.template_id || null;
        rebuildFloorFromState();
        let items = d.design_data;
        if (typeof items === 'string') {
          try {
            items = JSON.parse(items);
          } catch (_) {
            items = null;
          }
        }
        if (items && Array.isArray(items.objects)) items = items.objects;
        applyItemList(items);
      }
    } else if (templateId) {
      state.currentTemplateId = templateId;
      const resp = await getTemplate(templateId);
      const tpl = resp && resp.template ? resp.template : null;
      if (tpl) {
        const w = parseInt(tpl.grid_width, 10);
        const h = parseInt(tpl.grid_height, 10);
        if (w >= 2 && h >= 2) {
          state.gridWidth = w;
          state.gridHeight = h;
        }
        if (tpl.floor_color) state.floorColor = tpl.floor_color;
        rebuildFloorFromState();
        const tdata = tpl.template_data;
        if (tdata && tdata.rooms) {
          const first = tdata.rooms[0] || {};
          applyItemList(first.items);
        }
      }
    }
  } catch (err) {
    console.error('Failed to load initial design/template', err);
  }
}

// ---------------------------------------------------------------------------
// DOMContentLoaded
// ---------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await bootstrap();
    await loadAssets();
    await maybeLoadInitial();
    saveState();
    render();
  } catch (err) {
    console.error('Editor init failed', err);
    setSaveState('Editor failed to start', 'error');
    const loading = document.querySelector('[data-loading]');
    if (loading) loading.hidden = true;
  }
});

// Expose a few helpers globally for legacy hooks and debugging.
window.__roomEditor = {
  getState,
  getSelected,
  placeAsset,
  selectObject,
  clearSelection,
  deleteSelected,
  rotateSelected,
  undo,
  redo,
  copySelected,
  pasteClipboard,
  reorderLayer,
  resizeGrid,
  changeFloorColor,
  changeFloorMaterial,
  saveDesign,
  exportPng,
  selectAll,
};