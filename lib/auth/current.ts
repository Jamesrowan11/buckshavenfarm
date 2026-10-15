// The signed-in user for the current request (Server Components, Server
// Actions and route handlers). The session cookie is validated against the
// database on every request; roles always come from the database, never from
// anything the browser sends.
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth/config";
import { validateSessionToken, type Session, type SessionUser } from "@/lib/auth/session";

export const getCurrentSession = cache(
  async (): Promise<{ session: Session; user: SessionUser } | null> => {
    const store = await cookies();
    return validateSessionToken(store.get(SESSION_COOKIE)?.value);
  }
);

export async function getCurrentUser(): Promise<SessionUser | null> {
  return (await getCurrentSession())?.user ?? null;
}

/** For pages and actions that need any signed-in user. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For admin pages and actions. Employees are sent to their own portal. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/employee");
  return user;
}
