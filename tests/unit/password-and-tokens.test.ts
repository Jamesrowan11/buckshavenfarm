import { describe, expect, it } from "vitest";
import { checkPasswordStrength, hashPassword, verifyPassword } from "@/lib/shared/password.mjs";
import { generateSessionToken, hashSessionToken } from "@/lib/auth/session";
import { sessionCookieOptions } from "@/lib/auth/config";

describe("password hashing", () => {
  it("hashes with Argon2id and verifies", async () => {
    const h = await hashPassword("a long enough password");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(h).not.toContain("a long enough password");
    expect(await verifyPassword(h, "a long enough password")).toBe(true);
    expect(await verifyPassword(h, "a long enough passwore")).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same password here")).not.toBe(await hashPassword("same password here"));
  });

  it("treats malformed hashes as a failed match, not an error", async () => {
    expect(await verifyPassword("not-a-hash", "whatever")).toBe(false);
  });

  it("enforces a minimum length", () => {
    expect(checkPasswordStrength("short")).toMatch(/at least/);
    expect(checkPasswordStrength("long enough!")).toBeNull();
    expect(checkPasswordStrength("x".repeat(300))).toMatch(/at most/);
  });
});

describe("session tokens", () => {
  it("are 256-bit random base64url strings, stored only as SHA-256", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(hashSessionToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(a)).not.toBe(a);
  });

  it("cookie options are HttpOnly + SameSite=Lax, Secure in production", () => {
    const env = process.env as Record<string, string | undefined>;
    const prev = env.NODE_ENV;
    env.NODE_ENV = "production";
    try {
      expect(sessionCookieOptions()).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/" });
      env.COOKIE_SECURE = "false";
      expect(sessionCookieOptions().secure).toBe(false);
    } finally {
      env.NODE_ENV = prev;
      delete env.COOKIE_SECURE;
    }
  });
});
