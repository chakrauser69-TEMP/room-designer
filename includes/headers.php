<?php
/**
 * Security headers for the Room Designer application.
 *
 * Include this file at the very top of every PHP page that emits HTML or
 * serves any response to the browser. Each header is sent with header() and
 * applies to the current response only, so this file must be included before
 * any output has been produced.
 *
 * Headers emitted:
 *   - Content-Security-Policy: restricts sources for scripts, styles, images,
 *     connections, frames, base URIs and form submissions.
 *   - X-Content-Type-Options: nosniff - prevents MIME-type sniffing.
 *   - X-Frame-Options: DENY - blocks embedding in iframes.
 *   - Referrer-Policy: strict-origin-when-cross-origin - limits Referer info.
 *   - Permissions-Policy: disables geolocation and camera APIs.
 */

// Content-Security-Policy: lock down resource sources. 'self' is the only
// default origin; inline styles are allowed because the app uses small
// inline style attributes; images may come from data: URIs (used for
// inline previews); everything else is restricted to same-origin.
header(
    'Content-Security-Policy: '
    . "default-src 'self'; "
    . "img-src 'self' data:; "
    . "style-src 'self' 'unsafe-inline'; "
    . "script-src 'self' 'unsafe-inline'; "
    . "connect-src 'self'; "
    . "frame-ancestors 'none'; "
    . "base-uri 'self'; "
    . "form-action 'self'"
);

// Prevent browsers from MIME-sniffing a response away from the declared
// Content-Type (mitigates content-type confusion attacks).
header('X-Content-Type-Options: nosniff');

// Disallow this page from being rendered inside a <frame>, <iframe>,
// <embed> or <object>. Reinforced by CSP's frame-ancestors above.
header('X-Frame-Options: DENY');

// Send the full Referer on same-origin navigations, only the origin on
// cross-origin HTTPS->HTTPS, and nothing on HTTPS->HTTP downgrades.
header('Referrer-Policy: strict-origin-when-cross-origin');

// Disable powerful features the room designer does not use. Add more
// features here (microphone, payment, usb, etc.) as the policy grows.
header('Permissions-Policy: geolocation=(), camera=()');
