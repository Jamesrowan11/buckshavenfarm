import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";

// Public data for the barn display screens (no login), the same data the
// screens could read anonymously before: active horses, feeding charts,
// today's feeding checkmarks and the latest announcements.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const barn = new URL(request.url).searchParams.get("barn");
  const db = createClient();
  const today = new Date().toISOString().slice(0, 10);
  let horses = db.from("horses").select("*").eq("active", true).order("name");
  if (barn === "log-barn" || barn === "arena-barn") horses = horses.eq("barn", barn);
  const [h, c, l, a] = await Promise.all([
    horses,
    db.from("feeding_charts").select("*, profiles:responsible_employee(name)"),
    db.from("feeding_logs").select("horse_id, feeding_type, done, date").eq("date", today),
    db.from("announcements").select("id, title, body, created_at").order("created_at", { ascending: false }).limit(3),
  ]);
  return NextResponse.json(
    { horses: h.data ?? [], charts: c.data ?? [], logs: l.data ?? [], announcements: a.data ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}
