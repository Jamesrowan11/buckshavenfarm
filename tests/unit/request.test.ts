import { afterEach, describe, expect, it } from "vitest";
import { clientIp, isSameOriginRequest } from "@/lib/auth/request";

const h = (init: Record<string, string>) => new Headers(init);

afterEach(() => {
  delete process.env.ALLOWED_ORIGINS;
});

describe("isSameOriginRequest (CSRF)", () => {
  it("accepts same-origin requests", () => {
    expect(isSameOriginRequest(h({ origin: "https://farm.example.com", host: "farm.example.com" }))).toBe(true);
  });

  it("uses X-Forwarded-Host from the reverse proxy", () => {
    expect(
      isSameOriginRequest(
        h({ origin: "https://farm.example.com", host: "localhost:3000", "x-forwarded-host": "farm.example.com" })
      )
    ).toBe(true);
  });

  it("rejects cross-site and malformed origins", () => {
    expect(isSameOriginRequest(h({ origin: "https://evil.example", host: "farm.example.com" }))).toBe(false);
    expect(isSameOriginRequest(h({ origin: "null", host: "farm.example.com" }))).toBe(false);
    expect(isSameOriginRequest(h({ origin: "https://farm.example.com.evil.example", host: "farm.example.com" }))).toBe(false);
  });

  it("rejects requests without Origin unless Sec-Fetch-Site says same-origin", () => {
    expect(isSameOriginRequest(h({ host: "farm.example.com" }))).toBe(false);
    expect(isSameOriginRequest(h({ host: "farm.example.com", "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOriginRequest(h({ host: "farm.example.com", "sec-fetch-site": "same-origin" }))).toBe(true);
  });

  it("allows extra hosts from ALLOWED_ORIGINS", () => {
    process.env.ALLOWED_ORIGINS = "https://www.farm.example.com, portal.example.org";
    expect(isSameOriginRequest(h({ origin: "https://www.farm.example.com", host: "farm.example.com" }))).toBe(true);
    expect(isSameOriginRequest(h({ origin: "https://portal.example.org", host: "farm.example.com" }))).toBe(true);
  });
});

describe("clientIp", () => {
  it("prefers X-Real-IP, then the proxy-appended (last) X-Forwarded-For entry", () => {
    expect(clientIp(h({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "1.1.1.1" }))).toBe("203.0.113.9");
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(h({}))).toBeNull();
  });
});
