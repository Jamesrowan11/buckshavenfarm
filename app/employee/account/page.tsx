import { redirect } from "next/navigation";
import { getCurrentSession, requireUser } from "@/lib/auth/current";
import { changeOwnPassword } from "@/lib/services/users";
import { UnauthorizedError, ValidationError } from "@/lib/errors";
import { PASSWORD_MIN_LENGTH } from "@/lib/shared/password.mjs";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, { text: string; ok: boolean }> = {
  changed: { text: "Password changed. Your other devices were signed out.", ok: true },
  "wrong-password": { text: "Your current password is incorrect.", ok: false },
  mismatch: { text: "The new passwords don't match.", ok: false },
  invalid: { text: `Choose a new password of at least ${PASSWORD_MIN_LENGTH} characters that differs from the current one.`, ok: false },
};

async function changePassword(formData: FormData) {
  "use server";
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const next = String(formData.get("new_password") ?? "");
  let code = "changed";
  if (next !== String(formData.get("confirm_password") ?? "")) {
    code = "mismatch";
  } else {
    try {
      await changeOwnPassword(current.user, current.session.id, String(formData.get("current_password") ?? ""), next);
    } catch (err) {
      if (err instanceof UnauthorizedError) code = "wrong-password";
      else if (err instanceof ValidationError) code = "invalid";
      else throw err;
    }
  }
  redirect(`/employee/account?status=${code}`);
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireUser();
  const { status } = await searchParams;
  const message = status ? MESSAGES[status] : undefined;

  return (
    <div className="space-y-4">
      <h1 className="h1">My account</h1>
      <div className="card text-sm">
        <div className="font-medium">{user.name}</div>
        <div className="text-stone-500">{user.email}</div>
      </div>

      {message && (
        <div
          className={`card text-sm ${
            message.ok ? "border-farm-200 bg-farm-50 text-farm-800" : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <form action={changePassword} className="card space-y-3">
        <h2 className="h2">Change password</h2>
        <div>
          <label className="label">Current password</label>
          <input name="current_password" type="password" required autoComplete="current-password" className="input" />
        </div>
        <div>
          <label className="label">New password</label>
          <input
            name="new_password"
            type="password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            className="input"
          />
        </div>
        <div>
          <label className="label">Repeat new password</label>
          <input
            name="confirm_password"
            type="password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            className="input"
          />
        </div>
        <button className="btn-primary">Change password</button>
      </form>
    </div>
  );
}
