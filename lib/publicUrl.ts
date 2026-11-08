// The address the visitor used (e.g. https://buckshavenfarm.com), not the app's
// internal one (http://127.0.0.1:3001). Caddy passes the original Host header and
// X-Forwarded-Proto, so redirects built from these go to the right place.
export function publicUrl(headers: Headers, path: string, fallback: string): URL {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  const proto = (headers.get("x-forwarded-proto") ?? "").split(",")[0].trim() || (host?.startsWith("127.0.0.1") || host?.startsWith("localhost") ? "http" : "https");
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return new URL(path, fallback);
  return new URL(path, `${proto}://${host}`);
}
