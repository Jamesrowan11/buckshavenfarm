#!/usr/bin/env node
// One-time import of data exported from the old Supabase project.
//
//   npm run import:supabase -- --dir ./supabase-export --dry-run
//   npm run import:supabase -- --dir ./supabase-export
//
// Reads one file per table from --dir, named <table>.csv or <table>.json
// (CSV as exported by the Supabase table editor or psql \copy ... CSV HEADER;
// JSON as an array of row objects). Missing files are skipped. Tables:
//   profiles, horses, feeding_charts, feeding_logs, tasks, shifts,
//   availability, time_off_requests, announcements, clock_logs, admin_notes
//
// This never connects to Supabase and never modifies the old project. It only
// INSERTs into the Plesk database — existing rows are never updated or
// deleted — inside one transaction (--dry-run rolls it back at the end).
//
// Behaviour:
//   * Original UUIDs are kept, so relationships survive.
//   * A profile whose email already exists here (e.g. the admin created with
//     `npm run create-admin`) is merged: references to the old ID are
//     rewritten to the existing user's ID.
//   * Rows whose ID already exists are counted as "already present", so the
//     import can be re-run safely.
//   * Duplicate feeding charts (one per horse) and feeding logs (one per horse,
//     AM/PM and day) keep the first row and report the rest.
//   * Rows referencing a missing required record are skipped and reported;
//     a missing optional reference (e.g. a deleted assignee) is set to NULL
//     and reported as a warning.
//   * Imported users have NO password (Supabase password hashes are not
//     imported). An admin sets a password for each from /admin/employees, or
//     with `npm run set-password`.
// A full report is written to <dir>/import-report-<timestamp>.json.
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect, fail, loadEnv, parseArgs } from "./lib/cli.mjs";

// ---------- CSV ----------

