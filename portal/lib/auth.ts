import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";
import type { Role } from "@prisma/client";

const COOKIE = "bhf_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

export type Session = { uid: string; role: Role; name: string };

export async function createSession(user: { id: string; role: Role; name: string }) {
  const token = await new SignJWT({ uid: user.id, role: user.role, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { uid: payload.uid as string, role: payload.role as Role, name: payload.name as string };
  } catch {
    return null;
  }
}

/** Require a signed-in user with one of the given roles; redirects otherwise. */
export async function requireRole(...roles: Role[]): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (roles.length && !roles.includes(session.role)) redirect(homeFor(session.role));
  return session;
}

export function homeFor(role: Role): string {
  if (role === "ADMIN") return "/admin";
  if (role === "EMPLOYEE") return "/employee";
  return "/boarder";
}
