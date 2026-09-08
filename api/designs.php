<?php
/**
 * Room Designer - Designs API
 *
 * All endpoints require an authenticated user. All endpoints return JSON.
 *
 * Actions:
 *   GET    ?action=list                - List designs for the current user (safe columns).
 *   GET    ?action=load&id=N           - Load a single design (must belong to user, else 404).
 *   POST   ?action=save                - Create or update a design. Requires CSRF.
 *   POST   ?action=delete&id=N         - Delete a design. Requires CSRF.
 *   DELETE ?action=delete&id=N         - Delete a design. Requires CSRF.
 *   POST   ?action=share&id=N          - Toggle is_public; generate share_token if enabling.
 *
 * All database access uses prepared statements exclusively.
 */

require_once __DIR__ . '/../includes/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

// Session already started by bootstrap.php. isLoggedIn() and getUserId()
// read from $_SESSION which bootstrap set up with RD_SESSID.

// Use the PDO connection established by includes/db.php (loaded by bootstrap.php).
global $pdo;

// -----------------------------------------------------------------------------
// Require login for ALL actions. Return JSON (not an HTML redirect) so that
// JavaScript clients can react to the error.
// -----------------------------------------------------------------------------
if (!isLoggedIn()) {
    http_response_code(401);
    echo json_encode(['error' => 'Authentication required']);
    exit;
}

$userId = (int) getUserId();
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

/** Whitelist of allowed floor material values. */
$ALLOWED_FLOOR_MATERIALS = ['solid', 'wood', 'tile', 'concrete'];

/**
 * Emit a JSON response with the given HTTP status code and exit.
 */
function designs_respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

