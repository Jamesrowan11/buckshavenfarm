import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

async function updateMe(formData: FormData) {
  "use server";
  const session = await requireRole("BOARDER", "ADMIN");
  await db.user.update({
    where: { id: session.uid },
    data: {
      phone: String(formData.get("phone") || "").trim() || null,
      billingEmail: String(formData.get("billingEmail") || "").trim() || null,
    },
  });
  revalidatePath("/boarder/account");
}

async function changePassword(formData: FormData) {
  "use server";
  const session = await requireRole("BOARDER", "ADMIN");
  const current = String(formData.get("current") || "");
  const next = String(formData.get("next") || "");
  if (next.length < 8) return;
  const user = await db.user.findUnique({ where: { id: session.uid } });
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) return;
  await db.user.update({
    where: { id: session.uid },
    data: { passwordHash: await bcrypt.hash(next, 12) },
  });
  revalidatePath("/boarder/account");
}

async function addContact(formData: FormData) {
  "use server";
  const session = await requireRole("BOARDER", "ADMIN");
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  if (!name || !phone) return;
  const count = await db.emergencyContact.count({ where: { userId: session.uid } });
  await db.emergencyContact.create({
    data: {
      userId: session.uid,
      name,
      phone,
      relation: String(formData.get("relation") || "").trim() || null,
      priority: count + 1,
    },
  });
  revalidatePath("/boarder/account");
}

async function removeContact(contactId: string) {
  "use server";
  const session = await requireRole("BOARDER", "ADMIN");
  const c = await db.emergencyContact.findUnique({ where: { id: contactId } });
  if (c && c.userId === session.uid) {
    await db.emergencyContact.delete({ where: { id: contactId } });
  }
  revalidatePath("/boarder/account");
}

export default async function BoarderAccount() {
  const session = await requireRole("BOARDER", "ADMIN");
  const me = await db.user.findUnique({
    where: { id: session.uid },
    include: { emergencyContacts: { orderBy: { priority: "asc" } } },
  });
  if (!me) return null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My account</h1>
          <p className="sub">{me.email}</p>
        </div>
      </div>

      <div className="grid grid--2">
        <div>
          <div className="card">
            <h2>Contact info</h2>
            <form action={updateMe}>
              <label className="fld">Phone<input name="phone" defaultValue={me.phone ?? ""} /></label>
              <label className="fld">Billing email (if different)<input type="email" name="billingEmail" defaultValue={me.billingEmail ?? ""} /></label>
              <button className="btn btn--gold">Save</button>
            </form>
          </div>
          <div className="card">
            <h2>Change password</h2>
            <form action={changePassword}>
              <label className="fld">Current password<input type="password" name="current" required /></label>
              <label className="fld">New password (min 8)<input type="password" name="next" minLength={8} required /></label>
              <button className="btn">Change</button>
            </form>
          </div>
        </div>

        <div className="card">
          <h2>Emergency contacts</h2>
          <p className="muted" style={{ marginBottom: ".6rem" }}>
            Who the barn calls, in order, if we can't reach you about your horse.
          </p>
          {me.emergencyContacts.length === 0 && <p className="muted">None yet — please add at least one.</p>}
          {me.emergencyContacts.map((c) => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--line)", padding: ".45rem 0" }}>
              <span><strong>{c.priority}.</strong> {c.name} · {c.phone}{c.relation ? <span className="muted"> ({c.relation})</span> : null}</span>
              <form action={removeContact.bind(null, c.id)}>
                <button className="btn btn--danger btn--sm">Remove</button>
              </form>
            </div>
          ))}
          <form action={addContact} style={{ marginTop: ".8rem" }}>
            <div className="fld-row--3 fld-row">
              <label className="fld">Name<input name="name" required /></label>
              <label className="fld">Phone<input name="phone" required /></label>
              <label className="fld">Relation<input name="relation" /></label>
            </div>
            <button className="btn btn--sm">Add Contact</button>
          </form>
        </div>
      </div>
    </>
  );
}
