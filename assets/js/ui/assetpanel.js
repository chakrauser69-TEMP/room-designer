// assets/js/ui/assetpanel.js
// Renders a searchable, categorized asset panel for the room designer.
// Exports: renderAssetPanel(container, assets, onPickCallback),
//          initAssetPanel({ state, onPlace }), getLoadedAssets()

const STORAGE_KEY = "roomDesigner:lastAssetSearch";
const SEARCH_INPUT_ID = "asset-panel-search-input";
const LIST_ID = "asset-panel-list";
const SIDEBAR_CONTAINER_ID = "editorSidebar";

// Module-level state for the controller API
let _safeAssets = [];
let _currentQuery = "";
let _lastContainer = null;
let _lastPickCallback = null;

/**
 * Read the persisted last search from localStorage.
 * Returns "" when storage is unavailable or no value was saved.
 */
function loadLastSearch() {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return typeof v === "string" ? v : "";
  } catch (err) {
    // Storage may be disabled (private mode, blocked cookies, etc.)
    return "";
  }
}

/**
 * Persist the current search query to localStorage.
 * Failures are swallowed because persistence is a progressive enhancement.
 */
function saveLastSearch(value) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch (err) {
    // Ignore quota / availability errors.
  }
}

/**
 * Escape a string so it can be safely inserted into innerHTML.
 * Only used for user-supplied display text (asset names, category names).
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Group assets by their `category` field while preserving insertion order
 * of categories as they first appear in the source array.
 */
function groupByCategory(assets) {
  const groups = new Map();
  for (const asset of assets) {
    const key = asset && asset.category ? String(asset.category) : "Uncategorized";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(asset);
  }
  return groups;
}

/**
 * Build the search input element with the persisted value preloaded.
 * The input is wired so every keystroke re-renders the list and
 * re-saves the query to localStorage.
 */
function buildSearchInput(initialValue, onInput) {
  const wrapper = document.createElement("div");
  wrapper.className = "asset-panel__search";

  const label = document.createElement("label");
  label.className = "asset-panel__search-label";
  label.setAttribute("for", SEARCH_INPUT_ID);
  label.textContent = "Search assets";

  const input = document.createElement("input");
  input.type = "search";
  input.id = SEARCH_INPUT_ID;
  input.className = "asset-panel__search-input";
  input.placeholder = "Search assets by name...";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.value = initialValue;
  input.setAttribute("aria-controls", LIST_ID);

  input.addEventListener("input", (event) => {
    const value = event.target.value;
    onInput(value);
  });

  wrapper.appendChild(label);
  wrapper.appendChild(input);
  return { wrapper, input };
}

/**
 * Build a single asset button. The button carries an aria-label, the
 * data-asset-id attribute, and an emoji icon so it is identifiable to
 * assistive tech, the picking callback, and the user respectively.
 */
function buildAssetButton(asset, onPickCallback) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "asset-panel__item";

  const id = asset && asset.id != null ? String(asset.id) : "";
  const name = asset && asset.name ? String(asset.name) : "Unnamed asset";
  const icon = asset && asset.icon ? String(asset.icon) : "\u{1F4E6}"; // default package emoji

  button.dataset.assetId = id;
  button.setAttribute("aria-label", `Add ${name}`);
  button.title = name;

  const iconSpan = document.createElement("span");
  iconSpan.className = "asset-panel__item-icon";
  iconSpan.setAttribute("aria-hidden", "true");

  const imagePath = asset && asset.image_path ? String(asset.image_path) : "";
  if (imagePath) {
    const img = document.createElement("img");
    img.className = "asset-panel__item-img";
    img.fetchPriority = "low";
    img.loading = "lazy";
    img.alt = "";
    img.src = imagePath + "?v=2";
    img.addEventListener("error", () => {
      if (img.parentNode) img.parentNode.removeChild(img);
      iconSpan.textContent = icon;
    });
    iconSpan.appendChild(img);
  } else {
    iconSpan.textContent = icon;
  }

  const nameSpan = document.createElement("span");
  nameSpan.className = "asset-panel__item-name";
  nameSpan.textContent = name;

  button.appendChild(iconSpan);
  button.appendChild(nameSpan);

  button.addEventListener("click", () => {
    if (typeof onPickCallback === "function") {
      try {
        onPickCallback(asset);
      } catch (err) {
        // A faulty consumer callback must not break the panel.
        console.error("onPickCallback threw:", err);
      }
    }
  });

  return button;
}

/**
 * Build one <section> per category. Each section has a heading and a
 * grid of asset buttons. Returns the array of section elements.
 */
function buildCategorySections(assets, onPickCallback) {
  const groups = groupByCategory(assets);
  const fragments = [];

  for (const [category, items] of groups) {
    const section = document.createElement("section");
    section.className = "asset-panel__section";
    section.dataset.category = category;

    const heading = document.createElement("h3");
    heading.className = "asset-panel__category";
    heading.textContent = category;

    const grid = document.createElement("div");
    grid.className = "asset-panel__grid";
    grid.setAttribute("role", "list");

    for (const asset of items) {
      const btn = buildAssetButton(asset, onPickCallback);
      btn.setAttribute("role", "listitem");
      grid.appendChild(btn);
    }

    section.appendChild(heading);
    section.appendChild(grid);
    fragments.push(section);
  }

  return fragments;
}

/**
 * Build a friendly empty-state message when nothing matches the query.
 */
function buildEmptyState(query) {
  const empty = document.createElement("p");
  empty.className = "asset-panel__empty";
  empty.setAttribute("role", "status");
  empty.setAttribute("aria-live", "polite");
  empty.textContent = query
    ? `No assets match "${query}".`
    : "No assets available.";
  return empty;
}

