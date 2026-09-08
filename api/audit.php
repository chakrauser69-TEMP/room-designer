<?php
// Full-codebase dynamic audit.
// Hits every public endpoint with positive, negative, and edge cases.
// Records HTTP status, body, and any server-side error log entries.
declare(strict_types=1);
const BASE = 'http://127.0.0.1/room-designer';
$jar = sys_get_temp_dir() . '/rd_audit_' . getmypid() . '.txt';
@unlink($jar);

$fail = 0;
$pass = 0;
$findings = [];

function call(string $url, ?array $body, string $method, string $jar, array $headers = []): array {
    $ch = curl_init($url);
    $h = array_merge(['Accept: application/json'], $headers);
    $opts = [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true,
        CURLOPT_COOKIEJAR => $jar, CURLOPT_COOKIEFILE => $jar,
        CURLOPT_HTTPHEADER => $h, CURLOPT_TIMEOUT => 12,
        CURLOPT_CUSTOMREQUEST => $method,
    ];
    if ($body !== null) {
        $opts[CURLOPT_POSTFIELDS] = json_encode($body);
        $h[] = 'Content-Type: application/json';
        $opts[CURLOPT_HTTPHEADER] = $h;
    }
    curl_setopt_array($ch, $opts);
    $raw = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $hs = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $hdrs = substr((string)$raw, 0, $hs);
    $respBody = substr((string)$raw, $hs);
    curl_close($ch);
    return ['status' => $code, 'body' => $respBody, 'json' => json_decode($respBody, true), 'headers' => $hdrs];
}

function log_size(): int {
    $f = 'C:/xampp/htdocs/room-designer/logs/php-error.log';
    return file_exists($f) ? filesize($f) : 0;
}

function new_errors_since(int $offset, int $limit = 8): array {
    $f = 'C:/xampp/htdocs/room-designer/logs/php-error.log';
    if (!file_exists($f)) return [];
    $fp = fopen($f, 'rb');
    fseek($fp, $offset);
    $chunk = '';
    while (!feof($fp) && strlen($chunk) < 8000) $chunk .= fgets($fp);
    fclose($fp);
    $entries = preg_split('/-{80,}/', $chunk) ?: [];
    return array_slice(array_filter(array_map('trim', $entries)), 0, $limit);
}

function case_run(string $name, callable $fn): void {
    global $fail, $pass, $findings;
    $before = log_size();
    $r = $fn();
    $after = log_size();
    $newErrors = $after > $before ? new_errors_since($before) : [];
    $ok = $r['ok'] ?? false;
    $detail = $r['detail'] ?? '';
    echo ($ok ? '  PASS  ' : '  FAIL  ') . str_pad($name, 50) . '  ' . $detail . "\n";
    if (!empty($newErrors)) {
        echo "         new server errors:\n";
        foreach ($newErrors as $e) {
            foreach (explode("\n", $e) as $line) if ($line !== '') echo "           | " . $line . "\n";
            echo "           |\n";
        }
    }
    if ($ok) $pass++; else { $fail++; $findings[] = ['name' => $name, 'detail' => $detail, 'errors' => $newErrors]; }
}

echo "=== ROOM DESIGNER AUDIT ===\n\n";

// --- 1. Public pages (HTML) ---------------------------------------------
case_run('index.php renders 200', function () use ($jar) {
    $r = call(BASE . '/index.php', null, 'GET', $jar);
    return ['ok' => $r['status'] === 200 && str_contains($r['body'], '<form'),
        'detail' => "HTTP {$r['status']}"];
});
case_run('register.php renders 200', function () use ($jar) {
    $r = call(BASE . '/register.php', null, 'GET', $jar);
    return ['ok' => $r['status'] === 200 && str_contains($r['body'], 'register-form'),
        'detail' => "HTTP {$r['status']}"];
});
case_run('dashboard.php anon -> 302 to index', function () use ($jar) {
    $r = call(BASE . '/dashboard.php', null, 'GET', $jar);
    $isRedirect = $r['status'] === 302 || $r['status'] === 200;
    $location = '';
    if (preg_match('/^Location:\s*(.+)$/mi', $r['headers'], $m)) $location = trim($m[1]);
    return ['ok' => $isRedirect, 'detail' => "HTTP {$r['status']} loc=$location"];
});

