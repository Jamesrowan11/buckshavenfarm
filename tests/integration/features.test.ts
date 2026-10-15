import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { actorOf, createUser, hasTestDb, resetSchema, sql, truncateAll, useTestDatabaseEnv, type TestUser } from "../helpers/db";

useTestDatabaseEnv();
const { closePool } = await import("@/lib/db");
const { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } = await import("@/lib/errors");
const tasks = await import("@/lib/services/tasks");
const shifts = await import("@/lib/services/shifts");
const availability = await import("@/lib/services/availability");
const timeOff = await import("@/lib/services/timeOff");
const feeding = await import("@/lib/services/feeding");
const announcements = await import("@/lib/services/announcements");
const notes = await import("@/lib/services/notes");
const clock = await import("@/lib/services/clock");
const users = await import("@/lib/services/users");
const { todayLocal } = await import("@/lib/time");

let admin: TestUser;
let alice: TestUser;
let bob: TestUser;
const A = () => actorOf(admin);
const AL = () => actorOf(alice);
const BO = () => actorOf(bob);
const missingId = "00000000-0000-4000-8000-000000000000";

describe.skipIf(!hasTestDb)("database-backed features (MariaDB)", () => {
  beforeAll(resetSchema);
  beforeEach(async () => {
    await truncateAll();
    admin = await createUser("admin", { name: "Ada Admin" });
    alice = await createUser("employee", { name: "Alice Worker" });
    bob = await createUser("employee", { name: "Bob Worker" });
  });
  afterAll(closePool);

  // ---------------------------------------------------------------- tasks
  describe("tasks", () => {
    it("admin creates, lists with assignee, toggles and deletes", async () => {
      const id = await tasks.createTask(A(), { title: "Muck stalls", assigned_to: alice.id, due_date: "2026-10-20", priority: "high" });
      await tasks.createTask(A(), { title: "No due date" });
      const list = await tasks.listAllTasks(A());
      expect(list.map((t) => t.title)).toEqual(["Muck stalls", "No due date"]); // NULL due dates last
      expect(list[0]).toMatchObject({ assignee_name: "Alice Worker", priority: "high", done: false, due_date: "2026-10-20" });
      expect(list[0].created_at).toMatch(/Z$/);
      await tasks.setTaskDone(A(), id, true);
      expect((await tasks.listAllTasks(A())).find((t) => t.id === id)!.done).toBe(true);
      await tasks.deleteTask(A(), id);
      expect(await tasks.listAllTasks(A())).toHaveLength(1);
    });

    it("employees see their own and unassigned tasks only", async () => {
      await tasks.createTask(A(), { title: "Alice's", assigned_to: alice.id });
      await tasks.createTask(A(), { title: "Bob's", assigned_to: bob.id });
      await tasks.createTask(A(), { title: "Everyone's" });
      expect((await tasks.listTasksForEmployee(AL())).map((t) => t.title).sort()).toEqual(["Alice's", "Everyone's"]);
      expect((await tasks.listMyOpenTasks(AL())).map((t) => t.title)).toEqual(["Alice's"]);
    });

    it("employees can complete/comment on their own or unassigned tasks, not someone else's", async () => {
      const mine = await tasks.createTask(A(), { title: "Mine", assigned_to: alice.id });
      const all = await tasks.createTask(A(), { title: "All" });
      const bobs = await tasks.createTask(A(), { title: "Bob's", assigned_to: bob.id });
      await tasks.setTaskDone(AL(), mine, true);
      await tasks.setTaskDone(AL(), all, true);
      await expect(tasks.setTaskDone(AL(), bobs, true)).rejects.toThrow(ForbiddenError);
      await expect(tasks.addTaskComment(AL(), bobs, "sneaky")).rejects.toThrow(ForbiddenError);
      const [row] = await sql<{ done: number; notes: string | null }>("SELECT done, notes FROM tasks WHERE id = ?", [bobs]);
      expect(row).toEqual({ done: 0, notes: null });
    });

    it("employees cannot create or delete tasks", async () => {
      const id = await tasks.createTask(A(), { title: "T" });
      await expect(tasks.createTask(AL(), { title: "x" })).rejects.toThrow(ForbiddenError);
      await expect(tasks.deleteTask(AL(), id)).rejects.toThrow(ForbiddenError);
      await expect(tasks.listAllTasks(AL())).rejects.toThrow(ForbiddenError);
    });

    it("concurrent comments are all kept (server-side append in a transaction)", async () => {
      const id = await tasks.createTask(A(), { title: "T", notes: "Original", assigned_to: alice.id });
      await Promise.all(Array.from({ length: 8 }, (_, i) => tasks.addTaskComment(AL(), id, `comment ${i}`)));
      const [{ notes: n }] = await sql<{ notes: string }>("SELECT notes FROM tasks WHERE id = ?", [id]);
      expect(n.startsWith("Original\n")).toBe(true);
      for (let i = 0; i < 8; i++) expect(n).toContain(`comment ${i}`);
    });

    it("validates input and IDs", async () => {
      await expect(tasks.createTask(A(), { title: "" })).rejects.toThrow(ValidationError);
      await expect(tasks.createTask(A(), { title: "x", priority: "urgent" })).rejects.toThrow(ValidationError);
      await expect(tasks.createTask(A(), { title: "x", due_date: "2026-02-30" })).rejects.toThrow(ValidationError);
      await expect(tasks.createTask(A(), { title: "x", assigned_to: missingId })).rejects.toThrow(ValidationError); // FK
      await expect(tasks.setTaskDone(A(), "not-a-uuid", true)).rejects.toThrow(ValidationError);
      await expect(tasks.setTaskDone(A(), missingId, true)).rejects.toThrow(NotFoundError);
      await expect(tasks.listAllTasks(null as never)).rejects.toThrow(UnauthorizedError);
    });
  });

  // --------------------------------------------------------------- shifts
  describe("schedule (shifts)", () => {
    it("admin creates and deletes shifts; employees see only their own", async () => {
      const id = await shifts.createShift(A(), { employee_id: alice.id, date: "2026-10-14", start_time: "07:00", end_time: "15:30", notes: "Barn" });
      await shifts.createShift(A(), { employee_id: bob.id, date: "2026-10-14", start_time: "06:00", end_time: "12:00" });
      const week = await shifts.listShiftsBetween(A(), "2026-10-12", "2026-10-18");
      expect(week.map((s) => s.employee_name)).toEqual(["Bob Worker", "Alice Worker"]); // ordered by start time
      expect(week[1]).toMatchObject({ date: "2026-10-14", start_time: "07:00:00", end_time: "15:30:00", notes: "Barn" });
      expect((await shifts.listMyShiftsBetween(AL(), "2026-10-12", "2026-10-18")).map((s) => s.id)).toEqual([id]);
      expect(await shifts.listMyShiftsBetween(AL(), "2026-10-15", "2026-10-18")).toHaveLength(0);
      await shifts.deleteShift(A(), id);
      expect(await shifts.listShiftsBetween(A(), "2026-10-12", "2026-10-18")).toHaveLength(1);
    });

    it("rejects non-admins, bad times and unknown employees", async () => {
      await expect(shifts.createShift(AL(), { employee_id: alice.id, date: "2026-10-14", start_time: "07:00", end_time: "08:00" })).rejects.toThrow(ForbiddenError);
      await expect(shifts.listShiftsBetween(AL(), "2026-10-12", "2026-10-18")).rejects.toThrow(ForbiddenError);
      await expect(shifts.createShift(A(), { employee_id: alice.id, date: "2026-10-14", start_time: "25:00", end_time: "08:00" })).rejects.toThrow(ValidationError);
      await expect(shifts.createShift(A(), { employee_id: missingId, date: "2026-10-14", start_time: "07:00", end_time: "08:00" })).rejects.toThrow(ValidationError);
    });
  });

  // --------------------------------------------------------- availability
  describe("availability", () => {
    it("employees submit their own; admin sees everyone's with names", async () => {
      await availability.submitAvailability(AL(), {
        week_start: "2026-10-19",
        days: { Mon: { start: "08:00", end: "17:00" }, Sat: { start: "06:00" } },
        notes: "Vet appt Tue",
      });
      await availability.submitAvailability(BO(), { week_start: "2026-10-19", days: {} });
      const mine = await availability.listMyAvailability(AL());
      expect(mine).toHaveLength(1);
      expect(mine[0].available_days).toEqual({ Mon: { start: "08:00", end: "17:00" }, Sat: { start: "06:00" } });
      const all = await availability.listRecentAvailability(A());
      expect(all.map((a) => a.employee_name).sort()).toEqual(["Alice Worker", "Bob Worker"]);
      await expect(availability.listRecentAvailability(AL())).rejects.toThrow(ForbiddenError);
    });

    it("rejects invalid days and times", async () => {
      await expect(availability.submitAvailability(AL(), { week_start: "2026-10-19", days: { Funday: { start: "08:00" } } })).rejects.toThrow(ValidationError);
      await expect(availability.submitAvailability(AL(), { week_start: "2026-10-19", days: { Mon: { start: "8am" } } })).rejects.toThrow(ValidationError);
      await expect(availability.submitAvailability(AL(), { week_start: "soon", days: {} })).rejects.toThrow(ValidationError);
    });
  });

  // ------------------------------------------------------------- time off
  describe("time-off requests", () => {
    it("employee requests, admin approves/denies, ordering matches the old app", async () => {
      const r1 = await timeOff.requestTimeOff(AL(), { start_date: "2026-11-01", end_date: "2026-11-03", reason: "Trip" });
      const r2 = await timeOff.requestTimeOff(BO(), { start_date: "2026-10-20", end_date: "2026-10-20" });
      expect(await timeOff.listMyTimeOff(AL())).toHaveLength(1);
      expect((await timeOff.listPendingTimeOff(A())).map((r) => r.id)).toEqual([r2, r1]);
      await timeOff.reviewTimeOff(A(), r1, "approved");
      const all = await timeOff.listAllTimeOff(A());
      expect(all.map((r) => r.status)).toEqual(["approved", "pending"]);
      expect(all[0]).toMatchObject({ reviewed_by: admin.id, employee_name: "Alice Worker" });
      await timeOff.reviewTimeOff(A(), r2, "denied");
      expect(await timeOff.listPendingTimeOff(A())).toHaveLength(0);
    });

    it("blocks employees from reviewing and validates dates/status", async () => {
      const id = await timeOff.requestTimeOff(AL(), { start_date: "2026-11-01", end_date: "2026-11-01" });
      await expect(timeOff.reviewTimeOff(AL(), id, "approved")).rejects.toThrow(ForbiddenError);
      await expect(timeOff.listAllTimeOff(BO())).rejects.toThrow(ForbiddenError);
      await expect(timeOff.reviewTimeOff(A(), id, "maybe")).rejects.toThrow(ValidationError);
      await expect(timeOff.reviewTimeOff(A(), missingId, "approved")).rejects.toThrow(NotFoundError);
      await expect(timeOff.requestTimeOff(AL(), { start_date: "2026-11-05", end_date: "2026-11-01" })).rejects.toThrow(ValidationError);
    });
  });

  // -------------------------------------------------------------- feeding
  describe("feeding charts, logs and barn display", () => {
    it("admin manages horses and charts; saving a chart syncs the horse's barn", async () => {
      const h = await feeding.createHorse(A(), { name: "Biscuit", notes: "Old guy" });
      const c1 = await feeding.saveFeedingChart(A(), h, { am_feed: "2 qt grain", responsible_employee: alice.id, barn: "log-barn" });
      const c2 = await feeding.saveFeedingChart(A(), h, { am_feed: "3 qt grain", pm_feed: "Hay", barn: "arena-barn" });
      expect(c2).toBe(c1); // updated in place: one chart per horse
      const [chart] = await feeding.listCharts(A());
      expect(chart).toMatchObject({ am_feed: "3 qt grain", pm_feed: "Hay", responsible_employee: null, barn: "arena-barn" });
      expect((await feeding.listAllHorses(A()))[0]).toMatchObject({ name: "Biscuit", barn: "arena-barn", active: true });
      await feeding.saveFeedingChart(A(), h, { barn: "nonsense" });
      expect((await feeding.listAllHorses(A()))[0].barn).toBeNull();
    });

    it("rolls back the whole chart save when part of it fails", async () => {
      const h = await feeding.createHorse(A(), { name: "Pepper" });
      await feeding.saveFeedingChart(A(), h, { am_feed: "before", barn: "log-barn" });
      await expect(
        feeding.saveFeedingChart(A(), h, { am_feed: "after", barn: "arena-barn", responsible_employee: missingId })
      ).rejects.toThrow(ValidationError);
      const [chart] = await feeding.listCharts(A());
      expect(chart.am_feed).toBe("before");
      expect((await feeding.listAllHorses(A()))[0].barn).toBe("log-barn");
    });

    it("employees mark feedings done/undone — one log per horse, type and day", async () => {
      const h = await feeding.createHorse(A(), { name: "Biscuit" });
      const chartId = await feeding.saveFeedingChart(A(), h, { am_feed: "grain" });
      await feeding.setFeedingDone(AL(), h, "AM", true);
      await feeding.setFeedingDone(BO(), h, "AM", false);
      await feeding.setFeedingDone(BO(), h, "AM", true);
      await Promise.all([feeding.setFeedingDone(AL(), h, "PM", true), feeding.setFeedingDone(BO(), h, "PM", true)]);
      const logs = await sql<{ feeding_type: string; done: number; employee_id: string; chart_id: string; date: string }>(
        "SELECT feeding_type, done, employee_id, chart_id, DATE_FORMAT(date, '%Y-%m-%d') AS date FROM feeding_logs ORDER BY feeding_type"
      );
      expect(logs).toHaveLength(2);
      expect(logs[0]).toMatchObject({ feeding_type: "AM", done: 1, employee_id: bob.id, chart_id: chartId, date: todayLocal() });
      const day = await feeding.getFeedingDay(AL());
      expect(day.logs.filter((l) => l.done)).toHaveLength(2);
      await expect(feeding.setFeedingDone(AL(), h, "NOON", true)).rejects.toThrow(ValidationError);
      await expect(feeding.setFeedingDone(AL(), missingId, "AM", true)).rejects.toThrow(NotFoundError);
    });

    it("employees cannot change horses or charts", async () => {
      const h = await feeding.createHorse(A(), { name: "Biscuit" });
      await expect(feeding.createHorse(AL(), { name: "x" })).rejects.toThrow(ForbiddenError);
      await expect(feeding.deleteHorse(AL(), h)).rejects.toThrow(ForbiddenError);
      await expect(feeding.saveFeedingChart(AL(), h, { am_feed: "x" })).rejects.toThrow(ForbiddenError);
    });

    it("deleting a horse removes its chart and logs", async () => {
      const h = await feeding.createHorse(A(), { name: "Biscuit" });
      await feeding.saveFeedingChart(A(), h, { am_feed: "x" });
      await feeding.setFeedingDone(AL(), h, "AM", true);
      await feeding.deleteHorse(A(), h);
      expect(await sql("SELECT * FROM feeding_charts")).toHaveLength(0);
      expect(await sql("SELECT * FROM feeding_logs")).toHaveLength(0);
    });

    it("barn display filters by barn and exposes only displayed fields", async () => {
      const log = await feeding.createHorse(A(), { name: "Logan" });
      const arena = await feeding.createHorse(A(), { name: "Arya" });
      const retired = await feeding.createHorse(A(), { name: "Old Timer" });
      await sql("UPDATE horses SET active = FALSE WHERE id = ?", [retired]);
      await feeding.saveFeedingChart(A(), log, { am_feed: "grain", responsible_employee: alice.id, barn: "log-barn" });
      await feeding.saveFeedingChart(A(), arena, { pm_feed: "hay", barn: "arena-barn" });
      await feeding.setFeedingDone(AL(), log, "AM", true);
      await announcements.createAnnouncement(A(), { title: "Farrier Friday" });

      const all = await feeding.getBarnDisplayData();
      expect(all.horses.map((h) => h.name)).toEqual(["Arya", "Logan"]);
      const logBarn = await feeding.getBarnDisplayData("log-barn");
      expect(logBarn.horses.map((h) => h.name)).toEqual(["Logan"]);
      expect(logBarn.charts).toEqual([
        { horse_id: log, am_feed: "grain", pm_feed: null, supplements: null, special_notes: null, responsible_name: "Alice Worker" },
      ]);
      expect(logBarn.logs).toEqual([{ horse_id: log, feeding_type: "AM", done: true }]);
      expect(logBarn.announcements.map((a) => a.title)).toEqual(["Farrier Friday"]);
      const json = JSON.stringify(all);
      expect(json).not.toContain(alice.email);
      expect(json).not.toContain(alice.id);
      expect((await feeding.getBarnDisplayData("'; DROP TABLE horses; --")).horses).toHaveLength(2); // unknown → all
    });
  });

  // -------------------------------------------------------- announcements
  describe("announcements", () => {
    it("admin posts and deletes; everyone signed in reads with author name", async () => {
      const id = await announcements.createAnnouncement(A(), { title: "Hay delivery", body: "Tuesday 8am" });
      await announcements.createAnnouncement(A(), { title: "Second" });
      const list = await announcements.listAnnouncements(AL());
      expect(list.map((a) => a.title)).toEqual(["Second", "Hay delivery"]);
      expect(list[1]).toMatchObject({ body: "Tuesday 8am", author_name: "Ada Admin" });
      expect(await announcements.listAnnouncements(AL(), 1)).toHaveLength(1);
      await expect(announcements.createAnnouncement(AL(), { title: "x" })).rejects.toThrow(ForbiddenError);
      await expect(announcements.deleteAnnouncement(AL(), id)).rejects.toThrow(ForbiddenError);
      await announcements.deleteAnnouncement(A(), id);
      expect(await announcements.listAnnouncements(AL())).toHaveLength(1);
    });
  });

  // ----------------------------------------------------------- admin notes
  describe("admin notes", () => {
    it("are admin-only", async () => {
      const id = await notes.createNote(A(), { title: "Gate code", body: "1234" });
      expect((await notes.listNotes(A()))[0]).toMatchObject({ title: "Gate code", author_name: "Ada Admin" });
      await expect(notes.listNotes(AL())).rejects.toThrow(ForbiddenError);
      await expect(notes.createNote(AL(), { title: "x" })).rejects.toThrow(ForbiddenError);
      await expect(notes.deleteNote(AL(), id)).rejects.toThrow(ForbiddenError);
      await notes.deleteNote(A(), id);
      expect(await notes.listNotes(A())).toHaveLength(0);
    });
  });

  // ----------------------------------------------------------------- clock
  describe("clock in / out", () => {
    it("records alternating actions in UTC and ignores repeats", async () => {
      expect(await clock.recordClock(AL(), "in")).toBe(true);
      expect(await clock.recordClock(AL(), "in")).toBe(false); // double tap
      expect(await clock.recordClock(AL(), "out")).toBe(true);
      const mine = await clock.listMyClockLogs(AL());
      expect(mine.map((c) => c.action)).toEqual(["out", "in"]);
      expect(mine[0]).toMatchObject({ user_name: "Alice Worker", user_id: alice.id });
      expect(Math.abs(new Date(mine[0].created_at).getTime() - Date.now())).toBeLessThan(60_000);
      expect(await clock.listMyClockLogs(BO())).toHaveLength(0);
    });

    it("serializes concurrent clock-ins for the same user", async () => {
      const results = await Promise.all(Array.from({ length: 5 }, () => clock.recordClock(BO(), "in")));
      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it("only admins read everyone's log", async () => {
      await clock.recordClock(AL(), "in");
      expect(await clock.listClockLogs(A())).toHaveLength(1);
      expect(await clock.listClockLogsSince(A(), new Date(Date.now() - 3600_000))).toHaveLength(1);
      expect(await clock.listClockLogsSince(A(), new Date(Date.now() + 3600_000))).toHaveLength(0);
      await expect(clock.listClockLogs(AL())).rejects.toThrow(ForbiddenError);
      await expect(clock.recordClock(AL(), "lunch")).rejects.toThrow(ValidationError);
    });
  });

  // --------------------------------------------------------- users/admin
  describe("employee management", () => {
    it("admin adds users; duplicate emails are rejected", async () => {
      const id = await users.createUser(A(), { email: "New@Example.com", name: "Newbie", role: "employee", password: "first password" });
      const list = await users.listUsers(A());
      expect(list.find((u) => u.id === id)).toMatchObject({ email: "new@example.com", has_password: true, role: "employee" });
      await expect(
        users.createUser(A(), { email: "new@example.com", name: "Dup", role: "employee", password: "first password" })
      ).rejects.toThrow(ConflictError);
      await expect(users.createUser(A(), { email: "x@example.com", name: "X", role: "employee", password: "short" })).rejects.toThrow(ValidationError);
      await expect(users.createUser(A(), { email: "x@example.com", name: "X", role: "owner", password: "long enough pw" })).rejects.toThrow(ValidationError);
      const [row] = await sql<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", [id]);
      expect(row.password_hash).toMatch(/^\$argon2id\$/);
    });

    it("employees cannot manage accounts or promote themselves", async () => {
      await expect(users.listUsers(AL())).rejects.toThrow(ForbiddenError);
      await expect(users.setUserRole(AL(), alice.id, "admin")).rejects.toThrow(ForbiddenError);
      await expect(users.createUser(AL(), { email: "e@example.com", name: "E", role: "admin", password: "long enough pw" })).rejects.toThrow(ForbiddenError);
      await expect(users.resetUserPassword(AL(), bob.id, "long enough pw")).rejects.toThrow(ForbiddenError);
      await expect(users.deleteUser(AL(), bob.id)).rejects.toThrow(ForbiddenError);
    });

    it("never leaves the farm without an administrator", async () => {
      await expect(users.setUserRole(A(), admin.id, "employee")).rejects.toThrow(ForbiddenError);
      await expect(users.deleteUser(A(), admin.id)).rejects.toThrow(ForbiddenError);
      const admin2 = await createUser("admin");
      await users.setUserRole(actorOf(admin2), admin.id, "employee");
      expect((await users.listUsers(actorOf(admin2))).find((u) => u.id === admin.id)!.role).toBe("employee");
    });

    it("renames and removes users; related data cascades or is kept as before", async () => {
      await users.updateUserName(A(), alice.id, "Alice B.");
      const t = await tasks.createTask(A(), { title: "T", assigned_to: alice.id });
      await shifts.createShift(A(), { employee_id: alice.id, date: "2026-10-14", start_time: "07:00", end_time: "08:00" });
      await clock.recordClock(AL(), "in");
      await users.deleteUser(A(), alice.id);
      const [task] = await sql<{ assigned_to: string | null }>("SELECT assigned_to FROM tasks WHERE id = ?", [t]);
      expect(task.assigned_to).toBeNull(); // task kept, unassigned
      expect(await sql("SELECT * FROM shifts")).toHaveLength(0);
      expect(await sql("SELECT * FROM clock_logs")).toHaveLength(0);
      await expect(users.updateUserName(A(), alice.id, "Ghost")).rejects.toThrow(NotFoundError);
      await expect(users.updateUserName(A(), randomUUID(), "")).rejects.toThrow(ValidationError);
    });
  });
});
