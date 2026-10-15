// Password hashing, shared by the app and the CLI scripts so both always use
// the same Argon2id parameters.
import { randomUUID } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

// Argon2id (algorithm 2 in @node-rs/argon2). Parameters follow the OWASP
// recommendation (m=19 MiB, t=2, p=1). Hashes are self-describing PHC
// strings, so these can be raised later without invalidating old hashes.
const ARGON2_OPTIONS = {
  algorithm: 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 256;

/**
 * Returns an error message, or null when the password is acceptable.
 * @param {string} password
 */
export function checkPasswordStrength(password) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  return null;
}

/** @param {string} password */
export async function hashPassword(password) {
  return hash(password, ARGON2_OPTIONS);
}

/**
 * @param {string} passwordHash
 * @param {string} password
 */
export async function verifyPassword(passwordHash, password) {
  try {
    return await verify(passwordHash, password);
  } catch {
    // Malformed hash: treat as a failed match, never as an error that could
    // leak information to the caller.
    return false;
  }
}

// A valid hash of a random string, verified against when the email is unknown
// so that "no such user" takes as long as "wrong password".
let dummyHashPromise = null;
export function dummyHash() {
  dummyHashPromise ??= hash(randomUUID(), ARGON2_OPTIONS);
  return dummyHashPromise;
}
