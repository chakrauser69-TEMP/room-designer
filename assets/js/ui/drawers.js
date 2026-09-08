// assets/js/ui/drawers.js
// Responsive drawer component.
// On screens below `breakpoint` (default 1024px), the element becomes a
// position:fixed panel that slides in/out via a class toggle, with a backdrop.
// On screens at or above the breakpoint, the element is rendered inline and the
// drawer behavior is disabled (open/close become no-ops, no backdrop, no focus
// trap).
//
// Usage:
//   import { createDrawer, initDrawers } from './drawers.js';
//   const drawer = createDrawer(myEl, { side: 'right', breakpoint: 900 });
//   drawer.open();
//   // Or: initDrawers(document.getElementById('mySidebar'));
//
// Responsive breakpoints are inferred from window.matchMedia queries.
// Inline mode (screens >= breakpoint): drawer is always "visible" with
// correct aria. Drawer-mode (screens < breakpoint): sliding panel with
// backdrop and focus trap.
const TRANSITION_MS = 220;

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
].join(',');

/**
 * Create a responsive drawer controller.
 *
 * @param {HTMLElement} element - The drawer element to control.
 * @param {Object} [options]
 * @param {'left'|'right'} [options.side='left'] - Which edge the drawer slides in from.
 * @param {number} [options.breakpoint=1024] - Screens below this width use drawer mode.
 * @returns {{
 *   open: () => void,
 *   close: () => void,
 *   toggle: () => void,
 *   isOpen: () => boolean,
 *   isDrawerMode: () => boolean,
 *   destroy: () => void,
 * }}
 */
