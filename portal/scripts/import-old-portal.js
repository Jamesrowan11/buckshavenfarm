/*
 * One-time import from the previous portal's database (the version that ran
 * at buckshavenfarm.com before the website + portal: lowercase tables
 * profiles, horses, tasks, ...). Runs on every deploy but only does anything
 * when OLD_DATABASE_URL is set AND the new portal has no accounts yet. The old
 * database is only read, never changed, so it stays as a backup.
 *
 * Passwords carry over (both portals use bcrypt). Accounts that never set a
 * password get one at /portal/setup with the same setup code as before.
 *
 *   node scripts/import-old-portal.js
 */
const { PrismaClient } = require("@prisma/client");

const OLD_URL = process.env.OLD_DATABASE_URL;

const upper = (v, allowed, fallback) => {
  const u = String(v || "").toUpperCase().replace(/-/g, "_");
  return allowed.includes(u) ? u : fallback;
};
const day = (s) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
const bool = (v) => v === true || v === 1 || v === "1" || (typeof v === "bigint" && v === 1n);
const date = (v) => (v instanceof Date ? v : v ? new Date(v) : new Date());

async function main() {
  if (!OLD_URL) {
    console.log("import-old-portal: no OLD_DATABASE_URL, nothing to import.");
    return;
  }
  const db = new PrismaClient();
  const old = new PrismaClient({ datasourceUrl: OLD_URL });
  try {
    if ((await db.user.count()) > 0) {
      console.log("import-old-portal: the portal already has accounts, skipping.");
      return;
    }
    const [{ n }] = await old.$queryRawUnsafe(
      "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'profiles'",
    );
    if (Number(n) === 0) {
      console.log("import-old-portal: the old database has no portal tables, skipping.");
      return;
    }
    const q = (sql) => old.$queryRawUnsafe(sql);

    const profiles = await q("SELECT id, name, email, role, password_hash, created_at FROM profiles");
    const users = profiles.map((p) => ({
      id: p.id,
      name: p.name || p.email || "Unnamed",
      email: (p.email || `no-email-${p.id}@invalid.local`).toLowerCase(),
      passwordHash: p.password_hash || "",
      role: upper(p.role, ["ADMIN", "EMPLOYEE"], "EMPLOYEE"),
      active: Boolean(p.email),
      createdAt: date(p.created_at),
    }));
    const userIds = new Set(users.map((u) => u.id));
    const uid = (v) => (v && userIds.has(v) ? v : null);

    const horsesOld = await q("SELECT id, name, notes, active, barn, created_at FROM horses");
    const chartsOld = await q(
      "SELECT id, horse_id, am_feed, pm_feed, supplements, special_notes, responsible_employee, barn, created_at FROM feeding_charts ORDER BY created_at",
    );
    // The new portal has one feeding chart per horse: keep each horse's newest.
    const chartByHorse = new Map();
    for (const c of chartsOld) chartByHorse.set(c.horse_id, c);
    const horses = horsesOld.map((h) => ({
      id: h.id,
      name: h.name,
      notes: h.notes,
      active: bool(h.active),
      barn: upper(h.barn || chartByHorse.get(h.id)?.barn, ["LOG_BARN", "ARENA_BARN"], null),
      createdAt: date(h.created_at),
    }));
    const horseIds = new Set(horses.map((h) => h.id));
    const charts = [...chartByHorse.values()]
      .filter((c) => horseIds.has(c.horse_id))
      .map((c) => ({
        id: c.id,
        horseId: c.horse_id,
        amFeed: c.am_feed,
        pmFeed: c.pm_feed,
        supplements: c.supplements,
        specialNotes: c.special_notes,
        responsibleEmployeeId: uid(c.responsible_employee),
        createdAt: date(c.created_at),
      }));
    const chartIds = new Set(charts.map((c) => c.id));

    const logs = (
      await q("SELECT id, chart_id, horse_id, employee_id, feeding_type, done, DATE_FORMAT(date, '%Y-%m-%d') AS d, created_at FROM feeding_logs")
    )
      .filter((l) => l.horse_id && horseIds.has(l.horse_id))
      .map((l) => ({
        id: l.id,
        chartId: chartIds.has(l.chart_id) ? l.chart_id : null,
        horseId: l.horse_id,
        employeeId: uid(l.employee_id),
        feedingType: upper(l.feeding_type, ["AM", "PM"], "AM"),
        done: bool(l.done),
        date: day(l.d),
        createdAt: date(l.created_at),
      }));

    const tasks = (
      await q("SELECT id, title, notes, assigned_to, created_by, DATE_FORMAT(due_date, '%Y-%m-%d') AS due, priority, done, created_at FROM tasks")
    ).map((t) => ({
      id: t.id,
      title: t.title,
      notes: t.notes,
      assignedToId: uid(t.assigned_to),
      createdById: uid(t.created_by),
      dueDate: day(t.due),
      priority: upper(t.priority, ["LOW", "MEDIUM", "HIGH"], "MEDIUM"),
      done: bool(t.done),
      createdAt: date(t.created_at),
    }));

    const shifts = (
      await q(
        "SELECT id, employee_id, DATE_FORMAT(date, '%Y-%m-%d') AS d, TIME_FORMAT(start_time, '%H:%i') AS st, TIME_FORMAT(end_time, '%H:%i') AS et, notes, created_at FROM shifts",
      )
    )
      .filter((s) => uid(s.employee_id))
      .map((s) => ({
        id: s.id, employeeId: s.employee_id, date: day(s.d), startTime: s.st, endTime: s.et,
        notes: s.notes, createdAt: date(s.created_at),
      }));

    // One availability entry per person per week in the new portal: keep the newest.
    const availByKey = new Map();
    for (const a of await q(
      "SELECT id, employee_id, DATE_FORMAT(week_start, '%Y-%m-%d') AS w, available_days, notes, created_at FROM availability ORDER BY created_at",
    )) {
      if (uid(a.employee_id)) availByKey.set(`${a.employee_id}|${a.w}`, a);
    }
    const availability = [...availByKey.values()].map((a) => {
      let days = {};
      try {
        days = JSON.parse(a.available_days || "{}");
      } catch {
        days = {};
      }
      return { id: a.id, employeeId: a.employee_id, weekStart: day(a.w), availableDays: days, notes: a.notes, createdAt: date(a.created_at) };
    });

    const timeOff = (
      await q(
        "SELECT id, employee_id, DATE_FORMAT(start_date, '%Y-%m-%d') AS s, DATE_FORMAT(end_date, '%Y-%m-%d') AS e, reason, status, reviewed_by, created_at FROM time_off_requests",
      )
    )
      .filter((t) => uid(t.employee_id))
      .map((t) => ({
        id: t.id, employeeId: t.employee_id, startDate: day(t.s), endDate: day(t.e), reason: t.reason,
        status: upper(t.status, ["PENDING", "APPROVED", "DENIED"], "PENDING"), reviewedById: uid(t.reviewed_by),
        createdAt: date(t.created_at),
      }));

    const announcements = (await q("SELECT id, title, body, created_by, created_at FROM announcements")).map((a) => ({
      id: a.id, title: a.title, body: a.body, audience: "STAFF", createdById: uid(a.created_by), createdAt: date(a.created_at),
    }));
    const clockLogs = (await q("SELECT id, user_id, user_name, action, created_at FROM clock_logs"))
      .filter((c) => uid(c.user_id))
      .map((c) => ({
        id: c.id, userId: c.user_id, userName: c.user_name || "", action: upper(c.action, ["IN", "OUT"], "IN"),
        createdAt: date(c.created_at),
      }));
    const notes = (await q("SELECT id, title, body, created_by, created_at FROM admin_notes")).map((n) => ({
      id: n.id, title: n.title, body: n.body, createdById: uid(n.created_by), createdAt: date(n.created_at),
    }));

    await db.$transaction([
      db.user.createMany({ data: users }),
      db.horse.createMany({ data: horses }),
      db.feedingChart.createMany({ data: charts }),
      db.feedingLog.createMany({ data: logs }),
      db.task.createMany({ data: tasks }),
      db.shift.createMany({ data: shifts }),
      db.availability.createMany({ data: availability }),
      db.timeOffRequest.createMany({ data: timeOff }),
      db.announcement.createMany({ data: announcements }),
      db.clockLog.createMany({ data: clockLogs }),
      db.adminNote.createMany({ data: notes }),
    ]);
    console.log(
      `import-old-portal: imported ${users.length} accounts (${users.filter((u) => !u.passwordHash).length} still need a password), ` +
        `${horses.length} horses, ${charts.length} feeding charts, ${logs.length} feeding logs, ${tasks.length} tasks, ` +
        `${shifts.length} shifts, ${availability.length} availability weeks, ${timeOff.length} time-off requests, ` +
        `${announcements.length} announcements, ${clockLogs.length} clock entries, ${notes.length} admin notes.`,
    );
  } finally {
    await db.$disconnect();
    await old.$disconnect();
  }
}

main().catch((e) => {
  console.error("import-old-portal failed:", e);
  process.exit(1);
});
