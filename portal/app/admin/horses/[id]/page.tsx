import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { fmtDate, BARN_LABEL } from "@/lib/format";
import {
  updateHorse, addOwner, removeOwner, uploadDocument, deleteDocument, saveFeedingChart,
} from "../actions";

export default async function HorseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const horse = await db.horse.findUnique({
    where: { id },
    include: {
      owners: { include: { user: { include: { emergencyContacts: { orderBy: { priority: "asc" } } } } } },
      documents: { orderBy: { createdAt: "desc" }, include: { uploadedBy: true } },
      feedingChart: true,
    },
  });
  if (!horse) notFound();

  const [boarders, staff] = await Promise.all([
    db.user.findMany({ where: { role: "BOARDER", active: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { role: { in: ["ADMIN", "EMPLOYEE"] }, active: true }, orderBy: { name: "asc" } }),
  ]);

  const updateThis = updateHorse.bind(null, horse.id);
  const addOwnerThis = addOwner.bind(null, horse.id);
  const uploadThis = uploadDocument.bind(null, horse.id);
  const chartThis = saveFeedingChart.bind(null, horse.id);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{horse.name}{horse.showName ? <span className="muted"> “{horse.showName}”</span> : null}</h1>
          <p className="sub">
            {horse.barn ? BARN_LABEL[horse.barn] : "No barn"}{horse.stall ? ` · Stall ${horse.stall}` : ""} ·{" "}
            {horse.active ? "active" : "inactive"}
          </p>
        </div>
        <Link href="/admin/horses" className="btn btn--ghost btn--sm">← All horses</Link>
      </div>

      <div className="grid grid--2">
        <div>
          <div className="card">
            <h2>Profile & care team</h2>
            <form action={updateThis}>
              <div className="fld-row">
                <label className="fld">Barn name<input name="name" defaultValue={horse.name} required /></label>
                <label className="fld">Show name<input name="showName" defaultValue={horse.showName ?? ""} /></label>
              </div>
              <div className="fld-row--3 fld-row">
                <label className="fld">
                  Barn
                  <select name="barn" defaultValue={horse.barn ?? ""}>
                    <option value="">—</option>
                    <option value="LOG_BARN">Log Barn</option>
                    <option value="ARENA_BARN">Arena Barn</option>
                  </select>
                </label>
                <label className="fld">Stall<input name="stall" defaultValue={horse.stall ?? ""} /></label>
                <label className="fld">Emergency vet limit ($)
                  <input name="emergencySpendLimit" inputMode="numeric"
                    defaultValue={horse.emergencySpendLimit ?? ""} placeholder="e.g. 1500" />
                </label>
              </div>
              <div className="fld-row">
                <label className="fld">Vet<input name="vetName" defaultValue={horse.vetName ?? ""} /></label>
                <label className="fld">Vet phone<input name="vetPhone" defaultValue={horse.vetPhone ?? ""} /></label>
              </div>
              <div className="fld-row">
                <label className="fld">Farrier<input name="farrierName" defaultValue={horse.farrierName ?? ""} /></label>
                <label className="fld">Farrier phone<input name="farrierPhone" defaultValue={horse.farrierPhone ?? ""} /></label>
              </div>
              <label className="fld">Notes<textarea name="notes" rows={3} defaultValue={horse.notes ?? ""} /></label>
              <label className="check"><input type="checkbox" name="active" defaultChecked={horse.active} /> Active on the farm</label>
              <button className="btn btn--gold">Save</button>
            </form>
          </div>

          <div className="card">
            <h2>Feeding chart</h2>
            <form action={chartThis}>
              <div className="fld-row">
                <label className="fld">AM feed<textarea name="amFeed" rows={2} defaultValue={horse.feedingChart?.amFeed ?? ""} /></label>
                <label className="fld">PM feed<textarea name="pmFeed" rows={2} defaultValue={horse.feedingChart?.pmFeed ?? ""} /></label>
              </div>
              <div className="fld-row">
                <label className="fld">Supplements<textarea name="supplements" rows={2} defaultValue={horse.feedingChart?.supplements ?? ""} /></label>
                <label className="fld">Special notes<textarea name="specialNotes" rows={2} defaultValue={horse.feedingChart?.specialNotes ?? ""} /></label>
              </div>
              <label className="fld">
                Responsible staff
                <select name="responsibleEmployeeId" defaultValue={horse.feedingChart?.responsibleEmployeeId ?? ""}>
                  <option value="">—</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <button className="btn">Save Chart</button>
            </form>
          </div>
        </div>

        <div>
          <div className="card">
            <h2>Owners</h2>
            {horse.owners.length === 0 && <p className="muted">No owner linked — farm horse.</p>}
            {horse.owners.map(({ user }) => (
              <div key={user.id} style={{ borderBottom: "1px solid var(--line)", padding: ".5rem 0" }}>
                <strong>{user.name}</strong> <span className="muted">{user.email}{user.phone ? ` · ${user.phone}` : ""}</span>
                {user.emergencyContacts.length > 0 && (
                  <p className="muted" style={{ fontSize: ".8rem" }}>
                    Emergency: {user.emergencyContacts.map((c) => `${c.name} ${c.phone}`).join(" → ")}
                  </p>
                )}
                <form action={removeOwner.bind(null, horse.id, user.id)} style={{ display: "inline" }}>
                  <button className="btn btn--danger btn--sm" style={{ marginTop: ".3rem" }}>Unlink</button>
                </form>
              </div>
            ))}
            <form action={addOwnerThis} style={{ marginTop: ".8rem", display: "flex", gap: ".5rem" }}>
              <select name="userId" style={{ flex: 1, padding: ".45rem", border: "1px solid #d4d0c2", borderRadius: 7 }}>
                <option value="">Link a boarder…</option>
                {boarders.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.email})</option>)}
              </select>
              <button className="btn btn--sm">Link</button>
            </form>
          </div>

          <div className="card">
            <h2>Documents</h2>
            <p className="muted" style={{ marginBottom: ".6rem" }}>
              Coggins, vaccination records, registration papers, insurance — owners see these too.
            </p>
            {horse.documents.length === 0 && <p className="muted">Nothing on file yet.</p>}
            {horse.documents.map((d) => (
              <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--line)", padding: ".45rem 0", gap: ".6rem" }}>
                <span>
                  <a href={`/portal/api/documents/${d.id}`} style={{ fontWeight: 600, color: "var(--green-900)" }}>{d.title}</a>
                  <span className="muted"> · {(d.size / 1024).toFixed(0)} KB · {fmtDate(d.createdAt)}</span>
                </span>
                <form action={deleteDocument.bind(null, horse.id, d.id)}>
                  <button className="btn btn--danger btn--sm">Delete</button>
                </form>
              </div>
            ))}
            <form action={uploadThis} style={{ marginTop: ".8rem" }}>
              <div className="fld-row">
                <label className="fld">Title<input name="title" placeholder="e.g. Coggins 2026" /></label>
                <label className="fld">File<input type="file" name="file" required /></label>
              </div>
              <button className="btn btn--sm">Upload</button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
