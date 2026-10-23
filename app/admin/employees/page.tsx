import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current";
import {
  createUser,
  deleteUser,
  listUsers,
  resetUserPassword,
  setUserRole,
  updateUserName,
} from "@/lib/services/users";
import { AppError, ConflictError, ForbiddenError, ValidationError } from "@/lib/errors";
import { field } from "@/lib/validation";
import { PASSWORD_MIN_LENGTH } from "@/lib/shared/password.mjs";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

// Outcome banners. Only these fixed codes are accepted from the URL, so the
// query string can't be used to inject arbitrary text into the page.
const MESSAGES: Record<string, { text: string; ok: boolean }> = {
  created: { text: "User added. Share the temporary password with them privately.", ok: true },
  "password-reset": { text: "Password updated. The user was signed out of all devices.", ok: true },
  duplicate: { text: "A user with that email already exists.", ok: false },
  "weak-password": { text: `Passwords must be at least ${PASSWORD_MIN_LENGTH} characters.`, ok: false },
  invalid: { text: "Some of the information entered is invalid.", ok: false },
  "last-admin": { text: "At least one administrator must remain.", ok: false },
  self: { text: "You can't remove your own account or administrator access.", ok: false },
  error: { text: "Something went wrong. Please try again.", ok: false },
};

function outcomeCode(err: unknown): string {
  if (err instanceof ConflictError) return "duplicate";
  if (err instanceof ValidationError) return /Password/.test(err.publicMessage) ? "weak-password" : "invalid";
  if (err instanceof ForbiddenError) return /administrator must remain/.test(err.publicMessage) ? "last-admin" : "self";
  if (err instanceof AppError) return "error";
  throw err;
}

async function runAndReport(fn: () => Promise<unknown>, successCode?: string) {
  let code = successCode;
  try {
    await fn();
  } catch (err) {
    code = outcomeCode(err);
  }
  revalidatePath("/admin/employees");
  if (code) redirect(`/admin/employees?status=${code}`);
}

async function addUser(formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  await runAndReport(
    () =>
      createUser(actor, {
        name: field(formData, "name"),
        email: field(formData, "email"),
        role: field(formData, "role"),
        password: String(formData.get("password") ?? ""),
      }),
    "created"
  );
}

async function setRole(id: string, role: "admin" | "employee") {
  "use server";
  const actor = await requireAdmin();
  await runAndReport(() => setUserRole(actor, id, role));
}

async function updateName(id: string, formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  if (!field(formData, "name")) return;
  await runAndReport(() => updateUserName(actor, id, field(formData, "name")));
}

async function resetPassword(id: string, formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  await runAndReport(
    () => resetUserPassword(actor, id, String(formData.get("password") ?? "")),
    "password-reset"
  );
}

async function removeProfile(id: string) {
  "use server";
  const actor = await requireAdmin();
  await runAndReport(() => deleteUser(actor, id));
}

export default async function AdminEmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const actor = await requireAdmin();
  const data = await listUsers(actor);
  const { status } = await searchParams;
  const message = status ? MESSAGES[status] : undefined;

  return (
    <div className="space-y-6">
      <h1 className="h1">Employees & admins</h1>

      {message && (
        <div
          className={`card text-sm ${
            message.ok ? "border-farm-200 bg-farm-50 text-farm-800" : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <form action={addUser} className="card space-y-3">
        <h2 className="h2">Add user</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Name</label>
            <input name="name" required maxLength={200} className="input" />
          </div>
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" required maxLength={254} autoComplete="off" className="input" />
          </div>
          <div>
            <label className="label">Temporary password</label>
            <input
              name="password"
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              className="input"
            />
          </div>
          <div>
            <label className="label">Role</label>
            <select name="role" defaultValue="employee" className="input">
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <p className="text-xs text-stone-500">
          Passwords must be at least {PASSWORD_MIN_LENGTH} characters. The user can change it from{" "}
          <span className="font-medium">More → Change password</span> after signing in.
        </p>
        <button className="btn-primary">Add user</button>
      </form>

      {data.length === 0 ? (
        <EmptyState title="No users yet" hint="Add one above." />
      ) : (
        <ul className="space-y-2">
          {data.map((p) => (
            <li key={p.id} className="card space-y-3">
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <div className="flex-1 min-w-[200px]">
                  <form action={updateName.bind(null, p.id)} className="flex gap-2 items-center">
                    <input name="name" defaultValue={p.name} maxLength={200} className="input !py-1" />
                    <button className="btn-secondary !py-1 !px-3 text-sm">Save</button>
                  </form>
                  <div className="text-xs text-stone-500 mt-1">
                    {p.email}
                    {!p.has_password && (
                      <span className="ml-2 text-amber-700">· no password set — can&apos;t sign in yet</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${p.role === "admin" ? "badge-high" : "badge-low"}`}>{p.role}</span>
                  {p.id !== actor.id &&
                    (p.role === "admin" ? (
                      <form action={setRole.bind(null, p.id, "employee")}>
                        <button className="btn-secondary !py-1 !px-3 text-sm">Make employee</button>
                      </form>
                    ) : (
                      <form action={setRole.bind(null, p.id, "admin")}>
                        <button className="btn-primary !py-1 !px-3 text-sm">Make admin</button>
                      </form>
                    ))}
                  {p.id !== actor.id && (
                    <form action={removeProfile.bind(null, p.id)}>
                      <button className="text-stone-400 hover:text-red-600 text-sm">Remove</button>
                    </form>
                  )}
                </div>
              </div>
              {p.id !== actor.id && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-stone-600">
                    {p.has_password ? "Reset password" : "Set password"}
                  </summary>
                  <form action={resetPassword.bind(null, p.id)} className="flex gap-2 items-center mt-2">
                    <input
                      name="password"
                      type="password"
                      required
                      minLength={PASSWORD_MIN_LENGTH}
                      autoComplete="new-password"
                      placeholder="New temporary password"
                      className="input !py-1"
                    />
                    <button className="btn-secondary !py-1 !px-3 text-sm whitespace-nowrap">Set password</button>
                  </form>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
