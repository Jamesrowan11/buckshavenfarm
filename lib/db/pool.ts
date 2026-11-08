import mysql from "mysql2/promise";

// One shared connection pool. DATABASE_URL comes from /etc/buckshavenfarm/env on
// the server (mysql://user:pass@127.0.0.1:3306/buckshavenfarm).
// Dates come back the way the pages expect: DATE as "YYYY-MM-DD", TIME as
// "HH:MM:SS", timestamps as ISO strings in UTC, booleans as true/false.
const g = globalThis as unknown as { __bhPool?: mysql.Pool };

export function pool(): mysql.Pool {
  if (!g.__bhPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const p = mysql.createPool({
      uri: url,
      connectionLimit: 10,
      timezone: "Z",
      dateStrings: true,
      typeCast(field, next) {
        if (field.type === "TINY" && field.length === 1) {
          const v = field.string();
          return v === null ? null : v === "1";
        }
        if (field.type === "DATETIME" || field.type === "TIMESTAMP") {
          const v = field.string();
          return v === null ? null : v.replace(" ", "T") + "Z";
        }
        return next();
      },
    });
    p.on("connection", (conn) => {
      conn.query("SET time_zone = '+00:00'");
    });
    g.__bhPool = p;
  }
  return g.__bhPool;
}
