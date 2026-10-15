import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

function req(path: string, init: { cookie?: string; headers?: Record<string, string> } = {}) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", init.cookie);
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers });
}

describe("middleware (first gate)", () => {
  it("redirects protected pages to /login without a session cookie", () => {
    for (const p of ["/", "/admin", "/admin/employees", "/employee/clock"]) {
      const res = middleware(req(p));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost:3000/login");
    }
  });

  it("redirects to the public host behind the reverse proxy", () => {
    const res = middleware(req("/admin", { headers: { host: "farm.example.com", "x-forwarded-proto": "https" } }));
    expect(res.headers.get("location")).toBe("https://farm.example.com/login");
  });

  it("returns 401 JSON for unauthenticated API calls", async () => {
    const res = middleware(req("/api/anything"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "You must be signed in." });
  });

  it("lets public routes through", () => {
    for (const p of ["/login", "/barn-display", "/barn-display/log-barn", "/api/health", "/api/barn-display", "/api/auth/login"]) {
      expect(middleware(req(p)).headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("does not treat look-alike paths as public", () => {
    expect(middleware(req("/login-admin")).status).toBe(307);
    expect(middleware(req("/barn-display-secret")).status).toBe(307);
  });

  it("passes requests with a session cookie on to server-side validation", () => {
    expect(middleware(req("/admin", { cookie: "bhf_session=abc" })).headers.get("x-middleware-next")).toBe("1");
  });
});
