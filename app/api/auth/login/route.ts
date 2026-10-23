import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/auth/login";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/config";
import { clientIp, isSameOriginRequest } from "@/lib/auth/request";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const LoginBody = z.object({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(1024),
});

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.headers)) return error("Invalid request origin.", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error("Enter your email and password.", 400);
  }
  const parsed = LoginBody.safeParse(body);
  if (!parsed.success) return error("Enter your email and password.", 400);

  try {
    const result = await authenticate({
      email: parsed.data.email,
      password: parsed.data.password,
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
    const response = NextResponse.json(
      { redirect: result.role === "admin" ? "/admin" : "/employee" },
      { headers: { "Cache-Control": "no-store" } }
    );
    response.cookies.set(SESSION_COOKIE, result.token, sessionCookieOptions());
    return response;
  } catch (err) {
    if (err instanceof AppError) return error(err.publicMessage, err.status);
    console.error("[auth] login failed unexpectedly", (err as Error)?.name);
    return error("Sign-in is temporarily unavailable. Please try again.", 500);
  }
}
