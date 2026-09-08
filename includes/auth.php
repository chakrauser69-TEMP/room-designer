<?php
/**
 * Room Designer - Auth helper functions
 *
 * The session is started by includes/bootstrap.php. This file ONLY
 * defines helper functions. It must NOT call session_start().
 */

if (!defined('ROOM_DESIGNER')) { http_response_code(403); exit; }

function isLoggedIn(): bool {
    return isset($_SESSION['user_id']);
}

function requireLogin(): void {
    if (!isLoggedIn()) {
        $isApi = isset($_SERVER['REQUEST_URI']) && strpos($_SERVER['REQUEST_URI'], '/api/') !== false;
        if ($isApi) {
            http_response_code(401);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => 'Authentication required']);
            exit;
        }
        header('Location: index.php');
        exit;
    }
}

function getUserId(): ?int {
    return isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null;
}

function currentUserId(): ?int {
    return getUserId();
}

function getUsername(): string {
    return $_SESSION['username'] ?? '';
}

function getCsrfToken(): string {
    // Delegate to the canonical csrf_token() in csrf.php so all callers
    // (camelCase, snake_case, page templates, API endpoints) read the
    // same value from $_SESSION.
    return function_exists('csrf_token') ? csrf_token() : '';
}

function csrfToken(): string { return getCsrfToken(); }

function csrfValidate(string $token): bool {
    return function_exists('csrf_validate') ? csrf_validate($token) : false;
}

// Snake-case aliases for pages written against the old convention
function is_logged_in(): bool { return isLoggedIn(); }
function get_user_id(): ?int { return getUserId(); }
function get_username(): string { return getUsername(); }
function get_csrf_token(): string { return getCsrfToken(); }
function generate_csrf_token(): string { return getCsrfToken(); }
function csrf_token_field(): string { return function_exists('csrf_field') ? csrf_field() : '<input type="hidden" name="csrf_token" value="' . htmlspecialchars(getCsrfToken(), ENT_QUOTES, 'UTF-8') . '">'; }
function csrf_meta_tag(): string { return function_exists('csrf_meta') ? csrf_meta() : '<meta name="csrf-token" content="' . htmlspecialchars(getCsrfToken(), ENT_QUOTES, 'UTF-8') . '">'; }
function require_csrf(): void {
    if (!verifyCsrfHeader()) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'CSRF token missing or invalid']);
        exit;
    }
}

function verifyCsrfHeader(): bool {
    $header = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $body   = $_POST['csrf_token'] ?? '';
    $token  = $header !== '' ? $header : $body;
    return csrfValidate($token);
}

function currentUserOwnsDesign(PDO $pdo, int $designId, ?int $userId = null): ?array {
    $uid = $userId ?? getUserId();
    if ($uid === null) return null;
    $stmt = $pdo->prepare('SELECT * FROM designs WHERE id = ? AND user_id = ? LIMIT 1');
    $stmt->execute([$designId, $uid]);
    return $stmt->fetch() ?: null;
}

function sendSecurityHeaders(): void {
    if (headers_sent()) return;
    header("Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: geolocation=(), camera=()');
}
