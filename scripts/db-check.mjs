#!/usr/bin/env node
// Database health check: verifies the connection settings, the server
// version, the session time zone and that all migrations have been applied.
// Exit code 0 = healthy, 1 = problem. Never prints credentials.
//
//   npm run db:check
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readDbConfig } from "../lib/shared/db-config.mjs";
import { connect, fail, loadEnv } from "./lib/cli.mjs";

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

async function main() {
  loadEnv();
  const cfg = readDbConfig();
  const target = cfg.socketPath ? `socket ${cfg.socketPath}` : `${cfg.host}:${cfg.port}`;
  console.log(`Connecting to database "${cfg.database}" on ${target} as "${cfg.user}" ...`);
  const conn = await connect();
  try {
    const [[info]] = await conn.query(
      "SELECT VERSION() AS version, @@session.time_zone AS tz, UTC_TIMESTAMP(3) AS now_utc"
    );
    console.log(`  server:    ${info.version}`);
    console.log(`  time zone: ${info.tz}`);

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d+_.+\.sql$/.test(f));
    let applied = [];
    try {
      const [rows] = await conn.query("SELECT name FROM schema_migrations");
      applied = rows.map((r) => r.name);
    } catch (err) {
      if (err?.code !== "ER_NO_SUCH_TABLE") throw err;
    }
    const pending = files.filter((f) => !applied.includes(f));
    if (pending.length) {
      console.error(`  migrations: ${pending.length} pending (${pending.join(", ")}). Run: npm run db:migrate`);
      process.exitCode = 1;
      return;
    }
    console.log(`  migrations: all ${files.length} applied`);

    const [[counts]] = await conn.query(
      "SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM users WHERE role = 'admin') AS admins"
    );
    console.log(`  users:     ${counts.users} (${counts.admins} admin)`);
    if (Number(counts.admins) === 0) {
      console.warn("  warning:   no administrator exists yet. Run: npm run create-admin");
    }
    console.log("Database OK.");
  } finally {
    await conn.end();
  }
}

main().catch(fail);
