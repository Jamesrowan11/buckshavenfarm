import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/config";
import { isSameOriginRequest } from "@/lib/auth/request";
import { invalidateSessionToken } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.headers)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  try {
    await invalidateSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  } catch {
    // Even if the database is unreachable, the cookie is still cleared below.
  }
  // Relative Location so the redirect works behind the reverse proxy.
  const response = new NextResponse(null, { status: 303, headers: { Location: "/login" } });
  response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return response;
}
