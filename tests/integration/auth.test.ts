import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { actorOf, createUser, hasTestDb, resetSchema, sql, truncateAll, useTestDatabaseEnv } from "../helpers/db";

useTestDatabaseEnv();
const { authenticate, INVALID_CREDENTIALS } = await import("@/lib/auth/login");
const session = await import("@/lib/auth/session");
const users = await import("@/lib/services/users");
const { closePool } = await import("@/lib/db");
const { RateLimitError, UnauthorizedError } = await import("@/lib/errors");

const meta = { ip: "203.0.113.5", userAgent: "vitest" };

describe.skipIf(!hasTestDb)("authentication (MariaDB)", () => {
  beforeAll(resetSchema);
  beforeEach(truncateAll);
  afterAll(closePool);

  it("signs in with the right password and creates a hashed session", async () => {
    const u = await createUser("employee", { email: "worker@example.com" });
    const result = await authenticate({ email: " Worker@Example.com ", password: u.password, ...meta });
    expect(result.role).toBe("employee");
    const rows = await sql<{ id: string; user_id: string }>("SELECT id, user_id FROM sessions");
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(session.hashSessionToken(result.token)); // only the hash is stored
    expect(rows[0].id).not.toBe(result.token);
    const v = await session.validateSessionToken(result.token);
    expect(v?.user).toMatchObject({ id: u.id, role: "employee", email: "worker@example.com" });
  });

  it("gives the same error for a wrong password and an unknown email", async () => {
    const u = await createUser("employee");
    const wrong = authenticate({ email: u.email, password: "wrong password!!", ...meta });
    await expect(wrong).rejects.toThrow(UnauthorizedError);
    await expect(authenticate({ email: u.email, password: "wrong password!!", ...meta })).rejects.toThrow(INVALID_CREDENTIALS);
    await expect(authenticate({ email: "nobody@example.com", password: "whatever123", ...meta })).rejects.toThrow(
      INVALID_CREDENTIALS
    );
    expect(await sql("SELECT * FROM sessions")).toHaveLength(0);
  });

  it("refuses accounts that have no password yet (e.g. imported users)", async () => {
    const u = await createUser("employee");
    await sql("UPDATE users SET password_hash = NULL WHERE id = ?", [u.id]);
    await expect(authenticate({ email: u.email, password: u.password, ...meta })).rejects.toThrow(INVALID_CREDENTIALS);
  });

  it("locks an account after 5 failures, even for the right password, and resets on success", async () => {
    const u = await createUser("employee");
    for (let i = 0; i < 5; i++) {
      await expect(authenticate({ email: u.email, password: "bad password", ip: `198.51.100.${i}`, userAgent: null })).rejects.toThrow(
        UnauthorizedError
      );
    }
    await expect(authenticate({ email: u.email, password: u.password, ...meta })).rejects.toThrow(RateLimitError);

    // Lock expires → sign-in works again and the counter is cleared.
    await sql("UPDATE login_attempts SET locked_until = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND");
    await authenticate({ email: u.email, password: u.password, ...meta });
    expect(await sql("SELECT * FROM login_attempts WHERE throttle_key = ?", [`email:${u.email}`])).toHaveLength(0);
  });

  it("locks a client IP that sprays many accounts", async () => {
    const victim = await createUser("employee");
    for (let i = 0; i < 30; i++) {
      await expect(authenticate({ email: `guess${i}@example.com`, password: "bad password", ...meta })).rejects.toThrow();
    }
    await expect(authenticate({ email: victim.email, password: victim.password, ...meta })).rejects.toThrow(RateLimitError);
    // Same account from another IP is fine.
    await authenticate({ email: victim.email, password: victim.password, ip: "192.0.2.1", userAgent: null });
  });

  it("expires sessions after the idle timeout and deletes them", async () => {
    const u = await createUser("employee");
    const { token } = await authenticate({ email: u.email, password: u.password, ...meta });
    await sql("UPDATE sessions SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND");
    expect(await session.validateSessionToken(token)).toBeNull();
    expect(await sql("SELECT * FROM sessions")).toHaveLength(0);
  });

  it("expires sessions after the absolute lifetime even if active", async () => {
    const u = await createUser("employee");
    const { token } = await authenticate({ email: u.email, password: u.password, ...meta });
    await sql("UPDATE sessions SET created_at = UTC_TIMESTAMP(3) - INTERVAL 31 DAY");
    expect(await session.validateSessionToken(token)).toBeNull();
  });

  it("slides the idle expiry forward on activity", async () => {
    const u = await createUser("employee");
    const { token } = await authenticate({ email: u.email, password: u.password, ...meta });
    await sql(
      "UPDATE sessions SET last_seen_at = UTC_TIMESTAMP(3) - INTERVAL 2 DAY, expires_at = UTC_TIMESTAMP(3) + INTERVAL 1 HOUR"
    );
    const v = await session.validateSessionToken(token);
    expect(v!.session.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 3600_000);
  });

  it("logout invalidates the session server-side", async () => {
    const u = await createUser("employee");
    const { token } = await authenticate({ email: u.email, password: u.password, ...meta });
    await session.invalidateSessionToken(token);
    expect(await session.validateSessionToken(token)).toBeNull();
  });

  it("ignores malformed or forged tokens", async () => {
    for (const t of [undefined, null, "", "x", "' OR '1'='1", "a".repeat(200)]) {
      expect(await session.validateSessionToken(t as string)).toBeNull();
    }
    expect(await session.validateSessionToken(session.generateSessionToken())).toBeNull();
  });

  it("reflects role changes immediately (role is read from the database, not the cookie)", async () => {
    const admin = await createUser("admin");
    const u = await createUser("employee");
    const { token } = await authenticate({ email: u.email, password: u.password, ...meta });
    await users.setUserRole(actorOf(admin), u.id, "admin");
    expect((await session.validateSessionToken(token))!.user.role).toBe("admin");
  });

  it("changing your password signs out your other sessions but keeps this one", async () => {
    const u = await createUser("employee");
    const a = await authenticate({ email: u.email, password: u.password, ...meta });
    const b = await authenticate({ email: u.email, password: u.password, ...meta });
    const current = (await session.validateSessionToken(a.token))!;
    await expect(users.changeOwnPassword(actorOf(u), current.session.id, "wrong current", "new password 456")).rejects.toThrow(
      UnauthorizedError
    );
    await users.changeOwnPassword(actorOf(u), current.session.id, u.password, "new password 456");
    expect(await session.validateSessionToken(a.token)).not.toBeNull();
    expect(await session.validateSessionToken(b.token)).toBeNull();
    await expect(authenticate({ email: u.email, password: u.password, ...meta })).rejects.toThrow(UnauthorizedError);
    await authenticate({ email: u.email, password: "new password 456", ...meta });
  });

  it("an admin password reset signs the user out everywhere and clears their lockout", async () => {
    const admin = await createUser("admin");
    const u = await createUser("employee");
    const { token } = await authenticate({ email: u.email, password: u.password, ...meta });
    for (let i = 0; i < 5; i++) await authenticate({ email: u.email, password: "bad password", ...meta }).catch(() => {});
    await users.resetUserPassword(actorOf(admin), u.id, "temporary pass 1");
    expect(await session.validateSessionToken(token)).toBeNull();
    await authenticate({ email: u.email, password: "temporary pass 1", ...meta });
  });

  it("deleting a user ends their sessions", async () => {
    const admin = await createUser("admin");
    const u = await createUser("employee");
    const { token } = await authenticate({ email: u.email, password: u.password, ...meta });
    await users.deleteUser(actorOf(admin), u.id);
    expect(await session.validateSessionToken(token)).toBeNull();
  });
});
