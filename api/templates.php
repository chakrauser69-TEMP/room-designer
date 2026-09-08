<?php
/**
 * Templates API
 *
 * GET /api/templates.php                 -> list of template metadata (no template_data)
 * GET /api/templates.php?id=<id>         -> full template row including template_data
 *
 * All actions require a valid login session.
 */

require_once __DIR__ . '/../includes/bootstrap.php';

global $pdo;

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

// ---- 2. Require login for ALL actions ------------------------------------
if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode([
        'ok'    => false,
        'error' => 'unauthorized',
        'msg'   => 'Login required.',
    ]);
    exit;
}

$currentUserId = (int) $_SESSION['user_id'];

// ---- 3. Only allow GET ---------------------------------------------------
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET') {
    http_response_code(405);
    header('Allow: GET');
    echo json_encode([
        'ok'    => false,
        'error' => 'method_not_allowed',
        'msg'   => 'Only GET is supported on this endpoint.',
    ]);
    exit;
}

// ---- 5. Helpers ----------------------------------------------------------
function jsonOut(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Decode template_data from its stored representation.
 *  - JSON string -> assoc array
 *  - already-decoded array -> returned as-is
 *  - null/empty -> empty array
 */
function decodeTemplateData($raw): array
{
    if ($raw === null || $raw === '') {
        return [];
    }
    if (is_array($raw)) {
        return $raw;
    }
    if (is_string($raw)) {
        $decoded = json_decode($raw, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
            return $decoded;
        }
        return [];
    }
    return [];
}

// ---- 6. Parameters -------------------------------------------------------
$idParam = $_GET['id'] ?? null;
$hasId   = $idParam !== null && $idParam !== '';

// ---- 7. Single template fetch ------------------------------------
if ($hasId) {
    if (!ctype_digit((string) $idParam)) {
        jsonOut(400, [
            'ok'    => false,
            'error' => 'bad_id',
            'msg'   => 'Template id must be a positive integer.',
        ]);
    }

    $templateId = (int) $idParam;

    try {
        $stmt = $pdo->prepare(
            'SELECT id, user_id, name, description, thumbnail,
                    grid_width, grid_height, floor_color, template_data,
                    created_at, updated_at
               FROM templates
              WHERE id = :id
              LIMIT 1'
        );
        $stmt->execute([':id' => $templateId]);
        $row = $stmt->fetch();
    } catch (Throwable $e) {
        jsonOut(500, [
            'ok'    => false,
            'error' => 'db_query_failed',
            'msg'   => 'Failed to load template.',
        ]);
    }

    if (!$row) {
        jsonOut(404, [
            'ok'    => false,
            'error' => 'not_found',
            'msg'   => 'Template not found.',
        ]);
    }

    $isOwner = (int) $row['user_id'] === $currentUserId;
    $row['template_data'] = decodeTemplateData($row['template_data'] ?? null);

    jsonOut(200, [
        'ok'        => true,
        'template'  => $row,
        'is_owner'  => $isOwner,
    ]);
}

// ---- 8. List templates (metadata only, omit template_data) --------------
try {
    $stmt = $pdo->prepare(
        'SELECT id, name, description, thumbnail,
                grid_width, grid_height, floor_color,
                created_at, updated_at
           FROM templates
          WHERE user_id = :uid OR user_id IS NULL
          ORDER BY updated_at DESC, id DESC'
    );
    $stmt->execute([':uid' => $currentUserId]);
    $rows = $stmt->fetchAll();
} catch (Throwable $e) {
    jsonOut(500, [
        'ok'    => false,
        'error' => 'db_query_failed',
        'msg'   => 'Failed to list templates.',
    ]);
}

// Defensive — strip any leaked template_data column just in case the
// SELECT list grows in the future. The contract for the list endpoint
// is metadata only.
$metadataColumns = [
    'id', 'name', 'description', 'thumbnail',
    'grid_width', 'grid_height', 'floor_color',
    'created_at', 'updated_at',
];

$templates = [];
foreach ($rows as $row) {
    $clean = [];
    foreach ($metadataColumns as $col) {
        $clean[$col] = $row[$col] ?? null;
    }
    $templates[] = $clean;
}

jsonOut(200, [
    'ok'        => true,
    'count'     => count($templates),
    'templates' => $templates,
]);