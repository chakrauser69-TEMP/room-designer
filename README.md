# RoomSpace AI

A web-based 3D room designer built with PHP 8 + MySQL (XAMPP) and a vanilla-JS
THREE.js editor. Login/register your account, design rooms with furniture, and
save/load/share your layouts to MySQL.

**Running at:** `http://localhost/room-designer/`
**Stack:** PHP 8 + MySQL (XAMPP) · THREE.js (self-hosted ES modules) · Vanilla JS · Dark theme CSS

> 3D room designer for people who struggle with interior design or have tight/small spaces.

---

## Current State

### Core Features
- PHP + MySQL backend with session-based auth
- Login/Register system (dark theme UI)
- Dashboard: list user designs, browse room templates
- 3D room editor powered by THREE.js (self-hosted, no CDN)
- Furniture placement from the asset sidebar (click to place)
- Rotate objects with R key (45-degree increments)
- Delete with DEL key
- Mouse wheel zoom (clamped), orbit camera controls
- Undo/Redo (Ctrl+Z / Ctrl+Y), 50-state history
- Save/Load/Delete designs to MySQL
- Properties panel for selected objects
- Grid resize + floor color/material picker
- Room templates (5 seeds: Modern Living Room, Cozy Bedroom, Home Office, Bakery Shop, Restaurant)
- 25 furniture assets across 5 categories
- 3D rendered furniture built procedurally from BoxGeometry

### Tech Stack
- PHP 8 + MySQL (XAMPP)
- THREE.js r150+ (self-hosted in `assets/js/vendor/`)
- Vanilla JS (no framework, ES modules)
- Dark theme CSS

### File Structure
```
room-designer/
  index.php              - Login page
  register.php           - Registration page
  dashboard.php          - My designs + templates
  editor.php             - Main room editor
  README.md              - This file (canonical, supersedes PROJECT_NOTES.md)
  PROJECT_NOTES.md       - Legacy notes kept for history
  api/
    auth.php             - Login/register/logout/check
    designs.php          - CRUD for designs (+ share toggle)
    assets.php           - Furniture catalog
    templates.php        - Room templates
    audit.php            - Full-endpoint regression audit (curl harness)
  includes/
    bootstrap.php        - Session, error handler, headers, DB bootstrap
    config.php           - Env-based config with XAMPP defaults
    db.php               - PDO MySQL connection
    auth.php             - Auth helper functions (+ security headers)
    csrf.php             - CSRF token helpers
    headers.php          - Security headers (CSP etc.)
    ratelimit.php        - Login attempt rate limiting helpers
  assets/
    css/style.css        - Shared dark theme styles
    css/editor.css       - Editor layout/toolbar/styles
    js/editor.js         - Editor controller (state, placement, save/load)
    js/api.js            - API client (fetch wrapper + CSRF header)
    js/theme.js          - Light/dark theme manager
    js/three/            - scene.js, furniture.js, materials.js, raycast.js
    js/ui/               - assetpanel.js, drawers.js, keyboard.js, properties.js
    js/vendor/           - Self-hosted three.js + addons (no CDN needed)
    sprites/             - SVG placeholder furniture sprites
  sql/
    schema.sql           - Full DB schema + seed data (users/assets/templates/designs)
  logs/
    php-error.log        - Server-side error log
```

### Database
- `users` - id, username, email, password_hash, verified, failed_attempts, locked_until
- `designs` - id, user_id, name, template_id, grid dims, floor_color/material, design_data (JSON), thumbnail
- `templates` - id, user_id (nullable), name, description, thumbnail, grid dims, floor_color, template_data (JSON)
- `room_templates` - legacy/empty twin of `templates` (live DB only; not in schema.sql)
- `assets` - id, name, category, image_path, grid dims, depth/height (m), base_color, sort_order
- `login_attempts` - id, ip_address, username, attempted_at, success

