/**
 * Spam protection for the public tour-request form.
 *
 * Layers (a submission must pass all of them before any email is sent):
 *  1. Signed form token: the page fetches a token from the server when it
 *     loads. It is HMAC-signed, single-use, and only valid between
 *     MIN_FILL_MS and MAX_AGE_MS after it was issued. Bots that POST straight
 *     to the endpoint (no token) or submit instantly are dropped.
 *  2. Honeypot field (hidden from people; bots fill it).
 *  3. Rate limits per IP address and for the whole site, so even a bot that
 *     gets past the token can only send a handful of emails.
 *  4. Content checks (links in the name, link-stuffed messages).
 *  5. Duplicate suppression (same email + message within a day).
 *
 * State is kept in memory: it resets when the app restarts, and each app
 * process keeps its own counters. That's enough to stop floods; the limits
 * below are per process.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

export const MIN_FILL_MS = 3_000; // faster than this = a bot
export const MAX_AGE_MS = 4 * 60 * 60_000; // tokens expire after 4 hours

export const IP_LIMITS = [
  { windowMs: 15 * 60_000, max: 3 }, // 3 requests per 15 minutes per IP
  { windowMs: 24 * 60 * 60_000, max: 10 }, // 10 per day per IP
];
export const GLOBAL_LIMIT = { windowMs: 60 * 60_000, max: 20 }; // 20 emails/hour site-wide

// ---------- signing key ----------

let fallbackKey: Buffer | null = null;
function key(): Buffer {
  const s = process.env.AUTH_SECRET;
  if (s) return createHash("sha256").update(`tour-form:${s}`).digest();
  // No AUTH_SECRET: use a random per-process key (tokens stop working after
  // a restart, which only means a visitor may need to reload the page).
  fallbackKey ??= randomBytes(32);
  return fallbackKey;
}

function sign(payload: string): string {
  return createHmac("sha256", key()).update(payload).digest("base64url");
}

// ---------- tokens ----------

const usedNonces = new Map<string, number>(); // nonce → expiry time

export function issueFormToken(now = Date.now()): string {
  const payload = `${now}.${randomBytes(12).toString("base64url")}`;
  return `${payload}.${sign(payload)}`;
}

export type TokenCheck = "ok" | "missing" | "invalid" | "too-fast" | "expired" | "reused";

/** Verifies a token and marks it used (only when the result is "ok"). */
export function checkFormToken(token: string | null | undefined, now = Date.now()): TokenCheck {
  if (!token) return "missing";
  const parts = token.split(".");
  if (parts.length !== 3) return "invalid";
  const [issuedRaw, nonce, sig] = parts;
  const expected = Buffer.from(sign(`${issuedRaw}.${nonce}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return "invalid";
  const issued = Number(issuedRaw);
  if (!Number.isFinite(issued)) return "invalid";
  const age = now - issued;
  if (age < MIN_FILL_MS) return "too-fast";
  if (age > MAX_AGE_MS) return "expired";
  prune(now);
  if (usedNonces.has(nonce)) return "reused";
  usedNonces.set(nonce, issued + MAX_AGE_MS);
  return "ok";
}

// ---------- rate limits ----------

const hitsByIp = new Map<string, number[]>();
let globalHits: number[] = [];

/**
 * Records an attempt from `ip` and returns false if it exceeds a limit.
 * Every POST counts, so bots burn their allowance even when other checks
 * would have dropped them.
 */
export function allowRequest(ip: string, now = Date.now()): boolean {
  // Without a client IP every visitor would share one bucket and real people
  // would get blocked; the token check and the site-wide cap still apply.
  if (ip === "unknown") return true;
  prune(now);
  const longest = Math.max(...IP_LIMITS.map((l) => l.windowMs));
  const hits = (hitsByIp.get(ip) ?? []).filter((t) => now - t < longest);
  hits.push(now);
  hitsByIp.set(ip, hits);
  return IP_LIMITS.every((l) => hits.filter((t) => now - t < l.windowMs).length <= l.max);
}

/** Records one email about to be sent site-wide; false when the hourly cap is reached. */
export function allowGlobalSend(now = Date.now()): boolean {
  globalHits = globalHits.filter((t) => now - t < GLOBAL_LIMIT.windowMs);
  if (globalHits.length >= GLOBAL_LIMIT.max) return false;
  globalHits.push(now);
  return true;
}

// ---------- duplicates ----------

const recentMessages = new Map<string, number>(); // hash → expiry
const DUPLICATE_WINDOW_MS = 24 * 60 * 60_000;

/** True if the same email + message was already accepted within a day. */
export function isDuplicate(email: string, message: string, now = Date.now()): boolean {
  prune(now);
  const h = createHash("sha256").update(`${email.toLowerCase()}\n${message.trim()}`).digest("hex");
  if (recentMessages.has(h)) return true;
  recentMessages.set(h, now + DUPLICATE_WINDOW_MS);
  return false;
}

// ---------- content ----------

const HAS_URL = /(https?:\/\/|www\.)\S+/i;
const ALL_URLS = /(https?:\/\/|www\.)\S+/gi;

/** Returns a reason string when the content looks like spam, otherwise null. */
export function contentSpamReason(f: { name: string; message: string; phone: string }): string | null {
  if (HAS_URL.test(f.name)) return "link-in-name";
  const links = f.message.match(ALL_URLS)?.length ?? 0;
  if (links > 2) return "too-many-links";
  if (/<a\s+href=|\[url=/i.test(f.message)) return "html-links";
  if (f.phone && !/^[\d\s()+.\-x]{7,40}$/i.test(f.phone)) return "bad-phone";
  return null;
}

// ---------- housekeeping ----------

let lastPrune = 0;
function prune(now: number) {
  if (now - lastPrune < 60_000) return;
  lastPrune = now;
  for (const [k, exp] of usedNonces) if (exp < now) usedNonces.delete(k);
  for (const [k, exp] of recentMessages) if (exp < now) recentMessages.delete(k);
  const longest = Math.max(...IP_LIMITS.map((l) => l.windowMs));
  for (const [ip, hits] of hitsByIp) {
    const kept = hits.filter((t) => now - t < longest);
    if (kept.length) hitsByIp.set(ip, kept);
    else hitsByIp.delete(ip);
  }
}

/** Test helper: clears all in-memory state. */
export function _resetFormGuard() {
  usedNonces.clear();
  hitsByIp.clear();
  recentMessages.clear();
  globalHits = [];
  lastPrune = 0;
}

/**
 * Client IP behind Plesk's nginx: X-Real-IP, else the last X-Forwarded-For
 * entry (the one nginx appended; earlier entries can be forged).
 */
export function clientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const parts = (headers.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? "unknown";
}

/** Browsers send Origin on form POSTs; it must be this site. */
export function isSameOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (!origin) return false;
  try {
    const host = new URL(origin).host.toLowerCase();
    const allowed = [headers.get("x-forwarded-host"), headers.get("host")]
      .map((h) => h?.split(",")[0].trim().toLowerCase())
      .filter(Boolean);
    return allowed.includes(host);
  } catch {
    return false;
  }
}
