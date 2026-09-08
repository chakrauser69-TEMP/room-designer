/**
 * raycast.js — Pointer/raycast interaction layer for the room-designer.
 *
 * Wires the WebGL canvas to Pointer Events and emits high-level gestures
 * (pick, drag, hover, click, pinch) through a small callbacks surface.
 *
 * Coordinates:
 *   - Floor plane is y = 0 (constant THREE.Plane).
 *   - World drag positions are reported as { x, z } (Y is implied = 0).
 *   - Screen-to-NDC conversion uses getBoundingClientRect + canvas size.
 *
 * The module is framework-agnostic: it owns no UI state, just gestures.
 */

import * as THREE from 'three';

const CLICK_PIXEL_THRESHOLD = 5;       // px of movement allowed before a press becomes a drag
const CLICK_TIME_THRESHOLD = 250;      // ms; presses longer than this cannot be clicks

const POINTER_BUTTON_LEFT = 0;

/**
 * @typedef {Object} RaycasterCallbacks
 * @property {(mesh: import('three').Object3D|null) => void} onPick
 * @property {(mesh: import('three').Object3D) => void} onDragStart
 * @property {(worldPos: {x:number, z:number}) => void} onDragMove
 * @property {(worldPos: {x:number, z:number}) => void} onDragEnd
 * @property {(mesh: import('three').Object3D|null) => void} onHover
 * @property {(scaleRatio: number) => void} onPinch
 */

/**
 * Create a raycaster bound to the given canvas.
 *
 * @param {import('three').Camera} camera
 * @param {HTMLCanvasElement} canvas
 * @param {import('three').Scene} scene
 * @param {RaycasterCallbacks} callbacks
 * @returns {{ dispose: () => void }}
 */
