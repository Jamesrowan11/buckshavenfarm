import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";
export const runtime = "edge";

function getWeek() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
}

export default async function EmployeeSchedulePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const week = getWeek();
  const start = week[0].toISOString().slice(0, 10);
  const end = week[6].toISOString().slice(0, 10);

  const { data: shifts } = await supabase
    .from("shifts")
    .select("*")
    .eq("employee_id", user!.id)
    .gte("date", start)
    .lte("date", end)
    .order("date")
    .order("start_time");

  const byDate = new Map<string, any[]>();
  (shifts ?? []).forEach((s: any) => {
    const arr = byDate.get(s.date) ?? [];
    arr.push(s);
    byDate.set(s.date, arr);
  });

  return (
    <div className="space-y-4">
      <h1 className="h1">My schedule (this week)</h1>
      {(shifts?.length ?? 0) === 0 ? (
        <EmptyState title="No shifts scheduled" />
      ) : (
        <div className="space-y-2">
          {week.map((d) => {
            const key = d.toISOString().slice(0, 10);
            const list = byDate.get(key) ?? [];
            return (
              <div key={key} className="card">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">
                    {d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                  </div>
                  <div className="text-xs text-stone-500">{key}</div>
                </div>
                {list.length === 0 ? (
                  <div className="text-sm text-stone-500 mt-1">Off</div>
                ) : (
                  list.map((s: any) => (
                    <div key={s.id} className="text-stone-700 mt-1">
                      {s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}
                      {s.notes ? ` · ${s.notes}` : ""}
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
