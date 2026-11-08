import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/server";
import { adminSetPassword, currentUser, hashPassword, passwordProblem } from "@/lib/auth";
import EmptyState from "@/components/EmptyState";
import { pool } from "@/lib/db/pool";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const me = await currentUser();
  if (me?.role !== "admin") throw new Error("Admins only");
  return me;
}

async function addPerson(formData: FormData) {
  "use server";
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = formData.get("role") === "admin" ? "admin" : "employee";
  const password = String(formData.get("password") ?? "");
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || passwordProblem(password)) return;
  await pool().query(
    "INSERT IGNORE INTO profiles (id, name, email, role, password_hash) VALUES (UUID(), ?, ?, ?, ?)",
    [name, email, role, await hashPassword(password)],
  );
  revalidatePath("/admin/employees");
}

async function setPassword(id: string, formData: FormData) {
  "use server";
  await requireAdmin();
  await adminSetPassword(id, String(formData.get("password") ?? ""));
  revalidatePath("/admin/employees");
}

async function setRole(id: string, role: "admin" | "employee") {
  "use server";
  const me = await requireAdmin();
  if (id === me.id) return; // don't lock yourself out
  await createClient().from("profiles").update({ role }).eq("id", id);
  revalidatePath("/admin/employees");
}

async function updateName(id: string, formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await createClient().from("profiles").update({ name }).eq("id", id);
  revalidatePath("/admin/employees");
}

async function removeProfile(id: string) {
  "use server";
  const me = await requireAdmin();
  if (id === me.id) return;
  await createClient().from("profiles").delete().eq("id", id);
  revalidatePath("/admin/employees");
}

export default async function AdminEmployeesPage() {
  const me = await currentUser();
  const { data } = await createClient().from("profiles").select("*").order("role").order("name");

  return (
    <div className="space-y-6">
      <h1 className="h1">Employees & admins</h1>

      <form action={addPerson} className="card space-y-3">
        <h2 className="h2">Add a person</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Name</label>
            <input name="name" required className="input" />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" name="email" required className="input" />
          </div>
          <div>
            <label className="label">Role</label>
            <select name="role" defaultValue="employee" className="input">
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="label">Starting password</label>
            <input type="text" name="password" required minLength={10} autoComplete="off" className="input" />
            <p className="text-xs text-stone-500 mt-1">10+ characters with letters and numbers. Give it to them in person.</p>
          </div>
        </div>
        <button className="btn-primary">Add</button>
      </form>

      {(data?.length ?? 0) === 0 ? (
        <EmptyState title="No people yet" hint="Add someone above." />
      ) : (
        <ul className="space-y-2">
          {data!.map((p: any) => (
            <li key={p.id} className="card space-y-2">
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <div className="flex-1 min-w-[200px]">
                  <form action={updateName.bind(null, p.id)} className="flex gap-2 items-center">
                    <input name="name" defaultValue={p.name} className="input !py-1" />
                    <button className="btn-secondary !py-1 !px-3 text-sm">Save</button>
                  </form>
                  <div className="text-xs text-stone-500 mt-1">{p.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${p.role === "admin" ? "badge-high" : "badge-low"}`}>{p.role}</span>
                  {p.id !== me?.id &&
                    (p.role === "admin" ? (
                      <form action={setRole.bind(null, p.id, "employee")}>
                        <button className="btn-secondary !py-1 !px-3 text-sm">Make employee</button>
                      </form>
                    ) : (
                      <form action={setRole.bind(null, p.id, "admin")}>
                        <button className="btn-primary !py-1 !px-3 text-sm">Make admin</button>
                      </form>
                    ))}
                  {p.id !== me?.id && (
                    <form action={removeProfile.bind(null, p.id)}>
                      <button className="text-stone-400 hover:text-red-600 text-sm">Remove</button>
                    </form>
                  )}
                </div>
              </div>
              <form action={setPassword.bind(null, p.id)} className="flex gap-2 items-center">
                <input type="text" name="password" minLength={10} required placeholder="New password" autoComplete="off" className="input !py-1 max-w-xs" />
                <button className="btn-secondary !py-1 !px-3 text-sm">Set password</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
