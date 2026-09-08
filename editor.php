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
    <title><?= h($designName) ?> — Room Designer</title>

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

            <a class="top-bar__logo" href="./index.php" aria-label="Room Designer home">
                <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false">
                    <path d="M4 20 L16 6 L28 20 L28 26 L4 26 Z" fill="currentColor"/>
                    <rect x="14" y="20" width="4" height="6" fill="#0f0f14"/>
                </svg>
                <span class="top-bar__brand">Room Designer</span>
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

    <main class="editor-layout" data-layout="editor">

        <aside
            id="editorSidebar"
            class="editor-sidebar"
            aria-label="Asset library"
            data-panel="sidebar">

            <div
                class="sidebar-tabs"
                role="tablist"
                aria-label="Asset library tabs"
                data-tabs="sidebar">

                <button
                    type="button"
                    class="sidebar-tabs__tab"
                    id="tab-assets"
                    role="tab"
                    aria-selected="true"
                    aria-controls="panel-assets"
                    tabindex="0"
                    data-tab="assets">
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                        <rect x="3" y="3" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2"/>
                        <rect x="14" y="3" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2"/>
                        <rect x="3" y="14" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2"/>
                        <rect x="14" y="14" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2"/>
                    </svg>
                    <span>Assets</span>
                </button>

                <button
                    type="button"
                    class="sidebar-tabs__tab"
                    id="tab-templates"
                    role="tab"
                    aria-selected="false"
                    aria-controls="panel-templates"
                    tabindex="-1"
                    data-tab="templates">
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                        <path d="M3 7 L12 3 L21 7 L21 17 L12 21 L3 17 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                        <path d="M3 7 L12 11 L21 7 M12 11 V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                    </svg>
                    <span>Templates</span>
                </button>
            </div>

            <div
                class="sidebar-panel"
                id="panel-assets"
                role="tabpanel"
                aria-labelledby="tab-assets"
                data-tab-panel="assets">
                <div class="sidebar-panel__inner" data-sidebar-content="assets">
                    <!-- Filled by editor.js: searchable asset grid + filters -->
                </div>
            </div>

            <div
                class="sidebar-panel"
                id="panel-templates"
                role="tabpanel"
                aria-labelledby="tab-templates"
                data-tab-panel="templates"
                hidden>
                <div class="sidebar-panel__inner" data-sidebar-content="templates">
                    <!-- Filled by editor.js: template gallery -->
                </div>
            </div>
        </aside>

        <section class="editor-canvas-area" data-panel="canvas">

            <div class="editor-toolbar" role="toolbar" aria-label="Editor tools">

                <div class="toolbar-group" role="group" aria-label="Selection">
                    <button type="button" class="tool-btn" data-tool="select" aria-label="Select (V)" aria-pressed="true" title="Select (V)">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M5 3 L19 12 L12 14 L9 21 Z" fill="currentColor"/></svg>
                    </button>
                    <button type="button" class="tool-btn" data-tool="move" aria-label="Move (G)" aria-pressed="false" title="Move (G)">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M12 3 V21 M3 12 H21 M12 3 L8 7 M12 3 L16 7 M12 21 L8 17 M12 21 L16 17 M3 12 L7 8 M3 12 L7 16 M21 12 L17 8 M21 12 L17 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                    </button>
                    <button type="button" class="tool-btn" data-tool="rotate" aria-label="Rotate (R)" aria-pressed="false" title="Rotate (R)">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M21 12 a9 9 0 1 1 -3 -6.7 M21 4 V8 H17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                    <button type="button" class="tool-btn" data-tool="scale" aria-label="Scale (S)" aria-pressed="false" title="Scale (S)">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M4 20 L4 4 L20 20 Z M7 13 H13 M9 11 V15" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
                    </button>
                </div>

                <div class="toolbar-group" role="group" aria-label="Room">
                    <button type="button" class="tool-btn" data-tool="wall" aria-label="Draw wall (W)" aria-pressed="false" title="Draw wall (W)">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M4 4 H20 V20 H4 Z M4 12 H20 M12 4 V20" fill="none" stroke="currentColor" stroke-width="2"/></svg>
                    </button>
                    <button type="button" class="tool-btn" data-tool="floor" aria-label="Edit floor (F)" aria-pressed="false" title="Edit floor (F)">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M3 8 L21 4 L21 18 L3 14 Z M3 8 V14 L21 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
                    </button>
                    <button type="button" class="tool-btn" data-tool="door" aria-label="Place door" aria-pressed="false" title="Place door">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><rect x="5" y="3" width="14" height="18" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="15" cy="12" r="1" fill="currentColor"/></svg>
                    </button>
                    <button type="button" class="tool-btn" data-tool="window" aria-label="Place window" aria-pressed="false" title="Place window">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><rect x="4" y="5" width="16" height="14" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 5 V19 M4 12 H20" stroke="currentColor" stroke-width="2"/></svg>
                    </button>
                </div>

                <div class="toolbar-group" role="group" aria-label="Camera">
                    <button type="button" class="tool-btn" data-action="view-top" aria-label="Top view" title="Top view">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>
                    </button>
                    <button type="button" class="tool-btn" data-action="view-front" aria-label="Front view" title="Front view">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><rect x="4" y="3" width="16" height="18" fill="none" stroke="currentColor" stroke-width="2"/></svg>
                    </button>
                    <button type="button" class="tool-btn" data-action="view-perspective" aria-label="Perspective view" title="Perspective view">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M12 3 L22 8 L18 20 L6 20 L2 8 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
                    </button>
                    <button type="button" class="tool-btn" data-action="reset-camera" aria-label="Reset camera" title="Reset camera">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M4 4 V10 H10 M20 20 V14 H14 M5 11 a8 8 0 0 1 14 -3 M19 13 a8 8 0 0 1 -14 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                </div>

                <div class="toolbar-group" role="group" aria-label="Render">
                    <button type="button" class="tool-btn" data-action="toggle-grid" aria-label="Toggle grid" aria-pressed="true" title="Toggle grid">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M3 9 H21 M3 15 H21 M9 3 V21 M15 3 V21" stroke="currentColor" stroke-width="1.5"/></svg>
                    </button>
                    <button type="button" class="tool-btn" data-action="toggle-lights" aria-label="Toggle lights" aria-pressed="true" title="Toggle lights">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M9 18 H15 M10 21 H14 M12 3 a7 7 0 0 1 4 12.7 V18 H8 V15.7 A7 7 0 0 1 12 3 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
                    </button>
                    <button type="button" class="tool-btn" data-action="toggle-shadows" aria-label="Toggle shadows" aria-pressed="true" title="Toggle shadows">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M5 3 L19 21 H3 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
                    </button>
                    <button type="button" class="tool-btn" data-action="screenshot" aria-label="Screenshot" title="Screenshot">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M5 7 H8 L10 4 H14 L16 7 H19 a2 2 0 0 1 2 2 V18 a2 2 0 0 1 -2 2 H5 a2 2 0 0 1 -2 -2 V9 a2 2 0 0 1 2 -2 Z M12 17 a4 4 0 1 0 0 -8 a4 4 0 0 0 0 8 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
                    </button>
                </div>

                <div class="toolbar-group toolbar-group--end" role="group" aria-label="History">
                    <button type="button" class="tool-btn" data-action="undo" aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)" disabled>
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M9 14 L4 9 L9 4 M4 9 H14 a6 6 0 0 1 6 6 V17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                    <button type="button" class="tool-btn" data-action="redo" aria-label="Redo (Ctrl+Y)" title="Redo (Ctrl+Y)" disabled>
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M15 14 L20 9 L15 4 M20 9 H10 a6 6 0 0 0 -6 6 V17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                    <button type="button" class="tool-btn" data-action="help" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 9 a3 3 0 1 1 5 2 c-1 1 -2 1.5 -2 3 M12 17 h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                    </button>
                </div>
            </div>

            <div class="canvas-container" data-canvas-container id="viewport">
                <canvas
                    id="roomCanvas"
                    class="canvas-container__canvas"
                    aria-label="Room design canvas"
                    role="img"
                    tabindex="0"></canvas>

                <div class="sketchfab" id="sketchfabMount" data-sketchfab-mount aria-hidden="true"></div>

                <div class="canvas-overlay" data-canvas-overlay aria-hidden="true">
                    <div class="canvas-overlay__loading" data-loading hidden>
                        <span class="spinner" aria-hidden="true"></span>
                        <span class="canvas-overlay__loading-label">Loading…</span>
                    </div>
                </div>
            </div>
        </section>

        <aside
            id="editorProperties"
            class="editor-properties"
            aria-label="Object properties"
            data-panel="properties">
            <div class="editor-properties__inner" data-properties>
                <!-- Filled by editor.js: object transform, materials, etc. -->
            </div>
        </aside>
    </main>

    <button type="button" class="fab fab-save" data-action="save" aria-label="Save design" hidden>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M5 3 H17 L21 7 V21 H3 V5 a2 2 0 0 1 2-2 Z M7 3 V9 H15 V3 M7 14 H17 V21 H7 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
    </button>

    <button type="button" class="fab fab-delete" data-action="delete-selection" aria-label="Delete selected object" hidden>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M4 7 H20 M9 7 V4 H15 V7 M6 7 L7 21 H17 L18 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>

    <div
        class="shortcuts-modal"
        id="shortcutsModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcutsModalTitle"
        aria-hidden="true"
        hidden>
        <div class="shortcuts-modal__backdrop" data-action="close-shortcuts"></div>
        <div class="shortcuts-modal__panel" role="document">
            <header class="shortcuts-modal__header">
                <h2 id="shortcutsModalTitle" class="shortcuts-modal__title">Keyboard shortcuts</h2>
                <button type="button" class="shortcuts-modal__close" data-action="close-shortcuts" aria-label="Close shortcuts">&times;</button>
            </header>
            <dl class="shortcuts-modal__list" data-shortcuts-list>
                <!-- Filled by editor.js -->
            </dl>
        </div>
    </div>

    <div class="toast-container" id="toastContainer" role="region" aria-live="polite" aria-label="Notifications"></div>

    <script>
        window.DESIGN_ID    = <?= json_encode($designId > 0 ? $designId : null, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
        window.TEMPLATE_ID  = <?= json_encode($templateId > 0 ? $templateId : null, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
        window.CSRF_TOKEN   = <?= json_encode($csrfToken, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
        window.DESIGN_NAME  = <?= json_encode($designName, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
        window.DESIGN_SLUG  = <?= json_encode($designSlug, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
        window.USER_ID      = <?= json_encode((int)$userId, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    </script>

    <script type="module" src="./assets/js/editor.js"></script>
</body>
</html>
