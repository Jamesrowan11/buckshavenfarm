import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, getSession, homeFor } from "@/lib/auth";

async function login(formData: FormData) {
  "use server";
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    redirect("/login?error=1");
  }
  await createSession(user);
  redirect(homeFor(user.role));
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session) redirect(homeFor(session.role));
  const { error } = await searchParams;

  return (
    <div className="login-wrap">
      <form className="login-card" action={login}>
        <img src="/portal/logo-mark.svg" alt="" />
        <h1>Bucks Haven Farm</h1>
        <label className="fld">
          Email
          <input type="email" name="email" required autoComplete="email" autoFocus />
        </label>
        <label className="fld">
          Password
          <input type="password" name="password" required autoComplete="current-password" />
        </label>
        {error && <p className="msg-err">Wrong email or password — try again.</p>}
        <button className="btn btn--gold" style={{ width: "100%", marginTop: ".4rem" }}>
          Sign In
        </button>
      </form>
    </div>
  );
}
