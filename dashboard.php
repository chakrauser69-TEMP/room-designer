<?php require_once __DIR__ . '/includes/bootstrap.php'; requireLogin(); sendSecurityHeaders(); ?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="theme-color" content="#121018">
    <meta name="color-scheme" content="dark light">
    <meta name="csrf-token" content="<?= htmlspecialchars(getCsrfToken()) ?>">
    <meta name="description" content="RoomSpace AI - Manage your room designs and templates">
    <title>RoomSpace AI - Dashboard</title>
    <link rel="stylesheet" href="assets/css/style.css?v=2">
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
<body class="dashboard-page">
    <header class="topbar" role="banner">
        <div class="topbar-inner">
            <a class="brand" href="dashboard.php" aria-label="RoomSpace AI home">
                <svg class="brand-mark" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
                    <rect x="2" y="2" width="36" height="36" rx="8" ry="8" fill="url(#brandGradient)"></rect>
                    <defs>
                        <linearGradient id="brandGradient" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stop-color="#6366f1"></stop>
                            <stop offset="100%" stop-color="#ec4899"></stop>
                        </linearGradient>
                    </defs>
                    <path d="M20 9 L31 18 L28.5 18 L28.5 29 L22 29 L22 22 L18 22 L18 29 L11.5 29 L11.5 18 L9 18 Z" fill="#ffffff"></path>
                </svg>
                <span class="brand-name">RoomSpace AI</span>
            </a>
            <nav class="user-menu" aria-label="User account">
                <span class="username" aria-label="Current user"><?= htmlspecialchars(getUsername()) ?></span>
                <button type="button" class="btn btn-ghost btn-sm" id="logoutBtn">Logout</button>
            </nav>
        </div>
    </header>

    <main class="dashboard-main" role="main">
        <section id="myDesigns" class="dashboard-section" aria-labelledby="myDesignsHeading">
            <header class="section-header">
                <h2 id="myDesignsHeading">My Designs</h2>
                <a class="btn btn-primary" href="editor.php" role="button">+ New Design</a>
            </header>
            <div class="card-grid" id="designsGrid" aria-live="polite">
                <div class="loading" aria-label="Loading designs">Loading designs&hellip;</div>
            </div>
        </section>

        <section id="templates" class="dashboard-section" aria-labelledby="templatesHeading">
            <header class="section-header">
                <h2 id="templatesHeading">Templates</h2>
            </header>
            <div class="card-grid" id="templatesGrid" aria-live="polite">
                <div class="loading" aria-label="Loading templates">Loading templates&hellip;</div>
            </div>
        </section>
    </main>

    <script type="module">
        import { api } from './assets/js/api.js';

        const designsGrid = document.getElementById('designsGrid');
        const templatesGrid = document.getElementById('templatesGrid');
        const logoutBtn = document.getElementById('logoutBtn');

        let tileCounter = 0;

        function createBaseCard() {
            const card = document.createElement('article');
            card.className = 'design-card tile-' + (tileCounter++ % 5);
            return card;
        }

        function buildThumbnail(src, alt) {
            const wrap = document.createElement('div');
            wrap.className = 'card-thumb';
            const img = document.createElement('img');
            img.setAttribute('loading', 'lazy');
            img.setAttribute('alt', alt || 'Design thumbnail');
            if (src) {
                img.setAttribute('src', src + '?v=2');
            } else {
                img.setAttribute('src', 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect width="100" height="60" fill="%231a1a22"/></svg>');
            }
            wrap.appendChild(img);
            return wrap;
        }

        function buildBody(name, metaText) {
            const body = document.createElement('div');
            body.className = 'card-body';

            const title = document.createElement('h3');
            title.className = 'card-title';
            title.textContent = name || 'Untitled';

            const meta = document.createElement('p');
            meta.className = 'card-meta';
            meta.textContent = metaText || '';

            body.appendChild(title);
            body.appendChild(meta);
            return body;
        }

        function buildActionButton(label, variant) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-' + (variant || 'ghost') + ' btn-sm';
            btn.textContent = label;
            return btn;
        }

        function formatDate(value) {
            if (!value) return '';
            const d = new Date(value);
            if (isNaN(d.getTime())) return '';
            return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        }

        function buildDesignActions(design, onShare) {
            const actions = document.createElement('div');
            actions.className = 'card-actions';

            const editBtn = buildActionButton('Edit', 'primary');
            editBtn.addEventListener('click', function () {
                const id = encodeURIComponent(design.id);
                window.location.href = 'editor.php?id=' + id;
            });

            const shareBtn = buildActionButton('Share', 'ghost');
            shareBtn.addEventListener('click', function () {
                onShare(design, shareBtn);
            });

            const deleteBtn = buildActionButton('Delete', 'danger');
            deleteBtn.addEventListener('click', function () {
                const name = design.name || 'this design';
                if (!confirm('Delete ' + name + '? This cannot be undone.')) return;
                deleteBtn.disabled = true;
                api.del('./api/designs.php?action=delete&id=' + encodeURIComponent(design.id))
                    .then(function () {
                        loadDesigns();
                    })
                    .catch(function (err) {
                        alert('Could not delete design: ' + (err && err.message ? err.message : 'Unknown error'));
                        deleteBtn.disabled = false;
                    });
            });

            actions.appendChild(editBtn);
            actions.appendChild(shareBtn);
            actions.appendChild(deleteBtn);
            return actions;
        }

        function buildTemplateActions(template) {
            const actions = document.createElement('div');
            actions.className = 'card-actions';

            const useBtn = buildActionButton('Use Template', 'primary');
            useBtn.addEventListener('click', function () {
                const id = encodeURIComponent(template.id);
                window.location.href = 'editor.php?template=' + id;
            });

            actions.appendChild(useBtn);
            return actions;
        }

        function renderEmpty(container, message) {
            container.innerHTML = '';
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            const p = document.createElement('p');
            p.textContent = message;
            empty.appendChild(p);
            container.appendChild(empty);
        }

        function handleShare(design, shareBtn) {
            shareBtn.disabled = true;
            api.post('./api/designs.php?action=share', { id: design.id })
                .then(function (resp) {
                    const url = (resp && resp.url) || (resp && resp.share_url);
                    if (!url) {
                        alert('Sharing is not available right now.');
                        return;
                    }
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(url).then(function () {
                            shareBtn.textContent = 'Copied!';
                            setTimeout(function () { shareBtn.textContent = 'Share'; }, 1600);
                        }, function () {
                            prompt('Copy this share link:', url);
                        });
                    } else {
                        prompt('Copy this share link:', url);
                    }
                })
                .catch(function (err) {
                    alert('Could not share design: ' + (err && err.message ? err.message : 'Unknown error'));
                })
                .finally(function () {
                    shareBtn.disabled = false;
                });
        }

        function loadDesigns() {
            designsGrid.innerHTML = '';
            const loading = document.createElement('div');
            loading.className = 'loading';
            loading.textContent = 'Loading designs…';
            designsGrid.appendChild(loading);

            api.get('./api/designs.php?action=list')
                .then(function (resp) {
                    designsGrid.innerHTML = '';
                    const items = (resp && resp.designs) || [];
                    if (!items.length) {
                        renderEmpty(designsGrid, 'No designs yet. Click + New Design to get started.');
                        return;
                    }
                    items.forEach(function (design, index) {
                        const card = createBaseCard();
                        if (index === 0) card.classList.add('card--feature');
                        const thumb = buildThumbnail(design.thumbnail, design.name);
                        const metaText = 'Updated ' + (formatDate(design.updated_at) || 'recently');
                        const body = buildBody(design.name, metaText);
                        const actions = buildDesignActions(design, handleShare);
                        card.appendChild(thumb);
                        card.appendChild(body);
                        card.appendChild(actions);
                        designsGrid.appendChild(card);
                    });
                })
                .catch(function (err) {
                    designsGrid.innerHTML = '';
                    const errBox = document.createElement('div');
                    errBox.className = 'error-state';
                    const p = document.createElement('p');
                    p.textContent = 'Failed to load designs: ' + (err && err.message ? err.message : 'Unknown error');
                    errBox.appendChild(p);
                    designsGrid.appendChild(errBox);
                });
        }

        function loadTemplates() {
            templatesGrid.innerHTML = '';
            const loading = document.createElement('div');
            loading.className = 'loading';
            loading.textContent = 'Loading templates…';
            templatesGrid.appendChild(loading);

            api.get('./api/templates.php')
                .then(function (resp) {
                    templatesGrid.innerHTML = '';
                    const items = (resp && resp.templates) || [];
                    if (!items.length) {
                        renderEmpty(templatesGrid, 'No templates available right now.');
                        return;
                    }
                    items.forEach(function (template, index) {
                        const card = createBaseCard();
                        if (index === 0) card.classList.add('card--feature');
                        const thumb = buildThumbnail(template.thumbnail, template.name);
                        const metaText = template.category ? 'Category: ' + template.category : 'Ready to use';
                        const body = buildBody(template.name, metaText);
                        const actions = buildTemplateActions(template);
                        card.appendChild(thumb);
                        card.appendChild(body);
                        card.appendChild(actions);
                        templatesGrid.appendChild(card);
                    });
                })
                .catch(function (err) {
                    templatesGrid.innerHTML = '';
                    const errBox = document.createElement('div');
                    errBox.className = 'error-state';
                    const p = document.createElement('p');
                    p.textContent = 'Failed to load templates: ' + (err && err.message ? err.message : 'Unknown error');
                    errBox.appendChild(p);
                    templatesGrid.appendChild(errBox);
                });
        }

        function loadInitial() {
            loadDesigns();
            loadTemplates();
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', function (event) {
                event.preventDefault();
                logoutBtn.disabled = true;
                Promise.resolve(api.logout())
                    .catch(function () { /* swallow - we'll still redirect */ })
                    .finally(function () {
                        window.location.href = 'index.php';
                    });
            });
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', loadInitial);
        } else {
            loadInitial();
        }
    </script>
</body>
</html>