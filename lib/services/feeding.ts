// Horses, feeding charts and daily feeding logs (and the public barn display).
import "server-only";
import { randomUUID } from "node:crypto";
import { execute, query, queryOne, toBool, toIso, withTransaction } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { assertAdmin, assertSignedIn, type Actor } from "@/lib/auth/authorize";
import { todayLocal } from "@/lib/time";
import {
  barn as barnSchema,
  feedingType as feedingTypeSchema,
  optionalText,
  parse,
  requiredText,
  uuid,
} from "@/lib/validation";
import type { Barn, FeedingChartWithResponsible, FeedingLog, Horse } from "@/lib/types";

type HorseRow = Omit<Horse, "active" | "created_at"> & { active: number; created_at: Date };
type ChartRow = Omit<FeedingChartWithResponsible, "created_at"> & { created_at: Date };
type LogRow = Omit<FeedingLog, "done" | "created_at"> & { done: number; created_at: Date };

function toHorse(r: HorseRow): Horse {
  return {
    id: r.id,
    name: r.name,
    notes: r.notes,
    active: toBool(r.active),
    barn: r.barn,
    created_at: toIso(r.created_at),
  };
}

function toChart(r: ChartRow): FeedingChartWithResponsible {
  return {
    id: r.id,
    horse_id: r.horse_id,
    am_feed: r.am_feed,
    pm_feed: r.pm_feed,
    supplements: r.supplements,
    special_notes: r.special_notes,
    responsible_employee: r.responsible_employee,
    barn: r.barn,
    created_at: toIso(r.created_at),
    responsible_name: r.responsible_name ?? null,
  };
}

function toLog(r: LogRow): FeedingLog {
  return {
    id: r.id,
    chart_id: r.chart_id,
    horse_id: r.horse_id,
    employee_id: r.employee_id,
    feeding_type: r.feeding_type,
    done: toBool(r.done),
    date: r.date,
    created_at: toIso(r.created_at),
  };
}

const HORSE_COLUMNS = "id, name, notes, active, barn, created_at";
const CHART_SELECT = `SELECT c.id, c.horse_id, c.am_feed, c.pm_feed, c.supplements, c.special_notes,
                             c.responsible_employee, c.barn, c.created_at, u.name AS responsible_name
                        FROM feeding_charts c LEFT JOIN users u ON u.id = c.responsible_employee`;

// ---------- reads (no actor: also used by the public barn display) ----------

async function readActiveHorses(barn?: Barn): Promise<Horse[]> {
  const rows = barn
    ? await query<HorseRow>(`SELECT ${HORSE_COLUMNS} FROM horses WHERE active = TRUE AND barn = ? ORDER BY name`, [barn])
    : await query<HorseRow>(`SELECT ${HORSE_COLUMNS} FROM horses WHERE active = TRUE ORDER BY name`);
  return rows.map(toHorse);
}

async function readCharts(): Promise<FeedingChartWithResponsible[]> {
  return (await query<ChartRow>(CHART_SELECT)).map(toChart);
}

async function readLogsForDate(date: string): Promise<FeedingLog[]> {
  const rows = await query<LogRow>(
    `SELECT id, chart_id, horse_id, employee_id, feeding_type, done, date, created_at
       FROM feeding_logs WHERE date = ?`,
    [date]
  );
  return rows.map(toLog);
}

// ---------- admin ----------

export async function listAllHorses(actor: Actor): Promise<Horse[]> {
  assertAdmin(actor);
  return (await query<HorseRow>(`SELECT ${HORSE_COLUMNS} FROM horses ORDER BY name`)).map(toHorse);
}

export async function listCharts(actor: Actor): Promise<FeedingChartWithResponsible[]> {
  assertAdmin(actor);
  return readCharts();
}

export async function createHorse(actor: Actor, input: { name: string; notes?: string }): Promise<string> {
  assertAdmin(actor);
  const id = randomUUID();
  await execute("INSERT INTO horses (id, name, notes) VALUES (?, ?, ?)", [
    id,
    requiredText(input.name, "Horse name", 200),
    optionalText(input.notes),
  ]);
  return id;
}

/** Removes a horse; its chart and feeding logs are deleted with it (FK cascade). */
export async function deleteHorse(actor: Actor, horseId: string): Promise<void> {
  assertAdmin(actor);
  await execute("DELETE FROM horses WHERE id = ?", [parse(uuid, horseId)]);
}

/**
 * Creates or updates a horse's feeding chart and keeps horses.barn in sync
 * with the chart's barn, in one transaction.
 */
