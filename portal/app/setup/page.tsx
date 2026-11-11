import { redirect } from "next/navigation";
import { headers } from "next/headers";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, homeFor } from "@/lib/auth";

/*
 * First-time password with the one-time setup code. Only works for accounts
 * that don't have a password yet (e.g. accounts brought over from the old
 * portal before that person ever signed in). The code's SHA-256 hash comes from
 * SETUP_CODE_SHA256 (infra/digitalocean/site.conf); the code itself is never
 * stored anywhere.
 */

const attempts = new Map<string, { n: number; reset: number }>();
function tooMany(ip: string) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || a.reset < now) {
    attempts.set(ip, { n: 1, reset: now + 15 * 60_000 });
    return false;
  }
  a.n += 1;
  return a.n > 10;
}

function codeMatches(code: string) {
  const expected = (process.env.SETUP_CODE_SHA256 || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected)) return false;
  const got = crypto.createHash("sha256").update(code.trim()).digest();
  return crypto.timingSafeEqual(got, Buffer.from(expected, "hex"));
}

async function setup(formData: FormData) {
  "use server";
  const ip = ((await headers()).get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  if (tooMany(ip)) redirect("/setup?error=busy");
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const code = String(formData.get("code") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  if (password.length < 8) redirect("/setup?error=short");
  if (password !== confirm) redirect("/setup?error=match");
  if (!codeMatches(code)) redirect("/setup?error=code");
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active || user.passwordHash) redirect("/setup?error=account");
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 12) } });
  await createSession(user);
  redirect(homeFor(user.role));
}

const ERRORS: Record<string, string> = {
  short: "The password must be at least 8 characters.",
  match: "The two passwords don't match.",
  code: "That setup code isn't right.",
  account: "That email has no account waiting for a first password. If you already set one, sign in instead.",
  busy: "Too many tries. Wait 15 minutes and try again.",
};

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="login-wrap">
      <form className="login-card" action={setup}>
        <img src="/portal/logo-mark.svg" alt="" />
        <h1>Set Your Password</h1>
        <label className="fld">
          Email
          <input type="email" name="email" required autoComplete="email" autoFocus />
        </label>
        <label className="fld">
          Setup code (from the farm office)
          <input name="code" required autoComplete="off" />
        </label>
        <label className="fld">
          New password (at least 8 characters)
          <input type="password" name="password" required minLength={8} autoComplete="new-password" />
        </label>
        <label className="fld">
          New password again
          <input type="password" name="confirm" required minLength={8} autoComplete="new-password" />
        </label>
        {error && <p className="msg-err">{ERRORS[error] ?? "Something went wrong. Try again."}</p>}
        <button className="btn btn--gold" style={{ width: "100%", marginTop: ".4rem" }}>
          Save and Sign In
        </button>
        <p style={{ textAlign: "center", marginTop: "1rem", fontSize: ".86rem" }}>
          <a href="/portal/login">Back to sign in</a>
        </p>
      </form>
    </div>
  );
}
