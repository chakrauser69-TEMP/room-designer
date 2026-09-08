// API client for the Room Designer backend.
// All requests send credentials. State-changing methods (POST/DELETE)
// automatically read the CSRF token from <meta name="csrf-token"> and
// forward it via the X-CSRF-Token header.

export class RateLimited extends Error {
  constructor(message, retryAfter) {
    super(message);
    this.name = 'RateLimited';
    this.retryAfter = retryAfter;
  }
}

function readCsrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta ? (meta.getAttribute('content') || '') : '';
}

function buildHeaders(includeCsrf, extra) {
  const headers = Object.assign({ Accept: 'application/json' }, extra || {});
  if (includeCsrf) {
    const token = readCsrfToken();
    if (token) {
      headers['X-CSRF-Token'] = token;
    }
  }
  return headers;
}

async function readErrorMessage(res) {
  let payload = null;
  try {
    payload = await res.json();
  } catch (_) {
    // Response body was not JSON; fall through to status text below.
  }
  if (payload && typeof payload === 'object') {
    if (typeof payload.error === 'string' && payload.error.length > 0) {
      return payload.error;
    }
    if (typeof payload.message === 'string' && payload.message.length > 0) {
      return payload.message;
    }
  }
  return res.statusText || `HTTP ${res.status}`;
}

function parseRetryAfter(res) {
  const raw = res.headers.get('Retry-After');
  if (!raw) return 60;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return Math.floor(asNumber);
  }
  const asDate = Date.parse(raw);
  if (Number.isFinite(asDate)) {
    const delta = Math.ceil((asDate - Date.now()) / 1000);
    return delta > 0 ? delta : 0;
  }
  return 60;
}

async function handleResponse(res) {
  if (res.status === 403) {
    throw new Error('Session expired');
  }
  if (res.status === 429) {
    const message = await readErrorMessage(res);
    const retryAfter = parseRetryAfter(res);
    throw new RateLimited(message, retryAfter);
  }
  if (!res.ok) {
    const message = await readErrorMessage(res);
    throw new Error(message);
  }
  if (res.status === 204) {
    return null;
  }
  return res.json();
}

async function request(url, init) {
  const options = Object.assign({ credentials: 'include' }, init || {});
  const res = await fetch(url, options);
  return handleResponse(res);
}

export const api = {
  async login(username, password) {
    return request('./api/auth.php?action=login', {
      method: 'POST',
      credentials: 'include',
      headers: buildHeaders(true, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ username, password }),
    });
  },

  async register(username, email, password) {
    return request('./api/auth.php?action=register', {
      method: 'POST',
      credentials: 'include',
      headers: buildHeaders(true, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ username, email, password }),
    });
  },

  async logout() {
    return request('./api/auth.php?action=logout', {
      method: 'POST',
      credentials: 'include',
      headers: buildHeaders(true),
    });
  },

  async get(url) {
    return request(url, {
      method: 'GET',
      credentials: 'include',
      headers: buildHeaders(false),
    });
  },

  async post(url, body) {
    return request(url, {
      method: 'POST',
      credentials: 'include',
      headers: buildHeaders(true, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
  },

  async del(url) {
    return request(url, {
      method: 'DELETE',
      credentials: 'include',
      headers: buildHeaders(true),
    });
  },

  async uploadThumbnail(designId, dataUrl) {
    return request('./api/designs.php?action=thumbnail&id=' + encodeURIComponent(designId), {
      method: 'POST',
      credentials: 'include',
      headers: buildHeaders(true, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ thumbnail: dataUrl }),
    });
  },
};

export async function getAssets() {
  return api.get('./api/assets.php');
}

export async function getDesign(id) {
  return api.get('./api/designs.php?action=load&id=' + id);
}

export async function saveDesign(payload) {
  return api.post('./api/designs.php?action=save', payload);
}

export async function getTemplate(id) {
  return api.get('./api/templates.php?id=' + id);
}

export async function exportImage() {
  // Use the canvas from the editor - this is a client-side export
  const canvas = document.querySelector('#roomCanvas');
  if (!canvas) return null;
  return canvas.toDataURL('image/png');
}