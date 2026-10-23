// Database connection settings, shared by the Next.js app (lib/db.ts) and the
// CLI scripts in scripts/. Plain ESM so the scripts run with bare `node` on the
// Plesk server without a TypeScript toolchain.
//
// Settings come from environment variables only — never hardcode credentials.
// Either:
//   DATABASE_URL=mysql://user:password@host:3306/database
// or the separate variables:
//   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
// Separate variables override the matching part of DATABASE_URL.
// Optional: DB_SOCKET (unix socket path), DB_SSL=true, DB_POOL_SIZE.

/**
 * @typedef {object} DbConfig
 * @property {string} host
 * @property {number} port
 * @property {string} database
 * @property {string} user
 * @property {string} password
 * @property {string} [socketPath]
 * @property {boolean} ssl
 * @property {number} connectionLimit
 */

export class DbConfigError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "DbConfigError";
  }
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {DbConfig}
 */
export function readDbConfig(env = process.env) {
  /** @type {Partial<DbConfig>} */
  const fromUrl = {};
  const rawUrl = env.DATABASE_URL?.trim();
  if (rawUrl) {
    let url;
    try {
      url = new URL(rawUrl);
    } catch {
      // Don't echo the value: it contains the password.
      throw new DbConfigError("DATABASE_URL is not a valid URL.");
    }
    if (url.protocol !== "mysql:" && url.protocol !== "mariadb:") {
      throw new DbConfigError("DATABASE_URL must start with mysql:// or mariadb://");
    }
    fromUrl.host = decodeURIComponent(url.hostname);
    if (url.port) fromUrl.port = Number(url.port);
    fromUrl.user = decodeURIComponent(url.username);
    fromUrl.password = decodeURIComponent(url.password);
    fromUrl.database = decodeURIComponent(url.pathname.replace(/^\//, ""));
    if (url.searchParams.get("ssl") === "true") fromUrl.ssl = true;
  }

  const host = env.DB_HOST?.trim() || fromUrl.host || "localhost";
  const port = Number(env.DB_PORT?.trim() || fromUrl.port || 3306);
  const database = env.DB_NAME?.trim() || fromUrl.database || "";
  const user = env.DB_USER?.trim() || fromUrl.user || "";
  const password = env.DB_PASSWORD ?? fromUrl.password ?? "";
  const ssl = env.DB_SSL ? env.DB_SSL === "true" : Boolean(fromUrl.ssl);
  const connectionLimit = Number(env.DB_POOL_SIZE || 10);

  const missing = [];
  if (!database) missing.push("DB_NAME");
  if (!user) missing.push("DB_USER");
  if (missing.length) {
    throw new DbConfigError(
      `Database is not configured: set DATABASE_URL or ${missing.join(" and ")}.`
    );
  }
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new DbConfigError("DB_PORT must be a valid TCP port.");
  }
  if (!Number.isInteger(connectionLimit) || connectionLimit < 1) {
    throw new DbConfigError("DB_POOL_SIZE must be a positive integer.");
  }

  /** @type {DbConfig} */
  const config = { host, port, database, user, password, ssl, connectionLimit };
  if (env.DB_SOCKET?.trim()) config.socketPath = env.DB_SOCKET.trim();
  return config;
}

/**
 * Options for mysql2's createPool/createConnection. Every connection runs in
 * UTC so CURRENT_TIMESTAMP and the driver's Date conversion agree.
 * @param {DbConfig} config
 * @param {{ multipleStatements?: boolean }} [extra]
 */
export function toMysqlOptions(config, extra = {}) {
  return {
    host: config.socketPath ? undefined : config.host,
    port: config.socketPath ? undefined : config.port,
    socketPath: config.socketPath,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: config.ssl ? {} : undefined,
    connectionLimit: config.connectionLimit,
    waitForConnections: true,
    connectTimeout: 10_000,
    timezone: "Z",
    // DATE columns come back as 'YYYY-MM-DD' strings (calendar dates have no
    // time zone); DATETIME columns come back as JS Dates in UTC.
    dateStrings: /** @type {["DATE"]} */ (["DATE"]),
    charset: "utf8mb4_unicode_ci",
    supportBigNumbers: true,
    multipleStatements: Boolean(extra.multipleStatements),
  };
}