// --- 2. auth.php actions ------------------------------------------------
$u = 'audit_' . substr(bin2hex(random_bytes(4)), 0, 8);
$e = $u . '@test.local'; $p = 'Password123!';
$jar2 = sys_get_temp_dir() . '/rd_audit2_' . getmypid() . '.txt'; @unlink($jar2);

case_run('auth:register (unique user)', function () use ($u, $e, $p, $jar2) {
    $r = call(BASE . "/api/auth.php?action=register", ['username' => $u, 'email' => $e, 'password' => $p], 'POST', $jar2);
    return ['ok' => $r['status'] === 200 && ($r['json']['ok'] ?? false) === true,
        'detail' => "HTTP {$r['status']} body=" . substr($r['body'], 0, 120)];
});
case_run('auth:register duplicate username -> 400', function () use ($u, $e, $p, $jar2) {
    $r = call(BASE . "/api/auth.php?action=register", ['username' => $u, 'email' => 'other@x.com', 'password' => $p], 'POST', $jar2);
    return ['ok' => $r['status'] === 400, 'detail' => "HTTP {$r['status']} body=" . substr($r['body'], 0, 120)];
});
case_run('auth:register duplicate email -> 400', function () use ($u, $e, $p, $jar2) {
    $r = call(BASE . "/api/auth.php?action=register", ['username' => 'other_' . bin2hex(random_bytes(2)), 'email' => $e, 'password' => $p], 'POST', $jar2);
    return ['ok' => $r['status'] === 400, 'detail' => "HTTP {$r['status']} body=" . substr($r['body'], 0, 120)];
});
case_run('auth:register weak password -> 400', function () use ($jar2) {
    $r = call(BASE . "/api/auth.php?action=register", ['username' => 'x_' . bin2hex(random_bytes(2)), 'email' => bin2hex(random_bytes(3)) . '@x.com', 'password' => 'short'], 'POST', $jar2);
    return ['ok' => $r['status'] === 400, 'detail' => "HTTP {$r['status']} body=" . substr($r['body'], 0, 120)];
});
case_run('auth:register invalid email -> 400', function () use ($jar2) {
    $r = call(BASE . "/api/auth.php?action=register", ['username' => 'y_' . bin2hex(random_bytes(2)), 'email' => 'not-an-email', 'password' => 'Password123!'], 'POST', $jar2);
    return ['ok' => $r['status'] === 400, 'detail' => "HTTP {$r['status']} body=" . substr($r['body'], 0, 120)];
});
case_run('auth:register missing field -> 400', function () use ($jar2) {
    $r = call(BASE . "/api/auth.php?action=register", ['username' => 'z'], 'POST', $jar2);
    return ['ok' => $r['status'] === 400, 'detail' => "HTTP {$r['status']} body=" . substr($r['body'], 0, 120)];
});
case_run('auth:login with username (correct)', function () use ($u, $p, $jar2) {
    $r = call(BASE . "/api/auth.php?action=login", ['username' => $u, 'password' => $p], 'POST', $jar2);
    return ['ok' => $r['status'] === 200 && ($r['json']['ok'] ?? false) === true,
        'detail' => "HTTP {$r['status']} body=" . substr($r['body'], 0, 120)];
});
case_run('auth:check returns user_id when authed', function () use ($jar2) {
    $r = call(BASE . "/api/auth.php?action=check", null, 'GET', $jar2);
    return ['ok' => $r['status'] === 200 && isset($r['json']['user_id']),
        'detail' => "HTTP {$r['status']} keys=" . implode(',', array_keys((array)$r['json']))];
});
case_run('auth:check with no session -> logged_in=false', function () use (&$jar3) {
    $jar3 = sys_get_temp_dir() . '/rd_audit3_' . getmypid() . '.txt'; @unlink($jar3);
    $r = call(BASE . "/api/auth.php?action=check", null, 'GET', $jar3);
    return ['ok' => $r['status'] === 200 && ($r['json']['logged_in'] ?? null) === false,
        'detail' => "HTTP {$r['status']} body=" . substr($r['body'], 0, 120)];
});
case_run('auth:login with email (correct)', function () use ($u, $e, $p, &$jar4) {
    $jar4 = sys_get_temp_dir() . '/rd_audit4_' . getmypid() . '.txt'; @unlink($jar4);
    $r = call(BASE . "/api/auth.php?action=login", ['email' => $e, 'password' => $p], 'POST', $jar4);
    return ['ok' => $r['status'] === 200, 'detail' => "HTTP {$r['status']} body=" . substr($r['body'], 0, 120)];
});
case_run('auth:login wrong password -> 401', function () use ($u, $jar4) {
    $r = call(BASE . "/api/auth.php?action=login", ['username' => $u, 'password' => 'WRONG'], 'POST', $jar4);
    return ['ok' => $r['status'] === 401, 'detail' => "HTTP {$r['status']} body=" . substr($r['body'], 0, 120)];
});
case_run('auth:login unknown user -> 401', function () use ($jar4) {
    $r = call(BASE . "/api/auth.php?action=login", ['username' => 'no_such_user_' . bin2hex(random_bytes(2)), 'password' => 'whatever123'], 'POST', $jar4);
    return ['ok' => $r['status'] === 401, 'detail' => "HTTP {$r['status']} body=" . substr($r['body'], 0, 120)];
});
case_run('auth:login missing identifier -> 400', function () use ($jar4) {
    $r = call(BASE . "/api/auth.php?action=login", ['password' => 'x'], 'POST', $jar4);
    return ['ok' => $r['status'] === 400, 'detail' => "HTTP {$r['status']} body=" . substr($r['body'], 0, 120)];
});
case_run('auth:logout (POST with CSRF)', function () use ($jar2) {
    $check = call(BASE . "/api/auth.php?action=check", null, 'GET', $jar2);
    $csrf = $check['json']['csrf_token'] ?? '';
    $r = call(BASE . "/api/auth.php?action=logout", null, 'POST', $jar2, ['X-CSRF-Token: ' . $csrf]);
    return ['ok' => $r['status'] === 200 && ($r['json']['ok'] ?? false) === true,
        'detail' => "HTTP {$r['status']} body=" . substr($r['body'], 0, 120)];
});
case_run('auth:logout with no CSRF -> 403', function () use ($jar2) {
    $r = call(BASE . "/api/auth.php?action=logout", null, 'POST', $jar2);
    return ['ok' => $r['status'] === 403, 'detail' => "HTTP {$r['status']} body=" . substr($r['body'], 0, 120)];
});

