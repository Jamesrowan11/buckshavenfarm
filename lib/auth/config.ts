// Session and cookie settings. Override with environment variables in Plesk.

function hoursFromEnv(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const SESSION_COOKIE = "bhf_session";

/** Sign out after this long without any activity (default 7 days). */
export function sessionIdleMs(): number {
  return hoursFromEnv("SESSION_IDLE_HOURS", 24 * 7) * 3600_000;
}

/** Sign out this long after login regardless of activity (default 30 days). */
export function sessionMaxMs(): number {
  return hoursFromEnv("SESSION_MAX_HOURS", 24 * 30) * 3600_000;
}

/**
 * Secure cookies require HTTPS. On by default in production; set
 * COOKIE_SECURE=false only for a plain-HTTP test deployment.
 */
export function cookieSecure(): boolean {
  if (process.env.COOKIE_SECURE === "false") return false;
  if (process.env.COOKIE_SECURE === "true") return true;
  return process.env.NODE_ENV === "production";
}

export function sessionCookieOptions(maxAgeMs: number = sessionMaxMs()) {
  return {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}