switch ($action) {

    // -------------------------------------------------------------------------
    // list - return array of designs for the current user (safe columns only).
    // Excludes the large design_data JSON column to keep the listing payload
    // small. Safe columns: identity, metadata, thumbnail, sharing state.
    // -------------------------------------------------------------------------
    case 'list':
        if ($method !== 'GET') {
            designs_respond(405, ['error' => 'Method not allowed']);
        }

        $stmt = $pdo->prepare(
            'SELECT id, name, template_id, grid_width, grid_height,
                    floor_color, floor_material, thumbnail,
                    is_public, share_token, created_at, updated_at
               FROM designs
             WHERE user_id = :uid
             ORDER BY updated_at DESC, id DESC'
        );
        $stmt->execute([':uid' => $userId]);
        designs_respond(200, ['designs' => $stmt->fetchAll()]);
        break;

    // -------------------------------------------------------------------------
    // load - return full design row IF it belongs to the user, else 404.
    // -------------------------------------------------------------------------
    case 'load':
        if ($method !== 'GET') {
            designs_respond(405, ['error' => 'Method not allowed']);
        }

        $id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
        if (!$id || $id <= 0) {
            designs_respond(400, ['error' => 'Invalid or missing id']);
        }

        $stmt = $pdo->prepare(
            'SELECT * FROM designs WHERE id = :id AND user_id = :uid'
        );
        $stmt->execute([':id' => $id, ':uid' => $userId]);
        $design = $stmt->fetch();
        if (!$design) {
            designs_respond(404, ['error' => 'Design not found']);
        }

        designs_respond(200, ['design' => $design]);
        break;

    // -------------------------------------------------------------------------
    // save - create or update a design.
    //   - Requires CSRF.
    //   - Requires Content-Type: application/json.
    //   - Caps raw input at MAX_DESIGN_BYTES.
    //   - Validates name (1-100 chars).
    //   - Validates floor_color against ALLOWED_FLOOR_COLOR_REGEX.
    //   - Validates floor_material in {solid, wood, tile, concrete}.
    //   - Validates grid_width / grid_height as ints in [4, 30].
    //   - Validates design_data JSON size <= MAX_DESIGN_DATA_BYTES.
    //   - Validates thumbnail against ALLOWED_THUMBNAIL_REGEX.
    //   - Performs INSERT or UPDATE; checks rowCount() and returns 404 on 0.
    // -------------------------------------------------------------------------
    case 'save':
        if ($method !== 'POST') {
            designs_respond(405, ['error' => 'Method not allowed']);
        }
        if (!csrf_validate()) {
            designs_respond(403, ['error' => 'CSRF token invalid']);
        }

        // Enforce Content-Type: application/json (allow charset parameters).
        $contentType = (string) ($_SERVER['CONTENT_TYPE'] ?? '');
        if (stripos($contentType, 'application/json') === false) {
            designs_respond(415, ['error' => 'Content-Type must be application/json']);
        }

        // Cap raw input size at MAX_DESIGN_BYTES. Reading one extra byte lets
        // us detect and reject oversized payloads.
        $rawInput = file_get_contents('php://input', false, null, 0, MAX_DESIGN_BYTES + 1);
        if ($rawInput === false || strlen($rawInput) > MAX_DESIGN_BYTES) {
            designs_respond(413, ['error' => 'Payload too large']);
        }

        $data = json_decode($rawInput, true);
        if (!is_array($data)) {
            designs_respond(400, ['error' => 'Invalid JSON body']);
        }

        // --- name: 1-100 characters -----------------------------------------
        $name   = isset($data['name']) ? (string) $data['name'] : '';
        $name   = trim($name);
        $nameLen = function_exists('mb_strlen')
            ? mb_strlen($name, 'UTF-8')
            : strlen($name);
        if ($nameLen < 1 || $nameLen > 100) {
            designs_respond(422, ['error' => 'Name must be 1-100 characters']);
        }

        // --- floor_color ------------------------------------------------------
        $floorColor = isset($data['floor_color']) ? (string) $data['floor_color'] : '';
        if ($floorColor === '' || !preg_match(ALLOWED_FLOOR_COLOR_REGEX, $floorColor)) {
            designs_respond(422, ['error' => 'Invalid floor_color']);
        }

        // --- floor_material ---------------------------------------------------
        $floorMaterial = isset($data['floor_material']) ? (string) $data['floor_material'] : '';
        if (!in_array($floorMaterial, $ALLOWED_FLOOR_MATERIALS, true)) {
            designs_respond(422, ['error' => 'Invalid floor_material']);
        }

        // --- grid_width / grid_height (4-30) ---------------------------------
        $gridWidth  = filter_var($data['grid_width']  ?? null, FILTER_VALIDATE_INT);
        $gridHeight = filter_var($data['grid_height'] ?? null, FILTER_VALIDATE_INT);
        if ($gridWidth === false || $gridWidth < 4 || $gridWidth > 30) {
            designs_respond(422, ['error' => 'grid_width must be an integer between 4 and 30']);
        }
        if ($gridHeight === false || $gridHeight < 4 || $gridHeight > 30) {
            designs_respond(422, ['error' => 'grid_height must be an integer between 4 and 30']);
        }

        // --- design_data: JSON-encode and check serialized size -------------
        $designDataRaw = $data['design_data'] ?? ($data['objects'] ?? []);
        if (!is_array($designDataRaw) && !is_object($designDataRaw)) {
            designs_respond(422, ['error' => 'design_data must be an array or object']);
        }
        $designDataJson = json_encode($designDataRaw, JSON_UNESCAPED_SLASHES);
        if ($designDataJson === false) {
            designs_respond(422, ['error' => 'design_data is not valid JSON']);
        }
        if (strlen($designDataJson) > MAX_DESIGN_DATA_BYTES) {
            designs_respond(413, ['error' => 'design_data too large']);
        }

        // --- thumbnail (optional) -------------------------------------------
        $thumbnail = null;
        if (array_key_exists('thumbnail', $data)
            && $data['thumbnail'] !== null
            && $data['thumbnail'] !== '') {
            $thumbnail = (string) $data['thumbnail'];
            if (!preg_match(ALLOWED_THUMBNAIL_REGEX, $thumbnail)) {
                designs_respond(422, ['error' => 'Invalid thumbnail']);
            }
        }

        // --- template_id (optional) -----------------------------------------
        $templateId = null;
        if (isset($data['template_id'])
            && $data['template_id'] !== null
            && $data['template_id'] !== '') {
            $templateId = filter_var($data['template_id'], FILTER_VALIDATE_INT);
            if ($templateId === false || $templateId <= 0) {
                designs_respond(422, ['error' => 'Invalid template_id']);
            }
        }

        // --- Persist (INSERT or UPDATE) -------------------------------------
        $id = isset($data['id']) ? filter_var($data['id'], FILTER_VALIDATE_INT) : false;

        if ($id !== false && $id > 0) {
            // UPDATE existing design, scoped to the current user.
            $stmt = $pdo->prepare(
                'UPDATE designs
                    SET name           = :name,
                        template_id    = :template_id,
                        grid_width     = :grid_width,
                        grid_height    = :grid_height,
                        floor_color    = :floor_color,
                        floor_material = :floor_material,
                        design_data    = :design_data,
                        thumbnail      = :thumbnail
                  WHERE id = :id
                    AND user_id = :uid'
            );
            $stmt->execute([
                ':name'           => $name,
                ':template_id'    => $templateId,
                ':grid_width'     => $gridWidth,
                ':grid_height'    => $gridHeight,
                ':floor_color'    => $floorColor,
                ':floor_material' => $floorMaterial,
                ':design_data'    => $designDataJson,
                ':thumbnail'      => $thumbnail,
                ':id'             => $id,
                ':uid'            => $userId,
            ]);

            if ($stmt->rowCount() < 1) {
                // rowCount() may be 0 either because no row matched (design
                // does not belong to this user / does not exist) OR because
                // the new values match the existing ones. Disambiguate by
                // checking ownership; only return 404 when the row is gone.
                $check = $pdo->prepare(
                    'SELECT id FROM designs WHERE id = :id AND user_id = :uid'
                );
                $check->execute([':id' => $id, ':uid' => $userId]);
                if (!$check->fetch()) {
                    designs_respond(404, ['error' => 'Design not found']);
                }
            }

            designs_respond(200, ['success' => true, 'id' => $id]);
        } else {
            // INSERT new design.
            $stmt = $pdo->prepare(
                'INSERT INTO designs
                    (user_id, name, template_id, grid_width, grid_height,
                     floor_color, floor_material, design_data, thumbnail)
                  VALUES
                    (:uid, :name, :template_id, :grid_width, :grid_height,
                     :floor_color, :floor_material, :design_data, :thumbnail)'
            );
            $stmt->execute([
                ':uid'            => $userId,
                ':name'           => $name,
                ':template_id'    => $templateId,
                ':grid_width'     => $gridWidth,
                ':grid_height'    => $gridHeight,
                ':floor_color'    => $floorColor,
                ':floor_material' => $floorMaterial,
                ':design_data'    => $designDataJson,
                ':thumbnail'      => $thumbnail,
            ]);

            $newId = (int) $pdo->lastInsertId();
            if ($newId < 1 || $stmt->rowCount() < 1) {
                designs_respond(500, ['error' => 'Failed to save design']);
            }

            designs_respond(201, ['success' => true, 'id' => $newId]);
        }
        break;

    // -------------------------------------------------------------------------
    // delete - remove a design owned by the user. Accepts POST or DELETE.
    //   - Requires CSRF.
    //   - Returns 404 if 0 rows affected.
    // -------------------------------------------------------------------------
    case 'delete':
        if (!in_array($method, ['POST', 'DELETE'], true)) {
            designs_respond(405, ['error' => 'Method not allowed']);
        }
        if (!csrf_validate()) {
            designs_respond(403, ['error' => 'CSRF token invalid']);
        }

        $id = filter_var(
            $_GET['id'] ?? $_POST['id'] ?? null,
            FILTER_VALIDATE_INT
        );
        if (!$id || $id <= 0) {
            designs_respond(400, ['error' => 'Invalid or missing id']);
        }

        $stmt = $pdo->prepare(
            'DELETE FROM designs WHERE id = :id AND user_id = :uid'
        );
        $stmt->execute([':id' => $id, ':uid' => $userId]);

        if ($stmt->rowCount() < 1) {
            designs_respond(404, ['error' => 'Design not found']);
        }

        designs_respond(200, ['success' => true]);
        break;

    // -------------------------------------------------------------------------
    // share - toggle is_public. Generate a share_token when enabling.
    //   - Requires CSRF.
    //   - Returns the share URL when public, or null when unshared.
    // -------------------------------------------------------------------------
    case 'share':
        if ($method !== 'POST') {
            designs_respond(405, ['error' => 'Method not allowed']);
        }
        if (!csrf_validate()) {
            designs_respond(403, ['error' => 'CSRF token invalid']);
        }

        $id = filter_var(
            $_GET['id'] ?? $_POST['id'] ?? null,
            FILTER_VALIDATE_INT
        );
        if (!$id || $id <= 0) {
            designs_respond(400, ['error' => 'Invalid or missing id']);
        }

        // Load the current state, scoped to the current user.
        $stmt = $pdo->prepare(
            'SELECT id, is_public, share_token
               FROM designs
              WHERE id = :id AND user_id = :uid'
        );
        $stmt->execute([':id' => $id, ':uid' => $userId]);
        $row = $stmt->fetch();
        if (!$row) {
            designs_respond(404, ['error' => 'Design not found']);
        }

        $currentlyPublic = ((int) $row['is_public'] === 1);
        $newIsPublic     = $currentlyPublic ? 0 : 1;

        // If enabling and no token exists yet, generate a fresh one.
        $newToken = $row['share_token'];
        if ($newIsPublic === 1 && (empty($newToken) || $newToken === null)) {
            $newToken = bin2hex(random_bytes(16));
        }

        $upd = $pdo->prepare(
            'UPDATE designs
                SET is_public   = :pub,
                    share_token = :tok
              WHERE id  = :id
                AND user_id = :uid'
        );
        $upd->execute([
            ':pub' => $newIsPublic,
            ':tok' => $newIsPublic === 1 ? $newToken : null,
            ':id'  => $id,
            ':uid' => $userId,
        ]);
        if ($upd->rowCount() < 1) {
            // Unreachable in normal flow (the row was just confirmed), but
            // handle defensively.
            designs_respond(404, ['error' => 'Design not found']);
        }

        // Build a share URL based on the current request.
        $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['SERVER_PORT'] ?? '') === '443');
        $scheme = $isHttps ? 'https' : 'http';
        $host   = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $url    = ($newIsPublic === 1)
            ? $scheme . '://' . $host . '/share.php?token=' . urlencode((string) $newToken)
            : null;

        designs_respond(200, [
            'success'     => true,
            'id'          => $id,
            'is_public'   => $newIsPublic === 1,
            'share_token' => $newIsPublic === 1 ? $newToken : null,
            'url'         => $url,
        ]);
        break;

    // -------------------------------------------------------------------------
    // default - invalid action.
    // -------------------------------------------------------------------------
    default:
        designs_respond(400, ['error' => 'Invalid action']);
}