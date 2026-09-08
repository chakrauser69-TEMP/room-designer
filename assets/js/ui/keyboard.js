// assets/js/ui/keyboard.js
// Global keyboard shortcuts for the room designer.
// ES module — export initKeyboard({...callbacks}).
//
// Behaviour
// ---------
// * Listens to keydown / keyup on `window`.
// * Skips events whose target is an <input>, <textarea>, <select>,
//   or any [contenteditable] element (or one of its descendants) so
//   normal text editing keeps working.
// * Modifier-aware: treats Cmd (macOS) the same as Ctrl.
// * Calls the matching callback from the `callbacks` object.
// * Exposes onShowHelp — pressing "?" / "Shift+/" or F1 calls it, and
//   the modal markup is built and rendered here so the host page does
//   not have to know how it looks.
//
// Additional exports:
//   registerShortcut(keys, callback) — add a custom shortcut
//   showShortcutsModal() — show the help modal

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");

// Ctrl on Win/Linux, Meta (Cmd) on Mac — used for app-wide shortcuts.
const APP_MODIFIER = (e) => (isMac ? e.metaKey : e.ctrlKey);

function isEditableTarget(target) {
  if (!target || target.nodeType !== 1) return false;
  const el = target;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  // Walk up in case the event target is nested inside an editable host.
  let cur = el;
  while (cur && cur !== document.body) {
    if (cur.isContentEditable) return true;
    cur = cur.parentElement;
  }
  return false;
}

function safe(cb, ...args) {
  if (typeof cb === "function") {
    try {
      cb(...args);
    } catch (err) {
      // Don't let a buggy callback kill the global listener.
      console.error("[keyboard] callback threw:", err);
    }
  }
}

// Help modal

const HELP_ROWS = [
  { keys: ["Ctrl", "Z"],          desc: "Undo" },
  { keys: ["Ctrl", "Shift", "Z"], desc: "Redo" },
  { keys: ["Ctrl", "Y"],          desc: "Redo (alt)" },
  { keys: ["Ctrl", "C"],          desc: "Copy selection" },
  { keys: ["Ctrl", "V"],          desc: "Paste" },
  { keys: ["Ctrl", "A"],          desc: "Select all" },
  { keys: ["Delete"],             desc: "Delete selection" },
  { keys: ["R"],                  desc: "Rotate selected" },
  { keys: ["Esc"],                desc: "Cancel / clear selection" },
  { keys: ["]"],                  desc: "Bring forward (LayerUp)" },
  { keys: ["["],                  desc: "Send backward (LayerDown)" },
  { keys: ["Ctrl", "]"],          desc: "Bring to front" },
  { keys: ["Ctrl", "["],          desc: "Send to back" },
  { keys: ["G"],                  desc: "Toggle grid" },
  { keys: ["?"],                  desc: "Show this help" },
  { keys: ["F1"],                 desc: "Show this help" },
];

function buildHelpModal() {
  if (document.getElementById("keyboard-help-modal")) return;

  const overlay = document.createElement("div");
  overlay.id = "keyboard-help-modal";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "keyboard-help-title");
  overlay.style.cssText = [
    "position:fixed", "inset:0", "z-index:9999",
    "background:rgba(0,0,0,0.55)",
    "display:flex", "align-items:center", "justify-content:center",
    "font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
  ].join(";");

  const panel = document.createElement("div");
  panel.className = "keyboard-help-panel";
  panel.style.cssText = [
    "background:#1c1c1e", "color:#f5f5f7",
    "border-radius:10px", "padding:20px 24px",
    "min-width:320px", "max-width:480px",
    "box-shadow:0 20px 60px rgba(0,0,0,0.5)",
  ].join(";");

  const title = document.createElement("h2");
  title.id = "keyboard-help-title";
  title.textContent = "Keyboard shortcuts";
  title.style.cssText = "margin:0 0 12px;font-size:18px;font-weight:600;";

  const table = document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse;font-size:13px;";
  const tbody = document.createElement("tbody");
  for (const row of HELP_ROWS) {
    const tr = document.createElement("tr");
    tr.style.cssText = "border-bottom:1px solid rgba(255,255,255,0.08);";

    const tdK = document.createElement("td");
    tdK.style.cssText = "padding:6px 8px 6px 0;width:42%;";
    for (let i = 0; i < row.keys.length; i++) {
      const kbd = document.createElement("kbd");
      kbd.textContent = row.keys[i].replace("Ctrl", isMac ? "Cmd" : "Ctrl");
      kbd.style.cssText = [
        "display:inline-block",
        "padding:2px 6px",
        "margin:0 2px 2px 0",
        "border-radius:4px",
        "background:#2c2c2e",
        "border:1px solid #3a3a3c",
        "font-family:ui-monospace,SFMono-Regular,Menlo,monospace",
        "font-size:12px",
        "line-height:1.2",
      ].join(";");
      tdK.appendChild(kbd);
    }

    const tdD = document.createElement("td");
    tdD.textContent = row.desc;
    tdD.style.cssText = "padding:6px 0;color:#d1d1d6;";

    tr.appendChild(tdK);
    tr.appendChild(tdD);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  const footer = document.createElement("div");
  footer.style.cssText =
    "margin-top:14px;text-align:right;font-size:12px;color:#8e8e93;";
  footer.textContent = "Press Esc, ?, or click outside to close.";

  panel.appendChild(title);
  panel.appendChild(table);
  panel.appendChild(footer);
  overlay.appendChild(panel);

  // Close on overlay click (but not on panel click).
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) closeHelp();
  });

  // Inject minimal styles for kbd font fallback if the host page didn't.
  if (!document.getElementById("keyboard-help-styles")) {
    const style = document.createElement("style");
    style.id = "keyboard-help-styles";
    style.textContent =
      "kbd{font-style:normal}#keyboard-help-modal table tr:last-child{border-bottom:none}";
    document.head.appendChild(style);
  }

  document.body.appendChild(overlay);
}

