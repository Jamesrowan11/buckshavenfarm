// Time-off requests.
import "server-only";
import { randomUUID } from "node:crypto";
import { execute, query, toIso } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { assertAdmin, assertSignedIn, type Actor } from "@/lib/auth/authorize";
import { calendarDate, optionalText, parse, reviewStatus, uuid } from "@/lib/validation";
import type { TimeOffWithEmployee } from "@/lib/types";

type Row = Omit<TimeOffWithEmployee, "created_at" | "employee_name"> & {
  created_at: Date;
  employee_name?: string | null;
};

function toRequest(r: Row): TimeOffWithEmployee {
  return {
    id: r.id,
    employee_id: r.employee_id,
    start_date: r.start_date,
    end_date: r.end_date,
    reason: r.reason,
    status: r.status,
    reviewed_by: r.reviewed_by,
    created_at: toIso(r.created_at),
    employee_name: r.employee_name ?? null,
  };
}

const SELECT = `SELECT r.id, r.employee_id, r.start_date, r.end_date, r.reason, r.status, r.reviewed_by,
                       r.created_at, u.name AS employee_name
                  FROM time_off_requests r LEFT JOIN users u ON u.id = r.employee_id`;

export async function requestTimeOff(
  actor: Actor,
  input: { start_date: string; end_date: string; reason?: string }
): Promise<string> {
  assertSignedIn(actor);
  const start = parse(calendarDate, input.start_date);
  const end = parse(calendarDate, input.end_date);
  if (end < start) throw new ValidationError("The end date must be on or after the start date.");
  const id = randomUUID();
  await execute(
    "INSERT INTO time_off_requests (id, employee_id, start_date, end_date, reason) VALUES (?, ?, ?, ?, ?)",
    [id, actor.id, start, end, optionalText(input.reason)]
  );
  return id;
}

export async function listMyTimeOff(actor: Actor): Promise<TimeOffWithEmployee[]> {
  assertSignedIn(actor);
  const rows = await query<Row>(`${SELECT} WHERE r.employee_id = ? ORDER BY r.created_at DESC`, [actor.id]);
  return rows.map(toRequest);
}

/** All requests, ordered by status then start date (as before: approved, denied, pending). */
export async function listAllTimeOff(actor: Actor): Promise<TimeOffWithEmployee[]> {
  assertAdmin(actor);
  // Postgres ordered the text status alphabetically; FIELD() reproduces that.
  const rows = await query<Row>(
    `${SELECT} ORDER BY FIELD(r.status, 'approved', 'denied', 'pending'), r.start_date`
  );
  return rows.map(toRequest);
}

export async function listPendingTimeOff(actor: Actor): Promise<TimeOffWithEmployee[]> {
  assertAdmin(actor);
  const rows = await query<Row>(`${SELECT} WHERE r.status = 'pending' ORDER BY r.start_date`);
  return rows.map(toRequest);
}

export async function reviewTimeOff(actor: Actor, requestId: string, status: string): Promise<void> {
  assertAdmin(actor);
  const result = await execute("UPDATE time_off_requests SET status = ?, reviewed_by = ? WHERE id = ?", [
    parse(reviewStatus, status),
    actor.id,
    parse(uuid, requestId),
  ]);
  if (result.affectedRows === 0) throw new NotFoundError();
}
