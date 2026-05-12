import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: tasksToday }, { data: shiftsToday }, { data: ann }, { data: clockToday }, { data: pendingTOR }] =
    await Promise.all([
      supabase.from("tasks").select("*").eq("done", false).order("due_date", { ascending: true }).limit(5),
      supabase.from("shifts").select("*, profiles:employee_id(name)").eq("date", today),
      supabase.from("announcements").select("*").order("created_at", { ascending: false }).limit(3),
      supabase.from("clock_logs").select("*").gte("created_at", `${today}T00:00:00`).order("created_at", { ascending: false }),
      supabase.from("time_off_requests").select("*, profiles:employee_id(name)").eq("status", "pending"),
    ]);

  // Compute who is clocked in (last action per user)
  const lastByUser = new Map<string, "in" | "out">();
  (clockToday ?? []).slice().reverse().forEach((c: any) => lastByUser.set(c.user_id, c.action));
  const clockedIn = (clockToday ?? []).filter((c: any) => lastByUser.get(c.user_id) === "in" && c.action === "in");
  const seen = new Set();
  const currentlyIn = clockedIn.filter((c: any) => (seen.has(c.user_id) ? false : seen.add(c.user_id)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Dashboard</h1>
        <p className="text-stone-600 text-sm">Today is {new Date().toLocaleDateString()}</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Open tasks" value={String(tasksToday?.length ?? 0)} href="/admin/tasks" />
        <Stat label="Shifts today" value={String(shiftsToday?.length ?? 0)} href="/admin/schedule" />
        <Stat label="Clocked in" value={String(currentlyIn.length)} href="/admin/clock-log" />
        <Stat label="Time-off pending" value={String(pendingTOR?.length ?? 0)} href="/admin/availability" />
      </div>

      <section className="card">
        <h2 className="h2 mb-3">Today&apos;s shifts</h2>
        {shiftsToday && shiftsToday.length > 0 ? (
          <ul className="divide-y divide-stone-100">
            {shiftsToday.map((s: any) => (
              <li key={s.id} className="py-2 flex items-center justify-between">
                <span className="font-medium">{s.profiles?.name ?? "—"}</span>
                <span className="text-stone-600 text-sm">
                  {s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-stone-500 text-sm">No shifts scheduled today.</p>
        )}
      </section>

      <section className="card">
        <h2 className="h2 mb-3">Latest announcements</h2>
        {ann && ann.length > 0 ? (
          <ul className="space-y-3">
            {ann.map((a: any) => (
              <li key={a.id}>
                <div className="font-medium">{a.title}</div>
                <div className="text-sm text-stone-600 line-clamp-2">{a.body}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-stone-500 text-sm">No announcements yet.</p>
        )}
        <Link href="/admin/announcements" className="text-sm text-farm font-medium mt-3 inline-block">
          Manage →
        </Link>
      </section>

      {pendingTOR && pendingTOR.length > 0 && (
        <section className="card border-amber-200 bg-amber-50">
          <h2 className="h2 mb-3">Pending time-off requests</h2>
          <ul className="space-y-2 text-sm">
            {pendingTOR.map((r: any) => (
              <li key={r.id} className="flex items-center justify-between">
                <span>
                  <span className="font-medium">{r.profiles?.name ?? "—"}</span> · {r.start_date} → {r.end_date}
                </span>
                <Link href="/admin/availability" className="text-farm font-medium">
                  Review
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link href={href} className="card hover:shadow-md transition block">
      <div className="text-xs uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-1 text-3xl font-bold text-farm">{value}</div>
    </Link>
  );
}