export function createRaycaster(camera, canvas, scene, callbacks) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint = new THREE.Vector3();

  /** All active pointers, keyed by pointerId. */
  const activePointers = new Map();

  /** Whether we are currently in a drag gesture. */
  let isDragging = false;

  /** The mesh currently being dragged, if any. */
  let dragTarget = null;

  /** The pointerId that initiated the drag (lock to that pointer only). */
  let dragPointerId = null;

  /** Pointer-down bookkeeping for click vs drag classification. */
  let downX = 0;
  let downY = 0;
  let downTime = 0;
  let downHasMoved = false;
  let downPointerId = null;

  /** Pinch bookkeeping. */
  let pinchPrevDistance = 0;
  let pinchActive = false;

  /** Suppress hover emissions during an active drag (avoids spurious picks). */
  let hoverDirty = true;

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  function setNdcFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function pickAtEvent(event) {
    setNdcFromEvent(event);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(scene, true);
    if (hits.length === 0) return null;
    // First non-decorator hit. Filters / decorators can be tagged later
    // via userData.isPickerIgnore === true.
    for (const hit of hits) {
      let obj = hit.object;
      let ignore = false;
      while (obj) {
        if (obj.userData && obj.userData.isPickerIgnore) {
          ignore = true;
          break;
        }
        obj = obj.parent;
      }
      if (!ignore) return hit.object;
    }
    return null;
  }

  function intersectFloor(event) {
    setNdcFromEvent(event);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.ray.intersectPlane(floorPlane, hitPoint);
    if (!hit) return null;
    return { x: hitPoint.x, z: hitPoint.z };
  }

  function intersectObject(event) {
    setNdcFromEvent(event);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(scene, true);
    if (hits.length === 0) return null;
    return pickAtEvent(event);
  }

  function distanceSq(a, b) {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return dx * dx + dy * dy;
  }

  function clearDragState() {
    isDragging = false;
    dragTarget = null;
    dragPointerId = null;
    downHasMoved = false;
    downPointerId = null;
  }

  function clearPinchState() {
    pinchActive = false;
    pinchPrevDistance = 0;
  }

  // ---------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------

  function onPointerDown(event) {
    // Only main button drags; secondary buttons are ignored so context menus etc.
    // remain native. Touch / pen inputs typically report button 0.
    if (event.pointerType !== 'touch' && event.button !== POINTER_BUTTON_LEFT) {
      return;
    }

    canvas.setPointerCapture?.(event.pointerId);
    activePointers.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
    });

    if (activePointers.size === 1) {
      // Possible click / drag start.
      downPointerId = event.pointerId;
      downX = event.clientX;
      downY = event.clientY;
      downTime = performance.now();
      downHasMoved = false;
      isDragging = false;
      dragTarget = null;
      dragPointerId = null;
    } else if (activePointers.size === 2) {
      // Second finger landed — start pinch tracking, abort any pending click/drag.
      isDragging = false;
      dragTarget = null;
      downPointerId = null;
      const [a, b] = activePointers.values();
      pinchPrevDistance = distanceSq(a, b);
      pinchActive = true;
    }
  }

  function onPointerMove(event) {
    const entry = activePointers.get(event.pointerId);
    if (!entry) return;
    entry.clientX = event.clientX;
    entry.clientY = event.clientY;

    // Pinch handling — only when exactly two pointers are down.
    if (activePointers.size === 2 && pinchActive) {
      const [a, b] = activePointers.values();
      const currentDist = distanceSq(a, b);
      if (pinchPrevDistance > 0 && currentDist > 0) {
        const ratio = currentDist / pinchPrevDistance;
        if (callbacks.onPinch) callbacks.onPinch(ratio);
      }
      pinchPrevDistance = currentDist;
      return;
    }

    // Single-pointer drag — only the pointer that started the gesture owns it.
    if (
      activePointers.size === 1 &&
      downPointerId === event.pointerId
    ) {
      const dx = event.clientX - downX;
      const dy = event.clientY - downY;
      const movedPx = distanceSq({ clientX: event.clientX, clientY: event.clientY }, { clientX: downX, clientY: downY });

      if (!isDragging) {
        // Promote to drag once we exceed the pixel threshold OR the time budget.
        const elapsed = performance.now() - downTime;
        const overPixel = movedPx > CLICK_PIXEL_THRESHOLD * CLICK_PIXEL_THRESHOLD;
        const overTime = elapsed > CLICK_TIME_THRESHOLD;
        if (overPixel || overTime) {
          downHasMoved = true;
          isDragging = true;
          dragPointerId = event.pointerId;
          dragTarget = pickAtEvent(event);
          if (callbacks.onDragStart) callbacks.onDragStart(dragTarget);
        }
      }

      if (isDragging) {
        const worldPos = intersectFloor(event);
        if (worldPos && callbacks.onDragMove) {
          callbacks.onDragMove(worldPos);
        }
      }
      return;
    }

    // Hover — emit only when the gesture is idle and pointer movement is over us.
    if (activePointers.size === 0 && !isDragging) {
      if (event.pointerType === 'touch') return; // touch devices don't hover meaningfully
      const mesh = pickAtEvent(event);
      if (callbacks.onHover) callbacks.onHover(mesh);
    }
  }

  function onPointerMove2(event) {
    // deprecated: use onPointerMove above
  }

  function onPointerUp(event) {
    if (!activePointers.has(event.pointerId)) return;
    activePointers.delete(event.pointerId);
    canvas.releasePointerCapture?.(event.pointerId);

    // End of pinch?
    if (activePointers.size < 2) {
      clearPinchState();
    }

    // End of drag?
    if (isDragging && dragPointerId === event.pointerId) {
      const worldPos = intersectFloor(event);
      if (callbacks.onDragEnd) callbacks.onDragEnd(worldPos);
      clearDragState();
      hoverDirty = true;
      return;
    }

    // Possible click — only the pointer that started the press, and only if
    // movement stayed within the threshold and time budget.
    if (downPointerId === event.pointerId && !downHasMoved) {
      const elapsed = performance.now() - downTime;
      if (elapsed <= CLICK_TIME_THRESHOLD) {
        const mesh = pickAtEvent(event);
        if (callbacks.onPick) callbacks.onPick(mesh);
      }
      downPointerId = null;
    } else if (downPointerId === event.pointerId) {
      downPointerId = null;
    }
  }

  function onPointerCancel(event) {
    if (!activePointers.has(event.pointerId)) return;
    activePointers.delete(event.pointerId);
    canvas.releasePointerCapture?.(event.pointerId);

    if (isDragging && dragPointerId === event.pointerId) {
      if (callbacks.onDragEnd) callbacks.onDragEnd(null);
    }
    clearDragState();
    clearPinchState();
  }

  function onPointerLeave() {
    if (activePointers.size > 0) return; // captured pointer; ignore
    if (callbacks.onHover) callbacks.onHover(null);
  }

  // ---------------------------------------------------------------------
  // Bind
  // ---------------------------------------------------------------------

  const bound = {
    down: onPointerDown,
    move: onPointerMove,
    up: onPointerUp,
    cancel: onPointerCancel,
    leave: onPointerLeave,
  };

  const opts = { passive: false };
  canvas.addEventListener('pointerdown', bound.down, opts);
  canvas.addEventListener('pointermove', bound.move, opts);
  canvas.addEventListener('pointerup', bound.up, opts);
  canvas.addEventListener('pointercancel', bound.cancel, opts);
  canvas.addEventListener('pointerleave', bound.leave, opts);

  // ---------------------------------------------------------------------
  // Dispose
  // ---------------------------------------------------------------------

  function dispose() {
    canvas.removeEventListener('pointerdown', bound.down, opts);
    canvas.removeEventListener('pointermove', bound.move, opts);
    canvas.removeEventListener('pointerup', bound.up, opts);
    canvas.removeEventListener('pointercancel', bound.cancel, opts);
    canvas.removeEventListener('pointerleave', bound.leave, opts);

    activePointers.clear();
    clearDragState();
    clearPinchState();
  }

  return { dispose };
}

