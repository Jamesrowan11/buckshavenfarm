import { describe, expect, it } from "vitest";
import { DbConfigError, readDbConfig, toMysqlOptions } from "@/lib/shared/db-config.mjs";

describe("readDbConfig", () => {
  it("parses a mysql:// connection URL, decoding special characters", () => {
    const c = readDbConfig({ DATABASE_URL: "mysql://app%40farm:p%40ss%3Aw0rd@db.local:3307/farm_db" });
    expect(c).toMatchObject({ host: "db.local", port: 3307, user: "app@farm", password: "p@ss:w0rd", database: "farm_db" });
  });

  it("accepts separate variables and lets them override the URL", () => {
    const c = readDbConfig({
      DATABASE_URL: "mysql://u:p@h:3306/d",
      DB_HOST: "other",
      DB_NAME: "override",
      DB_PASSWORD: "secret",
    });
    expect(c).toMatchObject({ host: "other", port: 3306, user: "u", password: "secret", database: "override" });
  });

  it("works with separate variables only and defaults host/port", () => {
    const c = readDbConfig({ DB_NAME: "farm", DB_USER: "app", DB_PASSWORD: "x" });
    expect(c).toMatchObject({ host: "localhost", port: 3306, database: "farm", user: "app" });
  });

  it("supports a unix socket", () => {
    const c = readDbConfig({ DB_NAME: "farm", DB_USER: "app", DB_SOCKET: "/run/mysqld/mysqld.sock" });
    const opts = toMysqlOptions(c);
    expect(opts.socketPath).toBe("/run/mysqld/mysqld.sock");
    expect(opts.host).toBeUndefined();
  });

  it("fails clearly when the database isn't configured", () => {
    expect(() => readDbConfig({})).toThrow(DbConfigError);
    expect(() => readDbConfig({})).toThrow(/DB_NAME and DB_USER/);
  });

  it("never echoes the URL (which contains the password) in errors", () => {
    let message = "";
    try {
      readDbConfig({ DATABASE_URL: "not a url with s3cret" });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/not a valid URL/);
    expect(message).not.toContain("s3cret");
  });

  it("rejects non-MySQL URLs (e.g. a leftover Postgres/Supabase URL)", () => {
    expect(() => readDbConfig({ DATABASE_URL: "postgres://u:p@h/d" })).toThrow(/mysql:\/\//);
  });

  it("rejects invalid ports", () => {
    expect(() => readDbConfig({ DB_NAME: "d", DB_USER: "u", DB_PORT: "99999" })).toThrow(/DB_PORT/);
  });

  it("produces UTC driver options", () => {
    const opts = toMysqlOptions(readDbConfig({ DB_NAME: "d", DB_USER: "u" }));
    expect(opts.timezone).toBe("Z");
    expect(opts.multipleStatements).toBe(false);
  });
});
