import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/config";

// Fast first gate: requests without a session cookie are sent to /login (or
// get 401 for API routes) before any page code runs. This only checks that a
// cookie is present; the session itself is validated against the database by
// every protected layout, page, Server Action and route handler.
const PUBLIC_PATHS = ["/login", "/barn-display", "/api/auth/", "/api/health", "/api/barn-display", "/logout"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`));
}

/**
 * Absolute URL on the host the browser actually used. Behind Plesk's nginx
 * reverse proxy, request.nextUrl carries the internal address (e.g.
 * localhost:3000), so the public host and scheme come from the proxy headers.
 */
function publicUrl(request: NextRequest, pathname: string): URL {
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    request.nextUrl.host;
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || request.nextUrl.protocol.replace(":", "");
  return new URL(pathname, `${proto === "https" ? "https" : "http"}://${host}`);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname) || request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  return NextResponse.redirect(publicUrl(request, "/login"));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
