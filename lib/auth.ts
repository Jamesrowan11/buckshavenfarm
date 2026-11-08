import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2/promise";
import { pool } from "./db/pool";
import type { Me } from "./db/policies";

// Logins: passwords are bcrypt hashes in the profiles table; a signed,
// httpOnly cookie identifies the session. Changing a password bumps
// session_version, which signs that person out everywhere.

export const SESSION_COOKIE = "bh_session";
const SESSION_DAYS = 14;

export function authSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET is not set (32+ characters)");
  return new TextEncoder().encode(s);
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 12);
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return "Use at least 10 characters.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Use both letters and numbers.";
  return null;
}

let dummy: Promise<string> | null = null;
const dummyHash = () => (dummy ??= bcrypt.hash("not-a-real-password", 12));

type ProfileRow = RowDataPacket & { id: string; name: string; email: string; role: "admin" | "employee"; password_hash: string | null; session_version: number };

async function profileByEmail(email: string): Promise<ProfileRow | null> {
  const [rows] = await pool().query<ProfileRow[]>(
    "SELECT id, name, email, role, password_hash, session_version FROM profiles WHERE email = ?",
    [email.trim().toLowerCase()],
  );
  return rows[0] ?? null;
}

async function startSession(p: { id: string; session_version: number }) {
  const token = await new SignJWT({ v: p.session_version })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(authSecret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

/** Check email + password and start a session. Returns an error message, or null on success. */
export async function signIn(email: string, password: string): Promise<string | null> {
  const p = await profileByEmail(email);
  // Compare against a dummy hash when the user doesn't exist, so timing doesn't reveal accounts.
  const ok = await bcrypt.compare(password, p?.password_hash ?? (await dummyHash()));
  if (!p || !p.password_hash || !ok) return "Wrong email or password.";
  await startSession(p);
  return null;
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** First-time password with the one-time setup code (only for accounts that don't have a password yet). */
export async function setFirstPassword(email: string, code: string, password: string): Promise<string | null> {
  const expected = (process.env.SETUP_CODE_SHA256 || "").toLowerCase();
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const got = createHash("sha256").update(code.trim()).digest("hex");
  if (!/^[0-9a-f]{64}$/.test(expected) || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
    return "That setup code isn't right.";
  }
  const p = await profileByEmail(email);
  if (!p) return "There's no account for that email. Ask an admin to add you.";
  if (p.password_hash) return "This account already has a password. Sign in, or ask an admin to reset it.";
  const problem = passwordProblem(password);
  if (problem) return problem;
  await pool().query("UPDATE profiles SET password_hash = ?, session_version = session_version + 1 WHERE id = ?", [
    await hashPassword(password),
    p.id,
  ]);
  await startSession({ id: p.id, session_version: p.session_version + 1 });
  return null;
}

/** Admin: set someone's password (they're signed out everywhere). */
export async function adminSetPassword(userId: string, password: string): Promise<string | null> {
  const problem = passwordProblem(password);
  if (problem) return problem;
  await pool().query("UPDATE profiles SET password_hash = ?, session_version = session_version + 1 WHERE id = ?", [
    await hashPassword(password),
    userId,
  ]);
  return null;
}

/** The signed-in person, or null. Checks the cookie and that the account still exists. */
export async function currentUser(): Promise<Me> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecret());
    const [rows] = await pool().query<ProfileRow[]>(
      "SELECT id, name, email, role, session_version FROM profiles WHERE id = ?",
      [String(payload.sub)],
    );
    const p = rows[0];
    if (!p || p.session_version !== payload.v) return null;
    return { id: p.id, name: p.name, email: p.email, role: p.role };
  } catch {
    return null;
  }
}
