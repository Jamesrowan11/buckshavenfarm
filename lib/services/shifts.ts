// Work schedule (shifts).
import "server-only";
import { randomUUID } from "node:crypto";
import { execute, query, toIso } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { assertAdmin, assertSignedIn, type Actor } from "@/lib/auth/authorize";
import { calendarDate, optionalText, parse, timeOfDay, uuid } from "@/lib/validation";
import type { ShiftWithEmployee } from "@/lib/types";

type ShiftRow = Omit<ShiftWithEmployee, "created_at" | "employee_name"> & {
  created_at: Date;
  employee_name?: string | null;
};

function toShift(r: ShiftRow): ShiftWithEmployee {
  return {
    id: r.id,
    employee_id: r.employee_id,
    date: r.date,
    start_time: r.start_time,
    end_time: r.end_time,
    notes: r.notes,
    created_at: toIso(r.created_at),
    employee_name: r.employee_name ?? null,
  };
}

const SELECT = `SELECT s.id, s.employee_id, s.date, s.start_time, s.end_time, s.notes, s.created_at,
                       u.name AS employee_name
                  FROM shifts s LEFT JOIN users u ON u.id = s.employee_id`;

/** All shifts between two dates (inclusive), for the admin schedule. */
export async function listShiftsBetween(actor: Actor, start: string, end: string): Promise<ShiftWithEmployee[]> {
  assertAdmin(actor);
  const rows = await query<ShiftRow>(
    `${SELECT} WHERE s.date BETWEEN ? AND ? ORDER BY s.date, s.start_time`,
    [parse(calendarDate, start), parse(calendarDate, end)]
  );
  return rows.map(toShift);
}

/** The signed-in employee's own shifts between two dates (inclusive). */
export async function listMyShiftsBetween(actor: Actor, start: string, end: string): Promise<ShiftWithEmployee[]> {
  assertSignedIn(actor);
  const rows = await query<ShiftRow>(
    `${SELECT} WHERE s.employee_id = ? AND s.date BETWEEN ? AND ? ORDER BY s.date, s.start_time`,
    [actor.id, parse(calendarDate, start), parse(calendarDate, end)]
  );
  return rows.map(toShift);
}

export async function createShift(
  actor: Actor,
  input: { employee_id: string; date: string; start_time: string; end_time: string; notes?: string }
): Promise<string> {
  assertAdmin(actor);
  const employeeId = parse(uuid, input.employee_id);
  const date = parse(calendarDate, input.date);
  const start = parse(timeOfDay, input.start_time);
  const end = parse(timeOfDay, input.end_time);
  if (!start || !end) throw new ValidationError("Start and end times are required.");
  const id = randomUUID();
  // An end earlier than the start is an overnight shift, which the old app
  // also allowed, so it is not rejected here.
  await execute(
    "INSERT INTO shifts (id, employee_id, date, start_time, end_time, notes) VALUES (?, ?, ?, ?, ?, ?)",
    [id, employeeId, date, start, end, optionalText(input.notes)]
  );
  return id;
}

export async function deleteShift(actor: Actor, shiftId: string): Promise<void> {
  assertAdmin(actor);
  await execute("DELETE FROM shifts WHERE id = ?", [parse(uuid, shiftId)]);
}
