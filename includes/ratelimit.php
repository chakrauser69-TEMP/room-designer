<?php
/**
 * Rate limiting helpers for login attempts.
 *
 * Provides IP- and username-based throttling backed by a `login_attempts` table.
 * Expects the following schema (or equivalent) to exist:
 *
 *   CREATE TABLE login_attempts (
 *       id            INT AUTO_INCREMENT PRIMARY KEY,
 *       ip_address    VARCHAR(45)  NOT NULL,
 *       username      VARCHAR(255) NOT NULL,
 *       success       TINYINT(1)   NOT NULL DEFAULT 0,
 *       attempted_at  DATETIME     NOT NULL,
 *       INDEX idx_ip_time        (ip_address, attempted_at),
 *       INDEX idx_user_time      (username, attempted_at),
 *       INDEX idx_attempted_at   (attempted_at)
 *   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
 */

/**
 * Record a single login attempt.
 *
 * @param PDO   $pdo       Active PDO connection.
 * @param string $ip       Client IP address (IPv4 or IPv6, up to 45 chars).
 * @param string $username Submitted username (may be empty for unknown users).
 * @param bool   $success  Whether the attempt succeeded.
 *
 * @return bool True on successful insert, false on failure (errors are silenced
 *              so that a transient DB problem does not block the user).
 */
function record_attempt(PDO $pdo, string $ip, string $username, bool $success): bool
{
    try {
        $sql = 'INSERT INTO login_attempts (ip_address, username, success, attempted_at)
                VALUES (:ip, :username, :success, :attempted_at)';
        $stmt = $pdo->prepare($sql);

        return $stmt->execute([
            ':ip'          => $ip,
            ':username'    => $username,
            ':success'     => $success ? 1 : 0,
            ':attempted_at'=> date('Y-m-d H:i:s'),
        ]);
    } catch (Throwable $e) {
        // Swallow errors: rate limiting must never block a legitimate user
        // when the audit log is unavailable.
        error_log('record_attempt failed: ' . $e->getMessage());
        return false;
    }
}

/**
 * Determine whether the given IP/username pair is currently rate limited.
 *
 * If a recent failure threshold has been exceeded, the function returns true
 * AND emits an HTTP `Retry-After` header (in seconds) advising the client when
 * it may try again. The header is only sent if no output has been emitted yet
 * (i.e. headers are still available).
 *
 * @param PDO    $pdo
 * @param string $ip
 * @param string $username
 * @param int    $maxAttempts   Maximum allowed failures within the window. Default 5.
 * @param int    $windowMinutes Sliding window length in minutes.        Default 15.
 *
 * @return bool  True if further attempts should be blocked, false otherwise.
 */
function is_rate_limited(
    PDO $pdo,
    string $ip,
    string $username,
    int $maxAttempts = 5,
    int $windowMinutes = 15
): bool {
    try {
        $windowStart = date('Y-m-d H:i:s', time() - ($windowMinutes * 60));

        $sql = 'SELECT COUNT(*) AS failures
                FROM login_attempts
                WHERE success = 0
                  AND attempted_at >= :window_start
                  AND (ip_address = :ip OR username = :username)';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ':window_start' => $windowStart,
            ':ip'           => $ip,
            ':username'     => $username,
        ]);

        $failures = (int) $stmt->fetchColumn();

        if ($failures < $maxAttempts) {
            return false;
        }

        // Threshold exceeded: compute when the oldest in-window failure
        // will fall outside the sliding window, and tell the client.
        $retryAfterSql = 'SELECT attempted_at
                          FROM login_attempts
                          WHERE success = 0
                            AND attempted_at >= :window_start
                            AND (ip_address = :ip OR username = :username)
                          ORDER BY attempted_at ASC
                          LIMIT 1';
        $retryStmt = $pdo->prepare($retryAfterSql);
        $retryStmt->execute([
            ':window_start' => $windowStart,
            ':ip'           => $ip,
            ':username'     => $username,
        ]);
        $oldest = $retryStmt->fetchColumn();

        $retryAfterSeconds = $windowMinutes * 60; // safe fallback
        if ($oldest !== false) {
            $unlockAt = strtotime($oldest) + ($windowMinutes * 60);
            $retryAfterSeconds = max(1, $unlockAt - time());
        }

        if (!headers_sent()) {
            header('Retry-After: ' . $retryAfterSeconds);
        }

        return true;
    } catch (Throwable $e) {
        error_log('is_rate_limited failed: ' . $e->getMessage());
        // Fail open: if we cannot consult the rate-limit store, do not block.
        return false;
    }
}