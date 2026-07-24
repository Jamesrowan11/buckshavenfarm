import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { fmtDate, todayUTC } from "@/lib/format";

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export default async function AvailabilityPage() {
  await requireRole("ADMIN");
  const weekStart = todayUTC();
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());

  const entries = await db.availability.findMany({
    where: { weekStart: { gte: weekStart } },
    include: { employee: true },
    orderBy: [{ weekStart: "asc" }, { employee: { name: "asc" } }],
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Availability</h1>
          <p className="sub">What staff submitted for this week and beyond.</p>
        </div>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Employee</th><th>Week of</th>
              {DAYS.map((d) => <th key={d} style={{ textAlign: "center" }}>{d}</th>)}
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr><td colSpan={10} className="empty">No availability submitted for upcoming weeks yet.</td></tr>
            )}
            {entries.map((a) => {
              const days = (a.availableDays ?? {}) as Record<string, boolean>;
              return (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.employee.name}</td>
                  <td>{fmtDate(a.weekStart)}</td>
                  {DAYS.map((d) => (
                    <td key={d} style={{ textAlign: "center" }}>
                      {days[d] ? <span style={{ color: "var(--ok)", fontWeight: 700 }}>✓</span> : <span className="muted">·</span>}
                    </td>
                  ))}
                  <td className="muted">{a.notes ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
