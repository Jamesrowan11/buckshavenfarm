// End-to-end tests against the real production build, started exactly the
// way Plesk starts it (`node server.js`). Requires `npm run build` first and
// TEST_DATABASE_URL.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUser, hasTestDb, resetSchema, sql, TEST_DATABASE_URL, type TestUser } from "../helpers/db";

const ROOT = path.resolve(__dirname, "../..");
const built = existsSync(path.join(ROOT, ".next/BUILD_ID"));

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

async function startServer(env: Record<string, string>): Promise<{ proc: ChildProcess; base: string; output: () => string }> {
  const port = await freePort();
  let output = "";
  const childEnv = {
    PATH: process.env.PATH ?? "",
    PORT: String(port),
    HOST: "127.0.0.1",
    APP_TIME_ZONE: "America/New_York",
    ...env,
  } as unknown as NodeJS.ProcessEnv;
  const proc = spawn(process.execPath, ["server.js"], { cwd: ROOT, env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
  proc.stdout.on("data", (d: Buffer) => (output += d));
  proc.stderr.on("data", (d: Buffer) => (output += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    if (output.includes("ready on")) return { proc, base, output: () => output };
    if (proc.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  proc.kill();
  throw new Error(`server did not start:\n${output}`);
}

function sessionCookie(res: Response): string | null {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith("bhf_session="));
  return raw ?? null;
}

/** Server Action IDs from the build manifest, by page file and declaration order. */
function actionId(file: string, index: number): string {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, ".next/server/server-reference-manifest.json"), "utf8"));
  const entry = Object.entries<{ filename: string; exportedName: string }>(manifest.node).find(
    ([, v]) => v.filename === file && v.exportedName === `$$RSC_SERVER_ACTION_${index}`
  );
  if (!entry) throw new Error(`action ${index} not found in ${file}`);
  return entry[0];
}

describe.skipIf(!hasTestDb || !built)("production server (node server.js)", () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  let base: string;
  let admin: TestUser;
  let employee: TestUser;

  const get = (p: string, cookie?: string) =>
    fetch(base + p, { redirect: "manual", headers: cookie ? { cookie } : {} });

  async function login(email: string, password: string, origin = base) {
    return fetch(base + "/api/auth/login", {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ email, password }),
    });
  }

  async function cookieFor(u: TestUser) {
    const res = await login(u.email, u.password);
    expect(res.status).toBe(200);
    return sessionCookie(res)!.split(";")[0];
  }

  /** Submits a Server Action the way a no-JavaScript form post does. */
  async function submitAction(page: string, id: string, fields: Record<string, string>, cookie?: string) {
    const form = new FormData();
    form.set(`$ACTION_ID_${id}`, "");
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    return fetch(base + page, {
      method: "POST",
      redirect: "manual",
      headers: { Origin: base, ...(cookie ? { cookie } : {}) },
      body: form,
    });
  }

  beforeAll(async () => {
    await resetSchema();
    admin = await createUser("admin", { email: "boss@example.com", name: "Boss Admin" });
    employee = await createUser("employee", { email: "hand@example.com", name: "Farm Hand" });
    server = await startServer({ DATABASE_URL: TEST_DATABASE_URL });
    base = server.base;
  });

  afterAll(() => {
    server?.proc.kill();
  });

  it("serves the health check and static assets", async () => {
    const res = await get("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", database: "ok" });
    const login = await get("/login");
    expect(login.status).toBe(200);
    const html = await login.text();
    expect(html).toContain("Bucks Haven Farm");
    const css = html.match(/\/_next\/static\/[^"]+\.css/)?.[0];
    expect(css).toBeTruthy();
    expect((await get(css!)).status).toBe(200);
    expect((await get("/robots.txt")).status).toBe(200);
  });

  it("sends anonymous visitors to /login and rejects anonymous API calls", async () => {
    for (const p of ["/", "/admin", "/admin/employees", "/employee", "/employee/clock"]) {
      const res = await get(p);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toMatch(/\/login$/);
    }
    expect((await get("/api/anything")).status).toBe(401);
    expect((await get("/barn-display")).status).toBe(200);
  });

  it("rejects forged session cookies", async () => {
    const res = await get("/admin", "bhf_session=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    expect([303, 307]).toContain(res.status);
    expect(res.headers.get("location")).toMatch(/\/login$/);
  });

  it("validates sign-in requests and never reveals which part was wrong", async () => {
    expect((await login(admin.email, admin.password, "https://evil.example")).status).toBe(403);
    const bad = await login(admin.email, "wrong password");
    expect(bad.status).toBe(401);
    expect(await bad.json()).toEqual({ error: "Invalid email or password." });
    const unknown = await login("ghost@example.com", "wrong password");
    expect(await unknown.json()).toEqual({ error: "Invalid email or password." });
    const empty = await fetch(base + "/api/auth/login", { method: "POST", headers: { Origin: base }, body: "nope" });
    expect(empty.status).toBe(400);
  });

  it("sets a Secure, HttpOnly, SameSite=Lax session cookie and lets an admin in", async () => {
    const res = await login(admin.email, admin.password);
    expect(await res.json()).toEqual({ redirect: "/admin" });
    const cookie = sessionCookie(res)!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\//);
    const c = cookie.split(";")[0];
    for (const p of ["/admin", "/admin/tasks", "/admin/schedule", "/admin/availability", "/admin/feeding-charts",
      "/admin/announcements", "/admin/employees", "/admin/clock-log", "/admin/notes", "/employee", "/employee/account"]) {
      const page = await get(p, c);
      expect(page.status, p).toBe(200);
    }
    expect(await (await get("/admin", c)).text()).toContain("Dashboard");
  });

  it("keeps employees out of the admin portal", async () => {
    const c = await cookieFor(employee);
    for (const p of ["/admin", "/admin/employees", "/admin/notes"]) {
      const res = await get(p, c);
      expect(res.status, p).toBe(307);
      expect(res.headers.get("location")).toMatch(/\/employee$/);
    }
    for (const p of ["/employee", "/employee/tasks", "/employee/feeding-charts", "/employee/clock", "/employee/more",
      "/employee/schedule", "/employee/availability", "/employee/time-off", "/employee/announcements"]) {
      expect((await get(p, c)).status, p).toBe(200);
    }
  });

  it("blocks direct Server Action calls from employees and anonymous users", async () => {
    const employeeCookie = await cookieFor(employee);
    const adminCookie = await cookieFor(admin);
    const attempts: [string, string, Record<string, string>, string][] = [
      ["/admin/announcements", "app/admin/announcements/page.tsx", { title: "Hacked", body: "x" }, "announcements"],
      ["/admin/notes", "app/admin/notes/page.tsx", { title: "Hacked" }, "admin_notes"],
      ["/admin/tasks", "app/admin/tasks/page.tsx", { title: "Hacked", priority: "low" }, "tasks"],
      ["/admin/feeding-charts", "app/admin/feeding-charts/page.tsx", { name: "Hacked" }, "horses"],
    ];
    for (const [page, file, fields, table] of attempts) {
      const id = actionId(file, 0);
      const asEmployee = await submitAction(page, id, fields, employeeCookie);
      expect(asEmployee.status, page).toBeGreaterThanOrEqual(300);
      const anon = await submitAction(page, id, fields);
      expect(anon.status, page).toBeGreaterThanOrEqual(300);
      expect(await sql(`SELECT * FROM ${table}`), table).toHaveLength(0);
      // Positive control: the same request as an admin does write.
      await submitAction(page, id, fields, adminCookie);
      expect(await sql(`SELECT * FROM ${table}`), table).toHaveLength(1);
    }

    // An employee can't create accounts (e.g. an admin for themselves).
    const addUser = actionId("app/admin/employees/page.tsx", 0);
    await submitAction(
      "/admin/employees",
      addUser,
      { name: "Evil", email: "evil@example.com", role: "admin", password: "evil password 1" },
      employeeCookie
    );
    expect(await sql("SELECT * FROM users WHERE email = 'evil@example.com'")).toHaveLength(0);
  });

  it("serves the public barn display data without personal details", async () => {
    await sql("INSERT INTO horses (id, name, barn) VALUES (UUID(), 'Logan', 'log-barn'), (UUID(), 'Arya', 'arena-barn')");
    const all = await (await get("/api/barn-display")).json();
    expect(all.horses.map((h: { name: string }) => h.name).sort()).toEqual(["Arya", "Hacked", "Logan"]);
    const log = await (await get("/api/barn-display?barn=log-barn")).json();
    expect(log.horses.map((h: { name: string }) => h.name)).toEqual(["Logan"]);
    expect(JSON.stringify(all)).not.toMatch(/@example\.com/);
  });

  it("expires sessions server-side", async () => {
    const c = await cookieFor(employee);
    expect((await get("/employee", c)).status).toBe(200);
    await sql("UPDATE sessions SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND WHERE user_id = ?", [employee.id]);
    const res = await get("/employee", c);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/\/login$/);
  });

  it("logs out: clears the cookie and revokes the session", async () => {
    const c = await cookieFor(employee);
    const forged = await fetch(base + "/logout", { method: "POST", redirect: "manual", headers: { cookie: c, Origin: "https://evil.example" } });
    expect(forged.status).toBe(403);
    const res = await fetch(base + "/logout", { method: "POST", redirect: "manual", headers: { cookie: c, Origin: base } });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/login");
    expect(sessionCookie(res)).toMatch(/Max-Age=0/);
    const after = await get("/employee", c); // replaying the old cookie
    expect(after.status).toBe(307);
    expect(after.headers.get("location")).toMatch(/\/login$/);
  });
});

describe.skipIf(!built)("production server without a reachable database", () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  beforeAll(async () => {
    server = await startServer({ DATABASE_URL: "mysql://nobody:wrong-secret@127.0.0.1:1/nowhere" });
  });
  afterAll(() => server?.proc.kill());

  it("still starts, reports unhealthy, and fails sign-in safely", async () => {
    const health = await fetch(server.base + "/api/health");
    expect(health.status).toBe(503);
    expect(await health.json()).toEqual({ status: "error", database: "unavailable" });
    expect((await fetch(server.base + "/login")).status).toBe(200);
    const res = await fetch(server.base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: server.base },
      body: JSON.stringify({ email: "a@example.com", password: "whatever123" }),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/temporarily unavailable/);
    expect(JSON.stringify(body)).not.toContain("wrong-secret");
    expect(server.output()).not.toContain("wrong-secret");
  });
});
