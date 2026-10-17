import bcrypt from "bcryptjs";
import { db } from "./db";

/** Same minimum the admin "Reset password" form uses. */
export const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;

export type PasswordResult =
  | "changed"
  | "wrong-current"
  | "too-short"
  | "too-long"
  | "mismatch"
  | "same"
  | "locked";

export const PASSWORD_MESSAGES: Record<PasswordResult, { text: string; ok: boolean }> = {
  changed: { text: "Your password has been changed.", ok: true },
  "wrong-current": { text: "Your current password is incorrect.", ok: false },
  "too-short": { text: `The new password must be at least ${MIN_PASSWORD} characters.`, ok: false },
  "too-long": { text: `The new password must be at most ${MAX_PASSWORD} characters.`, ok: false },
  mismatch: { text: "The two new passwords don't match.", ok: false },
  same: { text: "Choose a new password that's different from your current one.", ok: false },
  locked: { text: "Too many wrong attempts. Wait 15 minutes and try again.", ok: false },
};

/** Narrows an untrusted ?pw= query value to a known result (or undefined). */
export function passwordResultFrom(value: string | undefined): PasswordResult | undefined {
  return value && Object.hasOwn(PASSWORD_MESSAGES, value) ? (value as PasswordResult) : undefined;
}

// Wrong "current password" attempts per user, so a session left open on a
// shared barn computer can't be used to guess the password. In memory: resets
// when the app restarts.
const failures = new Map<string, number[]>();
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60_000;

/**
 * Changes the signed-in user's own password after checking the current one.
 * `uid` must come from the server-side session, never from the form.
 */
export async function changeOwnPassword(
  uid: string,
  current: string,
  next: string,
  confirm: string
): Promise<PasswordResult> {
  const now = Date.now();
  const recent = (failures.get(uid) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_FAILURES) return "locked";

  if (next.length < MIN_PASSWORD) return "too-short";
  if (next.length > MAX_PASSWORD) return "too-long";
  if (next !== confirm) return "mismatch";

  const user = await db.user.findUnique({ where: { id: uid }, select: { passwordHash: true } });
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) {
    recent.push(now);
    failures.set(uid, recent);
    return "wrong-current";
  }
  if (current === next) return "same";

  await db.user.update({
    where: { id: uid },
    data: { passwordHash: await bcrypt.hash(next, 12) },
  });
  failures.delete(uid);
  return "changed";
}
