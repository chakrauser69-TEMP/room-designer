<?php
/**
 * Room Designer - Application Configuration
 *
 * Central configuration file. All values are loaded from environment
 * variables via getenv() and fall back to sensible XAMPP defaults
 * so the project runs out-of-the-box on a fresh XAMPP install.
 *
 * Environment variables (optional):
 *   DB_HOST, DB_NAME, DB_USER, DB_PASS, DB_CHARSET
 *   APP_NAME, APP_VERSION
 */

// Prevent direct script access.
if (!defined('ROOM_DESIGNER')) {
    define('ROOM_DESIGNER', true);
}

// -----------------------------------------------------------------------------
// Database configuration
// -----------------------------------------------------------------------------
// XAMPP defaults: host=localhost, user=root, password=(empty), database=room_designer
define('DB_HOST',  getenv('DB_HOST')    !== false ? getenv('DB_HOST')    : 'localhost');
define('DB_NAME',  getenv('DB_NAME')    !== false ? getenv('DB_NAME')    : 'room_designer');
define('DB_USER',  getenv('DB_USER')    !== false ? getenv('DB_USER')    : 'root');
define('DB_PASS',  getenv('DB_PASS')    !== false ? getenv('DB_PASS')    : '');
define('DB_CHARSET', getenv('DB_CHARSET') !== false ? getenv('DB_CHARSET') : 'utf8mb4');

// -----------------------------------------------------------------------------
// Application metadata
// -----------------------------------------------------------------------------
define('APP_NAME',    getenv('APP_NAME')    !== false ? getenv('APP_NAME')    : 'Room Designer');
define('APP_VERSION', getenv('APP_VERSION') !== false ? getenv('APP_VERSION') : '1.0.0');

// -----------------------------------------------------------------------------
// Upload / payload size limits (in bytes)
// -----------------------------------------------------------------------------
// 1 MiB raw design payload
define('MAX_DESIGN_BYTES', 1048576);

// 256 KiB thumbnail image
define('MAX_THUMBNAIL_BYTES', 262144);

// 256 KiB serialized design data
define('MAX_DESIGN_DATA_BYTES', 262144);

// -----------------------------------------------------------------------------
// Validation regexes
// -----------------------------------------------------------------------------
// Hex colour: #RGB, #RRGGBB, or #RRGGBBAA
define('ALLOWED_FLOOR_COLOR_REGEX', '/^#[0-9A-Fa-f]{6,8}$/');

// Data-URL or http(s) URL pointing to a thumbnail image
define('ALLOWED_THUMBNAIL_REGEX',
    '/^(data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+\/=]+|https?:\/\/[^\s<>"\'`]+)$/i'
);

// -----------------------------------------------------------------------------
// Asset categories whitelist (matches schema.sql seed categories)
// -----------------------------------------------------------------------------
define('ALLOWED_ASSET_CATEGORIES', ['seating', 'tables', 'beds', 'storage', 'decor']);

// -----------------------------------------------------------------------------
// 3D Model upload configuration
// -----------------------------------------------------------------------------
// Maximum size for uploaded 3D model files (5 MiB). The GLB format is
// binary, so even modest scenes can produce a few-MB file.
define('MAX_MODEL_BYTES', 5 * 1024 * 1024);

// File extensions accepted for user-uploaded 3D models.
define('ALLOWED_MODEL_EXTENSIONS', ['glb', 'gltf']);

// MIME types accepted for user-uploaded 3D models (checked in addition to
// extension, for defence in depth).
define('ALLOWED_MODEL_MIME_TYPES', [
    'model/gltf-binary',
    'model/gltf+json',
    'application/octet-stream',
    'application/gltf-binary',
    'application/gltf+json',
]);

// Directory (relative to project root) where 3D model files are stored.
// System models live directly under assets/models/; user models live in
// assets/models/user_<id>/.
define('MODEL_DIR', __DIR__ . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'models');
define('MODEL_PATH_PUBLIC', './assets/models');
