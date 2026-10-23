import path from "node:path";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUser, hasTestDb, resetSchema, sql, TEST_DATABASE_URL, useTestDatabaseEnv } from "../helpers/db";
import { parseCsv, runImport, toTimestamp } from "../../scripts/import-supabase.mjs";

useTestDatabaseEnv();
const FIXTURES = path.resolve(__dirname, "../fixtures/supabase-export");
const quiet = { log: () => {} };

async function importOnce(rollback = false) {
  const conn = await mysql.createConnection({ uri: TEST_DATABASE_URL, timezone: "Z", dateStrings: ["DATE"] });
  await conn.query("SET time_zone = '+00:00'");
  try {
    await conn.beginTransaction();
    const report = await runImport(conn, FIXTURES, quiet);
    if (rollback) await conn.rollback();
    else await conn.commit();
    return report;
  } finally {
    await conn.end();
  }
}

describe("import helpers", () => {
  it("parses CSV with quotes, escaped quotes and embedded newlines", () => {
    expect(parseCsv('a,b\n"x, y","he said ""hi""\nbye"\r\n1,\n')).toEqual([
      { a: "x, y", b: 'he said "hi"\nbye' },
      { a: "1", b: "" },
    ]);
  });

  it("converts Postgres timestamptz text to UTC", () => {
    expect(toTimestamp("2025-01-02 03:04:05.123456+00")?.toISOString()).toBe("2025-01-02T03:04:05.123Z");
    expect(toTimestamp("2025-01-02 03:04:05-05")?.toISOString()).toBe("2025-01-02T08:04:05.000Z");
    expect(toTimestamp("2025-01-02T03:04:05")?.toISOString()).toBe("2025-01-02T03:04:05.000Z");
  });
});

describe.skipIf(!hasTestDb)("Supabase import (MariaDB)", () => {
  let bootAdminId: string;
  beforeAll(async () => {
    await resetSchema();
    // The admin created with `npm run create-admin` before importing.
    bootAdminId = (await createUser("admin", { email: "boot@example.com", name: "Boot Admin" })).id;
  });
  afterAll(() => undefined);

  it("a dry run changes nothing", async () => {
    await importOnce(true);
    expect(await sql("SELECT * FROM horses")).toHaveLength(0);
    expect(await sql("SELECT * FROM users")).toHaveLength(1);
  });

  it("imports rows with their original IDs and reports what it couldn't import", async () => {
    const report = await importOnce();
    const t = report.tables;

    expect(t.profiles).toMatchObject({ read: 4, imported: 2, merged: 1 });
    expect(t.profiles.skipped).toEqual([expect.objectContaining({ reason: expect.stringMatching(/no email/) })]);
    const users = await sql<{ id: string; email: string; role: string; password_hash: string | null }>(
      "SELECT id, email, role, password_hash FROM users ORDER BY email"
    );
    expect(users.map((u) => u.email)).toEqual(["boot@example.com", "james@example.com", "theresa@example.com"]);
    expect(users.find((u) => u.email === "james@example.com")).toMatchObject({
      id: "aaaaaaaa-0000-4000-8000-000000000001",
      role: "admin",
      password_hash: null, // must have a password set before signing in
    });

    expect(t.horses).toMatchObject({ read: 3, imported: 2 });
    const [biscuit] = await sql<{ notes: string; active: number; barn: string }>(
      "SELECT notes, active, barn FROM horses WHERE name = 'Biscuit'"
    );
    expect(biscuit).toEqual({ notes: "Loves carrots\nand apples", active: 1, barn: "log-barn" });

    // One chart per horse: duplicate reported; orphan chart skipped.
    expect(t.feeding_charts.imported).toBe(1);
    expect(t.feeding_charts.skipped.map((s: { reason: string }) => s.reason)).toEqual([
      expect.stringMatching(/duplicate/),
      expect.stringMatching(/horse_id .* does not exist/),
    ]);
    expect(t.feeding_logs).toMatchObject({ imported: 1 });
    expect(t.feeding_logs.skipped[0].reason).toMatch(/duplicate/);

    // created_by pointed at the old ID of the bootstrapped admin → remapped.
    const [fence] = await sql<{ created_by: string; due_date: string; priority: string }>(
      "SELECT created_by, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date, priority FROM tasks WHERE title = 'Fix fence'"
    );
    expect(fence).toEqual({ created_by: bootAdminId, due_date: "2025-04-01", priority: "high" });
    expect(t.tasks.skipped[0].reason).toMatch(/invalid value "urgent"/);
    expect(t.tasks.warnings[0].warning).toMatch(/assigned_to .* set to NULL/);

    expect(t.shifts).toMatchObject({ imported: 1 });
    expect(t.shifts.skipped[0].reason).toMatch(/employee_id .* does not exist/);

    const [avail] = await sql<{ d: unknown }>("SELECT available_days AS d FROM availability");
    expect(typeof avail.d === "string" ? JSON.parse(avail.d) : avail.d).toEqual({ Mon: { start: "08:00", end: "17:00" } });

    const clock = await sql<{ t: string }>("SELECT DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s.%f') AS t FROM clock_logs ORDER BY created_at");
    expect(clock.map((c) => c.t.slice(0, 23))).toEqual(["2025-04-02 11:00:00.000", "2025-04-02 19:30:00.500"]);

    const [note] = await sql<{ created_by: string }>("SELECT created_by FROM admin_notes");
    expect(note.created_by).toBe(bootAdminId);
    expect(t.time_off_requests.imported).toBe(1);
    expect(t.announcements.imported).toBe(1);
  });

  it("is safe to run again: existing rows are left alone", async () => {
    const before = await sql<{ n: number }>("SELECT COUNT(*) AS n FROM tasks");
    const report = await importOnce();
    expect(report.tables.tasks.imported).toBe(0);
    expect(report.tables.tasks.alreadyPresent).toBe(2);
    expect(report.tables.horses.alreadyPresent).toBe(2);
    expect(await sql<{ n: number }>("SELECT COUNT(*) AS n FROM tasks")).toEqual(before);
  });
});
