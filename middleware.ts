import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Send anyone who isn't signed in to /login, except for public pages
// (login, first-time setup, and the barn display screens).
const PUBLIC = ["/login", "/setup", "/barn-display", "/api/barn-display"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  const token = request.cookies.get("bh_session")?.value;
  if (token && process.env.AUTH_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
      return NextResponse.next();
    } catch {
      // expired or tampered: fall through to the login page
    }
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
