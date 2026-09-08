<?php
/**
 * Room Designer - PDO connection
 *
 * The DB_HOST/DB_NAME/DB_USER/DB_PASS/DB_CHARSET constants are
 * defined by includes/config.php (loaded first by bootstrap.php).
 * This file only opens the PDO handle as $pdo.
 */

if (!defined('DB_HOST')) {
    http_response_code(500);
    die(json_encode(['error' => 'DB config missing - config.php must be loaded first']));
}

try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET,
        DB_USER,
        DB_PASS,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]
    );
} catch (PDOException $e) {
    error_log('[db.php] ' . $e->getMessage());
    http_response_code(500);
    if (strpos($_SERVER['REQUEST_URI'] ?? '', '/api/') !== false) {
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Database connection failed']);
    } else {
        echo 'Database connection failed';
    }
    exit;
}
