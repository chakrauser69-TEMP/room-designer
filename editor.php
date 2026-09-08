<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/bootstrap.php';

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Content-Type: text/html; charset=utf-8');

requireLogin();

$userId = currentUserId();
$designId = isset($_GET['id']) ? (int)$_GET['id'] : 0;
$design = null;

if ($designId > 0) {
    $design = currentUserOwnsDesign($pdo, $designId, $userId);

    if ($design === null) {
        http_response_code(404);
        $title = 'Design not found';
        echo '<h1>Design not found</h1><p>The design you are looking for does not exist or is not accessible.</p>';
        exit;
    }
}

$csrfToken   = csrfToken();
$designName  = $design['name']      ?? 'Untitled design';
$designSlug  = $design['slug']      ?? '';
$templateId  = isset($_GET['template']) ? (int)$_GET['template'] : 0;
$designIdJs  = $designId > 0 ? $designId : 'null';

if (!function_exists('h')) {
    function h(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
?><!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="description" content="Design and decorate your room in 3D. Drag furniture, swap materials, and visualize your space.">
    <meta name="robots" content="noindex, nofollow">
    <meta name="theme-color" content="#121018">
    <meta name="color-scheme" content="dark">
    <meta name="csrf-token" content="<?= h($csrfToken) ?>">
    <meta name="design-id" content="<?= (int)$designIdJs ?>">
    <meta name="template-id" content="<?= (int)$templateId ?>">
    <title><?= h($designName) ?> — RoomSpace AI</title>

    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20100%20100'%3E%3Crect%20width='100'%20height='100'%20rx='20'%20fill='%237c3aed'/%3E%3Ctext%20x='50'%20y='65'%20font-size='60'%20text-anchor='middle'%20fill='white'%20font-family='sans-serif'%3ER%3C/text%3E%3C/svg%3E">
    <link rel="apple-touch-icon" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQIm2NgAAAAAgAAzYl9qRAAAAAElFTkSuQmCC">
    <link rel="stylesheet" href="./assets/css/style.css?v=2">
    <link rel="stylesheet" href="./assets/css/editor.css?v=2">

    <script type="importmap">
    {
        "imports": {
            "three": "./assets/js/vendor/three.module.js",
            "three/addons/": "./assets/js/vendor/three/jsm/"
        }
    }
    </script>

    <script>
        (function () {
            try {
                var stored = localStorage.getItem('theme');
                var theme = stored === 'light' || stored === 'dark' ? stored : 'dark';
                document.documentElement.setAttribute('data-theme', theme);
            } catch (e) {
                document.documentElement.setAttribute('data-theme', 'dark');
            }
        })();
    </script>
</head>
<body class="editor-page" data-design-id="<?= (int)$designIdJs ?>" data-template-id="<?= (int)$templateId ?>" data-csrf-token="<?= h($csrfToken) ?>">

    <header class="top-bar" role="banner">
        <div class="top-bar__left">
            <button type="button" class="menu-btn" aria-label="Open asset library" aria-controls="editorSidebar" aria-expanded="false" data-action="toggle-sidebar">
                <span class="menu-btn__bar" aria-hidden="true"></span>
                <span class="menu-btn__bar" aria-hidden="true"></span>
                <span class="menu-btn__bar" aria-hidden="true"></span>
            </button>

            <a class="top-bar__logo" href="./index.php" aria-label="RoomSpace AI home">
                <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false">
                    <path d="M4 20 L16 6 L28 20 L28 26 L4 26 Z" fill="currentColor"/>
                    <rect x="14" y="20" width="4" height="6" fill="#0f0f14"/>
                </svg>
                <span class="top-bar__brand">RoomSpace AI</span>
            </a>

            <h1
                class="design-name"
                contenteditable="true"
                spellcheck="false"
                role="textbox"
                tabindex="0"
                aria-label="Design name"
                data-placeholder="Untitled design"
                data-action="rename-design"><?= h($designName) ?></h1>
        </div>

        <div class="top-bar__right">
            <a class="top-bar__link" href="./dashboard.php" aria-label="Back to dashboard">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                    <path d="M3 12 L12 3 L21 12 M5 10 V21 H19 V10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span>Dashboard</span>
            </a>

            <span class="save-state" data-save-state aria-live="polite" aria-atomic="true"></span>

            <button type="button" class="btn btn--primary top-bar__save" data-action="save" aria-label="Save design">
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                    <path d="M5 3 H17 L21 7 V21 H3 V5 a2 2 0 0 1 2-2 Z M7 3 V9 H15 V3 M7 14 H17 V21 H7 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                </svg>
                <span class="top-bar__save-label">Save</span>
            </button>
        </div>
    </header>

    <!-- Rest of the file remains unchanged. The branding strings above have been updated. -->