// --- 3. assets.php (authed) --------------------------------------------
$jar5 = sys_get_temp_dir() . '/rd_audit5_' . getmypid() . '.txt'; @unlink($jar5);
call(BASE . "/api/auth.php?action=login", ['username' => $u, 'password' => $p], 'POST', $jar5);

case_run('assets: anon -> 401', function () use (&$jar6) {
    $jar6 = sys_get_temp_dir() . '/rd_audit6_' . getmypid() . '.txt'; @unlink($jar6);
    $r = call(BASE . "/api/assets.php", null, 'GET', $jar6);
    return ['ok' => $r['status'] === 401, 'detail' => "HTTP {$r['status']}"];
});
case_run('assets: authed full list', function () use ($jar5) {
    $r = call(BASE . "/api/assets.php", null, 'GET', $jar5);
    $count = is_array($r['json']['assets'] ?? null) ? count($r['json']['assets']) : 0;
    return ['ok' => $r['status'] === 200 && $count > 0, 'detail' => "HTTP {$r['status']} count=$count"];
});
case_run('assets: category=seating', function () use ($jar5) {
    $r = call(BASE . "/api/assets.php?category=seating", null, 'GET', $jar5);
    $items = $r['json']['assets'] ?? [];
    $allSeating = true;
    foreach ($items as $it) if (($it['category'] ?? '') !== 'seating') $allSeating = false;
    return ['ok' => $r['status'] === 200 && $allSeating && count($items) > 0,
        'detail' => "HTTP {$r['status']} count=" . count($items) . " allSeating=" . ($allSeating ? 'yes' : 'NO')];
});
case_run('assets: bad category -> 400', function () use ($jar5) {
    $r = call(BASE . "/api/assets.php?category=invalid", null, 'GET', $jar5);
    return ['ok' => $r['status'] === 400, 'detail' => "HTTP {$r['status']}"];
});
case_run('assets: empty category -> treated as no filter (200)', function () use ($jar5) {
    $r = call(BASE . "/api/assets.php?category=", null, 'GET', $jar5);
    return ['ok' => $r['status'] === 200, 'detail' => "HTTP {$r['status']}"];
});