/** RFC 4180 parser: quoted fields, escaped quotes, newlines inside quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let i = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1; // BOM
  for (; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => !(r.length === 1 && r[0] === ""));
  if (nonEmpty.length === 0) return [];
  const [header, ...data] = nonEmpty;
  return data.map((r) => Object.fromEntries(header.map((h, idx) => [h.trim(), r[idx] ?? ""])));
}

async function readTable(dir, table) {
  const csv = path.join(dir, `${table}.csv`);
  const json = path.join(dir, `${table}.json`);
  if (existsSync(json)) {
    const data = JSON.parse(await readFile(json, "utf8"));
    if (!Array.isArray(data)) throw new Error(`${table}.json must contain a JSON array of rows.`);
    return data;
  }
  if (existsSync(csv)) return parseCsv(await readFile(csv, "utf8"));
  return null;
}

// ---------- value conversion ----------

const isBlank = (v) => v === undefined || v === null || v === "";

export function toText(v) {
  return isBlank(v) ? null : String(v);
}

export function toBool(v, fallback = false) {
  if (isBlank(v)) return fallback;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["t", "true", "1", "yes"].includes(s)) return true;
  if (["f", "false", "0", "no"].includes(s)) return false;
  throw new Error(`invalid boolean "${v}"`);
}

/** Postgres timestamptz text → JS Date (UTC). */
export function toTimestamp(v) {
  if (isBlank(v)) return null;
  let s = String(v).trim().replace(" ", "T");
  s = s.replace(/([+-]\d{2})$/, "$1:00"); // "+00" → "+00:00"
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) s += "Z"; // no zone given → UTC
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid timestamp "${v}"`);
  return d;
}

export function toDate(v) {
  if (isBlank(v)) return null;
  const s = String(v).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`invalid date "${v}"`);
  return s;
}

export function toTime(v) {
  if (isBlank(v)) return null;
  const m = String(v).trim().match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) throw new Error(`invalid time "${v}"`);
  return `${m[1]}:${m[2]}:${m[3] ?? "00"}`;
}

export function toJson(v) {
  if (isBlank(v)) return "{}";
  const obj = typeof v === "string" ? JSON.parse(v) : v;
  return JSON.stringify(obj);
}

function oneOf(v, allowed, fallback) {
  if (isBlank(v)) return fallback;
  if (!allowed.includes(String(v))) throw new Error(`invalid value "${v}" (expected ${allowed.join("/")})`);
  return String(v);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function toId(v) {
  if (isBlank(v)) return null;
  const s = String(v).trim().toLowerCase();
  if (!UUID_RE.test(s)) throw new Error(`invalid UUID "${v}"`);
  return s;
}

// ---------- table definitions ----------
// ref: [column, referencedTable, required]

const TABLES = [
  {
    source: "profiles",
    target: "users",
    refs: [],
    map: (r) => ({
      id: toId(r.id),
      email: toText(r.email)?.trim().toLowerCase() ?? null,
      name: toText(r.name) ?? "",
      role: oneOf(r.role, ["admin", "employee"], "employee"),
      created_at: toTimestamp(r.created_at) ?? new Date(),
    }),
  },
  {
    source: "horses",
    target: "horses",
    refs: [],
    map: (r) => ({
      id: toId(r.id),
      name: toText(r.name) ?? "",
      notes: toText(r.notes),
      active: toBool(r.active, true),
      barn: isBlank(r.barn) ? null : oneOf(r.barn, ["log-barn", "arena-barn"], null),
      created_at: toTimestamp(r.created_at) ?? new Date(),
    }),
  },
  {
    source: "feeding_charts",
    target: "feeding_charts",
    refs: [
      ["horse_id", "horses", true],
      ["responsible_employee", "users", false],
    ],
    unique: (r) => `horse:${r.horse_id}`,
    uniqueSql: "SELECT CONCAT('horse:', horse_id) AS k FROM feeding_charts",
    map: (r) => ({
      id: toId(r.id),
      horse_id: toId(r.horse_id),
      am_feed: toText(r.am_feed),
      pm_feed: toText(r.pm_feed),
      supplements: toText(r.supplements),
      special_notes: toText(r.special_notes),
      responsible_employee: toId(r.responsible_employee),
      barn: isBlank(r.barn) ? null : oneOf(r.barn, ["log-barn", "arena-barn"], null),
      created_at: toTimestamp(r.created_at) ?? new Date(),
    }),
  },
  {
    source: "feeding_logs",
    target: "feeding_logs",
    refs: [
      ["chart_id", "feeding_charts", false],
      ["horse_id", "horses", false],
      ["employee_id", "users", false],
    ],
    unique: (r) => (r.horse_id ? `${r.horse_id}|${r.feeding_type}|${r.date}` : null),
    uniqueSql:
      "SELECT CONCAT(horse_id, '|', feeding_type, '|', DATE_FORMAT(date, '%Y-%m-%d')) AS k FROM feeding_logs WHERE horse_id IS NOT NULL",
    map: (r) => ({
      id: toId(r.id),
      chart_id: toId(r.chart_id),
      horse_id: toId(r.horse_id),
      employee_id: toId(r.employee_id),
      feeding_type: oneOf(r.feeding_type, ["AM", "PM"]),
      done: toBool(r.done, false),
      date: toDate(r.date) ?? (() => { throw new Error("missing date"); })(),
      created_at: toTimestamp(r.created_at) ?? new Date(),
    }),
  },
  {
    source: "tasks",
    target: "tasks",
    refs: [
      ["assigned_to", "users", false],
      ["created_by", "users", false],
    ],
    map: (r) => ({
      id: toId(r.id),
      title: toText(r.title) ?? "",
      notes: toText(r.notes),
      assigned_to: toId(r.assigned_to),
      created_by: toId(r.created_by),
      due_date: toDate(r.due_date),
      priority: oneOf(r.priority, ["low", "medium", "high"], "medium"),
      done: toBool(r.done, false),
      created_at: toTimestamp(r.created_at) ?? new Date(),
    }),
  },
  {
    source: "shifts",
    target: "shifts",
    refs: [["employee_id", "users", true]],
    map: (r) => ({
      id: toId(r.id),
      employee_id: toId(r.employee_id),
      date: toDate(r.date),
      start_time: toTime(r.start_time),
      end_time: toTime(r.end_time),
      notes: toText(r.notes),
      created_at: toTimestamp(r.created_at) ?? new Date(),
    }),
  },
  {
    source: "availability",
    target: "availability",
    refs: [["employee_id", "users", true]],
    map: (r) => ({
      id: toId(r.id),
      employee_id: toId(r.employee_id),
      week_start: toDate(r.week_start),
      available_days: toJson(r.available_days),
      notes: toText(r.notes),
      created_at: toTimestamp(r.created_at) ?? new Date(),
    }),
  },
  {
    source: "time_off_requests",
    target: "time_off_requests",
    refs: [
      ["employee_id", "users", true],
      ["reviewed_by", "users", false],
    ],
    map: (r) => ({
      id: toId(r.id),
      employee_id: toId(r.employee_id),
      start_date: toDate(r.start_date),
      end_date: toDate(r.end_date),
      reason: toText(r.reason),
      status: oneOf(r.status, ["pending", "approved", "denied"], "pending"),
      reviewed_by: toId(r.reviewed_by),
      created_at: toTimestamp(r.created_at) ?? new Date(),
    }),
  },
  {
    source: "announcements",
    target: "announcements",
    refs: [["created_by", "users", false]],
    map: (r) => ({
      id: toId(r.id),
      title: toText(r.title) ?? "",
      body: toText(r.body),
      created_by: toId(r.created_by),
      created_at: toTimestamp(r.created_at) ?? new Date(),
    }),
  },
  {
    source: "clock_logs",
    target: "clock_logs",
    refs: [["user_id", "users", true]],
    map: (r) => ({
      id: toId(r.id),
      user_id: toId(r.user_id),
      user_name: toText(r.user_name) ?? "",
      action: oneOf(r.action, ["in", "out"]),
      created_at: toTimestamp(r.created_at) ?? new Date(),
    }),
  },
  {
    source: "admin_notes",
    target: "admin_notes",
    refs: [["created_by", "users", false]],
    map: (r) => ({
      id: toId(r.id),
      title: toText(r.title) ?? "",
      body: toText(r.body),
      created_by: toId(r.created_by),
      created_at: toTimestamp(r.created_at) ?? new Date(),
    }),
  },
];

const REQUIRED_TEXT = { users: [], horses: ["name"], tasks: ["title"], announcements: ["title"], admin_notes: ["title"] };

// ---------- import ----------

export async function runImport(conn, dir, { log = console.log } = {}) {
  /** @type {Record<string, any>} */
  const report = { startedAt: new Date().toISOString(), dir, tables: {} };
  const ids = {}; // table → Set of ids present
  const idRemap = new Map(); // old user id → existing user id (merged by email)

  async function loadIds(table) {
    const [rows] = await conn.query(`SELECT id FROM \`${table}\``);
    ids[table] = new Set(rows.map((r) => r.id));
  }
  for (const t of new Set(TABLES.map((t) => t.target))) await loadIds(t);

  const [existingUsers] = await conn.query("SELECT id, email FROM users");
  const userByEmail = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u.id]));

  for (const def of TABLES) {
    const rows = await readTable(dir, def.source);
    const stats = { read: 0, imported: 0, alreadyPresent: 0, merged: 0, skipped: [], warnings: [] };
    report.tables[def.source] = stats;
    if (rows === null) {
      stats.missingFile = true;
      log(`  ${def.source.padEnd(18)} no export file — skipped`);
      continue;
    }

    let uniqueKeys = null;
    if (def.uniqueSql) {
      const [u] = await conn.query(def.uniqueSql);
      uniqueKeys = new Set(u.map((r) => r.k));
    }

    for (const raw of rows) {
      stats.read++;
      const rawId = raw?.id ?? null;
      let rec;
      try {
        rec = def.map(raw);
        if (!rec.id) throw new Error("missing id");
        for (const col of REQUIRED_TEXT[def.target] ?? []) {
          if (!rec[col]) throw new Error(`missing ${col}`);
        }
      } catch (err) {
        stats.skipped.push({ id: rawId, reason: err.message });
        continue;
      }

      if (def.target === "users") {
        if (!rec.email) {
          stats.skipped.push({ id: rec.id, reason: "profile has no email address; recreate this user manually" });
          continue;
        }
        const existing = userByEmail.get(rec.email);
        if (existing && existing !== rec.id) {
          idRemap.set(rec.id, existing);
          stats.merged++;
          continue;
        }
      }

      if (ids[def.target].has(rec.id)) {
        stats.alreadyPresent++;
        continue;
      }

      // Resolve references.
      let skip = null;
      for (const [col, refTable, required] of def.refs) {
        if (rec[col] == null) {
          if (required) skip = `missing ${col}`;
          continue;
        }
        if (refTable === "users" && idRemap.has(rec[col])) rec[col] = idRemap.get(rec[col]);
        if (!ids[refTable].has(rec[col])) {
          if (required) {
            skip = `${col} ${rec[col]} does not exist in ${refTable}`;
            break;
          }
          stats.warnings.push({ id: rec.id, warning: `${col} ${rec[col]} not found; set to NULL` });
          rec[col] = null;
        }
      }
      if (skip) {
        stats.skipped.push({ id: rec.id, reason: skip });
        continue;
      }

      if (def.unique) {
        const key = def.unique(rec);
        if (key && uniqueKeys.has(key)) {
          stats.skipped.push({ id: rec.id, reason: `duplicate of an existing ${def.target} row (${key})` });
          continue;
        }
        if (key) uniqueKeys.add(key);
      }

      const cols = Object.keys(rec);
      try {
        await conn.query(
          `INSERT INTO \`${def.target}\` (${cols.map((c) => `\`${c}\``).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
          cols.map((c) => rec[c])
        );
      } catch (err) {
        // A failed statement is rolled back by InnoDB; the transaction continues.
        stats.skipped.push({ id: rec.id, reason: `${err.code ?? "error"}: ${err.message}` });
        continue;
      }
      ids[def.target].add(rec.id);
      if (def.target === "users") userByEmail.set(rec.email, rec.id);
      stats.imported++;
    }

    log(
      `  ${def.source.padEnd(18)} read ${stats.read}, imported ${stats.imported}, already present ${stats.alreadyPresent}` +
        (stats.merged ? `, merged by email ${stats.merged}` : "") +
        `, skipped ${stats.skipped.length}` +
        (stats.warnings.length ? `, warnings ${stats.warnings.length}` : "")
    );
  }
  report.finishedAt = new Date().toISOString();
  return report;
}

