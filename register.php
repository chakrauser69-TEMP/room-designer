<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/bootstrap.php';

if (isLoggedIn()) {
    header('Location: dashboard.php');
    exit;
}

header_remove('X-Powered-By');
header('Content-Type: text/html; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: camera=(), microphone=(), geolocation=(), usb=()');
header('Cross-Origin-Opener-Policy: same-origin');
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';");
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
?>

<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="csrf-token" content="<?= htmlspecialchars(csrf_token(), ENT_QUOTES, 'UTF-8') ?>">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#121018">
<meta name="color-scheme" content="light dark">
<title>Create account &middot; RoomSpace AI</title>
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
<body>
<main class="auth">
    <section class="auth__card" aria-labelledby="auth-title">
        <header class="auth__header">
            <h1 id="auth-title">Create your account</h1>
            <p>Design rooms in 3D with RoomSpace AI.</p>
        </header>

        <form id="register-form" class="auth__form" novalidate autocomplete="on" method="post" action="register.php">
            <div class="field">
                <label for="username">Username</label>
                <input
                    type="text"
                    id="username"
                    name="username"
                    required
                    minlength="3"
                    maxlength="50"
                    autocomplete="username"
                    autocapitalize="none"
                    autocorrect="off"
                    spellcheck="false"
                    aria-describedby="username-error"
                >
                <span class="field__error" data-field="username" id="username-error" role="alert"></span>
            </div>

            <div class="field">
                <label for="email">Email</label>
                <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    autocomplete="email"
                    autocapitalize="none"
                    autocorrect="off"
                    spellcheck="false"
                    aria-describedby="email-error"
                >
                <span class="field__error" data-field="email" id="email-error" role="alert"></span>
            </div>

            <div class="field">
                <label for="password">Password</label>
                <input
                    type="password"
                    id="password"
                    name="password"
                    required
                    minlength="10"
                    autocomplete="new-password"
                    aria-describedby="password-strength password-error"
                >
                <span class="field__meter" id="password-strength" data-strength aria-live="polite"></span>
                <span class="field__error" data-field="password" id="password-error" role="alert"></span>
            </div>

            <div class="field">
                <label for="confirm-password">Confirm password</label>
                <input
                    type="password"
                    id="confirm-password"
                    name="confirm-password"
                    required
                    minlength="10"
                    autocomplete="new-password"
                    aria-describedby="confirm-password-error"
                >
                <span class="field__error" data-field="confirm-password" id="confirm-password-error" role="alert"></span>
            </div>

            <button type="submit" class="btn btn--primary" id="submit-btn">Create account</button>

            <div class="field__error field__error--global" data-field="global" id="global-error" role="alert" aria-live="polite"></div>
        </form>

        <footer class="auth__footer">
            <p>Already have an account? <a href="index.php">Sign in</a></p>
        </footer>
    </section>
</main>

<script>
(function () {
    'use strict';

    var form = document.getElementById('register-form');
    var usernameInput = document.getElementById('username');
    var emailInput = document.getElementById('email');
    var passwordInput = document.getElementById('password');
    var confirmInput = document.getElementById('confirm-password');
    var submitBtn = document.getElementById('submit-btn');
    var strengthEl = document.getElementById('password-strength');
    var csrfMeta = document.querySelector('meta[name="csrf-token"]');
    var csrfToken = csrfMeta ? csrfMeta.getAttribute('content') : '';

    function setError(name, message) {
        var el = form.querySelector('[data-field="' + name + '"]');
        if (!el) return;
        el.textContent = message || '';
        el.classList.toggle('is-visible', !!message);
    }

    function clearErrors() {
        var errors = form.querySelectorAll('.field__error');
        for (var i = 0; i < errors.length; i++) {
            errors[i].textContent = '';
            errors[i].classList.remove('is-visible');
        }
    }

    function passwordScore(value) {
        var score = 0;
        if (!value) return 0;
        if (value.length >= 10) score++;
        if (value.length >= 14) score++;
        if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
        if (/\d/.test(value)) score++;
        if (/[^A-Za-z0-9]/.test(value)) score++;
        return Math.min(score, 4);
    }

    function renderStrength(value) {
        var score = passwordScore(value);
        var labels = ['', 'Too weak', 'Weak', 'Good', 'Strong'];
        var classes = ['', 'meter--weak', 'meter--weak', 'meter--medium', 'meter--strong'];
        strengthEl.textContent = value ? labels[score] : '';
        strengthEl.dataset.score = String(score);
        strengthEl.className = 'field__meter ' + classes[score];
    }

    passwordInput.addEventListener('input', function () {
        renderStrength(passwordInput.value);
        if (confirmInput.value) {
            confirmInput.dispatchEvent(new Event('input'));
        }
    });

    confirmInput.addEventListener('input', function () {
        if (confirmInput.value && confirmInput.value !== passwordInput.value) {
            setError('confirm-password', 'Passwords do not match.');
        } else {
            setError('confirm-password', '');
        }
    });

    function validate() {
        clearErrors();
        var ok = true;

        var username = usernameInput.value.trim();
        if (!username) {
            setError('username', 'Username is required.');
            ok = false;
        } else if (username.length < 3 || username.length > 50) {
            setError('username', 'Username must be between 3 and 50 characters.');
            ok = false;
        } else if (!/^[A-Za-z0-9_.-]+$/.test(username)) {
            setError('username', 'Username may only contain letters, numbers, dots, underscores, or dashes.');
            ok = false;
        }

        var email = emailInput.value.trim();
        if (!email) {
            setError('email', 'Email is required.');
            ok = false;
        } else if (email.length > 254) {
            setError('email', 'Email is too long.');
            ok = false;
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setError('email', 'Please enter a valid email address.');
            ok = false;
        }

        var password = passwordInput.value;
        if (!password) {
            setError('password', 'Password is required.');
            ok = false;
        } else if (password.length < 10) {
            setError('password', 'Password must be at least 10 characters.');
            ok = false;
        } else if (passwordScore(password) <= 1) {
            setError('password', 'Choose a stronger password (mix cases, numbers, or symbols).');
            ok = false;
        }

        if (!confirmInput.value) {
            setError('confirm-password', 'Please confirm your password.');
            ok = false;
        } else if (confirmInput.value !== password) {
            setError('confirm-password', 'Passwords do not match.');
            ok = false;
        }

        return ok;
    }

    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (!validate()) return;

        submitBtn.disabled = true;
        submitBtn.classList.add('is-loading');

        try {
            var result = await fetch('api/auth.php?action=register', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({
                    username: usernameInput.value.trim(),
                    email: emailInput.value.trim(),
                    password: passwordInput.value,
                    csrf_token: csrfToken
                })
            });

            var data = await result.json();

            if (result.ok && data && data.ok) {
                window.location.href = 'dashboard.php';
                return;
            }

            if (data && data.errors && typeof data.errors === 'object') {
                Object.keys(data.errors).forEach(function (key) {
                    setError(key, String(data.errors[key]));
                });
            }

            var message = (data && (data.message || data.error)) || 'Registration failed. Please try again.';
            setError('global', message);
        } catch (err) {
            setError('global', (err && err.message) ? err.message : 'Network error. Please try again.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.classList.remove('is-loading');
        }
    });
})();
</script>
</body>
</html>