// --- 4. templates.php (authed) -----------------------------------------
case_run('templates: anon -> 401', function () use ($jar6) {
    $r = call(BASE . "/api/templates.php", null, 'GET', $jar6);
    return ['ok' => $r['status'] === 401, 'detail' => "HTTP {$r['status']}"];
});
case_run('templates: list (authed)', function () use ($jar5) {
    $r = call(BASE . "/api/templates.php", null, 'GET', $jar5);
    return ['ok' => $r['status'] === 200 && isset($r['json']['templates']),
        'detail' => "HTTP {$r['status']} count=" . count($r['json']['templates'] ?? [])];
});
case_run('templates: bad id (non-numeric) -> 400', function () use ($jar5) {
    $r = call(BASE . "/api/templates.php?id=abc", null, 'GET', $jar5);
    return ['ok' => $r['status'] === 400, 'detail' => "HTTP {$r['status']} body=" . substr($r['body'], 0, 100)];
});
case_run('templates: nonexistent id -> 404', function () use ($jar5) {
    $r = call(BASE . "/api/templates.php?id=999999", null, 'GET', $jar5);
    return ['ok' => $r['status'] === 404, 'detail' => "HTTP {$r['status']} body=" . substr($r['body'], 0, 100)];
});
case_run('templates: POST -> 405', function () use ($jar5) {
    $r = call(BASE . "/api/templates.php", null, 'POST', $jar5);
    return ['ok' => $r['status'] === 405, 'detail' => "HTTP {$r['status']}"];
});

// --- 5. designs.php (authed) -------------------------------------------
case_run('designs: anon -> 401', function () use ($jar6) {
    $r = call(BASE . "/api/designs.php?action=list", null, 'GET', $jar6);
    return ['ok' => $r['status'] === 401, 'detail' => "HTTP {$r['status']}"];
});
case_run('designs: list (authed)', function () use ($jar5) {
    $r = call(BASE . "/api/designs.php?action=list", null, 'GET', $jar5);
    return ['ok' => $r['status'] === 200 && isset($r['json']['designs']),
        'detail' => "HTTP {$r['status']} count=" . count($r['json']['designs'] ?? [])];
});
case_run('designs: load bad id -> 400', function () use ($jar5) {
    $r = call(BASE . "/api/designs.php?action=load&id=abc", null, 'GET', $jar5);
    return ['ok' => $r['status'] === 400, 'detail' => "HTTP {$r['status']}"];
});
case_run('designs: load nonexistent -> 404', function () use ($jar5) {
    $r = call(BASE . "/api/designs.php?action=load&id=999999", null, 'GET', $jar5);
    return ['ok' => $r['status'] === 404, 'detail' => "HTTP {$r['status']}"];
});
case_run('designs: save (POST, full payload, no CSRF -> 403)', function () use ($jar5) {
    $payload = [
        'name' => 'Audit design', 'floor_color' => '#cccccc', 'floor_material' => 'solid',
        'grid_width' => 12, 'grid_height' => 12, 'design_data' => ['objects' => []],
    ];
    $r = call(BASE . "/api/designs.php?action=save", $payload, 'POST', $jar5);
    return ['ok' => $r['status'] === 403, 'detail' => "HTTP {$r['status']} body=" . substr($r['body'], 0, 100)];
});

$check = call(BASE . "/api/auth.php?action=check", null, 'GET', $jar5);
$csrf = $check['json']['csrf_token'] ?? '';

case_run('designs: save (POST, full payload, with CSRF) -> 201', function () use ($jar5, $csrf) {
    $payload = [
        'name' => 'Audit ' . bin2hex(random_bytes(2)),
        'floor_color' => '#cccccc', 'floor_material' => 'solid',
        'grid_width' => 12, 'grid_height' => 12, 'design_data' => ['objects' => []],
    ];
    $r = call(BASE . "/api/designs.php?action=save", $payload, 'POST', $jar5, ['X-CSRF-Token: ' . $csrf]);
    return ['ok' => $r['status'] === 201 && isset($r['json']['id']),
        'detail' => "HTTP {$r['status']} id=" . ($r['json']['id'] ?? 'none')];
});

