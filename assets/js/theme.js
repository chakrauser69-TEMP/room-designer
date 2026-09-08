// theme.js — ES module
// Manages light/dark theme via localStorage and data-theme attribute on <html>.
// Falls back to system prefers-color-scheme and listens for changes when the
// user has not set a manual preference.

const STORAGE_KEY = 'theme';

/** Read the stored manual theme, if any. */
function getStoredTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    // localStorage may be unavailable (private mode, disabled, etc.)
    console.warn('[theme] localStorage unavailable:', err);
    return null;
  }
}

/** Persist the user's manual theme choice. */
function setStoredTheme(theme) {
  try {
    if (theme === null || theme === undefined) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, theme);
    }
  } catch (err) {
    console.warn('[theme] Could not write to localStorage:', err);
  }
}

/**
 * Resolve the current OS / browser color scheme preference.
 * Returns 'light' or 'dark'. Defaults to 'light' if unavailable.
 */
function getSystemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'light';
  }
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

/** Apply a theme name ('light' or 'dark') to <html data-theme="...">. */
export function applyTheme(theme) {
  const resolved = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', resolved);
  // Reflect meta theme-color if a tag is present, for mobile browser chrome.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', resolved === 'dark' ? '#121018' : '#f4f2fb');
  }
  // Optional: dispatch an event so other modules can react if needed.
  try {
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: resolved } }));
  } catch (err) {
    // CustomEvent ctor in very old browsers — ignore.
  }
}

/**
 * Public API — set a theme manually, persist it, and apply it immediately.
 * @param {'light' | 'dark' | string} name
 */
export function updateTheme(name) {
  const normalized = name === 'dark' ? 'dark' : 'light';
  setStoredTheme(normalized);
  applyTheme(normalized);
}

/**
 * Public API — initialize theming.
 * - If a manual preference is stored, use it.
 * - Otherwise, use system prefers-color-scheme.
 * - When no manual preference exists, follow live OS color-scheme changes.
 * Safe to call multiple times; listeners are not duplicated.
 */
export function initTheme() {
  if (typeof document === 'undefined') return;

  const stored = getStoredTheme();

  if (stored === 'light' || stored === 'dark') {
    applyTheme(stored);
    return;
  }

  // No manual preference — start with system theme, then follow changes.
  applyTheme(getSystemTheme());

  if (typeof window === 'undefined' || !window.matchMedia) return;

  const mql = window.matchMedia('(prefers-color-scheme: dark)');

  // Guard against re-registering listeners on repeated init calls.
  if (mql.__themeListenerAttached) return;
  mql.__themeListenerAttached = true;

  const handler = (event) => {
    // Only react if the user still has no manual preference — they may
    // have updated localStorage after init, so re-check each time.
    const current = getStoredTheme();
    if (current === 'light' || current === 'dark') return;
    applyTheme(event.matches ? 'dark' : 'light');
  };

  // Newer API uses addEventListener; older Safari uses addListener.
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', handler);
  } else if (typeof mql.addListener === 'function') {
    mql.addListener(handler);
  }
}

/**
 * Apply a theme name ('light' or 'dark') to <html data-theme="...">.
 * This is the underlying function that updateTheme() calls.
 * Provided as a named export for direct import by consumer modules.
 * @param {'light' | 'dark'} theme
 */
export function applyThemeNamed(theme) {
  applyTheme(theme);
}

/**
 * Get the current theme name ('light' or 'dark').
 * Reads from the data-theme attribute on <html>, falling back to localStorage,
 * then to the system preference.
 * @returns {'light' | 'dark'}
 */
export function getCurrentTheme() {
  // First check the data-theme attribute on <html>
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') {
      return attr;
    }
  }
  // Fall back to localStorage
  const stored = getStoredTheme();
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  // Fall back to system preference
  return getSystemTheme();
}

// Default export exposes both functions on a single object as well, in case
// consumers prefer `import theme from './theme.js'; theme.initTheme();`.
export default {
  initTheme,
  updateTheme,
};