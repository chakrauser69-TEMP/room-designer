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
        echo '<h1>Design not found</h1><p>The design you are looking for does not exist or is not accessible.</p>';
        exit;
    }
}

$csrfToken   = csrfToken();
$designName  = $design['name'] ?? 'Untitled design';
$templateId  = isset($_GET['template']) ? (int)$_GET['template'] : 0;
$designIdJs  = $designId > 0 ? $designId : 'null';

if (!function_exists('h')) {
    function h(string $value): string {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
?><!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="description" content="Design and decorate your room in 3D with RoomSpace AI.">
    <meta name="robots" content="noindex, nofollow">
    <meta name="theme-color" content="#12151a">
    <meta name="color-scheme" content="dark">
    <meta name="csrf-token" content="<?= h($csrfToken) ?>">
    <meta name="design-id" content="<?= (int)$designIdJs ?>">
    <meta name="template-id" content="<?= (int)$templateId ?>">
    <title><?= h($designName) ?> — RoomSpace AI</title>

    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%237ec8a3'/%3E%3Ctext x='50' y='65' font-size='60' text-anchor='middle' fill='white' font-family='sans-serif'%3ER%3C/text%3E%3C/svg%3E">
    <link rel="stylesheet" href="./assets/css/style.css?v=3">
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
                <span class="menu-btn__bar"></span>
                <span class="menu-btn__bar"></span>
                <span class="menu-btn__bar"></span>
            </button>

            <a class="top-bar__logo" href="./dashboard.php" aria-label="RoomSpace AI home">
                <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
                    <path d="M4 20 L16 6 L28 20 L28 26 L4 26 Z" fill="currentColor"/>
                    <rect x="14" y="20" width="4" height="6" fill="#0f0f14"/>
                </svg>
                <span class="top-bar__brand">RoomSpace AI</span>
            </a>

            <h1 class="design-name" contenteditable="true" spellcheck="false" role="textbox" tabindex="0" aria-label="Design name" data-placeholder="Untitled design" data-action="rename-design"><?= h($designName) ?></h1>
        </div>

        <div class="top-bar__right">
            <a class="top-bar__link" href="./dashboard.php" aria-label="Back to dashboard">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path d="M3 12 L12 3 L21 12 M5 10 V21 H19 V10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span>Dashboard</span>
            </a>

            <span class="save-state" data-save-state aria-live="polite"></span>

            <button type="button" class="btn btn--primary top-bar__save" data-action="save" aria-label="Save design">
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <path d="M5 3 H17 L21 7 V21 H3 V5 a2 2 0 0 1 2-2 Z M7 3 V9 H15 V3 M7 14 H17 V21 H7 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                </svg>
                <span class="top-bar__save-label">Save</span>
            </button>
        </div>
    </header>

    <main class="editor-layout" data-layout="editor">
        <aside id="editorSidebar" class="editor-sidebar" aria-label="Asset library" data-panel="sidebar">
            <div class="sidebar-tabs" role="tablist" aria-label="Asset library tabs" data-tabs="sidebar">
                <button type="button" class="sidebar-tabs__tab" id="tab-assets" role="tab" aria-selected="true" aria-controls="panel-assets" tabindex="0" data-tab="assets">
                    <span>Assets</span>
                </button>
                <button type="button" class="sidebar-tabs__tab" id="tab-templates" role="tab" aria-selected="false" aria-controls="panel-templates" tabindex="-1" data-tab="templates">
                    <span>Templates</span>
                </button>
            </div>

            <div class="sidebar-panel" id="panel-assets" role="tabpanel" aria-labelledby="tab-assets" data-tab-panel="assets">
                <div class="sidebar-panel__inner" data-sidebar-content="assets">
                    <!-- Filled by editor.js -->
                </div>
            </div>

            <div class="sidebar-panel" id="panel-templates" role="tabpanel" aria-labelledby="tab-templates" data-tab-panel="templates" hidden>
                <div class="sidebar-panel__inner" data-sidebar-content="templates">
                    <!-- Filled by editor.js -->
                </div>
            </div>
        </aside>

        <section class="editor-canvas-area" data-panel="canvas">
            <div class="editor-toolbar" role="toolbar" aria-label="Editor tools">
                <div class="toolbar-group" role="group" aria-label="Selection">
                    <button type="button" class="tool-btn" data-tool="select" aria-label="Select (V)" aria-pressed="true" title="Select (V)">Select</button>
                    <button type="button" class="tool-btn" data-tool="move" aria-label="Move (G)" title="Move (G)">Move</button>
                    <button type="button" class="tool-btn" data-tool="rotate" aria-label="Rotate (R)" title="Rotate (R)">Rotate</button>
                </div>
                <div class="toolbar-group" role="group" aria-label="History">
                    <button type="button" class="tool-btn" data-action="undo" aria-label="Undo" title="Undo (Ctrl+Z)" disabled>Undo</button>
                    <button type="button" class="tool-btn" data-action="redo" aria-label="Redo" title="Redo (Ctrl+Y)" disabled>Redo</button>
                </div>
            </div>

            <div class="canvas-container" data-canvas-container id="viewport">
                <canvas id="roomCanvas" class="canvas-container__canvas" aria-label="Room design canvas" role="img" tabindex="0"></canvas>
                <div class="canvas-overlay" data-canvas-overlay></div>
            </div>
        </section>

        <aside class="properties-panel" data-panel="properties" aria-label="Properties">
            <div data-properties-content>
                <!-- Filled by properties.js -->
            </div>
        </aside>
    </main>

    <script>
        window.DESIGN_ID   = <?= $designIdJs ?>;
        window.TEMPLATE_ID = <?= (int)$templateId ?>;
        window.CSRF_TOKEN  = <?= json_encode($csrfToken) ?>;
        window.USER_ID     = <?= (int)$userId ?>;
    </script>

    <script type="module" src="./assets/js/editor.js"></script>
</body>
</html>
