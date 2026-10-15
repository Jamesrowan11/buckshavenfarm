// Test database helpers. Integration tests only run when TEST_DATABASE_URL
// points at a disposable database whose name contains "test" — they wipe it.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import mysql from "mysql2/promise";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
export const hasTestDb = (() => {
  if (!TEST_DATABASE_URL) return false;
  const name = new URL(TEST_DATABASE_URL).pathname.slice(1);
  if (!/test/i.test(name)) {
    throw new Error(`Refusing to run tests against database "${name}": its name must contain "test".`);
  }
  return true;
})();

const ROOT = path.resolve(__dirname, "../..");

const TABLES = [
  "feeding_logs",
  "feeding_charts",
  "horses",
  "tasks",
  "shifts",
  "availability",
  "time_off_requests",
  "announcements",
  "clock_logs",
  "admin_notes",
  "sessions",
  "login_attempts",
  "users",
];

async function raw() {
  return mysql.createConnection({ uri: TEST_DATABASE_URL, timezone: "Z", multipleStatements: true });
}

/** Drops everything and applies the migrations from scratch via the real CLI. */
export async function resetSchema() {
  const conn = await raw();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const t of [...TABLES, "schema_migrations"]) await conn.query(`DROP TABLE IF EXISTS \`${t}\``);
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    await conn.end();
  }
  execFileSync(process.execPath, ["scripts/migrate.mjs"], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });
}

/** Empties every table (keeps the schema). */
export async function truncateAll() {
  const conn = await raw();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const t of TABLES) await conn.query(`TRUNCATE TABLE \`${t}\``);
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    await conn.end();
  }
}

export async function sql<T = Record<string, unknown>>(statement: string, params: unknown[] = []): Promise<T[]> {
  const conn = await raw();
  try {
    await conn.query("SET time_zone = '+00:00'");
    const [rows] = await conn.query(statement, params);
    return rows as T[];
  } finally {
    await conn.end();
  }
}

/** Points the app's DB module at the test database. Call before importing services. */
export function useTestDatabaseEnv() {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  for (const k of ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD", "DB_SOCKET"]) delete process.env[k];
  process.env.APP_TIME_ZONE = "America/New_York";
}

export type TestUser = { id: string; email: string; name: string; role: "admin" | "employee"; password: string };

/** Inserts a user with an Argon2id password hash. */
export async function createUser(
  role: "admin" | "employee",
  overrides: Partial<Pick<TestUser, "email" | "name" | "password">> = {}
): Promise<TestUser> {
  const { hashPassword } = await import("@/lib/shared/password.mjs");
  const id = randomUUID();
  const email = overrides.email ?? `${role}-${id.slice(0, 8)}@example.com`;
  const name = overrides.name ?? `${role === "admin" ? "Admin" : "Employee"} ${id.slice(0, 4)}`;
  const password = overrides.password ?? "test password 123";
  await sql("INSERT INTO users (id, email, name, role, password_hash) VALUES (?, ?, ?, ?, ?)", [
    id,
    email,
    name,
    role,
    await hashPassword(password),
  ]);
  return { id, email, name, role, password };
}

export const actorOf = (u: TestUser) => ({ id: u.id, email: u.email, name: u.name, role: u.role });
