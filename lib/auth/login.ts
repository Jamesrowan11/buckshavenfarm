// Credentials check for the sign-in endpoint.
import "server-only";
import { queryOne } from "@/lib/db";
import { RateLimitError, UnauthorizedError } from "@/lib/errors";
import { dummyHash, PASSWORD_MAX_LENGTH, verifyPassword } from "@/lib/shared/password.mjs";
import { createSession, purgeExpiredSessions } from "@/lib/auth/session";
import {
  clearFailures,
  EMAIL_RULE,
  emailKey,
  IP_RULE,
  ipKey,
  isLocked,
  purgeStaleAttempts,
  recordFailure,
} from "@/lib/auth/throttle";
import type { Role } from "@/lib/types";

// One message for unknown email, wrong password and accounts without a
// password, so the response never reveals which accounts exist.
export const INVALID_CREDENTIALS = "Invalid email or password.";

export async function authenticate(input: {
  email: string;
  password: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<{ token: string; userId: string; role: Role; expiresAt: Date }> {
  const email = input.email.trim().toLowerCase();
  const keys = [emailKey(email)];
  if (input.ip) keys.push(ipKey(input.ip));

  if (await isLocked(keys)) throw new RateLimitError();

  const user = await queryOne<{ id: string; role: Role; password_hash: string | null }>(
    "SELECT id, role, password_hash FROM users WHERE email = ?",
    [email]
  );

  // Always run one Argon2 verification so timing doesn't reveal whether the
  // email exists.
  const password = input.password.slice(0, PASSWORD_MAX_LENGTH);
  const ok = user?.password_hash
    ? await verifyPassword(user.password_hash, password)
    : (await verifyPassword(await dummyHash(), password), false);

  if (!user || !ok) {
    await recordFailure(emailKey(email), EMAIL_RULE);
    if (input.ip) await recordFailure(ipKey(input.ip), IP_RULE);
    throw new UnauthorizedError(INVALID_CREDENTIALS);
  }

  await clearFailures(emailKey(email));
  const { token, session } = await createSession(user.id, { userAgent: input.userAgent, ip: input.ip });

  // Housekeeping; failures here must not block sign-in.
  void Promise.all([purgeExpiredSessions(), purgeStaleAttempts()]).catch(() => {});

  return { token, userId: user.id, role: user.role, expiresAt: session.expiresAt };
}
