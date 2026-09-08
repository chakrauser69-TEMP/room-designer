<?php
/**
 * Bootstrap - loaded first by every PHP page.
 *
 * Responsibilities:
 *   1. Load config from getenv() with XAMPP-friendly defaults.
 *   2. Configure session cookies (lifetime=0, path=/, secure auto,
 *      httponly=true, samesite=Strict) and start the session.
 *   3. Enable session.use_strict_mode=1.
 *   4. Register an exception handler that emits JSON
 *      {"error":"Server error"} with HTTP 500 and writes a log entry.
 *   5. Set display_errors=0 and log_errors=1.
 *   6. require_once the helper includes (auth, csrf, headers, db).
 */

// Start output buffering immediately to prevent "headers already sent" issues
// when session_set_cookie_params() is called later.
if (ob_get_level() === 0) {
    ob_start();
}

// ---------------------------------------------------------------------------
// (1) Config - prefer environment, fall back to XAMPP defaults.
// ---------------------------------------------------------------------------
// Load the real config file first so DB constants and regexes are available.
require_once __DIR__ . DIRECTORY_SEPARATOR . 'config.php';

$config = [
    'db_host'    => DB_HOST,
    'db_port'    => '3306',
    'db_name'    => DB_NAME,
    'db_user'    => DB_USER,
    'db_pass'    => DB_PASS,
    'db_charset' => DB_CHARSET,

    'app_env'    => getenv('APP_ENV')    ?: 'development',
    'app_debug'  => filter_var(getenv('APP_DEBUG') ?: 'false', FILTER_VALIDATE_BOOLEAN),
    'app_key'    => getenv('APP_KEY')    ?: 'change-me-in-production',

    // Cookie / session origin (used to compute the "secure" flag).
    'cookie_secure_auto' => true,
];

// Expose globally as $GLOBALS['config'] and $config.
$GLOBALS['config'] = $config;

// ---------------------------------------------------------------------------
// (5) Error reporting - quiet in the response, verbose in the log.
//     Must happen BEFORE the exception handler is registered so the handler
//     can rely on log_errors being on.
// ---------------------------------------------------------------------------
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
ini_set('log_errors', '1');
ini_set('html_errors', '0');

error_reporting(E_ALL);

// ---------------------------------------------------------------------------
// (4) Custom exception handler - JSON {"error":"Server error"} + 500.
// ---------------------------------------------------------------------------
$logDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'logs';
$logFile = $logDir . DIRECTORY_SEPARATOR . 'php-error.log';

if (!is_dir($logDir)) {
    @mkdir($logDir, 0775, true);
}

set_exception_handler(static function (Throwable $e) use ($logFile): void {
    $entry = sprintf(
        "[%s] %s: %s in %s:%d\nStack trace:\n%s\n%s\n",
        date('Y-m-d H:i:s'),
        get_class($e),
        $e->getMessage(),
        $e->getFile(),
        $e->getLine(),
        $e->getTraceAsString(),
        str_repeat('-', 80)
    );

    // Best-effort log - swallow failures so the handler itself never throws.
    if (is_dir(dirname($logFile)) && is_writable(dirname($logFile))) {
        @file_put_contents($logFile, $entry, FILE_APPEND | LOCK_EX);
    }
    @error_log($entry);

    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
    }

    echo json_encode(['error' => 'Server error'], JSON_UNESCAPED_SLASHES);
    exit(1);
});

set_error_handler(static function ($severity, $message, $file, $line): bool {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});

// ---------------------------------------------------------------------------
// (2) Session cookie params + session_start.
//     "secure" is auto: on when the request is HTTPS, off otherwise.
// ---------------------------------------------------------------------------
$secureFlag = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['SERVER_PORT'] ?? '') === '443')
    || ((getenv('APP_ENV') ?: $config['app_env']) === 'production');

try {
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'domain'   => '',
        'secure'   => $secureFlag,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
} catch (Throwable $e) {
    // If we can't set cookie params (e.g. headers already sent), log and continue
    error_log('[bootstrap] session_set_cookie_params failed: ' . $e->getMessage());
}

// ---------------------------------------------------------------------------
// (3) Strict session mode - reject uninitialized session IDs.
// ---------------------------------------------------------------------------
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.cookie_httponly', '1');

session_name('RD_SESSID');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

// ---------------------------------------------------------------------------
// (6) Helper includes - loaded last so the above is in place when they run.
// ---------------------------------------------------------------------------
$includesDir = __DIR__ . DIRECTORY_SEPARATOR;

require_once $includesDir . 'auth.php';
require_once $includesDir . 'csrf.php';
require_once $includesDir . 'headers.php';
require_once $includesDir . 'db.php';
