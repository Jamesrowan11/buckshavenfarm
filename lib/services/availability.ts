// Weekly availability submissions.
import "server-only";
import { randomUUID } from "node:crypto";
import { execute, parseJson, query, toIso } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { assertAdmin, assertSignedIn, type Actor } from "@/lib/auth/authorize";
import { calendarDate, optionalText, parse, timeOfDay } from "@/lib/validation";
import type { Availability, AvailabilityWithEmployee } from "@/lib/types";

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
type Days = Availability["available_days"];

type AvailabilityRow = Omit<AvailabilityWithEmployee, "created_at" | "available_days" | "employee_name"> & {
  created_at: Date;
  available_days: unknown;
  employee_name?: string | null;
};

function toAvailability(r: AvailabilityRow): AvailabilityWithEmployee {
  return {
    id: r.id,
    employee_id: r.employee_id,
    week_start: r.week_start,
    available_days: parseJson<Days>(r.available_days, {}),
    notes: r.notes,
    created_at: toIso(r.created_at),
    employee_name: r.employee_name ?? null,
  };
}

/** Builds the available_days object from day → {start, end} 'HH:MM' strings. */
export function normalizeDays(input: Record<string, { start?: string; end?: string }>): Days {
  const out: Days = {};
  for (const day of DAYS) {
    const v = input[day];
    if (!v) continue;
    const start = v.start ? parse(timeOfDay, v.start).slice(0, 5) : undefined;
    const end = v.end ? parse(timeOfDay, v.end).slice(0, 5) : undefined;
    if (start || end) out[day] = { start, end };
  }
  for (const key of Object.keys(input)) {
    if (!(DAYS as readonly string[]).includes(key)) throw new ValidationError("Unknown day of week.");
  }
  return out;
}

export async function submitAvailability(
  actor: Actor,
  input: { week_start: string; days: Record<string, { start?: string; end?: string }>; notes?: string }
): Promise<string> {
  assertSignedIn(actor);
  const id = randomUUID();
  await execute(
    "INSERT INTO availability (id, employee_id, week_start, available_days, notes) VALUES (?, ?, ?, ?, ?)",
    [
      id,
      actor.id,
      parse(calendarDate, input.week_start),
      JSON.stringify(normalizeDays(input.days)),
      optionalText(input.notes),
    ]
  );
  return id;
}

export async function listMyAvailability(actor: Actor, limit = 8): Promise<AvailabilityWithEmployee[]> {
  assertSignedIn(actor);
  const rows = await query<AvailabilityRow>(
    `SELECT id, employee_id, week_start, available_days, notes, created_at
       FROM availability WHERE employee_id = ? ORDER BY week_start DESC, created_at DESC LIMIT ?`,
    [actor.id, limit]
  );
  return rows.map(toAvailability);
}

export async function listRecentAvailability(actor: Actor, limit = 20): Promise<AvailabilityWithEmployee[]> {
  assertAdmin(actor);
  const rows = await query<AvailabilityRow>(
    `SELECT a.id, a.employee_id, a.week_start, a.available_days, a.notes, a.created_at, u.name AS employee_name
       FROM availability a LEFT JOIN users u ON u.id = a.employee_id
      ORDER BY a.week_start DESC, a.created_at DESC LIMIT ?`,
    [limit]
  );
  return rows.map(toAvailability);
}
