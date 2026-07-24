import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";

async function createNote(formData: FormData) {
  "use server";
  const session = await requireRole("ADMIN");
  await db.adminNote.create({
    data: {
      title: String(formData.get("title") || "").trim(),
      body: String(formData.get("body") || "").trim() || null,
      createdById: session.uid,
    },
  });
  revalidatePath("/admin/notes");
}

async function deleteNote(id: string) {
  "use server";
  await requireRole("ADMIN");
  await db.adminNote.delete({ where: { id } });
  revalidatePath("/admin/notes");
}

export default async function NotesPage() {
  await requireRole("ADMIN");
  const notes = await db.adminNote.findMany({
    include: { createdBy: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Notes</h1>
          <p className="sub">Admin-only — boarders and staff never see these.</p>
        </div>
      </div>

      <div className="card">
        <h2>New note</h2>
        <form action={createNote}>
          <label className="fld">Title<input name="title" required /></label>
          <label className="fld">Body<textarea name="body" rows={3} /></label>
          <button className="btn btn--gold">Save Note</button>
        </form>
      </div>

      {notes.map((n) => (
        <div key={n.id} className="card card--tight">
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "start" }}>
            <div>
              <strong>{n.title}</strong>
              {n.body && <p style={{ marginTop: ".3rem", fontSize: ".9rem", whiteSpace: "pre-wrap" }}>{n.body}</p>}
              <p className="muted" style={{ marginTop: ".3rem" }}>{n.createdBy?.name ?? "—"} · {fmtDateTime(n.createdAt)}</p>
            </div>
            <form action={deleteNote.bind(null, n.id)}>
              <button className="btn btn--danger btn--sm">Delete</button>
            </form>
          </div>
        </div>
      ))}
      {notes.length === 0 && <p className="empty">No notes yet.</p>}
    </>
  );
}
