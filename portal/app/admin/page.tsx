import Link from "next/link";
import { db } from "@/lib/db";
import { fmtDate, todayUTC } from "@/lib/format";

export default async function AdminDashboard() {
  const today = todayUTC();
  const [horses, boarders, openTasks, pendingTimeOff, amDone, pmDone, chartCount, announcements] =
    await Promise.all([
      db.horse.count({ where: { active: true } }),
      db.user.count({ where: { role: "BOARDER", active: true } }),
      db.task.count({ where: { done: false } }),
      db.timeOffRequest.count({ where: { status: "PENDING" } }),
      db.feedingLog.count({ where: { date: today, feedingType: "AM", done: true } }),
      db.feedingLog.count({ where: { date: today, feedingType: "PM", done: true } }),
      db.feedingChart.count(),
      db.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 3, include: { createdBy: true } }),
    ]);

  const recentTasks = await db.task.findMany({
    where: { done: false },
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
    take: 6,
    include: { assignedTo: true },
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="sub">The farm at a glance.</p>
        </div>
      </div>

      <div className="grid grid--stats" style={{ marginBottom: "1.2rem" }}>
        <div className="stat"><b>{horses}</b><span>Horses</span></div>
        <div className="stat"><b>{boarders}</b><span>Boarders</span></div>
        <div className="stat"><b>{openTasks}</b><span>Open tasks</span></div>
        <div className="stat"><b>{amDone}/{chartCount}</b><span>AM feeds done</span></div>
        <div className="stat"><b>{pmDone}/{chartCount}</b><span>PM feeds done</span></div>
        <div className="stat"><b>{pendingTimeOff}</b><span>Time-off pending</span></div>
      </div>

      <div className="grid grid--2">
        <div className="card">
          <h2>Open tasks</h2>
          {recentTasks.length === 0 ? (
            <p className="empty">Nothing open — nice.</p>
          ) : (
            recentTasks.map((t) => (
              <p key={t.id} style={{ padding: ".35rem 0", borderBottom: "1px solid var(--line)", fontSize: ".9rem" }}>
                <span className={`badge badge--${t.priority === "HIGH" ? "red" : t.priority === "MEDIUM" ? "amber" : "gray"}`}>
                  {t.priority.toLowerCase()}
                </span>{" "}
                {t.title}
                <span className="muted"> — {t.assignedTo?.name ?? "unassigned"}{t.dueDate ? `, due ${fmtDate(t.dueDate)}` : ""}</span>
              </p>
            ))
          )}
          <p style={{ marginTop: ".7rem" }}><Link className="btn btn--ghost btn--sm" href="/admin/tasks">All tasks →</Link></p>
        </div>
        <div className="card">
          <h2>Latest announcements</h2>
          {announcements.length === 0 ? (
            <p className="empty">No announcements yet.</p>
          ) : (
            announcements.map((a) => (
              <p key={a.id} style={{ padding: ".35rem 0", borderBottom: "1px solid var(--line)", fontSize: ".9rem" }}>
                <strong>{a.title}</strong>
                <span className="muted"> — {a.createdBy?.name ?? "—"}, {fmtDate(a.createdAt)}</span>
              </p>
            ))
          )}
          <p style={{ marginTop: ".7rem" }}><Link className="btn btn--ghost btn--sm" href="/admin/announcements">Manage →</Link></p>
        </div>
      </div>
    </>
  );
}
