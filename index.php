<?php
/**
 * Login Page
 * Room Designer Application
 */
require_once __DIR__ . '/includes/bootstrap.php';

// Send headers
header('Content-Type: text/html; charset=UTF-8');
header('X-UA-Compatible: IE=edge');
header('Cache-Control: no-cache, must-revalidate');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');

// Redirect if already logged in
if (is_logged_in()) {
    header('Location: dashboard.php');
    exit;
}

// Generate CSRF token
$csrf_token = generate_csrf_token();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#121018">
    <meta name="color-scheme" content="dark light">
    <meta name="csrf-token" content="<?php echo htmlspecialchars($csrf_token, ENT_QUOTES, 'UTF-8'); ?>">
    <meta name="description" content="Sign in to Room Designer - Design your perfect space">
    <title>Sign In - Room Designer</title>
    <link rel="stylesheet" href="assets/css/style.css?v=2">
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%237c3aed'/><text x='50' y='65' font-size='60' text-anchor='middle' fill='white' font-family='sans-serif'>R</text></svg>">
    <script>
        // Theme init script - runs before render to prevent flash
        (function() {
            try {
                var theme = localStorage.getItem('theme');
                if (theme === 'light' || theme === 'dark') {
                    document.documentElement.setAttribute('data-theme', theme);
                } else {
                    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
                }
            } catch (e) {
                document.documentElement.setAttribute('data-theme', 'dark');
            }
        })();
    </script>
</head>
<body class="auth-page">
    <main class="auth-container">
        <header class="auth-header">
            <svg class="auth-logo" width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
                <defs>
                    <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#7c3aed" />
                        <stop offset="100%" stop-color="#a855f7" />
                    </linearGradient>
                </defs>
                <rect width="64" height="64" rx="14" fill="url(#logoGradient)"/>
                <path d="M16 44 L32 20 L48 44 Z" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"/>
                <rect x="28" y="34" width="8" height="10" fill="#ffffff"/>
                <circle cx="32" cy="14" r="3" fill="#ffffff"/>
            </svg>
            <h1 class="auth-tagline">Design your perfect space</h1>
        </header>

        <section class="auth-form">
            <h2>Sign In</h2>
            <div id="error-msg" class="error-msg" hidden role="alert" aria-live="assertive"></div>

            <form id="login-form" method="post" action="api/auth.php" novalidate>
                <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($csrf_token, ENT_QUOTES, 'UTF-8'); ?>">
                <input type="hidden" name="action" value="login">

                <div class="form-group">
                    <label for="username">Username</label>
                    <input
                        type="text"
                        id="username"
                        name="username"
                        autocomplete="username"
                        required
                        spellcheck="false"
                        autocapitalize="off"
                        autocorrect="off"
                        placeholder="Enter your username">
                </div>

                <div class="form-group">
                    <label for="password">Password</label>
                    <input
                        type="password"
                        id="password"
                        name="password"
                        autocomplete="current-password"
                        required
                        placeholder="Enter your password">
                </div>

                <button type="submit" class="btn btn-primary btn-block">Sign In</button>
            </form>

            <p class="auth-footer">
                Don't have an account? <a href="register.php">Create one</a>
            </p>
        </section>
    </main>

    <script>
        // Login form handler
        (function() {
            var form = document.getElementById('login-form');
            var errorMsg = document.getElementById('error-msg');
            var submitBtn = form.querySelector('button[type="submit"]');

            if (!form) return;

            // Ensure CSRF token is available on every fetch
            var csrfMeta = document.querySelector('meta[name="csrf-token"]');
            var csrfToken = csrfMeta ? csrfMeta.getAttribute('content') : '';

            function showError(message) {
                errorMsg.textContent = message;
                errorMsg.hidden = false;
            }

            function clearError() {
                errorMsg.textContent = '';
                errorMsg.hidden = true;
            }

            function setLoading(loading) {
                if (loading) {
                    submitBtn.disabled = true;
                    submitBtn.dataset.originalText = submitBtn.textContent;
                    submitBtn.textContent = 'Signing in...';
                } else {
                    submitBtn.disabled = false;
                    if (submitBtn.dataset.originalText) {
                        submitBtn.textContent = submitBtn.dataset.originalText;
                    }
                }
            }

            form.addEventListener('submit', function(event) {
                event.preventDefault();
                clearError();

                var formData = new FormData(form);
                var payload = {
                    username: formData.get('username'),
                    password: formData.get('password'),
                    csrf_token: formData.get('csrf_token')
                };

                if (!payload.username || !payload.password) {
                    showError('Please fill in all fields.');
                    return;
                }

                setLoading(true);

                fetch('api/auth.php?action=login', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-CSRF-Token': csrfToken
                    },
                    body: JSON.stringify(payload)
                })
                .then(function(response) {
                    return response.json().then(function(data) {
                        return { status: response.status, ok: response.ok, data: data };
                    }).catch(function() {
                        return { status: response.status, ok: response.ok, data: { success: false, message: 'Unexpected server response.' } };
                    });
                })
                .then(function(result) {
                    if (result.ok && result.data && result.data.ok) {
                        // Success - redirect to dashboard
                        if (result.data.csrf_token) {
                            try { sessionStorage.setItem('csrf_token', result.data.csrf_token); } catch (e) {}
                        }
                        window.location.href = 'dashboard.php';
                        return;
                    }
                    var msg = (result.data && result.data.message) ? result.data.message : 'Invalid username or password.';
                    showError(msg);
                    setLoading(false);
                })
                .catch(function(err) {
                    showError('Network error. Please check your connection and try again.');
                    setLoading(false);
                });
            });

            // Clear error as user types
            ['username', 'password'].forEach(function(id) {
                var el = document.getElementById(id);
                if (el) {
                    el.addEventListener('input', clearError);
                }
            });
        })();

        // api.login wrapper for convenience
        window.api = window.api || {};
        window.api.login = function(username, password) {
            var csrfMeta = document.querySelector('meta[name="csrf-token"]');
            var csrfToken = csrfMeta ? csrfMeta.getAttribute('content') : '';
            return fetch('api/auth.php?action=login', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({
                    username: username,
                    password: password,
                    csrf_token: csrfToken
                })
            }).then(function(response) {
                return response.json().catch(function() {
                    return { success: false, message: 'Unexpected server response.' };
                });
            });
        };
    </script>
</body>
</html>