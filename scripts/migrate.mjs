#!/usr/bin/env node
// Applies pending SQL migrations from db/migrations in filename order.
//
//   npm run db:migrate            apply pending migrations
//   npm run db:migrate -- --status  list applied / pending, change nothing
//
// Each file runs once and is recorded in schema_migrations with a checksum.
// The runner never drops tables or deletes data; it refuses to continue if an
// already-applied migration file has been edited. A named lock prevents two
// runs (e.g. two deploys) from applying migrations at the same time.
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect, fail, loadEnv, parseArgs } from "./lib/cli.mjs";

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
const LOCK_NAME = "bhf_schema_migrations";

async function main() {
  loadEnv();
  const args = parseArgs();
  const conn = await connect({ multipleStatements: true });
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       VARCHAR(255) NOT NULL,
        checksum   CHAR(64)     NOT NULL,
        applied_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    const [lockRows] = await conn.query("SELECT GET_LOCK(?, 30) AS got", [LOCK_NAME]);
    if (!lockRows[0]?.got) throw new Error("Another migration run holds the lock; try again shortly.");

    try {
      const files = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
      const [appliedRows] = await conn.query("SELECT name, checksum FROM schema_migrations");
      const applied = new Map(appliedRows.map((r) => [r.name, r.checksum]));

      const pending = [];
      for (const file of files) {
        const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
        const checksum = createHash("sha256").update(sql).digest("hex");
        if (applied.has(file)) {
          if (applied.get(file) !== checksum) {
            throw new Error(
              `Migration ${file} was modified after it was applied. ` +
                "Never edit an applied migration; add a new one instead."
            );
          }
          if (args.status) console.log(`  applied  ${file}`);
        } else {
          pending.push({ file, sql, checksum });
          if (args.status) console.log(`  pending  ${file}`);
        }
      }

      if (args.status) return;
      if (pending.length === 0) {
        console.log("Database schema is up to date.");
        return;
      }
      for (const m of pending) {
        process.stdout.write(`Applying ${m.file} ... `);
        // MySQL commits DDL implicitly, so a migration can't be wrapped in a
        // transaction. Migrations are written to be safely re-runnable
        // (IF NOT EXISTS) in case one is interrupted half way.
        await conn.query(m.sql);
        await conn.query("INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)", [
          m.file,
          m.checksum,
        ]);
        console.log("done");
      }
      console.log(`Applied ${pending.length} migration(s).`);
    } finally {
      await conn.query("SELECT RELEASE_LOCK(?)", [LOCK_NAME]);
    }
  } finally {
    await conn.end();
  }
}

main().catch(fail);
