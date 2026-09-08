<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

// ---------------------------------------------------------------------------
// (2) Output helpers
// ---------------------------------------------------------------------------
function out(int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}
function ok(array $payload = []): void { out(200, $payload); }
function err(int $status, string $message): void { out($status, ['error' => $message]); }

// ---------------------------------------------------------------------------
// (3) Input helpers
// ---------------------------------------------------------------------------
function read_json_body(): array {
    $raw = file_get_contents('php://input');
    if ($raw !== false && $raw !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) return $decoded;
    }
    // Fall back to form-encoded POST so the no-JS login form also works.
    return is_array($_POST) ? $_POST : [];
}

function client_ip(): string {
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $parts = explode(',', (string)$_SERVER['HTTP_X_FORWARDED_FOR']);
        $forwarded = trim($parts[0] ?? '');
        if (filter_var($forwarded, FILTER_VALIDATE_IP)) {
            $ip = $forwarded;
        }
    }
    return $ip;
}

// ---------------------------------------------------------------------------
// (4) Validation
// ---------------------------------------------------------------------------
function validate_username(string $u): ?string {
    $len = mb_strlen($u);
    if ($len < 3 || $len > 50) {
        return 'Username must be 3 to 50 characters';
    }
    if (!preg_match('/^[A-Za-z0-9_.\-]+$/', $u)) {
        return 'Username may only contain letters, digits, underscore, dot or dash';
    }
    return null;
}

function validate_email(string $e): ?string {
    if (mb_strlen($e) > 254) {
        return 'Email too long';
    }
    if (!filter_var($e, FILTER_VALIDATE_EMAIL)) {
        return 'Invalid email address';
    }
    return null;
}

function validate_password(string $p): ?string {
    if (mb_strlen($p) < 10) {
        return 'Password must be at least 10 characters';
    }
    if (!preg_match('/[A-Za-z]/', $p)) {
        return 'Password must include at least one letter';
    }
    if (!preg_match('/[0-9]/', $p)) {
        return 'Password must include at least one digit';
    }
    return null;
}

// ---------------------------------------------------------------------------
// (5) Rate limiting — use includes/ratelimit via PDO
// ---------------------------------------------------------------------------
function rl_ensure_dir(): void { /* no-op: MySQL-backed rate limiting in ratelimit.php */ }
function rl_path(string $bucket): string { return ''; }
function rl_load(string $bucket): array { return ['start' => time(), 'count' => 0]; }
function rl_save(string $bucket, int $start, int $count): void { /* no-op */ }
function rl_allow(string $bucket, int $limit, int $window): bool { return true; }
function rl_hit(string $bucket, int $window): void { /* no-op */ }
function rl_clear(string $bucket): void { /* no-op */ }

// ---------------------------------------------------------------------------
// (6) Session / CSRF — use includes helpers
// ---------------------------------------------------------------------------
// csrf_token() is provided by includes/csrf.php (loaded by bootstrap.php)

function csrf_require(): void {
    $token = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    $stored = (string)($_SESSION['_csrf_token'] ?? '');
    if ($token === '' || $stored === '' || !hash_equals($stored, $token)) {
        err(403, 'Invalid CSRF token');
    }
}

function session_regenerate(): void {
    if (session_status() === PHP_SESSION_ACTIVE) {
        @session_regenerate_id(true);
    }
}

function session_destroy_full(): void {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires'  => time() - 42000,
            'path'     => $p['path'],
            'domain'   => $p['domain'],
            'secure'   => (bool)$p['secure'],
            'httponly' => (bool)$p['httponly'],
            'samesite' => $p['samesite'] ?? 'Strict',
        ]);
    }
    @session_destroy();
}