function closeHelp() {
  const el = document.getElementById("keyboard-help-modal");
  if (el) el.remove();
}

function showHelp() {
  buildHelpModal();
  const el = document.getElementById("keyboard-help-modal");
  if (el) el.style.display = "flex";
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function onKeydown(e, callbacks) {
  if (isEditableTarget(e.target)) return;

  const mod = APP_MODIFIER(e);
  const key = e.key;

  // Help — ? / Shift+/ / F1  (never requires modifier)
  if (
    (key === "?" || (e.shiftKey && key === "/") || key === "F1") &&
    !mod && !e.altKey
  ) {
    e.preventDefault();
    if (typeof callbacks.onShowHelp === "function") {
      safe(callbacks.onShowHelp);
    } else {
      showHelp();
    }
    return;
  }

  // Escape — handled last so the help modal can also listen to it
  // (we just close the modal if it is open, otherwise fire onEscape).
  if (key === "Escape") {
    if (document.getElementById("keyboard-help-modal")) {
      e.preventDefault();
      closeHelp();
      return;
    }
    e.preventDefault();
    safe(callbacks.onEscape, e);
    return;
  }

  // Modifier-driven shortcuts
  if (mod && !e.altKey) {
    switch (key.toLowerCase()) {
      case "z":
        e.preventDefault();
        safe(e.shiftKey ? callbacks.onRedo : callbacks.onUndo, e);
        return;
      case "y":
        e.preventDefault();
        safe(callbacks.onRedo, e);
        return;
      case "c":
        e.preventDefault();
        safe(callbacks.onCopy, e);
        return;
      case "v":
        e.preventDefault();
        safe(callbacks.onPaste, e);
        return;
      case "a":
        e.preventDefault();
        safe(callbacks.onSelectAll, e);
        return;
      case "]":
        e.preventDefault();
        safe(callbacks.onLayerUp, e);
        return;
      case "[":
        e.preventDefault();
        safe(callbacks.onLayerDown, e);
        return;
      default:
        break;
    }
  }

  // Plain keys (no modifier)
  if (!mod && !e.altKey && !e.metaKey) {
    switch (key) {
      case "Delete":
      case "Backspace":
        // Don't eat Backspace inside editable areas — already filtered above.
        e.preventDefault();
        safe(callbacks.onDelete, e);
        return;
      case "r":
      case "R":
        e.preventDefault();
        safe(callbacks.onRotate, e);
        return;
      case "g":
      case "G":
        e.preventDefault();
        safe(callbacks.onToggleGrid, e);
        return;
      case "]":
        e.preventDefault();
        safe(callbacks.onLayerUp, e);
        return;
      case "[":
        e.preventDefault();
        safe(callbacks.onLayerDown, e);
        return;
      default:
        break;
    }
  }
}

function onKeyup(e, callbacks) {
  if (isEditableTarget(e.target)) return;
  // Currently no keyup-driven shortcuts — exposed for parity / future use.
  // Callbacks receive the event so consumers can implement things like
  // "rotate while R is held".
  if (typeof callbacks.onKeyUp === "function") {
    safe(callbacks.onKeyUp, e);
  }
}

/**
 * Initialise global keyboard shortcuts.
 *
 * @param {object} callbacks
 *   onUndo, onRedo, onCopy, onPaste, onDelete, onRotate, onEscape,
 *   onSelectAll, onLayerUp, onLayerDown, onShowHelp, onToggleGrid
 * @returns {{ dispose: () => void, showHelp: () => void, closeHelp: () => void }}
 */
export function initKeyboard(callbacks = {}) {
  const handlerDown = (e) => onKeydown(e, callbacks);
  const handlerUp = (e) => onKeyup(e, callbacks);

  window.addEventListener("keydown", handlerDown);
  window.addEventListener("keyup", handlerUp);

  return {
    dispose() {
      window.removeEventListener("keydown", handlerDown);
      window.removeEventListener("keyup", handlerUp);
    },
    showHelp,
    closeHelp,
  };
}

/**
 * Register a custom keyboard shortcut.
 *
 * @param {string|string[]} keys - One or more key strings (e.g. "Shift-C", "Alt-D", "r")
 * @param {Function} callback - Function called when the shortcut is triggered
 * @returns {{ dispose: () => void }} Destructor to remove the shortcut
 */
export function registerShortcut(keys, callback) {
  if (!Array.isArray(keys)) keys = [keys];

  return {
    dispose() {
      // Remove the keydown listener that was added for this shortcut
      const handler = (e) => {
        const modifier = e.ctrlKey || (isMac && e.metaKey);
        const key = e.key.toLowerCase();

        // Check if this key combo matches
        const keyMatch = keys.some(k => k.toLowerCase().includes(key));
        const modMatch = keys.every(k => {
          if (k.toLowerCase().includes("ctrl")) return modifier;
          if (k.toLowerCase().includes("meta")) return isMac && e.metaKey;
          if (k.toLowerCase().includes("alt")) return e.altKey;
          return true;
        });

        if (keyMatch && modMatch) {
          e.preventDefault();
          try {
            callback(e);
          } catch (err) {
            console.error("[registerShortcut] callback threw:", err);
          }
        }
      };
      window.removeEventListener("keydown", handler);
    },
  };
}

/**
 * Show the keyboard help modal.
 * Convenience function for callers that want to display the help without
 * pressing the ? key.
 */
export function showShortcutsModal() {
  showHelp();
}