### Running At
- Apache: port 80
- MySQL: port 3306
- URL: http://localhost/room-designer/
- Htdocs copy: C:\xampp\htdocs\room-designer\

### Deployment Notes
- Copy project folder to `C:\xampp\htdocs\`
- Start Apache + MySQL from XAMPP Control Panel
- Import `sql/schema.sql` into MySQL (database `room_designer`)
- Edit `includes/config.php` environment variables if MySQL has a password
  (defaults: host `localhost`, user `root`, pass empty)
- Visit http://localhost/room-designer/

---

## Development & Error Log

This section records the detailed problems and errors found while developing
and testing this system. Each item notes impact and resolution status.

### Status legend
- **RESOLVED** – fixed and verified
- **FIXING** – fix in progress (see roadmap)
- **HISTORICAL** – was a real bug, already fixed; documented for the record
- **AS-IS** – left unchanged by design decision

---

### 1. Login unusable in browser (CSP blocks inline scripts) — RESOLVED

**Symptom:** signing in never completes; the form submits but the app can't
process the JSON request.

**Cause:** `includes/headers.php` (loaded for every page by `bootstrap.php`)
sends:

```
Content-Security-Policy: default-src 'self'; ... script-src 'self'; ...
```

`script-src 'self'` blocks **all inline `<script>` blocks**. The login page
(`index.php`), dashboard (`dashboard.php`) and editor (`editor.php`) all rely on
inline scripts:

- `index.php` – theme init IIFE + the login `fetch` handler
- `dashboard.php` – the entire inline `<script type="module">` (loads designs,
  templates, logout)
- `editor.php` – inline global bootstrap (`window.DESIGN_ID` etc.)

Same policy is re-sent by `sendSecurityHeaders()` in `includes/auth.php`.

**Impact:** login/register failure in-browser (register.php only worked because
it overrides its own CSP with `script-src 'self' 'unsafe-inline'`).

**Resolution:** `script-src` relaxed to `'self' 'unsafe-inline'` in
`headers.php` and `sendSecurityHeaders()`; `api/auth.php` additionally accepts
`application/x-www-form-urlencoded` bodies and a `$_POST['action']` fallback so
the browser `fetch` login flow works. Verified by the audit suite (register,
login by username and email, check, logout — all 200) with no error-log entries.

---

### 2. All JS modules / static assets 404 under sub-directory installs — RESOLVED

**Symptom:** dashboard and editor load a blank/broken page; console shows 404s
for `/assets/...`.

**Cause:** many URLs and ES-module specifiers are written with absolute paths
(`/assets/...`), which resolve against the **server root** (`http://localhost/`)
instead of `http://localhost/room-designer/`:

- `dashboard.php:70` – `import { api } from '/assets/js/api.js';`
- `editor.php:57,58,63,64,336` – stylesheets, import map, `src="/assets/js/editor.js"`
- `editor.js:4-13` – absolute import specifiers
- `scene.js:4-6`, `materials.js:10` – absolute import specifiers

**Resolution:** all page URLs, stylesheet/script `src`, the `editor.php` import
map, and ES-module specifiers (`editor.js`, `scene.js`, `materials.js`) are now
**relative** (`./`, `../`, `../../`) so they resolve correctly at any htdocs
sub-path. Verified by `curl` over HTTP: all vendor modules, sprites and pages
return 200.

---

### 3. Editor module wiring mismatches — RESOLVED

Multiple places where `editor.js` calls module APIs with the wrong
arguments/signatures, silently killing features:

- **`initDrawers({ state, onChange })`** — module `initDrawers(element, opts)`
  requires an `HTMLElement`; passing a plain object throws a `TypeError`,
  aborting the whole editor bootstrap (`editor.js:136`).
- **`renderAssetPanel(assets)`** — module signature is
  `renderAssetPanel(container, assets, onPickCallback)`. Passing the asset
  array as the first argument throws ("container must be a DOM Element") and
  asset placement is never wired to a click handler.