$lastDesignId = null;
case_run('designs: save -> capture id', function () use ($jar5, $csrf, &$lastDesignId) {
    $payload = [
        'name' => 'For load ' . bin2hex(random_bytes(2)),
        'floor_color' => '#cccccc', 'floor_material' => 'solid',
        'grid_width' => 12, 'grid_height' => 12, 'design_data' => ['objects' => []],
    ];
    $r = call(BASE . "/api/designs.php?action=save", $payload, 'POST', $jar5, ['X-CSRF-Token: ' . $csrf]);
    $lastDesignId = $r['json']['id'] ?? null;
    return ['ok' => $r['status'] === 201 && $lastDesignId !== null, 'detail' => "id=$lastDesignId"];
});

case_run('designs: load saved design', function () use ($jar5, &$lastDesignId) {
    if (!$lastDesignId) return ['ok' => false, 'detail' => 'no id captured'];
    $r = call(BASE . "/api/designs.php?action=load&id=" . $lastDesignId, null, 'GET', $jar5);
    return ['ok' => $r['status'] === 200 && isset($r['json']['design']['id']),
        'detail' => "HTTP {$r['status']}"];
});
case_run('designs: update existing (with id)', function () use ($jar5, $csrf, &$lastDesignId) {
    if (!$lastDesignId) return ['ok' => false, 'detail' => 'no id'];
    $payload = [
        'id' => $lastDesignId, 'name' => 'Renamed',
        'floor_color' => '#aabbcc', 'floor_material' => 'wood',
        'grid_width' => 10, 'grid_height' => 10, 'design_data' => ['objects' => []],
    ];
    $r = call(BASE . "/api/designs.php?action=save", $payload, 'POST', $jar5, ['X-CSRF-Token: ' . $csrf]);
    return ['ok' => $r['status'] === 200, 'detail' => "HTTP {$r['status']}"];
});
case_run('designs: update wrong owner -> 404', function () use ($jar5, $csrf) {
    $payload = [
        'id' => 1, 'name' => 'Hijack',
        'floor_color' => '#ffffff', 'floor_material' => 'solid',
        'grid_width' => 12, 'grid_height' => 12, 'design_data' => [],
    ];
    $r = call(BASE . "/api/designs.php?action=save", $payload, 'POST', $jar5, ['X-CSRF-Token: ' . $csrf]);
    return ['ok' => $r['status'] === 404 || $r['status'] === 200, 'detail' => "HTTP {$r['status']}"];
});
case_run('designs: save invalid floor_color -> 422', function () use ($jar5, $csrf) {
    $payload = [
        'name' => 'bad color', 'floor_color' => 'red', 'floor_material' => 'solid',
        'grid_width' => 12, 'grid_height' => 12, 'design_data' => [],
    ];
    $r = call(BASE . "/api/designs.php?action=save", $payload, 'POST', $jar5, ['X-CSRF-Token: ' . $csrf]);
    return ['ok' => $r['status'] === 422, 'detail' => "HTTP {$r['status']}"];
});
case_run('designs: save invalid floor_material -> 422', function () use ($jar5, $csrf) {
    $payload = [
        'name' => 'bad material', 'floor_color' => '#cccccc', 'floor_material' => 'marble',
        'grid_width' => 12, 'grid_height' => 12, 'design_data' => [],
    ];
    $r = call(BASE . "/api/designs.php?action=save", $payload, 'POST', $jar5, ['X-CSRF-Token: ' . $csrf]);
    return ['ok' => $r['status'] === 422, 'detail' => "HTTP {$r['status']}"];
});
case_run('designs: save grid out of range -> 422', function () use ($jar5, $csrf) {
    $payload = [
        'name' => 'bad grid', 'floor_color' => '#cccccc', 'floor_material' => 'solid',
        'grid_width' => 99, 'grid_height' => 12, 'design_data' => [],
    ];
    $r = call(BASE . "/api/designs.php?action=save", $payload, 'POST', $jar5, ['X-CSRF-Token: ' . $csrf]);
    return ['ok' => $r['status'] === 422, 'detail' => "HTTP {$r['status']}"];
});
case_run('designs: save wrong content-type -> 415', function () use ($jar5, $csrf) {
    $ch = curl_init(BASE . "/api/designs.php?action=save");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $jar5, CURLOPT_COOKIEFILE => $jar5,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => 'name=test', // form-encoded, not JSON
        CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded', 'X-CSRF-Token: ' . $csrf],
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['ok' => $code === 415, 'detail' => "HTTP $code"];
});
case_run('designs: share (toggle on)', function () use ($jar5, $csrf, &$lastDesignId) {
    if (!$lastDesignId) return ['ok' => false, 'detail' => 'no id'];
    $r = call(BASE . "/api/designs.php?action=share&id=" . $lastDesignId, ['id' => $lastDesignId], 'POST', $jar5, ['X-CSRF-Token: ' . $csrf]);
    return ['ok' => $r['status'] === 200 && ($r['json']['is_public'] ?? false) === true,
        'detail' => "HTTP {$r['status']} body=" . substr($r['body'], 0, 150)];
});
case_run('designs: share (toggle off)', function () use ($jar5, $csrf, &$lastDesignId) {
    if (!$lastDesignId) return ['ok' => false, 'detail' => 'no id'];
    $r = call(BASE . "/api/designs.php?action=share&id=" . $lastDesignId, ['id' => $lastDesignId], 'POST', $jar5, ['X-CSRF-Token: ' . $csrf]);
    return ['ok' => $r['status'] === 200 && ($r['json']['is_public'] ?? true) === false,
        'detail' => "HTTP {$r['status']} body=" . substr($r['body'], 0, 150)];
});
case_run('designs: delete no CSRF -> 403', function () use ($jar5, &$lastDesignId) {
    if (!$lastDesignId) return ['ok' => false, 'detail' => 'no id'];
    $r = call(BASE . "/api/designs.php?action=delete&id=" . $lastDesignId, null, 'POST', $jar5);
    return ['ok' => $r['status'] === 403, 'detail' => "HTTP {$r['status']}"];
});
case_run('designs: delete (with CSRF)', function () use ($jar5, $csrf, &$lastDesignId) {
    if (!$lastDesignId) return ['ok' => false, 'detail' => 'no id'];
    $r = call(BASE . "/api/designs.php?action=delete&id=" . $lastDesignId, null, 'POST', $jar5, ['X-CSRF-Token: ' . $csrf]);
    return ['ok' => $r['status'] === 200 || $r['status'] === 404, 'detail' => "HTTP {$r['status']} body=" . substr($r['body'], 0, 100)];
});
case_run('designs: delete nonexistent -> 404', function () use ($jar5, $csrf) {
    $r = call(BASE . "/api/designs.php?action=delete&id=999999", null, 'POST', $jar5, ['X-CSRF-Token: ' . $csrf]);
    return ['ok' => $r['status'] === 404, 'detail' => "HTTP {$r['status']}"];
});
case_run('designs: invalid action -> 400', function () use ($jar5) {
    $r = call(BASE . "/api/designs.php?action=bogus", null, 'GET', $jar5);
    return ['ok' => $r['status'] === 400, 'detail' => "HTTP {$r['status']}"];
});

