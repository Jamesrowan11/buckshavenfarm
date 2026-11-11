import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { fmtDate, todayUTC } from "@/lib/format";

export default async function EmployeeHome() {
  const session = await requireRole("EMPLOYEE", "ADMIN");
  const today = todayUTC();
  const [myTasks, myShifts, lastPunch, announcements, chartCount, amDone, pmDone] = await Promise.all([
    db.task.findMany({
      where: { done: false, OR: [{ assignedToId: session.uid }, { assignedToId: null }] },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      take: 5,
    }),
    db.shift.findMany({
      where: { employeeId: session.uid, date: { gte: today } },
      orderBy: { date: "asc" },
      take: 5,
    }),
    db.clockLog.findFirst({ where: { userId: session.uid }, orderBy: { createdAt: "desc" } }),
    db.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 3 }),
    db.feedingChart.count(),
    db.feedingLog.count({ where: { date: today, feedingType: "AM", done: true } }),
    db.feedingLog.count({ where: { date: today, feedingType: "PM", done: true } }),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hi, {session.name.split(" ")[0]}</h1>
          <p className="sub">
            {lastPunch?.action === "IN" ? "You're clocked in." : "You're clocked out."} AM feeds {amDone}/{chartCount} · PM feeds {pmDone}/{chartCount}
          </p>
        </div>
        <Link href="/employee/clock" className="btn btn--gold">Clock {lastPunch?.action === "IN" ? "Out" : "In"}</Link>
      </div>

      <div className="grid grid--2">
        <div className="card">
          <h2>Your next shifts</h2>
          {myShifts.length === 0 && <p className="muted">Nothing scheduled.</p>}
          {myShifts.map((s) => (
            <p key={s.id} style={{ padding: ".3rem 0", borderBottom: "1px solid var(--line)", fontSize: ".9rem" }}>
              <strong>{fmtDate(s.date)}</strong> {s.startTime}–{s.endTime}{s.notes ? <span className="muted"> · {s.notes}</span> : null}
            </p>
          ))}
        </div>
        <div className="card">
          <h2>Open tasks</h2>
          {myTasks.length === 0 && <p className="muted">All caught up.</p>}
          {myTasks.map((t) => (
            <p key={t.id} style={{ padding: ".3rem 0", borderBottom: "1px solid var(--line)", fontSize: ".9rem" }}>
              <span className={`badge badge--${t.priority === "HIGH" ? "red" : t.priority === "MEDIUM" ? "amber" : "gray"}`}>{t.priority.toLowerCase()}</span>{" "}
              {t.title}{t.dueDate ? <span className="muted"> · due {fmtDate(t.dueDate)}</span> : null}
            </p>
          ))}
          <p style={{ marginTop: ".6rem" }}><Link href="/employee/tasks" className="btn btn--ghost btn--sm">All tasks →</Link></p>
        </div>
      </div>

      <div className="card">
        <h2>Announcements</h2>
        {announcements.length === 0 && <p className="muted">Nothing new.</p>}
        {announcements.map((a) => (
          <p key={a.id} style={{ padding: ".3rem 0", borderBottom: "1px solid var(--line)", fontSize: ".9rem" }}>
            <strong>{a.title}</strong>{a.body ? <span className="muted"> — {a.body}</span> : null}
          </p>
        ))}
      </div>
    </>
  );
}
