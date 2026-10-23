// Request helpers for route handlers: CSRF origin check and client IP.

/**
 * CSRF protection for state-changing route handlers (Server Actions get the
 * same check from Next.js itself). The browser's Origin header must match the
 * host the request was sent to, or one of ALLOWED_ORIGINS (comma-separated
 * hosts, e.g. "farm.example.com,www.farm.example.com").
 */
export function isSameOriginRequest(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (!origin) {
    // Browsers send Origin on every cross-site POST; a missing header with
    // Sec-Fetch-Site same-origin is a same-site request from an older client.
    return headers.get("sec-fetch-site") === "same-origin";
  }
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim().toLowerCase();
  const host = headers.get("host")?.toLowerCase();
  const allowed = new Set(
    (process.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, ""))
      .filter(Boolean)
  );
  if (forwardedHost) allowed.add(forwardedHost);
  if (host) allowed.add(host);
  return allowed.has(originHost);
}

/**
 * Client IP for throttling. Plesk puts nginx in front of the app; nginx sets
 * X-Real-IP and appends the connecting address to X-Forwarded-For, so the
 * last X-Forwarded-For entry is the one the proxy itself observed (earlier
 * entries can be forged by the client).
 */
export function clientIp(headers: Headers): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1].slice(0, 64);
  }
  return null;
}
