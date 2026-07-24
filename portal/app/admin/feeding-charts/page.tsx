import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { BARN_LABEL, todayUTC } from "@/lib/format";

export default async function FeedingChartsPage() {
  await requireRole("ADMIN");
  const today = todayUTC();
  const horses = await db.horse.findMany({
    where: { active: true },
    include: {
      feedingChart: { include: { responsibleEmployee: true } },
      feedingLogs: { where: { date: today } },
    },
    orderBy: [{ barn: "asc" }, { name: "asc" }],
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Feeding charts</h1>
          <p className="sub">
            Edit each horse's chart from its page. Barn TVs: {" "}
            <a href="/barn-display/log-barn" style={{ textDecoration: "underline" }}>Log Barn</a>{" · "}
            <a href="/barn-display/arena-barn" style={{ textDecoration: "underline" }}>Arena Barn</a>
          </p>
        </div>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Horse</th><th>Barn</th><th>AM</th><th>PM</th><th>Supplements</th><th>Responsible</th><th>Today</th></tr>
          </thead>
          <tbody>
            {horses.length === 0 && <tr><td colSpan={7} className="empty">No active horses.</td></tr>}
            {horses.map((h) => {
              const am = h.feedingLogs.find((l) => l.feedingType === "AM")?.done;
              const pm = h.feedingLogs.find((l) => l.feedingType === "PM")?.done;
              return (
                <tr key={h.id}>
                  <td><Link href={`/admin/horses/${h.id}`} style={{ fontWeight: 600, color: "var(--green-900)" }}>{h.name}</Link></td>
                  <td>{h.barn ? BARN_LABEL[h.barn] : "—"}</td>
                  <td className="muted">{h.feedingChart?.amFeed ?? "—"}</td>
                  <td className="muted">{h.feedingChart?.pmFeed ?? "—"}</td>
                  <td className="muted">{h.feedingChart?.supplements ?? "—"}</td>
                  <td>{h.feedingChart?.responsibleEmployee?.name ?? "—"}</td>
                  <td>
                    <span className={`badge badge--${am ? "green" : "gray"}`}>AM</span>{" "}
                    <span className={`badge badge--${pm ? "green" : "gray"}`}>PM</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
