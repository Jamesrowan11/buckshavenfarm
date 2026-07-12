<?php
/**
 * Bucks Haven Farm — self-updating gallery
 * Returns a JSON list of images in assets/img/gallery/.
 * Upload photos to that folder (via Plesk File Manager or FTP)
 * and the website gallery updates itself — no code changes.
 */
header('Content-Type: application/json');
header('Cache-Control: max-age=300'); // 5-minute cache

$dir = __DIR__ . '/../assets/img/gallery';
$out = [];

if (is_dir($dir)) {
    $files = scandir($dir);
    foreach ($files as $f) {
        if (preg_match('/\.(jpe?g|png|webp|gif|avif)$/i', $f)) {
            $out[] = 'assets/img/gallery/' . rawurlencode($f);
        }
    }
    sort($out, SORT_NATURAL | SORT_FLAG_CASE);
}

echo json_encode($out);
