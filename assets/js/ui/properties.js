// assets/js/ui/properties.js
//
// Properties panel for the room designer editor.
//
// Renders an editable form for the currently selected scene object:
//   - Name (text)
//   - Position (column, row) — grid coordinates
//   - Rotation (numeric, degrees)
//   - Category (text)
//   - Delete button
//
// When no object is selected, a "Select an object" prompt is shown instead.
//
// Exports:
//   initProperties({ state, onUpdate })  — bootstraps the module
//   renderProperties(container, selectedObject, callbacks)
//       container      : HTMLElement to render into
//       selectedObject : the selected object entry, or an array of entries
//                        (the first entry is used for editing). null/undefined
//                        or an empty array renders the empty-state prompt.
//       callbacks      : {
//         onChange(name, value)  — fired whenever an editable field changes
//         onDelete()             — fired when the Delete button is clicked
//       }
//
// The module also auto-discovers an inner container using
// `[data-properties]` if `container` is omitted, so existing call sites that
// pass nothing (or pass an array of selected ids) keep working.

const KNOWN_FIELDS = ['name', 'col', 'row', 'rotation', 'category'];

let _state = null;
let _onUpdate = null;
let _innerContainer = null;
let _lastCallbacks = null;
let _lastTarget = null;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveContainer(container) {
  if (container && container instanceof HTMLElement) return container;
  if (_innerContainer && _innerContainer instanceof HTMLElement) return _innerContainer;
  const discovered = document.querySelector('[data-properties]');
  if (discovered) {
    _innerContainer = discovered;
    return discovered;
  }
  return null;
}

function normalizeTarget(selectedObject) {
  if (selectedObject == null) return null;
  if (Array.isArray(selectedObject)) {
    return selectedObject.length > 0 ? selectedObject[0] : null;
  }
  return selectedObject;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') {
      for (const [dk, dv] of Object.entries(value)) node.dataset[dk] = dv;
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'html') {
      node.innerHTML = value;
    } else if (key === 'text') {
      node.textContent = value;
    } else if (key === 'value' || key === 'checked' || key === 'disabled') {
      node[key] = value;
    } else {
      node.setAttribute(key, value);
    }
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function toInt(value, fallback = 0) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function toFloat(value, fallback = 0) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function renderEmpty(container) {
  container.innerHTML = '';
  container.appendChild(
    el('div', { class: 'properties-empty', role: 'status' }, [
      el('div', { class: 'properties-empty__icon', html: '<svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true" focusable="false"><path d="M4 4 H20 V20 H4 Z M4 9 H20 M9 4 V20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>' }),
      el('p', { class: 'properties-empty__title', text: 'Select an object' }),
      el('p', { class: 'properties-empty__hint', text: 'Click an object in the scene or in the asset panel to edit its properties.' }),
    ])
  );
}

// ---------------------------------------------------------------------------
// Editable form
// ---------------------------------------------------------------------------

