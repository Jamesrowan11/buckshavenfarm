import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";

async function createAnnouncement(formData: FormData) {
  "use server";
  const session = await requireRole("ADMIN");
  await db.announcement.create({
    data: {
      title: String(formData.get("title") || "").trim(),
      body: String(formData.get("body") || "").trim() || null,
      audience: formData.get("audience") === "ALL" ? "ALL" : "STAFF",
      createdById: session.uid,
    },
  });
  revalidatePath("/admin/announcements");
}

async function deleteAnnouncement(id: string) {
  "use server";
  await requireRole("ADMIN");
  await db.announcement.delete({ where: { id } });
  revalidatePath("/admin/announcements");
}

export default async function AnnouncementsPage() {
  await requireRole("ADMIN");
  const announcements = await db.announcement.findMany({
    include: { createdBy: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Announcements</h1>
          <p className="sub">"Staff" shows to employees only; "Everyone" also reaches boarders and the barn TVs.</p>
        </div>
      </div>

      <div className="card">
        <h2>Post an announcement</h2>
        <form action={createAnnouncement}>
          <div className="fld-row">
            <label className="fld">Title<input name="title" required /></label>
            <label className="fld">
              Audience
              <select name="audience" defaultValue="STAFF">
                <option value="STAFF">Staff only</option>
                <option value="ALL">Everyone (staff + boarders + barn TVs)</option>
              </select>
            </label>
          </div>
          <label className="fld">Body<textarea name="body" rows={3} /></label>
          <button className="btn btn--gold">Post</button>
        </form>
      </div>

      {announcements.map((a) => (
        <div key={a.id} className="card card--tight">
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "start" }}>
            <div>
              <strong>{a.title}</strong>{" "}
              <span className={`badge badge--${a.audience === "ALL" ? "gold" : "gray"}`}>
                {a.audience === "ALL" ? "everyone" : "staff"}
              </span>
              {a.body && <p style={{ marginTop: ".3rem", fontSize: ".9rem" }}>{a.body}</p>}
              <p className="muted" style={{ marginTop: ".3rem" }}>{a.createdBy?.name ?? "—"} · {fmtDateTime(a.createdAt)}</p>
            </div>
            <form action={deleteAnnouncement.bind(null, a.id)}>
              <button className="btn btn--danger btn--sm">Delete</button>
            </form>
          </div>
        </div>
      ))}
      {announcements.length === 0 && <p className="empty">Nothing posted yet.</p>}
    </>
  );
}