/**
 * Re-render only the list portion of the panel based on the
 * current search query. Sections and buttons are rebuilt so
 * filtering stays in sync without any manual DOM diffing.
 */
function rerender() {
  const list = document.getElementById(LIST_ID);
  if (!list) return;

  list.textContent = "";

  const query = _currentQuery.trim().toLowerCase();
  const allNames = _safeAssets.map((a) => a && a.name ? String(a.name) : "").map(n => n.toLowerCase());
  const matchesQuery = _currentQuery === ''
    ? true
    : allNames.some(n => n.includes(_currentQuery.trim().toLowerCase()));

  if (matchesQuery && _safeAssets.length > 0 || !_currentQuery.trim()) {
    // Show all assets when no query
    const sections = buildCategorySections(_safeAssets, _lastPickCallback);
    for (const section of sections) list.appendChild(section);
    const count = _safeAssets.length;
    const liveRegion = list.previousSibling;
    if (liveRegion && liveRegion.className === "asset-panel__live") {
      liveRegion.textContent = `${count} assets shown`;
    }
  } else if (_currentQuery.trim()) {
    // Show filtered results
    const filteredAssets = _safeAssets.filter((a) => {
      const name = a && a.name ? String(a.name) : "";
      return name.toLowerCase().includes(_currentQuery.trim().toLowerCase());
    });
    if (filteredAssets.length > 0) {
      const sections = buildCategorySections(filteredAssets, _lastPickCallback);
      for (const section of sections) list.appendChild(section);
      const liveRegion = list.previousSibling;
      if (liveRegion && liveRegion.className === "asset-panel__live") {
        liveRegion.textContent = `${filteredAssets.length} assets shown`;
      }
    } else {
      const liveRegion = list.previousSibling;
      if (liveRegion && liveRegion.className === "asset-panel__live") {
        liveRegion.textContent = `No assets match "${_currentQuery.trim()}."`;
      }
    }
  }
}

/**
 * Main entry point. Wipes `container` and renders a search input plus
 * one section per category. Returns a small controller object that
 * lets the caller update the asset list later (e.g. after a fetch).
 *
 * If `onPickCallback` is omitted, clicking an asset will do nothing
 * (the panel still renders correctly).
 *
 * @param {Element} container - DOM element to render into.
 * @param {Array} assets - Asset data array.
 * @param {Function} [onPickCallback] - Called with the selected asset on click.
 * @returns {Object} Controller with setAssets(), setQuery(), refresh(), getQuery() methods.
 */
export function renderAssetPanel(container, assets, onPickCallback) {
  if (!container || !(container instanceof Element)) {
    throw new Error("renderAssetPanel: container must be a DOM Element");
  }

  // Store container reference and reset state.
  _lastContainer = container;
  _safeAssets = Array.isArray(assets) ? assets : [];
  _lastPickCallback = typeof onPickCallback === "function" ? onPickCallback : null;
  _currentQuery = loadLastSearch();

  // Clear previous content.
  container.textContent = "";
  container.classList.add("asset-panel");

  // Header / search.
  const header = document.createElement("div");
  header.className = "asset-panel__header";

  const title = document.createElement("h2");
  title.className = "asset-panel__title";
  title.id = "asset-panel-title";
  title.textContent = "Assets";
  header.appendChild(title);

  const { wrapper: searchWrapper, input: searchInput } = buildSearchInput(
    _currentQuery,
    (value) => {
      _currentQuery = value;
      saveLastSearch(value);
      rerender();
    }
  );
  header.appendChild(searchWrapper);
  container.appendChild(header);

  // Live region for screen-reader announcements of result counts.
  const liveRegion = document.createElement("p");
  liveRegion.className = "asset-panel__live";
  liveRegion.setAttribute("aria-live", "polite");
  liveRegion.setAttribute("aria-atomic", "true");
  container.appendChild(liveRegion);

  // List host.
  const list = document.createElement("div");
  list.id = LIST_ID;
  list.className = "asset-panel__categories";
  list.setAttribute("aria-labelledby", title.id);
  container.appendChild(list);

  // Initial render.
  rerender();

  // Expose a minimal controller so callers can refresh the data
  // without rebuilding the whole panel.
  const controller = {
    setAssets(nextAssets) {
      _safeAssets.length = 0;
      if (Array.isArray(nextAssets)) _safeAssets.push(...nextAssets);
      rerender();
    },
    setQuery(nextQuery) {
      _currentQuery = typeof nextQuery === "string" ? nextQuery : "";
      const searchInput = document.getElementById(SEARCH_INPUT_ID);
      if (searchInput) {
        searchInput.value = _currentQuery;
      }
      saveLastSearch(_currentQuery);
      rerender();
    },
    getQuery() {
      return _currentQuery;
    },
    refresh: rerender,
  };

  return controller;
}

/**
 * Initialize the asset panel module, storing state and the onPlace callback.
 * This is called by editor.js to set up the asset panel state.
 *
 * @param {{ state: object, onPlace: (asset: object) => void }} options
 *   - state: editor state object
 *   - onPlace: callback called when an asset is placed, receives the asset data
 */
export function initAssetPanel({ state, onPlace }) {
  // Store the onPlace callback for use by other modules
  // The renderAssetPanel call in editor.js already handles the UI rendering
  // This function exists for compatibility and future state management
  if (onPlace && typeof onPlace === "function") {
    // Callback is available for use; UI is already rendered by renderAssetPanel
  }
}

/**
 * Get the last loaded assets array from the asset panel.
 * Useful for undo/redo and state persistence.
 * @returns {Array} The last assets array that was rendered.
 */
export function getLoadedAssets() {
  return _safeAssets;
}