function buildForm(target, callbacks) {
  const safeCallbacks = callbacks || {};
  const onChange = typeof safeCallbacks.onChange === 'function'
    ? safeCallbacks.onChange
    : (name, value) => emitChange(name, value, target);
  const onDelete = typeof safeCallbacks.onDelete === 'function'
    ? safeCallbacks.onDelete
    : () => emitDelete(target);

  const initial = {
    name: target.name ?? target.assetName ?? '',
    col: Number.isFinite(target.col) ? target.col : toInt(target.x, 0),
    row: Number.isFinite(target.row) ? target.row : toInt(target.z, 0),
    rotation: Number.isFinite(target.rotation) ? target.rotation : 0,
    category: target.category ?? '',
  };

  const frag = document.createDocumentFragment();

  // --- Header
  frag.appendChild(
    el('header', { class: 'properties__header' }, [
      el('h3', { class: 'properties__title', text: 'Object Properties' }),
      el('span', {
        class: 'properties__id',
        text: target.id ? `id: ${String(target.id).slice(0, 8)}` : '',
        title: target.id || '',
      }),
    ])
  );

  // --- Name
  const nameInput = el('input', {
    type: 'text',
    id: 'prop-name',
    class: 'properties__input',
    value: initial.name,
    placeholder: 'Object name',
    'aria-label': 'Object name',
  });
  nameInput.addEventListener('input', () => onChange('name', nameInput.value));

  frag.appendChild(
    el('div', { class: 'properties__field' }, [
      el('label', { for: 'prop-name', class: 'properties__label', text: 'Name' }),
      nameInput,
    ])
  );

  // --- Position (col, row)
  const colInput = el('input', {
    type: 'number',
    id: 'prop-col',
    class: 'properties__input',
    value: String(initial.col),
    step: '1',
    'aria-label': 'Column',
  });
  const rowInput = el('input', {
    type: 'number',
    id: 'prop-row',
    class: 'properties__input',
    value: String(initial.row),
    step: '1',
    'aria-label': 'Row',
  });
  colInput.addEventListener('change', () => onChange('col', toInt(colInput.value, initial.col)));
  rowInput.addEventListener('change', () => onChange('row', toInt(rowInput.value, initial.row)));

  frag.appendChild(
    el('div', { class: 'properties__field properties__field--row' }, [
      el('span', { class: 'properties__label', text: 'Position' }),
      el('div', { class: 'properties__group' }, [
        el('label', { for: 'prop-col', class: 'visually-hidden', text: 'Column' }),
        colInput,
        el('span', { class: 'properties__sep', text: ',' }),
        el('label', { for: 'prop-row', class: 'visually-hidden', text: 'Row' }),
        rowInput,
      ]),
    ])
  );

  // --- Rotation
  const rotationInput = el('input', {
    type: 'number',
    id: 'prop-rotation',
    class: 'properties__input',
    value: String(initial.rotation),
    step: '1',
    'aria-label': 'Rotation in degrees',
  });
  rotationInput.addEventListener('change', () => {
    // Normalize into [0, 360)
    let v = toFloat(rotationInput.value, initial.rotation);
    v = ((v % 360) + 360) % 360;
    rotationInput.value = String(v);
    onChange('rotation', v);
  });

  frag.appendChild(
    el('div', { class: 'properties__field' }, [
      el('label', { for: 'prop-rotation', class: 'properties__label', text: 'Rotation (deg)' }),
      rotationInput,
    ])
  );

  // --- Category
  const categoryInput = el('input', {
    type: 'text',
    id: 'prop-category',
    class: 'properties__input',
    value: initial.category,
    placeholder: 'e.g. seating, lighting',
    list: 'properties-category-list',
    'aria-label': 'Category',
  });
  categoryInput.addEventListener('change', () => onChange('category', categoryInput.value));

  const datalist = el('datalist', { id: 'properties-category-list' });
  for (const option of ['seating', 'tables', 'lighting', 'storage', 'decor', 'misc']) {
    datalist.appendChild(el('option', { value: option }));
  }

  frag.appendChild(
    el('div', { class: 'properties__field' }, [
      el('label', { for: 'prop-category', class: 'properties__label', text: 'Category' }),
      categoryInput,
      datalist,
    ])
  );

  // --- Actions
  const deleteBtn = el('button', {
    type: 'button',
    class: 'properties__btn properties__btn--danger',
    'aria-label': 'Delete object',
    onclick: () => onDelete(),
  }, [
    el('span', { class: 'properties__btn-icon', html: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M4 7 H20 M9 7 V4 H15 V7 M6 7 L7 21 H17 L18 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' }),
    el('span', { text: 'Delete' }),
  ]);

  frag.appendChild(
    el('div', { class: 'properties__actions' }, [deleteBtn])
  );

  return frag;
}

// ---------------------------------------------------------------------------
// Event fallbacks (used when no callbacks supplied)
// ---------------------------------------------------------------------------

function emitChange(name, value, target) {
  if (!KNOWN_FIELDS.includes(name)) return;
  if (_state && target) {
    if (name === 'col' || name === 'x') target.x = value;
    else if (name === 'row' || name === 'z') target.z = value;
    else target[name] = value;
  }
  if (typeof _onUpdate === 'function') {
    try { _onUpdate({ type: 'change', name, value, target }); } catch (_) { /* ignore */ }
  }
  window.dispatchEvent(new CustomEvent('properties:change', {
    detail: { name, value, target },
  }));
}

function emitDelete(target) {
  if (typeof _onUpdate === 'function') {
    try { _onUpdate({ type: 'delete', target }); } catch (_) { /* ignore */ }
  }
  window.dispatchEvent(new CustomEvent('properties:delete', {
    detail: { target },
  }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the properties module. Stores the editor state and update
 * callback so renderProperties() can fall back to sensible defaults when the
 * caller doesn't supply its own callbacks.
 *
 * @param {{ state?: object, onUpdate?: (evt: object) => void }} [options]
 */
export function initProperties(options = {}) {
  _state = options && options.state ? options.state : _state;
  _onUpdate = options && typeof options.onUpdate === 'function'
    ? options.onUpdate
    : _onUpdate;
}

/**
 * Render the properties form for the currently selected object.
 *
 * @param {HTMLElement} [container] - Target element. If omitted, the module
 *   will use the previously remembered container (or `[data-properties]`).
 * @param {object|object[]|null} [selectedObject] - The selected object entry
 *   (or an array whose first element will be edited). Falsy / empty array
 *   renders the empty-state prompt.
 * @param {{
 *   onChange?: (name: string, value: any) => void,
 *   onDelete?: () => void,
 * }} [callbacks]
 */
export function renderProperties(container, selectedObject, callbacks) {
  const target = resolveContainer(container);
  if (!target) {
    // Nothing to render into. Still cache the last call for introspection.
    _lastCallbacks = callbacks || null;
    _lastTarget = normalizeTarget(selectedObject);
    return;
  }
  _innerContainer = target;
  _lastCallbacks = callbacks || null;
  _lastTarget = normalizeTarget(selectedObject);

  const obj = normalizeTarget(selectedObject);
  if (!obj) {
    renderEmpty(target);
    return;
  }

  target.innerHTML = '';
  target.appendChild(buildForm(obj, callbacks));
}

/**
 * Re-render the last view. Useful after external state changes.
 */
export function refreshProperties() {
  if (!_lastTarget) {
    if (_innerContainer) renderEmpty(_innerContainer);
    return;
  }
  renderProperties(_innerContainer, _lastTarget, _lastCallbacks);
}

export default renderProperties;
