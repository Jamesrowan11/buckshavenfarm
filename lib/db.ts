// Server-only MySQL / MariaDB access. Importing this from a Client Component
// fails the build ("server-only"), so credentials can never reach the browser.
import "server-only";
import mysql, {
  type Pool,
  type PoolConnection,
  type QueryValues,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";
import { readDbConfig, toMysqlOptions } from "@/lib/shared/db-config.mjs";
import { ConflictError, DatabaseUnavailableError, ValidationError } from "@/lib/errors";

export type Queryable = Pool | PoolConnection;
type Params = QueryValues;

// One pool per process; kept on globalThis so dev-mode hot reloads don't leak
// connections.
const globalForDb = globalThis as unknown as { __bhfPool?: Pool };

export function getPool(): Pool {
  if (!globalForDb.__bhfPool) {
    const pool = mysql.createPool(toMysqlOptions(readDbConfig()));
    // Every connection runs in UTC so CURRENT_TIMESTAMP matches the UTC
    // values the app writes and reads.
    pool.on("connection", (conn) => {
      conn.query("SET time_zone = '+00:00'");
    });
    globalForDb.__bhfPool = pool;
  }
  return globalForDb.__bhfPool;
}

/** Closes the pool (tests and graceful shutdown). */
export async function closePool(): Promise<void> {
  const pool = globalForDb.__bhfPool;
  globalForDb.__bhfPool = undefined;
  if (pool) await pool.end();
}

const UNAVAILABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "PROTOCOL_CONNECTION_LOST",
  "PROTOCOL_SEQUENCE_TIMEOUT",
  "ER_ACCESS_DENIED_ERROR",
  "ER_DBACCESS_DENIED_ERROR",
  "ER_BAD_DB_ERROR",
  "ER_CON_COUNT_ERROR",
  "ER_TOO_MANY_USER_CONNECTIONS",
  "ER_SERVER_SHUTDOWN",
]);

/**
 * Converts driver errors into AppErrors with safe messages. The original
 * error is logged server-side (code and message only — never the SQL
 * parameters, which can contain password hashes).
 */
export function translateDbError(err: unknown): unknown {
  const e = err as { code?: string; errno?: number; message?: string; name?: string };
  if (e?.name === "DbConfigError") {
    console.error(`[db] configuration error: ${e.message}`);
    return new DatabaseUnavailableError();
  }
  if (!e?.code) return err;
  if (UNAVAILABLE_CODES.has(e.code)) {
    console.error(`[db] unavailable: ${e.code}`);
    return new DatabaseUnavailableError();
  }
  if (e.code === "ER_DUP_ENTRY") return new ConflictError();
  if (e.code === "ER_NO_REFERENCED_ROW_2" || e.code === "ER_NO_REFERENCED_ROW") {
    return new ValidationError("A selected record no longer exists.");
  }
  if (e.code === "ER_CHECK_CONSTRAINT_VIOLATED" || e.code === "ER_CONSTRAINT_FAILED") {
    return new ValidationError();
  }
  if (e.code === "ER_DATA_TOO_LONG") return new ValidationError("A value is too long.");
  console.error(`[db] query failed: ${e.code} ${e.message ?? ""}`);
  return err;
}

/** Runs a parameterized query and returns the rows. */
export async function query<T = RowDataPacket>(
  sql: string,
  params: Params = [],
  db?: Queryable
): Promise<T[]> {
  try {
    const [rows] = await (db ?? getPool()).query<RowDataPacket[]>(sql, params);
    return rows as T[];
  } catch (err) {
    throw translateDbError(err);
  }
}

/** Runs a parameterized query and returns the first row, or null. */
export async function queryOne<T = RowDataPacket>(
  sql: string,
  params: Params = [],
  db?: Queryable
): Promise<T | null> {
  const rows = await query<T>(sql, params, db);
  return rows[0] ?? null;
}

/** Runs an INSERT / UPDATE / DELETE and returns the result header. */
export async function execute(
  sql: string,
  params: Params = [],
  db?: Queryable
): Promise<ResultSetHeader> {
  try {
    const [result] = await (db ?? getPool()).query<ResultSetHeader>(sql, params);
    return result;
  } catch (err) {
    throw translateDbError(err);
  }
}

/**
 * Runs `fn` inside a transaction on a dedicated connection. Commits when it
 * resolves, rolls back when it throws (and rethrows).
 */
export async function withTransaction<T>(fn: (tx: PoolConnection) => Promise<T>): Promise<T> {
  let conn: PoolConnection;
  try {
    conn = await getPool().getConnection();
  } catch (err) {
    throw translateDbError(err);
  }
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // Connection already broken; the pool discards it on release.
    }
    throw translateDbError(err);
  } finally {
    conn.release();
  }
}

/** Lightweight connectivity check for the health endpoint. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await query("SELECT 1 AS ok");
    return true;
  } catch {
    return false;
  }
}

// ---------- row helpers ----------

export function toIso(value: Date | string | null | undefined): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  // DATETIME as string 'YYYY-MM-DD HH:MM:SS(.fff)' in UTC.
  return new Date(value.replace(" ", "T") + (value.endsWith("Z") ? "" : "Z")).toISOString();
}

export function toBool(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

/** MySQL returns JSON columns parsed; MariaDB returns them as strings. */
export function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}