- **`window.__roomDesignerScene` never set** — `scene.js`'s `createScene()`
  returns `{ scene, ... }` but never assigns `window.__roomDesignerScene`;
  `editor.js` relies on that global. Result: placed objects are **never added
  to the scene** (invisible), and undo/redo/`applySnapshot`/floor rebuild
  silently no-op.
- **URL param mismatch** — dashboard links to `editor.php?id=N`, but
  `editor.js` reads `?design=`; editing an existing design never loads its
  objects and saving creates a new design instead of updating.
- **Option-key mismatches** — `editor.js` calls `createScene(..., { gridWidth,
  gridHeight, floorColor })` but `scene.js` reads `gridW/gridH`; and
  `rebuildFloor(scene, { width, height, color, material })` but `materials.js`
  expects `{ type, baseColor, sizeMeters }`. Floor width/height are hard-coded
  to 20x20, colors/resizes are lost.
- **`renderProperties(Array.from(state.selected))`** — first argument is
  treated as the container; the panel always shows the empty state.
- **`initKeyboard({ state })`** — module expects a callbacks object
  (`onUndo`, `onRedo`, `onDelete`, `onRotate`, ...); shortcuts are inert
  (and would double-fire against the local handler).

**Impact (historical):** the editor could not initialize, no furniture rendered,
and save/load + undo/redo did not work.

**Resolution (2026-09-07):** `assets/js/editor.js` was fully rewritten around the
module contracts: placement + drag via raycasting, selection, undo/redo,
copy/paste, rotate, layer reorder, thumbnail capture, PNG export, save/load.
Supporting fixes: `scene.js` now sets `window.THREE`; `materials.js` floor
rebuild accepts the full options object; `assetpanel.js` preserves the asset-pick
callback across re-renders; `keyboard.js` entity-escaping bug fixed. Editor reads
`window.DESIGN_ID` / `window.TEMPLATE_ID` (so `?design=`/`?template=` both work).

---

### 4. Asset catalog vs. renderer mismatch — RESOLVED

**Symptom (historical):** DB categories (`seating`, `beds`, `tables`, `storage`,
`decor`) did not match `buildFurniture()`'s switch keys, so all 25 assets fell
through to a generic box; seed `image_path` values pointed at non-existent
`.png` files.

**Resolution:**
- `furniture.js` gained a `NAME_KIND_MAP`/`CATEGORY_KIND_MAP` resolver mapping all
  25 DB assets onto the `bed`/`chair`/`sofa`/`beanbag`/`table`/`shelf`/`lamp`/
  `plant`/`rug`/`picture` builders (per-asset variants + shelf count).
- `image_path` repointed to real sprites under
  `assets/sprites/{beds,chairs,decor,shelves,tables}/*.svg` — in both the live DB
  and `sql/schema.sql`. All paths return 200 over HTTP.

---

### 5. Schema drift / fresh-install incompatibility — RESOLVED

**Symptom (historical):** `/api/templates.php` queried a `templates` table that
`schema.sql` never created (it only had an empty `room_templates` twin).

**Resolution:**
- `sql/schema.sql` now creates `templates` (columns matching the live DB, incl.
  `updated_at` and `template_data LONGTEXT`) plus 5 shared template seeds
  (`user_id = NULL`), and no longer creates `room_templates`.
- Live DB: `designs.template_id` FK retargeted from the empty `room_templates` to
  `templates(id)` (previously any design saved with a `template_id` would fail);
  `templates.user_id` made nullable and all 5 seeds set to `NULL` (shared);
  dead template `thumbnail` values cleared.
- `/api/templates.php` list now returns `user_id = :uid OR user_id IS NULL`.
- The legacy `room_templates` table remains in the live DB only (empty, unused).

---

### 6. Historical errors (already resolved)