export function createDrawer(element, options = {}) {
  if (!element || !(element instanceof HTMLElement)) {
    throw new TypeError('createDrawer: first argument must be an HTMLElement');
  }

  const { side = 'left', breakpoint = 1024 } = options;

  if (side !== 'left' && side !== 'right') {
    throw new RangeError("createDrawer: 'side' must be 'left' or 'right'");
  }

  if (typeof breakpoint !== 'number' || !Number.isFinite(breakpoint)) {
    throw new RangeError('createDrawer: breakpoint must be a finite number');
  }

  let open = false;
  let backdrop = null;
  let lastFocused = null;
  let keydownHandler = null;
  let mq = null;
  let mqListener = null;

  // --- Helpers ---------------------------------------------------------------

  function isDrawerMode() {
    return typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia(`(max-width: ${breakpoint - 0.02}px)`).matches;
  }

  function ensureBackdrop() {
    if (backdrop) return backdrop;
    backdrop = document.createElement('div');
    backdrop.className = 'drawer-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.style.position = 'fixed';
    backdrop.style.inset = '0';
    backdrop.style.zIndex = '999';
    backdrop.style.opacity = '0';
    backdrop.style.transition = `opacity ${TRANSITION_MS}ms ease`;
    backdrop.style.pointerEvents = 'none';
    backdrop.addEventListener('click', close);
    return backdrop;
  }

  function getFocusable() {
    return Array.from(element.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => {
      if (el.hasAttribute('disabled')) return false;
      if (el.getAttribute('aria-hidden') === 'true') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 || rect.height > 0 || el === document.activeElement;
    });
  }

  function onKeydown(e) {
    if (!open) return;

    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      close();
      return;
    }

    if (e.key !== 'Tab') return;

    const focusables = getFocusable();
    if (focusables.length === 0) {
      e.preventDefault();
      element.focus();
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (e.shiftKey) {
      if (active === first || !element.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last || !element.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function trapFocus() {
    if (keydownHandler) return;
    keydownHandler = onKeydown;
    document.addEventListener('keydown', keydownHandler, true);
  }

  function releaseFocus() {
    if (keydownHandler) {
      document.removeEventListener('keydown', keydownHandler, true);
      keydownHandler = null;
    }
  }

  function removeBackdrop() {
    if (backdrop && backdrop.parentNode) {
      backdrop.parentNode.removeChild(backdrop);
    }
    if (backdrop) {
      backdrop.style.pointerEvents = 'none';
    }
  }

  // --- Mode / state synchronization ------------------------------------------

  function applyDrawerMode() {
    if (isDrawerMode()) {
      element.classList.add('drawer', `drawer-${side}`);
      element.style.position = 'fixed';
      element.style.top = '0';
      element.style.bottom = '0';
      element.style.width = 'min(85vw, 360px)';
      element.style.maxWidth = '90vw';
      element.style.zIndex = '1000';
      element.style.overflowY = 'auto';
      element.style.background = element.style.background || '#fff';
      element.style.boxShadow = side === 'left'
        ? '2px 0 12px rgba(0,0,0,0.2)'
        : '-2px 0 12px rgba(0,0,0,0.2)';
      element.setAttribute('aria-hidden', open ? 'false' : 'true');
      element.setAttribute('tabindex', '-1');
      element.setAttribute('role', element.getAttribute('role') || 'dialog');
      if (side === 'left') {
        element.style.left = '0';
        element.style.right = 'auto';
        element.style.transform = open ? 'translateX(0)' : 'translateX(-100%)';
      } else {
        element.style.right = '0';
        element.style.left = 'auto';
        element.style.transform = open ? 'translateX(0)' : 'translateX(100%)';
      }
    } else {
      // Inline mode: tear down any drawer styling.
      element.classList.remove('drawer', `drawer-${side}`, 'drawer-open');
      element.style.position = '';
      element.style.top = '';
      element.style.bottom = '';
      element.style.left = '';
      element.style.right = '';
      element.style.transform = '';
      element.style.transition = '';
      element.style.zIndex = '';
      element.style.width = '';
      element.style.maxWidth = '';
      element.style.overflowY = '';
      element.style.boxShadow = '';
      element.removeAttribute('aria-hidden');
      element.removeAttribute('tabindex');
      removeBackdrop();
      releaseFocus();
    }
  }

  function removeBackdrop() {
    if (backdrop && backdrop.parentNode) {
      backdrop.parentNode.removeChild(backdrop);
    }
    if (backdrop) {
      backdrop.style.pointerEvents = 'none';
    }
  }

  // --- Public API ------------------------------------------------------------

  function openDrawer() {
    if (!isDrawerMode()) {
      // In inline mode the drawer is always "visible"; just ensure aria is correct.
      open = true;
      element.classList.add('drawer-open');
      return;
    }

    if (open) return;
    open = true;

    lastFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const bg = ensureBackdrop();
    if (!bg.parentNode) {
      document.body.appendChild(bg);
    }
    // Defer to allow layout.
    requestAnimationFrame(() => {
      bg.style.opacity = '1';
      bg.style.pointerEvents = 'auto';
    });

    element.setAttribute('aria-hidden', 'false');
    element.classList.add('drawer-open');
    element.style.transform = 'translateX(0)';

    trapFocus();

    // Focus the first focusable element (or the drawer itself).
    requestAnimationFrame(() => {
      const focusables = getFocusable();
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        element.focus();
      }
    });
  }

  function closeDrawer() {
    if (!isDrawerMode()) {
      open = false;
      element.classList.remove('drawer-open');
      return;
    }

    if (!open) return;
    open = false;

    element.setAttribute('aria-hidden', 'true');
    element.classList.remove('drawer-open');
    element.style.transform = side === 'left'
      ? 'translateX(-100%)'
      : 'translateX(100%)';

    if (backdrop) {
      backdrop.style.opacity = '0';
      backdrop.style.pointerEvents = 'none';
    }

    releaseFocus();

    if (lastFocused && document.contains(lastFocused)) {
      try {
        lastFocused.focus();
      } catch (_) {
        /* ignore */
      }
    }
    lastFocused = null;
  }

  function toggle() {
    if (open) closeDrawer();
    else openDrawer();
  }

  function setupMatchMedia() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    mq = window.matchMedia(`(max-width: ${breakpoint - 0.02}px)`);
    const handler = () => {
      // Tear down drawer state when switching modes.
      removeBackdrop();
      releaseFocus();
      if (isDrawerMode()) {
        // Re-apply positioning; preserve open state.
        open = false;
        applyDrawerMode();
        // If the user had it conceptually open, leave it closed after resize
        // to avoid surprising jumps. Callers can call open() again.
        element.setAttribute('aria-hidden', 'true');
        element.style.transform = side === 'left'
          ? 'translateX(-100%)'
          : 'translateX(100%)';
      } else {
        applyDrawerMode();
      }
    };
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler);
      mqListener = () => mq.removeEventListener('change', handler);
    } else if (typeof mq.addListener === 'function') {
      mq.addListener(handler);
      mqListener = () => mq.removeListener(handler);
    }
  }

  function destroy() {
    closeDrawer();
    removeBackdrop();
    releaseFocus();
    if (mqListener) mqListener();
    element.classList.remove('drawer', `drawer-${side}`, 'drawer-open');
    element.style.position = '';
    element.style.top = '';
    element.style.bottom = '';
    element.style.left = '';
    element.style.right = '';
    element.style.transform = '';
    element.style.transition = '';
    element.style.zIndex = '';
    element.style.width = '';
    element.style.maxWidth = '';
    element.style.overflowY = '';
    element.style.boxShadow = '';
    element.removeAttribute('aria-hidden');
    element.removeAttribute('tabindex');
  }

  // --- Init ------------------------------------------------------------------

  applyDrawerMode();
  setupMatchMedia();

  return {
    open: openDrawer,
    close: closeDrawer,
    toggle,
    isOpen: () => open,
    isDrawerMode,
    destroy,
  };
}

// ---------------------------------------------------------------------------
// initDrawers — create a drawer for the given element, with optional
// breakpoint override. Convenience wrapper for callers that just need a
// standard sidebar drawer.
// ---------------------------------------------------------------------------
export function initDrawers(element, options = {}) {
  if (!element || !(element instanceof HTMLElement)) {
    throw new TypeError('initDrawers: first argument must be an HTMLElement');
  }
  const drawer = createDrawer(element, options);
  // Ensure the drawer is initially open on drawer-mode screens so the
  // asset panel is visible by default.
  if (drawer.isDrawerMode()) {
    drawer.open();
  }
  return drawer;
}

export default createDrawer;