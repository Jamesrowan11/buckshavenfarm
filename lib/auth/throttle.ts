// Brute-force protection for sign-in, stored in the database so it holds
// across restarts and across multiple app processes.
//
// Two independent limits:
//   * per account (email): 5 failures in 15 minutes locks that account's
//     sign-in for 15 minutes — stops password guessing on one account.
//   * per client IP: 30 failures in 15 minutes locks that IP for 15 minutes —
//     stops one client spraying many accounts.
import "server-only";
import { execute, queryOne, withTransaction } from "@/lib/db";

export type ThrottleRule = { maxFailures: number; windowMs: number; lockMs: number };

export const EMAIL_RULE: ThrottleRule = { maxFailures: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };
export const IP_RULE: ThrottleRule = { maxFailures: 30, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };

export const emailKey = (email: string) => `email:${email.toLowerCase()}`.slice(0, 191);
export const ipKey = (ip: string) => `ip:${ip}`.slice(0, 191);

/** True if any of the keys is currently locked. */
export async function isLocked(keys: string[]): Promise<boolean> {
  if (keys.length === 0) return false;
  const row = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM login_attempts
      WHERE throttle_key IN (?) AND locked_until IS NOT NULL AND locked_until > UTC_TIMESTAMP(3)`,
    [keys]
  );
  return Number(row?.n ?? 0) > 0;
}

/** Records one failed attempt for `key`; locks it when the rule is exceeded. */
export async function recordFailure(key: string, rule: ThrottleRule, now: Date = new Date()): Promise<void> {
  await withTransaction(async (tx) => {
    const row = await queryOne<{ failures: number; window_started_at: Date }>(
      "SELECT failures, window_started_at FROM login_attempts WHERE throttle_key = ? FOR UPDATE",
      [key],
      tx
    );
    const windowExpired = !row || now.getTime() - row.window_started_at.getTime() > rule.windowMs;
    const failures = windowExpired ? 1 : row.failures + 1;
    const windowStart = windowExpired ? now : row.window_started_at;
    const lockedUntil = failures >= rule.maxFailures ? new Date(now.getTime() + rule.lockMs) : null;
    await execute(
      `INSERT INTO login_attempts (throttle_key, failures, window_started_at, locked_until)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE failures = VALUES(failures),
                               window_started_at = VALUES(window_started_at),
                               locked_until = VALUES(locked_until)`,
      [key, failures, windowStart, lockedUntil],
      tx
    );
  });
}

export async function clearFailures(key: string): Promise<void> {
  await execute("DELETE FROM login_attempts WHERE throttle_key = ?", [key]);
}

/** Drops stale rows (called opportunistically on login). */
export async function purgeStaleAttempts(): Promise<void> {
  await execute(
    `DELETE FROM login_attempts
      WHERE window_started_at < UTC_TIMESTAMP(3) - INTERVAL 1 DAY
        AND (locked_until IS NULL OR locked_until < UTC_TIMESTAMP(3))`
  );
}
