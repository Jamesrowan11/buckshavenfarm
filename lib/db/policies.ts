// Who may read and change what. These are the same rules the app had as
// Supabase row-level security policies (supabase/schema.sql, now removed),
// enforced here on every query instead. Self-service profile edits are
// narrower than before: people may change only their own name.

export type Me = { id: string; role: "admin" | "employee"; email: string; name: string } | null;
export type Cond = { sql: string; params: unknown[] };

const ALL: Cond = { sql: "TRUE", params: [] };
const NONE: Cond = { sql: "FALSE", params: [] };
const isAdmin = (me: Me) => me?.role === "admin";
const own = (me: Me, col: string): Cond => (me ? { sql: `t.${col} = ?`, params: [me.id] } : NONE);

type Row = Record<string, unknown>;
export type Policy = {
  /** Rows the user may read. */
  select(me: Me): Cond;
  /** Whether the user may insert this row. */
  insert(me: Me, row: Row): boolean;
  /** Rows the user may update, and whether the new values are allowed. */
  update(me: Me): Cond;
  updateCheck(me: Me, changes: Row): boolean;
  /** Rows the user may delete. */
  delete(me: Me): Cond;
};

const adminOnlyWrite = (select: (me: Me) => Cond): Policy => ({
  select,
  insert: (me) => isAdmin(me),
  update: (me) => (isAdmin(me) ? ALL : NONE),
  updateCheck: (me) => isAdmin(me),
  delete: (me) => (isAdmin(me) ? ALL : NONE),
});

const ownOrAdmin = (col: string) => (me: Me) => (isAdmin(me) ? ALL : own(me, col));

export const POLICIES: Record<string, Policy> = {
  profiles: {
    select: () => ALL,
    insert: (me) => isAdmin(me),
    update: (me) => (isAdmin(me) ? ALL : own(me, "id")),
    updateCheck: (me, changes) => isAdmin(me) || Object.keys(changes).every((k) => k === "name"),
    delete: (me) => (isAdmin(me) ? ALL : NONE),
  },
  tasks: {
    select: (me) => (me ? ALL : NONE),
    insert: (me) => isAdmin(me),
    update: (me) => (isAdmin(me) ? ALL : own(me, "assigned_to")),
    updateCheck: (me, changes) => isAdmin(me) || !("assigned_to" in changes) || changes.assigned_to === me?.id,
    delete: (me) => (isAdmin(me) ? ALL : NONE),
  },
  shifts: adminOnlyWrite(ownOrAdmin("employee_id")),
  availability: {
    select: ownOrAdmin("employee_id"),
    insert: (me, row) => isAdmin(me) || (!!me && row.employee_id === me.id),
    update: ownOrAdmin("employee_id"),
    updateCheck: (me, changes) => isAdmin(me) || !("employee_id" in changes) || changes.employee_id === me?.id,
    delete: ownOrAdmin("employee_id"),
  },
  time_off_requests: {
    select: ownOrAdmin("employee_id"),
    insert: (me, row) => isAdmin(me) || (!!me && row.employee_id === me.id),
    update: (me) => (isAdmin(me) ? ALL : NONE),
    updateCheck: (me) => isAdmin(me),
    delete: (me) => (isAdmin(me) ? ALL : NONE),
  },
  // The public barn display reads these without logging in.
  horses: adminOnlyWrite(() => ALL),
  feeding_charts: adminOnlyWrite(() => ALL),
  announcements: adminOnlyWrite(() => ALL),
  feeding_logs: {
    select: () => ALL,
    insert: (me) => !!me,
    update: (me) => (me ? ALL : NONE),
    updateCheck: (me) => !!me,
    delete: (me) => (isAdmin(me) ? ALL : NONE),
  },
  clock_logs: {
    select: ownOrAdmin("user_id"),
    insert: (me, row) => isAdmin(me) || (!!me && row.user_id === me.id),
    update: (me) => (isAdmin(me) ? ALL : NONE),
    updateCheck: (me) => isAdmin(me),
    delete: (me) => (isAdmin(me) ? ALL : NONE),
  },
  admin_notes: adminOnlyWrite((me) => (isAdmin(me) ? ALL : NONE)),
};

/** Columns each table exposes (never password hashes or session data). */
export const COLUMNS: Record<string, string[]> = {
  profiles: ["id", "name", "email", "role", "created_at"],
  tasks: ["id", "title", "notes", "assigned_to", "created_by", "due_date", "priority", "done", "created_at"],
  shifts: ["id", "employee_id", "date", "start_time", "end_time", "notes", "created_at"],
  availability: ["id", "employee_id", "week_start", "available_days", "notes", "created_at"],
  time_off_requests: ["id", "employee_id", "start_date", "end_date", "reason", "status", "reviewed_by", "created_at"],
  horses: ["id", "name", "notes", "active", "barn", "created_at"],
  feeding_charts: ["id", "horse_id", "am_feed", "pm_feed", "supplements", "special_notes", "responsible_employee", "barn", "created_at"],
  feeding_logs: ["id", "chart_id", "horse_id", "employee_id", "feeding_type", "done", "date", "created_at"],
  announcements: ["id", "title", "body", "created_by", "created_at"],
  clock_logs: ["id", "user_id", "user_name", "action", "created_at"],
  admin_notes: ["id", "title", "body", "created_by", "created_at"],
};

/** JSON columns (stored as text, parsed on read). */
export const JSON_COLUMNS: Record<string, string[]> = { availability: ["available_days"] };
