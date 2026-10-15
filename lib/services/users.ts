// Employee / administrator accounts (replaces Supabase Auth users + profiles).
import "server-only";
import { randomUUID } from "node:crypto";
import { execute, query, queryOne, toBool, toIso, withTransaction, type Queryable } from "@/lib/db";
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { assertAdmin, assertSignedIn, type Actor } from "@/lib/auth/authorize";
import { invalidateUserSessions } from "@/lib/auth/session";
import { checkPasswordStrength, hashPassword, verifyPassword } from "@/lib/shared/password.mjs";
import { email as emailSchema, parse, requiredText, role as roleSchema, uuid } from "@/lib/validation";
import type { ProfileListItem, Role, UserOption } from "@/lib/types";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
  has_password: number;
  created_at: Date;
};

function toListItem(r: UserRow): ProfileListItem {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    has_password: toBool(r.has_password),
    created_at: toIso(r.created_at),
  };
}

function validatePassword(password: string): string {
  const problem = checkPasswordStrength(password);
  if (problem) throw new ValidationError(problem);
  return password;
}

export async function listUsers(actor: Actor): Promise<ProfileListItem[]> {
  assertAdmin(actor);
  const rows = await query<UserRow>(
    `SELECT id, email, name, role, password_hash IS NOT NULL AS has_password, created_at
       FROM users ORDER BY role, name`
  );
  return rows.map(toListItem);
}

/** Names for pickers (assign task, responsible employee, shift employee). */
export async function listUserOptions(actor: Actor, filter?: { role?: Role }): Promise<UserOption[]> {
  assertAdmin(actor);
  if (filter?.role) {
    return query<UserOption>("SELECT id, name FROM users WHERE role = ? ORDER BY name", [filter.role]);
  }
  return query<UserOption>("SELECT id, name FROM users ORDER BY name");
}

export async function createUser(
  actor: Actor,
  input: { email: string; name: string; role: string; password: string }
): Promise<string> {
  assertAdmin(actor);
  const email = parse(emailSchema, input.email);
  const name = requiredText(input.name, "Name", 200);
  const role = parse(roleSchema, input.role);
  const passwordHash = await hashPassword(validatePassword(input.password));
  const id = randomUUID();
  try {
    await execute(
      `INSERT INTO users (id, email, name, role, password_hash, password_changed_at)
       VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
      [id, email, name, role, passwordHash]
    );
  } catch (err) {
    if (err instanceof ConflictError) throw new ConflictError("A user with that email already exists.");
    throw err;
  }
  return id;
}

export async function updateUserName(actor: Actor, userId: string, name: string): Promise<void> {
  assertAdmin(actor);
  const id = parse(uuid, userId);
  const clean = requiredText(name, "Name", 200);
  const result = await execute("UPDATE users SET name = ? WHERE id = ?", [clean, id]);
  if (result.affectedRows === 0) throw new NotFoundError();
}

/**
 * Locks the admin rows and fails if the change would leave no administrator,
 * so the farm can never be locked out of its own admin portal.
 */
async function assertNotLastAdmin(tx: Queryable, userId: string) {
  const admins = await query<{ id: string }>("SELECT id FROM users WHERE role = 'admin' FOR UPDATE", [], tx);
  if (admins.length <= 1 && admins.some((a) => a.id === userId)) {
    throw new ForbiddenError("At least one administrator must remain.");
  }
}

export async function setUserRole(actor: Actor, userId: string, newRole: string): Promise<void> {
  assertAdmin(actor);
  const id = parse(uuid, userId);
  const role = parse(roleSchema, newRole);
  if (id === actor.id && role !== "admin") {
    throw new ForbiddenError("You can't remove your own administrator access.");
  }
  await withTransaction(async (tx) => {
    const target = await queryOne<{ role: Role }>("SELECT role FROM users WHERE id = ? FOR UPDATE", [id], tx);
    if (!target) throw new NotFoundError();
    if (target.role === role) return;
    if (target.role === "admin") await assertNotLastAdmin(tx, id);
    await execute("UPDATE users SET role = ? WHERE id = ?", [role, id], tx);
  });
}

export async function deleteUser(actor: Actor, userId: string): Promise<void> {
  assertAdmin(actor);
  const id = parse(uuid, userId);
  if (id === actor.id) throw new ForbiddenError("You can't remove your own account.");
  await withTransaction(async (tx) => {
    const target = await queryOne<{ role: Role }>("SELECT role FROM users WHERE id = ? FOR UPDATE", [id], tx);
    if (!target) throw new NotFoundError();
    if (target.role === "admin") await assertNotLastAdmin(tx, id);
    // Foreign keys cascade (sessions, shifts, availability, time off, clock
    // logs) or set NULL (tasks, charts, announcements, notes), exactly as
    // deleting a profile did in Supabase.
    await execute("DELETE FROM users WHERE id = ?", [id], tx);
  });
}

/** Admin sets a temporary password for someone (also used for imported users). */
export async function resetUserPassword(actor: Actor, userId: string, password: string): Promise<void> {
  assertAdmin(actor);
  const id = parse(uuid, userId);
  const passwordHash = await hashPassword(validatePassword(password));
  await withTransaction(async (tx) => {
    const result = await execute(
      "UPDATE users SET password_hash = ?, password_changed_at = UTC_TIMESTAMP(3) WHERE id = ?",
      [passwordHash, id],
      tx
    );
    if (result.affectedRows === 0) throw new NotFoundError();
    await invalidateUserSessions(id, undefined, tx);
    const user = await queryOne<{ email: string }>("SELECT email FROM users WHERE id = ?", [id], tx);
    if (user) await execute("DELETE FROM login_attempts WHERE throttle_key = ?", [`email:${user.email}`], tx);
  });
}

/** Signed-in user changes their own password; other sessions are signed out. */
export async function changeOwnPassword(
  actor: Actor,
  currentSessionId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  assertSignedIn(actor);
  validatePassword(newPassword);
  const row = await queryOne<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id = ?", [
    actor.id,
  ]);
  if (!row?.password_hash || !(await verifyPassword(row.password_hash, currentPassword))) {
    throw new UnauthorizedError("Your current password is incorrect.");
  }
  if (currentPassword === newPassword) {
    throw new ValidationError("Choose a password different from your current one.");
  }
  const passwordHash = await hashPassword(newPassword);
  await withTransaction(async (tx) => {
    await execute(
      "UPDATE users SET password_hash = ?, password_changed_at = UTC_TIMESTAMP(3) WHERE id = ?",
      [passwordHash, actor.id],
      tx
    );
    await invalidateUserSessions(actor.id, currentSessionId, tx);
  });
}
