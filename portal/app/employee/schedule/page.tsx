import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { fmtDate, todayUTC } from "@/lib/format";

export default async function EmployeeSchedule() {
  const session = await requireRole("EMPLOYEE", "ADMIN");
  const start = todayUTC();
  start.setUTCDate(start.getUTCDate() - 7);
  const shifts = await db.shift.findMany({
    where: { employeeId: session.uid, date: { gte: start } },
    orderBy: { date: "asc" },
    take: 60,
  });
  const today = todayUTC().getTime();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My schedule</h1>
          <p className="sub">Last week and everything upcoming.</p>
        </div>
      </div>
      {shifts.length === 0 && <p className="empty">No shifts scheduled.</p>}
      {shifts.map((s) => (
        <div key={s.id} className="card card--tight" style={s.date.getTime() === today ? { borderColor: "var(--gold)" } : undefined}>
          <strong>{fmtDate(s.date)}</strong> {s.startTime}–{s.endTime}
          {s.date.getTime() === today && <span className="badge badge--gold" style={{ marginLeft: ".5rem" }}>today</span>}
          {s.notes && <span className="muted"> · {s.notes}</span>}
        </div>
      ))}
    </>
  );
}
