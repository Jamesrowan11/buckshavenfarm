import { NextResponse, type NextRequest } from "next/server";
import { getBarnDisplayData } from "@/lib/services/feeding";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

// Public, read-only data for the barn TV screens (they run unattended without
// a login, as before). Exposes only what the screens display.
export async function GET(request: NextRequest) {
  try {
    const data = await getBarnDisplayData(request.nextUrl.searchParams.get("barn"));
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const status = err instanceof AppError ? err.status : 500;
    return NextResponse.json({ error: "Unavailable" }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
