#!/usr/bin/env node
// OPTIONAL: adds a few sample horses, feeding charts and a welcome
// announcement so a brand-new installation has something to look at.
//
//   npm run db:seed-demo -- --yes
//
// Safe to run intentionally: it never touches users, passwords or any
// existing rows, and does nothing if any horse already exists (so running it
// twice, or against a database with real data, changes nothing).
// Not needed for production — skip it if you're importing real data.
import { randomUUID } from "node:crypto";
import { connect, fail, loadEnv, parseArgs } from "./lib/cli.mjs";

const HORSES = [
  { name: "Sample Horse 1", barn: "log-barn", am: "2 qt senior feed", pm: "2 qt senior feed + hay" },
  { name: "Sample Horse 2", barn: "arena-barn", am: "1 qt pellets", pm: "Hay only" },
];

async function main() {
  loadEnv();
  if (!parseArgs().yes) {
    throw new Error("This adds sample data. Re-run with --yes to confirm: npm run db:seed-demo -- --yes");
  }
  const conn = await connect();
  try {
    await conn.beginTransaction();
    const [[{ n }]] = await conn.query("SELECT COUNT(*) AS n FROM horses FOR UPDATE");
    if (Number(n) > 0) {
      await conn.rollback();
      console.log("Horses already exist; demo data not added (nothing changed).");
      return;
    }
    for (const h of HORSES) {
      const horseId = randomUUID();
      await conn.query("INSERT INTO horses (id, name, barn) VALUES (?, ?, ?)", [horseId, h.name, h.barn]);
      await conn.query(
        "INSERT INTO feeding_charts (id, horse_id, am_feed, pm_feed, barn) VALUES (?, ?, ?, ?, ?)",
        [randomUUID(), horseId, h.am, h.pm, h.barn]
      );
    }
    await conn.query("INSERT INTO announcements (id, title, body) VALUES (?, ?, ?)", [
      randomUUID(),
      "Welcome to the new portal",
      "Sample announcement — delete it from Admin → Announcements.",
    ]);
    await conn.commit();
    console.log(`Added ${HORSES.length} sample horses with feeding charts and one announcement.`);
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    await conn.end();
  }
}

main().catch(fail);