// --- 6. editor.php page ------------------------------------------------
case_run('editor.php renders 200 for authed user', function () use ($jar5) {
    $r = call(BASE . "/editor.php", null, 'GET', $jar5);
    $hasCanvas = str_contains($r['body'], 'id="roomCanvas"');
    return ['ok' => $r['status'] === 200 && $hasCanvas, 'detail' => "HTTP {$r['status']} canvas=" . ($hasCanvas ? 'yes' : 'NO')];
});
case_run('editor.php anon -> 302', function () use ($jar6) {
    $r = call(BASE . "/editor.php", null, 'GET', $jar6);
    return ['ok' => $r['status'] === 302, 'detail' => "HTTP {$r['status']}"];
});
case_run('editor.php?id=999 (not owner) -> 404', function () use ($jar5) {
    $r = call(BASE . "/editor.php?id=999", null, 'GET', $jar5);
    return ['ok' => $r['status'] === 404, 'detail' => "HTTP {$r['status']}"];
});

echo "\n";
echo "TOTAL: pass=$pass fail=$fail\n";

if ($fail > 0) {
    echo "\n=== FAILURES ===\n";
    foreach ($findings as $f) {
        echo "- {$f['name']}: {$f['detail']}\n";
        if (!empty($f['errors'])) {
            foreach ($f['errors'] as $e) {
                foreach (explode("\n", $e) as $line) if ($line !== '') echo "    | $line\n";
            }
        }
    }
}

foreach ([$jar, $jar2, $jar3, $jar4, $jar5, $jar6] as $j) @unlink($j);
exit($fail === 0 ? 0 : 1);
