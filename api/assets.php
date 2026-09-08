<?php
/**
 * Room Designer - Assets API
 *
 * Returns the catalogue of furniture assets available to place in the
 * designer. Authentication is required — anonymous callers receive
 * a 401 JSON error and never reach the database.
 *
 * Optional query parameter:
 *   ?category=chairs|tables|beds|shelves|decor
 *
 * If `category` is supplied, the value MUST appear in the
 * ALLOWED_ASSET_CATEGORIES whitelist defined in includes/config.php.
 * Any other value (including an empty string) is rejected with a 400.
 * When the parameter is omitted entirely, every category is returned.
 *
 * Response: JSON object { "assets": [ ... ] }, where each entry exposes
 * only the safe, explicitly enumerated columns — no `SELECT *`.
 */

header('Content-Type: application/json');

require_once __DIR__ . '/../includes/bootstrap.php';

global $pdo;

// --- Auth gate ---------------------------------------------------------------
if (!isLoggedIn()) {
    http_response_code(401);
    echo json_encode(['error' => 'Authentication required']);
    exit;
}

// --- Whitelisted columns returned to the client ------------------------------
$ALLOWED_COLUMNS = [
    'id',
    'name',
    'category',
    'image_path',
    'grid_width',
    'grid_height',
    'depth_m',
    'height_m',
    'base_color',
    'sort_order',
];
$selectList = implode(', ', $ALLOWED_COLUMNS);

// --- Optional category filter (whitelist only) -------------------------------
$category = $_GET['category'] ?? null;
$hasCategory = ($category !== null && $category !== '');

if ($hasCategory) {
    if (!in_array($category, ALLOWED_ASSET_CATEGORIES, true)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid category']);
        exit;
    }
}

try {
    if ($hasCategory) {
        $sql = "SELECT $selectList FROM assets WHERE category = ? ORDER BY sort_order, id";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$category]);
    } else {
        $sql = "SELECT $selectList FROM assets ORDER BY category, sort_order, id";
        $stmt = $pdo->query($sql);
    }

    $assets = $stmt->fetchAll();

    echo json_encode(['assets' => $assets]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to load assets']);
}
