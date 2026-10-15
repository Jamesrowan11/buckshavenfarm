import { NextResponse } from "next/server";
import { pingDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

// Public health check for monitoring: reports only up/down, no details.
export async function GET() {
  const dbOk = await pingDatabase();
  return NextResponse.json(
    { status: dbOk ? "ok" : "error", database: dbOk ? "ok" : "unavailable" },
    { status: dbOk ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
