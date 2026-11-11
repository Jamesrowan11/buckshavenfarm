import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";

export default async function BoarderAnnouncements() {
  await requireRole("BOARDER", "ADMIN");
  const announcements = await db.announcement.findMany({
    where: { audience: "ALL" },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return (
    <>
      <div className="page-head">
        <div><h1>Farm news</h1></div>
      </div>
      {announcements.length === 0 && <p className="empty">Nothing posted yet — check back soon.</p>}
      {announcements.map((a) => (
        <div key={a.id} className="card card--tight">
          <strong>{a.title}</strong>
          {a.body && <p style={{ marginTop: ".3rem", fontSize: ".9rem" }}>{a.body}</p>}
          <p className="muted" style={{ marginTop: ".3rem" }}>{fmtDateTime(a.createdAt)}</p>
        </div>
      ))}
    </>
  );
}
