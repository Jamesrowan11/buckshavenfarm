// Shared bootstrap for the CLI scripts: loads .env files the same way
// `next start` does, and opens a single MySQL connection.
import { createInterface } from "node:readline";
import nextEnv from "@next/env";
import mysql from "mysql2/promise";
import { readDbConfig, toMysqlOptions } from "../../lib/shared/db-config.mjs";

// Loads .env.production.local, .env.local, .env.production, .env (if they
// exist). Variables already set in the environment (e.g. by Plesk) win.
export function loadEnv() {
  nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error: console.error });
}

/** @param {{ multipleStatements?: boolean }} [opts] */
export async function connect(opts = {}) {
  const config = readDbConfig();
  const conn = await mysql.createConnection(toMysqlOptions(config, opts));
  await conn.query("SET time_zone = '+00:00'");
  return conn;
}

/** Parses `--flag value` and `--flag=value` pairs; bare `--flag` becomes true. */
export function parseArgs(argv = process.argv.slice(2)) {
  /** @type {Record<string, string | boolean>} */
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq !== -1) {
      args[a.slice(2, eq)] = a.slice(eq + 1);
    } else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) {
      args[a.slice(2)] = argv[++i];
    } else {
      args[a.slice(2)] = true;
    }
  }
  return args;
}

/**
 * Reads a secret without echoing it. On a TTY the input is hidden; when stdin
 * is a pipe the first line is used (e.g. `printf '%s\n' "$PW" | npm run ...`).
 * @param {string} prompt
 */
export async function readSecret(prompt) {
  if (!process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, terminal: false });
    for await (const line of rl) {
      rl.close();
      return line;
    }
    return "";
  }
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stdout.write(prompt);
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (/** @type {string} */ chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          cleanup();
          process.stdout.write("\n");
          reject(new Error("Cancelled."));
          return;
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
    };
    stdin.on("data", onData);
  });
}

/** Prints an error without stack traces or connection details and exits. */
export function fail(/** @type {unknown} */ err) {
  const e = /** @type {{ code?: string; message?: string }} */ (err);
  const detail = e?.code ? `${e.code}: ${e.message}` : e?.message ?? String(err);
  console.error(`Error: ${detail}`);
  process.exit(1);
}
