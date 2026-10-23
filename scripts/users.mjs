#!/usr/bin/env node
// Administrative account tools. Run on the server (SSH, in the app directory)
// — there is deliberately no web route that can create the first admin.
//
//   npm run create-admin -- --email you@example.com --name "Your Name"
//       Creates the first administrator. Refuses if an admin already exists
//       unless --additional is passed. If the email already belongs to a user
//       (e.g. imported from Supabase), that user is promoted to admin and
//       given the new password.
//
//   npm run set-password -- --email someone@example.com
//       Sets a new password for an existing user (account recovery), signs
//       them out everywhere and clears any login lockout.
//
// The password is read from a hidden prompt (or the first line of stdin when
// piped). It is never accepted as a command-line argument, so it doesn't end
// up in shell history or the process list, and it is never printed.
import { randomUUID } from "node:crypto";
import { checkPasswordStrength, hashPassword } from "../lib/shared/password.mjs";
import { connect, fail, loadEnv, parseArgs, readSecret } from "./lib/cli.mjs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function promptNewPassword() {
  const pw = await readSecret("New password: ");
  const problem = checkPasswordStrength(pw);
  if (problem) throw new Error(problem);
  if (process.stdin.isTTY) {
    const again = await readSecret("Repeat password: ");
    if (again !== pw) throw new Error("Passwords do not match.");
  }
  return pw;
}

function requireEmail(args) {
  const email = typeof args.email === "string" ? args.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    throw new Error("Pass a valid --email address.");
  }
  return email;
}

async function createAdmin(args) {
  const email = requireEmail(args);
  const name = typeof args.name === "string" ? args.name.trim().slice(0, 200) : "";
  if (!name) throw new Error('Pass --name "Full Name".');

  const conn = await connect();
  try {
    const [[{ admins }]] = await conn.query("SELECT COUNT(*) AS admins FROM users WHERE role = 'admin'");
    if (Number(admins) > 0 && !args.additional) {
      throw new Error(
        "An administrator already exists. Sign in as that admin and add users from " +
          "/admin/employees, or pass --additional to create another admin from the server."
      );
    }
    const password = await promptNewPassword();
    const passwordHash = await hashPassword(password);

    await conn.beginTransaction();
    try {
      const [existing] = await conn.query("SELECT id FROM users WHERE email = ? FOR UPDATE", [email]);
      if (existing.length) {
        const id = existing[0].id;
        await conn.query(
          `UPDATE users SET role = 'admin', name = ?, password_hash = ?, password_changed_at = UTC_TIMESTAMP(3)
            WHERE id = ?`,
          [name, passwordHash, id]
        );
        await conn.query("DELETE FROM sessions WHERE user_id = ?", [id]);
        await conn.commit();
        console.log(`Existing user ${email} promoted to administrator and password set.`);
      } else {
        await conn.query(
          `INSERT INTO users (id, email, name, role, password_hash, password_changed_at)
           VALUES (?, ?, ?, 'admin', ?, UTC_TIMESTAMP(3))`,
          [randomUUID(), email, name, passwordHash]
        );
        await conn.commit();
        console.log(`Administrator ${email} created.`);
      }
    } catch (err) {
      await conn.rollback();
      throw err;
    }
  } finally {
    await conn.end();
  }
}

async function setPassword(args) {
  const email = requireEmail(args);
  const conn = await connect();
  try {
    const [rows] = await conn.query("SELECT id FROM users WHERE email = ?", [email]);
    if (!rows.length) throw new Error(`No user with email ${email}.`);
    const password = await promptNewPassword();
    const passwordHash = await hashPassword(password);
    await conn.beginTransaction();
    try {
      await conn.query(
        "UPDATE users SET password_hash = ?, password_changed_at = UTC_TIMESTAMP(3) WHERE id = ?",
        [passwordHash, rows[0].id]
      );
      await conn.query("DELETE FROM sessions WHERE user_id = ?", [rows[0].id]);
      await conn.query("DELETE FROM login_attempts WHERE throttle_key = ?", [`email:${email}`]);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    }
    console.log(`Password updated for ${email}; existing sessions were signed out.`);
  } finally {
    await conn.end();
  }
}

async function main() {
  loadEnv();
  const [command] = process.argv.slice(2);
  const args = parseArgs(process.argv.slice(3));
  if (command === "create-admin") return createAdmin(args);
  if (command === "set-password") return setPassword(args);
  throw new Error("Usage: users.mjs create-admin|set-password --email <email> [--name <name>]");
}

main().catch(fail);