- **`api/auth.php` `PDOException: SQLSTATE[HY093] Invalid parameter number`**
  (seen at `auth.php:247` during login). A stale prepared-statement bug
  (placeholder/parameter count mismatch) that has since been corrected; verified
  by retesting the login flow.
- **`session_set_cookie_params(): Session cookie parameters cannot be changed
  after headers have already been sent`** at `includes/bootstrap.php` — emitted
  by a deleted test harness (`api/test_bootstrap_debug.php`). `bootstrap.php`
  now starts output buffering and guards the call.
- Both are recorded in `logs/php-error.log`; today's regression pass confirms no
  new entries are produced.

---

### 7. Cleanup & left-as-is items

- **Stray files deleted:** `api/designs.php.new` (truncated half-write) and
  `api/test_cookies.txt` (curl jar leftover) have been removed.
- **Dead code:** `assets/js/api.js` → `uploadThumbnail()` posts to
  `/api/designs/{id}/thumbnail`, an endpoint that does not exist (unused).
- **Share feature:** `share` action returns a URL to `share.php` which does not
  exist. **Left as-is** by design decision (registered as a known limitation;
  the API toggles `is_public`/`share_token` correctly).
- Asset thumbnails remain placeholder SVG placeholders (see TODO).

---

## Test Results

### Lint / static
- All 16 PHP files pass `php -l` (no syntax errors).

### Environment (verified)
- Apache2.4 + MySQL running (ports 80/443/3306)
- PHP 8.2.12 CLI (`C:\xampp\php\php.exe`)
- Extensions: `curl`, `json`, `mbstring`, `openssl`, `pdo_mysql`
- `mod_rewrite` loaded, `AllowOverride All`
- DB `room_designer`: assets=25, templates=5 (all shared, `user_id` NULL);
  users/designs grow with each audit run (the harness leaves its test user behind)

### Endpoint regression
- `api/audit.php` provides a full curl harness covering auth (register/login/
  check/logout + negatives), assets, templates, designs CRUD/share/delete,
  editor page access. Target: 100% pass with no new server-error log entries.

### Test feed (2026-09-07)
- `api/audit.php` full harness: **51/51 PASS** — auth (register/login by
  username+email/logout/check + negatives), assets (25), templates (5 shared),
  designs CRUD/share/delete, editor page access + ownership.
- All JS modules pass `node --check`: `editor.js`, `api.js`, `theme.js`,
  `three/*.js`, `ui/*.js`.
- Static assets verified over HTTP: vendor three.js + addons, `editor.js`,
  sprites, pages all 200; `dashboard.php`/`editor.php` 302 for anonymous;
  `/api/assets.php` 401 for anonymous.
- `logs/php-error.log` truncated to 0 bytes; its only entry was the pre-fix
  HY093 login bug, and no new entries were produced by the regression run.

---

## TODO / Improvements for Next Sessions

### High Priority
- [ ] Replace placeholder SVG sprites with real assets (Kenney Furniture Kit, CC0)
- [ ] Add thumbnail generation on save (capture canvas as PNG) — partially wired
- [ ] Add image export (PNG export exists in CLI; add UI button)
- [ ] Fix template asset_id references in schema.sql seed data

### Medium Priority
- [ ] Add collision detection (prevent placing furniture on top of each other)
- [ ] Add wall drawing tool, door/window placement
- [ ] Add object layers ordering (bring to front / send to back)
- [ ] Add multi-select (Shift+click)
- [ ] Add free-rotation toggle on top of 45° steps
- [ ] Improve floor texture picker (wood/tile/carpet) — procedural textures exist
- [ ] Responsive design for tablet/mobile

### Low Priority
- [ ] Real-time collaboration (WebSocket)
- [ ] Public share page (`share.php`) for shared designs
- [ ] PDF export, room measurement labels, asset search/filter improvements
- [ ] Dark/light theme toggle (framework present in `theme.js`)
- [ ] Keyboard shortcuts help modal and onboarding tutorial
