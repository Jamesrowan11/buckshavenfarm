<?php
/**
 * Bucks Haven Farm — tour request handler
 * Runs on any Plesk/PHP host, no dependencies.
 *
 * Automations:
 *  - emails the farm every tour request
 *  - sends the visitor a branded auto-reply confirmation
 *  - honeypot + time-trap + header-injection spam protection
 *
 * CONFIG — edit these two lines:
 */
const TO_EMAIL   = 'james@northvaleunified.com';        // where requests are delivered
const FROM_EMAIL = 'noreply@buckshavenfarm.com';        // must be a mailbox/domain on your Plesk server

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

$clean = static function (?string $v, int $max = 500): string {
    $v = trim((string) $v);
    $v = str_replace(["\r", "\n", "%0a", "%0d"], ' ', $v); // block header injection
    return mb_substr($v, 0, $max);
};

$name     = $clean($_POST['name'] ?? '', 120);
$email    = $clean($_POST['email'] ?? '', 200);
$phone    = $clean($_POST['phone'] ?? '', 40);
$interest = $clean($_POST['interest'] ?? 'General', 60);
$message  = trim(mb_substr((string) ($_POST['message'] ?? ''), 0, 4000));
$honeypot = trim((string) ($_POST['website'] ?? ''));
// ms the visitor spent on the page (set by JS on submit; blank when JS is off → skip the check)
$elapsed  = ($_POST['ts'] ?? '') === '' ? -1 : (int) $_POST['ts'];

// Spam gates: honeypot filled, or form submitted in under 3 seconds.
if ($honeypot !== '' || ($elapsed >= 0 && $elapsed < 3000)) {
    echo json_encode(['ok' => true]); // pretend success so bots move on
    exit;
}

if ($name === '' || $message === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'Please fill in name, a valid email, and a message.']);
    exit;
}

$subject = "Tour request ({$interest}) — {$name}";
$body = "New request from the Bucks Haven Farm website\n"
      . "------------------------------------------------\n"
      . "Name:      {$name}\n"
      . "Email:     {$email}\n"
      . "Phone:     " . ($phone !== '' ? $phone : '—') . "\n"
      . "Interest:  {$interest}\n"
      . "------------------------------------------------\n\n"
      . $message . "\n";

$headers = "From: Bucks Haven Farm Website <" . FROM_EMAIL . ">\r\n"
         . "Reply-To: {$name} <{$email}>\r\n"
         . "X-Mailer: PHP/" . phpversion();

$sent = mail(TO_EMAIL, $subject, $body, $headers);

if (!$sent) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Mail could not be sent.']);
    exit;
}

// Auto-reply to the visitor (best-effort; ignore failure).
$replyBody = "Hi {$name},\n\n"
           . "Thank you for reaching out to Bucks Haven Farm! We've received your "
           . strtolower($interest) . " inquiry and will get back to you shortly.\n\n"
           . "In the meantime, feel free to call us at (301) 440-7800.\n\n"
           . "Warm regards,\n"
           . "Bucks Haven Farm\n"
           . "12459 Scaggsville Rd #216, Highland, MD 20777\n";
@mail(
    $email,
    'We received your request — Bucks Haven Farm',
    $replyBody,
    "From: Bucks Haven Farm <" . FROM_EMAIL . ">\r\n"
);

echo json_encode(['ok' => true]);
