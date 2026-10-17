import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { changeOwnPassword, passwordResultFrom } from "@/lib/password";
import ChangePasswordForm from "@/components/ChangePasswordForm";

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
  const result = await changeOwnPassword(
    session.uid,
    String(formData.get("current") || ""),
    String(formData.get("next") || ""),
    String(formData.get("confirm") || "")
  );
  redirect(`/boarder/account?pw=${result}`);
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

export default async function BoarderAccount({
  searchParams,
}: {
  searchParams: Promise<{ pw?: string }>;
}) {
  const session = await requireRole("BOARDER", "ADMIN");
  const { pw } = await searchParams;
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
          <ChangePasswordForm action={changePassword} result={passwordResultFrom(pw)} />
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
