// Clock-in / clock-out records.
import "server-only";
import { randomUUID } from "node:crypto";
import { execute, query, queryOne, toIso, withTransaction } from "@/lib/db";
import { assertAdmin, assertSignedIn, type Actor } from "@/lib/auth/authorize";
import { clockAction, parse } from "@/lib/validation";
import type { ClockLog } from "@/lib/types";

type Row = Omit<ClockLog, "created_at"> & { created_at: Date };
const toLog = (r: Row): ClockLog => ({ ...r, created_at: toIso(r.created_at) });
const COLUMNS = "id, user_id, user_name, action, created_at";

/**
 * Records a clock-in or clock-out for the signed-in user. Serialized per user
 * (row lock) so a double-tap can't record two clock-ins in a row: repeating
 * the current state is a no-op. Returns whether a record was written.
 */
export async function recordClock(actor: Actor, action: string): Promise<boolean> {
  assertSignedIn(actor);
  const act = parse(clockAction, action);
  return withTransaction(async (tx) => {
    const user = await queryOne<{ name: string; email: string }>(
      "SELECT name, email FROM users WHERE id = ? FOR UPDATE",
      [actor.id],
      tx
    );
    if (!user) return false;
    const last = await queryOne<{ action: "in" | "out" }>(
      "SELECT action FROM clock_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
      [actor.id],
      tx
    );
    if ((last?.action ?? "out") === act) return false;
    await execute(
      "INSERT INTO clock_logs (id, user_id, user_name, action, created_at) VALUES (?, ?, ?, ?, ?)",
      [randomUUID(), actor.id, user.name || user.email, act, new Date()],
      tx
    );
    return true;
  });
}

export async function listMyClockLogs(actor: Actor, limit = 20): Promise<ClockLog[]> {
  assertSignedIn(actor);
  const rows = await query<Row>(
    `SELECT ${COLUMNS} FROM clock_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    [actor.id, limit]
  );
  return rows.map(toLog);
}

export async function listClockLogs(actor: Actor, limit = 200): Promise<ClockLog[]> {
  assertAdmin(actor);
  const rows = await query<Row>(`SELECT ${COLUMNS} FROM clock_logs ORDER BY created_at DESC LIMIT ?`, [limit]);
  return rows.map(toLog);
}

export async function listClockLogsSince(actor: Actor, since: Date): Promise<ClockLog[]> {
  assertAdmin(actor);
  const rows = await query<Row>(
    `SELECT ${COLUMNS} FROM clock_logs WHERE created_at >= ? ORDER BY created_at DESC`,
    [since]
  );
  return rows.map(toLog);
}
