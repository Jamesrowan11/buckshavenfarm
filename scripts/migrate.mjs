// Creates/updates the database tables (db/schema.sql). Safe to run on every deploy.
//   DATABASE_URL=mysql://... node scripts/migrate.mjs
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";

const sql = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL, multipleStatements: true });
await conn.query("SET time_zone = '+00:00'");
await conn.query(sql);
const [[{ n }]] = await conn.query("SELECT COUNT(*) AS n FROM profiles");
console.log(`Database ready (${n} people).`);
await conn.end();
