import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";

export default async function ClockLogPage() {
  await requireRole("ADMIN");
  const logs = await db.clockLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: true },
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clock log</h1>
          <p className="sub">Last 200 punches.</p>
        </div>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Who</th><th>Action</th><th>When</th></tr></thead>
          <tbody>
            {logs.length === 0 && <tr><td colSpan={3} className="empty">No punches yet.</td></tr>}
            {logs.map((l) => (
              <tr key={l.id}>
                <td style={{ fontWeight: 600 }}>{l.user?.name ?? l.userName}</td>
                <td><span className={`badge badge--${l.action === "IN" ? "green" : "gray"}`}>{l.action === "IN" ? "clock in" : "clock out"}</span></td>
                <td className="muted">{fmtDateTime(l.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