/**
 * Attach a raycaster to the canvas for picking and drag gestures.
 * Convenience wrapper around createRaycaster.
 *
 * @param {import('three').Camera} camera
 * @param {HTMLCanvasElement} canvas
 * @param {import('three').Scene} scene
 * @param {RaycasterCallbacks} callbacks
 * @returns {{ dispose: () => void }}
 */
export function attachRaycaster(camera, canvas, scene, callbacks) {
  return createRaycaster(camera, canvas, scene, callbacks);
}

/**
 * Raycast to the floor plane at the given event position.
 * Convenience function for floor placement.
 *
 * @param {import('three').Camera} camera
 * @param {HTMLCanvasElement} canvas
 * @param {import('three').Scene} scene
 * @param {Event} event
 * @returns {{ x: number, z: number }} world position on the floor, or null
 */
export function raycastFloorPoint(camera, canvas, scene, event) {
  // Create a temporary raycaster to avoid side effects
  const tmpRaycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint = new THREE.Vector3();

  function setNdcFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  setNdcFromEvent(event);
  tmpRaycaster.setFromCamera(ndc, camera);
  const hit = tmpRaycaster.ray.intersectPlane(floorPlane, hitPoint);
  if (!hit) return null;
  return { x: hitPoint.x, z: hitPoint.z };
}

/**
 * Raycast to the first intersected object in the scene.
 * Convenience function for object picking.
 *
 * @param {import('three').Camera} camera
 * @param {HTMLCanvasElement} canvas
 * @param {import('three').Scene} scene
 * @param {Event} event
 * @returns {import('three').Object3D|null} intersected object, or null
 */
export function raycastObject(camera, canvas, scene, event) {
  // Create a temporary raycaster to avoid side effects
  const tmpRaycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hitPoint = new THREE.Vector3();

  function setNdcFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  setNdcFromEvent(event);
  tmpRaycaster.setFromCamera(ndc, camera);
  const hits = tmpRaycaster.intersectObjects(scene, true);
  if (hits.length === 0) return null;
  // First non-decorator hit
  for (const hit of hits) {
    let obj = hit.object;
    let ignore = false;
    while (obj) {
      if (obj.userData && obj.userData.isPickerIgnore) {
        ignore = true;
        break;
      }
      obj = obj.parent;
    }
    if (!ignore) return hit.object;
  }
  return null;
}