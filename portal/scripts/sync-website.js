/**
 * Copies the public website (../website) into portal/httpdocs so Plesk can
 * use httpdocs as the domain's document root (it must be inside the app root).
 * Runs automatically at the end of `npm run deploy`.
 *
 * MERGES, never deletes: photos uploaded straight into
 * httpdocs/assets/img/gallery via File Manager survive every deploy.
 */
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "..", "website");
const dest = path.join(__dirname, "..", "httpdocs");

if (!fs.existsSync(src)) {
  console.log(`sync-website: ${src} not found — skipping (nothing to copy).`);
  process.exit(0);
}

fs.cpSync(src, dest, { recursive: true, force: true });
console.log(`sync-website: copied website → ${dest}`);

// Files removed from the website that must not stay live on the server.
// (The merge above never deletes, so retired files are removed here by name.)
// api/contact.php was the old PHP form handler with weaker spam protection;
// bots kept posting to it directly. The form now uses /portal/api/tour-request.
const RETIRED = ["api/contact.php"];
for (const rel of RETIRED) {
  const file = path.join(dest, rel);
  if (fs.existsSync(file)) {
    fs.rmSync(file);
    console.log(`sync-website: removed retired file ${rel}`);
  }
}