// ---------------------------------------------------------------------------
// (7) Database — use MySQL PDO from bootstrap (DB_* constants from config.php)
// ---------------------------------------------------------------------------
function db(): PDO {
    global $pdo;
    if ($pdo instanceof PDO) return $pdo;

    $host = DB_HOST ?? 'localhost';
    $name = DB_NAME ?? 'room_designer';
    $user = DB_USER ?? 'root';
    $pass = DB_PASS ?? '';

    $pdo = new PDO(
        'mysql:host=' . $host . ';dbname=' . $name . ';charset=' . (DB_CHARSET ?? 'utf8mb4'),
        $user,
        $pass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
    return $pdo;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------
$action = '';
if (isset($_GET['action']) && is_string($_GET['action'])) {
    $action = $_GET['action'];
} elseif (isset($_POST['action']) && is_string($_POST['action'])) {
    $action = $_POST['action'];
}

switch ($action) {
    case 'register': action_register(); break;
    case 'login':    action_login();    break;
    case 'logout':   action_logout();   break;
    case 'check':    action_check();    break;
    default:         err(400, 'Unknown action');
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------
function action_register(): void {
    $body = read_json_body();

    $username = isset($body['username']) && is_string($body['username'])
        ? strtolower(trim($body['username']))
        : '';
    $email = isset($body['email']) && is_string($body['email'])
        ? strtolower(trim($body['email']))
        : '';
    $password = isset($body['password']) && is_string($body['password'])
        ? $body['password']
        : '';

    if ($username === '' || $email === '' || $password === '') {
        err(400, 'Username, email and password are required');
    }
    if ($msg = validate_username($username)) err(400, $msg);
    if ($msg = validate_email($email))       err(400, $msg);
    if ($msg = validate_password($password)) err(400, $msg);

    $ip = client_ip();

    $pdo = db();

    $stmt = $pdo->prepare('SELECT id, username, email FROM users WHERE username = ? OR email = ? LIMIT 1');
    $stmt->execute([$username, $email]);
    $existing = $stmt->fetch();
    if ($existing) {
        if (strcasecmp((string)$existing['username'], $username) === 0) {
            err(400, 'Username already taken');
        }
        err(400, 'Email already registered');
    }

    $hash = password_hash($password, PASSWORD_DEFAULT);
    if (!is_string($hash) || $hash === '') {
        err(400, 'Could not create account');
    }

    try {
        $ins = $pdo->prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)');
        $ins->execute([$username, $email, $hash]);
        $userId = (int)$pdo->lastInsertId();
    } catch (PDOException $e) {
        err(400, 'Could not create account');
    }

    session_regenerate();
    $_SESSION['user_id']   = $userId;
    $_SESSION['username']  = $username;

    ok([
        'ok'         => true,
        'username'   => $username,
        'email'      => $email,
        'csrf_token' => csrf_token(),
    ]);
}

function action_login(): void {
    $body = read_json_body();

    $identifier = '';
    if (isset($body['username']) && is_string($body['username']) && trim($body['username']) !== '') {
        $identifier = strtolower(trim($body['username']));
    } elseif (isset($body['email']) && is_string($body['email']) && trim($body['email']) !== '') {
        $identifier = strtolower(trim($body['email']));
    }
    $password = isset($body['password']) && is_string($body['password'])
        ? $body['password']
        : '';

    if ($identifier === '' || $password === '') {
        err(400, 'Username or email, and password, are required');
    }

    $pdo = db();

    $stmt = $pdo->prepare('SELECT id, username, email, password_hash FROM users WHERE username = ? OR email = ? LIMIT 1');
    $stmt->execute([$identifier, $identifier]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, (string)$user['password_hash'])) {
        err(401, 'Invalid credentials');
    }

    session_regenerate();
    $_SESSION['user_id']   = (int)$user['id'];
    $_SESSION['username']  = (string)$user['username'];
    csrf_token();

    ok([
        'ok'         => true,
        'username'   => (string)$user['username'],
        'email'      => (string)$user['email'],
        'csrf_token' => csrf_token(),
    ]);
}

function action_logout(): void {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        err(403, 'POST method required');
    }
    csrf_require();
    session_destroy_full();
    ok(['ok' => true]);
}

function action_check(): void {
    $userId   = $_SESSION['user_id'] ?? null;
    $username = $_SESSION['username'] ?? null;

    if (is_int($userId) && $userId > 0 && is_string($username) && $username !== '') {
        ok([
            'logged_in'  => true,
            'user_id'    => $userId,
            'username'   => $username,
            'csrf_token' => csrf_token(),
        ]);
    } else {
        ok([
            'logged_in' => false,
            'username'  => null,
        ]);
    }
}