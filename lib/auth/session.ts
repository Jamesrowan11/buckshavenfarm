// Database-backed sessions. The browser holds a random 256-bit token; the
// database stores only its SHA-256, so a database leak can't be replayed.
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { execute, queryOne, toIso, type Queryable } from "@/lib/db";
import { sessionIdleMs, sessionMaxMs } from "@/lib/auth/config";
import type { Profile, Role } from "@/lib/types";

export type SessionUser = Profile;

export type Session = {
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
};

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Only well-formed tokens ever reach the database. */
function isWellFormedToken(token: string | undefined | null): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
  db?: Queryable
): Promise<{ token: string; session: Session }> {
  const token = generateSessionToken();
  const id = hashSessionToken(token);
  const now = Date.now();
  const expiresAt = new Date(Math.min(now + sessionIdleMs(), now + sessionMaxMs()));
  await execute(
    `INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at, user_agent, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      new Date(now),
      new Date(now),
      expiresAt,
      meta.userAgent?.slice(0, 255) ?? null,
      meta.ip?.slice(0, 64) ?? null,
    ],
    db
  );
  return { token, session: { id, userId, createdAt: new Date(now), expiresAt } };
}

type SessionRow = {
  id: string;
  user_id: string;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
  email: string;
  name: string;
  role: Role;
  user_created_at: Date;
};

/**
 * Returns the session and its user, or null if the token is unknown or the
 * session has expired (idle timeout or absolute lifetime). Extends the idle
 * timeout on activity, at most once a minute to avoid a write per request.
 */
export async function validateSessionToken(
  token: string | undefined | null
): Promise<{ session: Session; user: SessionUser } | null> {
  if (!isWellFormedToken(token)) return null;
  const id = hashSessionToken(token);
  const row = await queryOne<SessionRow>(
    `SELECT s.id, s.user_id, s.created_at, s.last_seen_at, s.expires_at,
            u.email, u.name, u.role, u.created_at AS user_created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = ?`,
    [id]
  );
  if (!row) return null;

  const now = Date.now();
  const absoluteEnd = row.created_at.getTime() + sessionMaxMs();
  if (row.expires_at.getTime() <= now || absoluteEnd <= now) {
    await execute("DELETE FROM sessions WHERE id = ?", [id]);
    return null;
  }

  let expiresAt = row.expires_at;
  if (now - row.last_seen_at.getTime() > 60_000) {
    expiresAt = new Date(Math.min(now + sessionIdleMs(), absoluteEnd));
    await execute("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?", [
      new Date(now),
      expiresAt,
      id,
    ]);
  }

  return {
    session: { id, userId: row.user_id, createdAt: row.created_at, expiresAt },
    user: {
      id: row.user_id,
      email: row.email,
      name: row.name,
      role: row.role,
      created_at: toIso(row.user_created_at),
    },
  };
}

export async function invalidateSessionToken(token: string | undefined | null): Promise<void> {
  if (!isWellFormedToken(token)) return;
  await execute("DELETE FROM sessions WHERE id = ?", [hashSessionToken(token)]);
}

/** Signs a user out everywhere, optionally keeping one session (the current one). */
export async function invalidateUserSessions(
  userId: string,
  exceptSessionId?: string,
  db?: Queryable
): Promise<void> {
  if (exceptSessionId) {
    await execute("DELETE FROM sessions WHERE user_id = ? AND id <> ?", [userId, exceptSessionId], db);
  } else {
    await execute("DELETE FROM sessions WHERE user_id = ?", [userId], db);
  }
}

/** Removes expired sessions (called opportunistically on login). */
export async function purgeExpiredSessions(): Promise<number> {
  const result = await execute("DELETE FROM sessions WHERE expires_at <= UTC_TIMESTAMP(3)");
  return result.affectedRows;
}
