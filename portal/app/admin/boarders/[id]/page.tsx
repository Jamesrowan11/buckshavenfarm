import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  updateBoarder, addEmergencyContact, deleteEmergencyContact, resetBoarderPassword,
} from "../actions";

export default async function BoarderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const boarder = await db.user.findUnique({
    where: { id },
    include: {
      horses: { include: { horse: true } },
      emergencyContacts: { orderBy: { priority: "asc" } },
    },
  });
  if (!boarder || boarder.role !== "BOARDER") notFound();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{boarder.name}</h1>
          <p className="sub">{boarder.email}{boarder.phone ? ` · ${boarder.phone}` : ""}</p>
        </div>
        <Link href="/admin/boarders" className="btn btn--ghost btn--sm">← All boarders</Link>
      </div>

      <div className="grid grid--2">
        <div>
          <div className="card">
            <h2>Account</h2>
            <form action={updateBoarder.bind(null, boarder.id)}>
              <label className="fld">Name<input name="name" defaultValue={boarder.name} required /></label>
              <div className="fld-row">
                <label className="fld">Phone<input name="phone" defaultValue={boarder.phone ?? ""} /></label>
                <label className="fld">Billing email<input name="billingEmail" defaultValue={boarder.billingEmail ?? ""} /></label>
              </div>
              <label className="check"><input type="checkbox" name="active" defaultChecked={boarder.active} /> Active</label>
              <button className="btn btn--gold">Save</button>
            </form>
            <hr className="divider" />
            <form action={resetBoarderPassword.bind(null, boarder.id)} style={{ display: "flex", gap: ".5rem", alignItems: "end" }}>
              <label className="fld" style={{ flex: 1, marginBottom: 0 }}>
                Reset password (min 8 chars)
                <input name="password" minLength={8} />
              </label>
              <button className="btn btn--ghost btn--sm" style={{ marginBottom: ".1rem" }}>Reset</button>
            </form>
          </div>

          <div className="card">
            <h2>Horses</h2>
            {boarder.horses.length === 0 && <p className="muted">No horses linked. Link from the horse's page.</p>}
            {boarder.horses.map(({ horse }) => (
              <p key={horse.id} style={{ padding: ".4rem 0", borderBottom: "1px solid var(--line)" }}>
                <Link href={`/admin/horses/${horse.id}`} style={{ fontWeight: 600, color: "var(--green-900)" }}>{horse.name}</Link>
                {horse.stall && <span className="muted"> · Stall {horse.stall}</span>}
              </p>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Emergency contacts</h2>
          <p className="muted" style={{ marginBottom: ".6rem" }}>Called in order when this boarder can't be reached.</p>
          {boarder.emergencyContacts.length === 0 && <p className="muted">None on file — add at least one.</p>}
          {boarder.emergencyContacts.map((c) => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--line)", padding: ".45rem 0" }}>
              <span><strong>{c.priority}.</strong> {c.name} · {c.phone}{c.relation ? <span className="muted"> ({c.relation})</span> : null}</span>
              <form action={deleteEmergencyContact.bind(null, boarder.id, c.id)}>
                <button className="btn btn--danger btn--sm">Remove</button>
              </form>
            </div>
          ))}
          <form action={addEmergencyContact.bind(null, boarder.id)} style={{ marginTop: ".8rem" }}>
            <div className="fld-row--3 fld-row">
              <label className="fld">Name<input name="name" required /></label>
              <label className="fld">Phone<input name="phone" required /></label>
              <label className="fld">Relation<input name="relation" placeholder="spouse, trainer…" /></label>
            </div>
            <button className="btn btn--sm">Add Contact</button>
          </form>
        </div>
      </div>
    </>
  );
}