export async function saveFeedingChart(
  actor: Actor,
  horseId: string,
  input: {
    am_feed?: string;
    pm_feed?: string;
    supplements?: string;
    special_notes?: string;
    responsible_employee?: string;
    barn?: string;
  }
): Promise<string> {
  assertAdmin(actor);
  const hid = parse(uuid, horseId);
  // Unknown barn values clear the assignment, as before.
  const barnResult = barnSchema.safeParse(input.barn);
  const barn: Barn | null = barnResult.success ? barnResult.data : null;
  const values = {
    am_feed: optionalText(input.am_feed),
    pm_feed: optionalText(input.pm_feed),
    supplements: optionalText(input.supplements),
    special_notes: optionalText(input.special_notes),
    responsible_employee: input.responsible_employee ? parse(uuid, input.responsible_employee) : null,
    barn,
  };

  return withTransaction(async (tx) => {
    const horse = await queryOne<{ id: string }>("SELECT id FROM horses WHERE id = ? FOR UPDATE", [hid], tx);
    if (!horse) throw new NotFoundError();
    const existing = await queryOne<{ id: string }>("SELECT id FROM feeding_charts WHERE horse_id = ?", [hid], tx);
    let chartId: string;
    if (existing) {
      chartId = existing.id;
      await execute(
        `UPDATE feeding_charts SET am_feed = ?, pm_feed = ?, supplements = ?, special_notes = ?,
                responsible_employee = ?, barn = ? WHERE id = ?`,
        [
          values.am_feed,
          values.pm_feed,
          values.supplements,
          values.special_notes,
          values.responsible_employee,
          values.barn,
          chartId,
        ],
        tx
      );
    } else {
      chartId = randomUUID();
      await execute(
        `INSERT INTO feeding_charts (id, horse_id, am_feed, pm_feed, supplements, special_notes, responsible_employee, barn)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          chartId,
          hid,
          values.am_feed,
          values.pm_feed,
          values.supplements,
          values.special_notes,
          values.responsible_employee,
          values.barn,
        ],
        tx
      );
    }
    await execute("UPDATE horses SET barn = ? WHERE id = ?", [barn, hid], tx);
    return chartId;
  });
}

// ---------- employees ----------

export async function getFeedingDay(actor: Actor, date: string = todayLocal()) {
  assertSignedIn(actor);
  const [horses, charts, logs] = await Promise.all([readActiveHorses(), readCharts(), readLogsForDate(date)]);
  return { date, horses, charts, logs };
}

/** Marks a horse's AM/PM feeding done or not done for today (atomic upsert). */
export async function setFeedingDone(
  actor: Actor,
  horseId: string,
  type: string,
  done: boolean,
  date: string = todayLocal()
): Promise<void> {
  assertSignedIn(actor);
  const hid = parse(uuid, horseId);
  const feedingType = parse(feedingTypeSchema, type);
  const horse = await queryOne<{ chart_id: string | null }>(
    "SELECT (SELECT id FROM feeding_charts WHERE horse_id = h.id) AS chart_id FROM horses h WHERE h.id = ?",
    [hid]
  );
  if (!horse) throw new NotFoundError();
  await execute(
    `INSERT INTO feeding_logs (id, chart_id, horse_id, employee_id, feeding_type, done, date)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE done = VALUES(done), employee_id = VALUES(employee_id)`,
    [randomUUID(), horse.chart_id, hid, actor.id, feedingType, Boolean(done), date]
  );
}

// ---------- public barn display ----------

export type BarnDisplayData = {
  date: string;
  horses: { id: string; name: string; notes: string | null; barn: Barn | null }[];
  charts: {
    horse_id: string;
    am_feed: string | null;
    pm_feed: string | null;
    supplements: string | null;
    special_notes: string | null;
    responsible_name: string | null;
  }[];
  logs: { horse_id: string | null; feeding_type: "AM" | "PM"; done: boolean }[];
  announcements: { id: string; title: string; body: string | null; created_at: string }[];
};

/**
 * Everything the unauthenticated barn TV screens show. Returns only the
 * fields that are displayed (no emails, no employee IDs).
 */
export async function getBarnDisplayData(barnFilter?: string | null): Promise<BarnDisplayData> {
  const parsed = barnFilter ? barnSchema.safeParse(barnFilter) : null;
  const barn = parsed?.success ? parsed.data : undefined;
  const date = todayLocal();
  const [horses, charts, logs, announcements] = await Promise.all([
    readActiveHorses(barn),
    readCharts(),
    readLogsForDate(date),
    query<{ id: string; title: string; body: string | null; created_at: Date }>(
      "SELECT id, title, body, created_at FROM announcements ORDER BY created_at DESC LIMIT 3"
    ),
  ]);
  const horseIds = new Set(horses.map((h) => h.id));
  return {
    date,
    horses: horses.map(({ id, name, notes, barn }) => ({ id, name, notes, barn })),
    charts: charts
      .filter((c) => horseIds.has(c.horse_id))
      .map((c) => ({
        horse_id: c.horse_id,
        am_feed: c.am_feed,
        pm_feed: c.pm_feed,
        supplements: c.supplements,
        special_notes: c.special_notes,
        responsible_name: c.responsible_name,
      })),
    logs: logs
      .filter((l) => l.horse_id && horseIds.has(l.horse_id))
      .map((l) => ({ horse_id: l.horse_id, feeding_type: l.feeding_type, done: l.done })),
    announcements: announcements.map((a) => ({ ...a, created_at: toIso(a.created_at) })),
  };
}
