/**
 * Bucks Haven Farm: one Node process serves the whole domain.
 *   /            the public website (static files in ../website)
 *   /portal/...  the portal (this Next.js app, basePath /portal)
 * Old addresses from the previous portal (/login, /admin, /barn-display/...)
 * redirect to their /portal/... equivalents so bookmarks and barn TVs keep working.
 *
 * Caddy (HTTPS) sits in front on the DigitalOcean server; set PORT and
 * HOSTNAME (127.0.0.1 there). Website photos added on the server go in
 * GALLERY_DIR and are served at /assets/img/gallery/<name>.
 */
process.env.NODE_ENV = process.env.NODE_ENV || "production";
process.chdir(__dirname);

const http = require("http");
const fs = require("fs");
const path = require("path");
const next = require("next");

const WEBSITE = path.resolve(process.env.WEBSITE_DIR || path.join(__dirname, "..", "website"));
const GALLERY_DIR = process.env.GALLERY_DIR ? path.resolve(process.env.GALLERY_DIR) : null;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".pdf": "application/pdf",
  ".woff2": "font/woff2",
};
const LONG_CACHE = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".svg", ".mp4", ".webm", ".woff2", ".ico"]);

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

// Old portal addresses → new ones.
function legacyRedirect(p) {
  if (p === "/barn-display" || p === "/barn-display/") return "/portal/barn-display/log-barn";
  if (/^\/(login|setup|admin|employee|barn-display)(\/|$)/.test(p)) return "/portal" + p;
  if (p === "/logout") return "/portal/logout";
  return null;
}

/** Resolves a URL path to a file inside root, or null (never escapes root). */
function inside(root, rel) {
  const full = path.resolve(root, "." + rel);
  return full === root || full.startsWith(root + path.sep) ? full : null;
}

function findFile(urlPath) {
  // Hidden files, server-side scripts and Apache config are never served.
  if (urlPath.split("/").some((seg) => seg.startsWith(".")) || /\.(php|htaccess|md)$/i.test(urlPath)) return null;
  const candidates = [];
  if (GALLERY_DIR && urlPath.startsWith("/assets/img/gallery/")) {
    candidates.push(inside(GALLERY_DIR, urlPath.slice("/assets/img/gallery".length)));
  }
  candidates.push(inside(WEBSITE, urlPath));
  for (let file of candidates) {
    if (!file) continue;
    try {
      let st = fs.statSync(file);
      if (st.isDirectory()) {
        file = path.join(file, "index.html");
        st = fs.statSync(file);
      }
      if (st.isFile()) return { file, st };
    } catch {
      // not here
    }
  }
  return null;
}

function serveStatic(req, res, urlPath) {
  const found = findFile(urlPath);
  if (!found) return false;
  const { file, st } = found;
  const ext = path.extname(file).toLowerCase();
  const headers = {
    ...SECURITY_HEADERS,
    "Content-Type": TYPES[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-cache" : LONG_CACHE.has(ext) ? "public, max-age=2592000" : "public, max-age=604800",
    "Last-Modified": st.mtime.toUTCString(),
    "Accept-Ranges": "bytes",
  };
  if (req.headers["if-modified-since"] && new Date(req.headers["if-modified-since"]) >= new Date(st.mtime.toUTCString())) {
    res.writeHead(304, headers);
    return res.end(), true;
  }
  // Byte ranges, so the hero video can start playing (and seek) before it has fully downloaded.
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? parseInt(range[1], 10) : st.size - parseInt(range[2], 10);
    let end = range[1] && range[2] ? parseInt(range[2], 10) : st.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, st.size - 1);
    if (start > end) {
      res.writeHead(416, { ...headers, "Content-Range": `bytes */${st.size}` });
      return res.end(), true;
    }
    res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Content-Length": end - start + 1 });
    if (req.method === "HEAD") return res.end(), true;
    fs.createReadStream(file, { start, end }).pipe(res);
    return true;
  }
  res.writeHead(200, { ...headers, "Content-Length": st.size });
  if (req.method === "HEAD") return res.end(), true;
  fs.createReadStream(file).pipe(res);
  return true;
}

const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const port = parseInt(process.env.PORT || "3000", 10);
  const host = process.env.HOSTNAME || "0.0.0.0";
  http
    .createServer((req, res) => {
      let urlPath;
      try {
        urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
      } catch {
        res.writeHead(400);
        return res.end("Bad request");
      }
      if (urlPath === "/portal" || urlPath.startsWith("/portal/")) return handle(req, res);
      const to = legacyRedirect(urlPath);
      if (to) {
        const q = req.url.indexOf("?");
        res.writeHead(301, { Location: to + (q >= 0 ? req.url.slice(q) : "") });
        return res.end();
      }
      if ((req.method === "GET" || req.method === "HEAD") && serveStatic(req, res, urlPath)) return;
      const notFound = findFile("/404.html");
      res.writeHead(404, { ...SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8" });
      if (notFound && req.method !== "HEAD") return fs.createReadStream(notFound.file).pipe(res);
      res.end('<!doctype html><title>Not found</title><p>Page not found. <a href="/">Bucks Haven Farm home</a></p>');
    })
    .listen(port, host, () => {
      console.log(`Bucks Haven Farm: website + portal on http://${host}:${port}`);
    });
});
