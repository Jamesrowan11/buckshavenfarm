import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { changeOwnPassword, passwordResultFrom } from "@/lib/password";
import ChangePasswordForm from "@/components/ChangePasswordForm";

async function changePassword(formData: FormData) {
  "use server";
  const session = await requireRole("ADMIN");
  const result = await changeOwnPassword(
    session.uid,
    String(formData.get("current") || ""),
    String(formData.get("next") || ""),
    String(formData.get("confirm") || "")
  );
  redirect(`/admin/account?pw=${result}`);
}

export default async function AdminAccount({
  searchParams,
}: {
  searchParams: Promise<{ pw?: string }>;
}) {
  const session = await requireRole("ADMIN");
  const me = await db.user.findUnique({ where: { id: session.uid }, select: { name: true, email: true } });
  const { pw } = await searchParams;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My account</h1>
          <p className="sub">
            {me?.name} · {me?.email}
          </p>
        </div>
      </div>
      <div className="grid grid--2">
        <ChangePasswordForm action={changePassword} result={passwordResultFrom(pw)} />
        <div className="card">
          <h2>Sign out</h2>
          <p className="muted" style={{ marginBottom: ".8rem" }}>
            Sign out when you&apos;re done, especially on a shared barn computer.
          </p>
          <a href="/portal/logout" className="btn">Sign out</a>
        </div>
      </div>
    </>
  );
}