async function main() {
  loadEnv();
  const args = parseArgs();
  if (typeof args.dir !== "string") throw new Error("Usage: npm run import:supabase -- --dir <export folder> [--dry-run]");
  const dir = path.resolve(args.dir);
  if (!existsSync(dir)) throw new Error(`Folder not found: ${dir}`);
  const dryRun = Boolean(args["dry-run"]);

  const conn = await connect();
  let report;
  try {
    await conn.beginTransaction();
    console.log(`Importing from ${dir}${dryRun ? " (dry run — nothing will be saved)" : ""}`);
    report = await runImport(conn, dir);
    if (dryRun) {
      await conn.rollback();
      console.log("Dry run complete; all changes rolled back.");
    } else {
      await conn.commit();
      console.log("Import committed.");
    }
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    await conn.end();
  }
  report.dryRun = dryRun;
  const file = path.join(dir, `import-report-${Date.now()}-${randomUUID().slice(0, 8)}.json`);
  await writeFile(file, JSON.stringify(report, null, 2));
  const problems = Object.values(report.tables).reduce((n, t) => n + t.skipped.length + t.warnings.length, 0);
  console.log(`Report written to ${file}${problems ? ` (${problems} skipped/warning entries — review it)` : ""}.`);
  console.log("Imported users have no password yet: set one for each in /admin/employees or with `npm run set-password`.");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch(fail);
