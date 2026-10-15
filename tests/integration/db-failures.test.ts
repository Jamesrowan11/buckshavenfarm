import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { hasTestDb, resetSchema, sql, useTestDatabaseEnv } from "../helpers/db";

useTestDatabaseEnv();
const db = await import("@/lib/db");
const { ConflictError, DatabaseUnavailableError } = await import("@/lib/errors");
const { authenticate } = await import("@/lib/auth/login");

describe.skipIf(!hasTestDb)("transactions and duplicates (MariaDB)", () => {
  beforeAll(resetSchema);
  afterAll(db.closePool);

  it("rolls back every write when the transaction body throws", async () => {
    await expect(
      db.withTransaction(async (tx) => {
        await db.execute("INSERT INTO horses (id, name) VALUES (UUID(), 'Rollback me')", [], tx);
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(await sql("SELECT * FROM horses WHERE name = 'Rollback me'")).toHaveLength(0);
  });

  it("rolls back when a later statement violates a constraint", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    await expect(
      db.withTransaction(async (tx) => {
        await db.execute("INSERT INTO horses (id, name) VALUES (?, 'First')", [id], tx);
        await db.execute("INSERT INTO horses (id, name) VALUES (?, 'Duplicate PK')", [id], tx);
      })
    ).rejects.toThrow(ConflictError);
    expect(await sql("SELECT * FROM horses WHERE id = ?", [id])).toHaveLength(0);
  });

  it("maps duplicate unique keys to ConflictError", async () => {
    await sql("INSERT INTO users (id, email, name) VALUES (UUID(), 'dup@example.com', 'A')");
    await expect(db.execute("INSERT INTO users (id, email, name) VALUES (UUID(), 'dup@example.com', 'B')")).rejects.toThrow(
      ConflictError
    );
  });

  it("stores and reads timestamps in UTC", async () => {
    const [row] = await db.query<{ tz: string }>("SELECT @@session.time_zone AS tz");
    expect(row.tz).toBe("+00:00");
    const at = new Date("2026-07-04T15:30:00.123Z");
    await db.execute("INSERT INTO announcements (id, title, created_at) VALUES (UUID(), 'utc', ?)", [at]);
    const [a] = await db.query<{ created_at: Date; raw: string }>(
      "SELECT created_at, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s.%f') AS raw FROM announcements WHERE title = 'utc'"
    );
    expect(a.created_at.toISOString()).toBe("2026-07-04T15:30:00.123Z");
    expect(a.raw.startsWith("2026-07-04 15:30:00.123")).toBe(true);
  });
});

describe("database unavailable", () => {
  afterEach(db.closePool);

  it("reports a safe error and a failing health check when the server is unreachable", async () => {
    await db.closePool();
    process.env.DATABASE_URL = "mysql://nobody:wrong-secret@127.0.0.1:1/nowhere";
    const err = await db.query("SELECT 1").catch((e) => e);
    expect(err).toBeInstanceOf(DatabaseUnavailableError);
    expect(String(err.message)).not.toContain("wrong-secret");
    expect(await db.pingDatabase()).toBe(false);
    await expect(authenticate({ email: "a@example.com", password: "whatever123", ip: null, userAgent: null })).rejects.toThrow(
      DatabaseUnavailableError
    );
  });

  it("reports a safe error when the database isn't configured at all", async () => {
    await db.closePool();
    delete process.env.DATABASE_URL;
    await expect(db.query("SELECT 1")).rejects.toThrow(DatabaseUnavailableError);
    await expect(db.withTransaction(async () => 1)).rejects.toThrow(DatabaseUnavailableError);
  });
});
