import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import type { Role } from "@prisma/client";

async function createUser(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const role = String(formData.get("role") || "EMPLOYEE") as Role;
  const password = String(formData.get("password") || "");
  if (!email || password.length < 8) return;
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return;
  await db.user.create({
    data: {
      name: String(formData.get("name") || "").trim() || email.split("@")[0],
      email,
      role: ["ADMIN", "EMPLOYEE", "BOARDER"].includes(role) ? role : "EMPLOYEE",
      phone: String(formData.get("phone") || "").trim() || null,
      passwordHash: await bcrypt.hash(password, 12),
    },
  });
  revalidatePath("/admin/users");
}

async function setRole(userId: string, formData: FormData) {
  "use server";
  const session = await requireRole("ADMIN");
  if (userId === session.uid) return; // can't demote yourself
  const role = String(formData.get("role") || "") as Role;
  if (!["ADMIN", "EMPLOYEE", "BOARDER"].includes(role)) return;
  await db.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/admin/users");
}

async function toggleActive(userId: string) {
  "use server";
  const session = await requireRole("ADMIN");
  if (userId === session.uid) return;
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return;
  await db.user.update({ where: { id: userId }, data: { active: !user.active } });
  revalidatePath("/admin/users");
}

async function resetPassword(userId: string, formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const password = String(formData.get("password") || "");
  if (password.length < 8) return;
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(password, 12) },
  });
  revalidatePath("/admin/users");
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireRole("ADMIN");
  const { q } = await searchParams;
  const users = await db.user.findMany({
    where: q
      ? { OR: [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }] }
      : undefined,
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Users</h1>
          <p className="sub">Everyone with a login — family, staff, boarders.</p>
        </div>
        <form method="get" style={{ display: "flex", gap: ".5rem" }}>
          <input name="q" defaultValue={q ?? ""} placeholder="Search name, email, phone…"
            style={{ padding: ".5rem .7rem", border: "1px solid #d4d0c2", borderRadius: 7, fontSize: ".9rem" }} />
          <button className="btn btn--ghost">Search</button>
        </form>
      </div>

      <div className="card">
        <h2>Add a user</h2>
        <form action={createUser}>
          <div className="fld-row">
            <label className="fld">Name<input name="name" required /></label>
            <label className="fld">Email<input type="email" name="email" required /></label>
          </div>
          <div className="fld-row--3 fld-row">
            <label className="fld">Phone<input name="phone" /></label>
            <label className="fld">
              Role
              <select name="role" defaultValue="EMPLOYEE">
                <option value="EMPLOYEE">Employee</option>
                <option value="BOARDER">Boarder</option>
                <option value="ADMIN">Admin</option>
              </select>
            </label>
            <label className="fld">Password (min 8)<input name="password" minLength={8} required /></label>
          </div>
          <button className="btn btn--gold">Create User</button>
        </form>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Name</th><th>Email / Phone</th><th>Role</th><th>Since</th><th>Actions</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600 }}>{u.name}{!u.active && <span className="badge badge--gray" style={{ marginLeft: ".4rem" }}>disabled</span>}</td>
                <td>{u.email}{u.phone ? <span className="muted"> · {u.phone}</span> : null}</td>
                <td>
                  {u.id === session.uid ? (
                    <span className="badge badge--gold">{u.role.toLowerCase()} (you)</span>
                  ) : (
                    <form action={setRole.bind(null, u.id)} style={{ display: "flex", gap: ".3rem" }}>
                      <select name="role" defaultValue={u.role} style={{ padding: ".25rem", border: "1px solid #d4d0c2", borderRadius: 6, fontSize: ".8rem" }}>
                        <option value="ADMIN">admin</option>
                        <option value="EMPLOYEE">employee</option>
                        <option value="BOARDER">boarder</option>
                      </select>
                      <button className="btn btn--sm btn--ghost">Set</button>
                    </form>
                  )}
                </td>
                <td className="muted">{fmtDate(u.createdAt)}</td>
                <td>
                  {u.id !== session.uid && (
                    <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
                      <form action={toggleActive.bind(null, u.id)}>
                        <button className="btn btn--sm btn--ghost">{u.active ? "Disable" : "Enable"}</button>
                      </form>
                      <form action={resetPassword.bind(null, u.id)} style={{ display: "flex", gap: ".3rem" }}>
                        <input name="password" placeholder="new password" minLength={8}
                          style={{ padding: ".25rem .5rem", border: "1px solid #d4d0c2", borderRadius: 6, fontSize: ".8rem", width: 120 }} />
                        <button className="btn btn--sm btn--ghost">Reset</button>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
