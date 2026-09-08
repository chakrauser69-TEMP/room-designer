<?php
/**
 * CSRF protection helpers.
 *
 * Token strategy: hash(session_id + installation secret) regenerated per
 * session. The installation secret should be defined by the application
 * bootstrap (e.g. in config.php) as CSRF_SECRET; if it is not defined, a
 * per-process fallback is derived to keep the helpers usable, but you
 * SHOULD define a stable secret in production.
 */

if (!defined('CSRF_SECRET')) {
    // Fallback: derive a per-process secret. Replace with a real constant
    // in your application bootstrap (recommended: a random 32+ byte value
    // stored in config.php or an environment variable).
    if (!defined('CSRF_FALLBACK_SECRET')) {
        define('CSRF_FALLBACK_SECRET', 'csrf-fallback-' . __FILE__);
    }
    $GLOBALS['CSRF_SECRET_RESOLVED'] = CSRF_FALLBACK_SECRET;
} else {
    $GLOBALS['CSRF_SECRET_RESOLVED'] = CSRF_SECRET;
}

/**
 * Return the current session CSRF token, generating one if needed.
 *
 * @return string
 */
function csrf_token(): string
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        // Best-effort: if a session isn't active, we can't generate a
        // per-session token. Return an empty string so callers can detect.
        return '';
    }

    if (empty($_SESSION['_csrf_token'])) {
        $secret = $GLOBALS['CSRF_SECRET_RESOLVED'] ?? 'csrf-fallback';
        $_SESSION['_csrf_token'] = hash('sha256', session_id() . '|' . $secret);
    }

    return (string) $_SESSION['_csrf_token'];
}

/**
 * Return a <meta> tag string containing the current CSRF token.
 *
 * @return string
 */
function csrf_meta(): string
{
    $token = htmlspecialchars(csrf_token(), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    return '<meta name="csrf-token" content="' . $token . '">';
}

/**
 * Validate a token supplied via POST body (csrf_token / _csrf / token)
 * or via the X-CSRF-Token header. Uses hash_equals for constant-time
 * comparison.
 *
 * @param string|null $supplied Optional explicit token; if null, reads
 *                              from $_POST and the X-CSRF-Token header.
 * @return bool
 */
function csrf_validate(?string $supplied = null): bool
{
    $expected = csrf_token();
    if ($expected === '') {
        return false;
    }

    if ($supplied === null) {
        $candidates = [];

        if (isset($_POST['csrf_token'])) {
            $candidates[] = (string) $_POST['csrf_token'];
        }
        if (isset($_POST['_csrf'])) {
            $candidates[] = (string) $_POST['_csrf'];
        }
        if (isset($_POST['token'])) {
            $candidates[] = (string) $_POST['token'];
        }

        if (function_exists('getallheaders')) {
            $headers = getallheaders();
            if (is_array($headers)) {
                foreach ($headers as $name => $value) {
                    if (strcasecmp((string) $name, 'X-CSRF-Token') === 0) {
                        $candidates[] = (string) $value;
                        break;
                    }
                }
            }
        }

        if (isset($_SERVER['HTTP_X_CSRF_TOKEN'])) {
            $candidates[] = (string) $_SERVER['HTTP_X_CSRF_TOKEN'];
        }

        foreach ($candidates as $candidate) {
            if ($candidate === '') {
                continue;
            }
            if (hash_equals($expected, $candidate)) {
                return true;
            }
        }
        return false;
    }

    if ($supplied === '') {
        return false;
    }
    return hash_equals($expected, $supplied);
}

/**
 * Return a hidden <input> HTML field carrying the current CSRF token.
 *
 * @param string $name The field name (default: csrf_token).
 * @return string
 */
function csrf_field(string $name = 'csrf_token'): string
{
    $token = htmlspecialchars(csrf_token(), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $nameEsc = htmlspecialchars($name, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    return '<input type="hidden" name="' . $nameEsc . '" value="' . $token . '">';
}
