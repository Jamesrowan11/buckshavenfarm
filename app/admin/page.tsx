import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current";
import { listOpenTasks } from "@/lib/services/tasks";
import { listShiftsBetween } from "@/lib/services/shifts";
import { listAnnouncements } from "@/lib/services/announcements";
import { listClockLogsSince } from "@/lib/services/clock";
import { listPendingTimeOff } from "@/lib/services/timeOff";
import { formatInstantDate, hhmm, startOfLocalDayUtc, todayLocal } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const actor = await requireAdmin();
  const today = todayLocal();

  const [tasksToday, shiftsToday, ann, clockToday, pendingTOR] = await Promise.all([
    listOpenTasks(actor, 5),
    listShiftsBetween(actor, today, today),
    listAnnouncements(actor, 3),
    listClockLogsSince(actor, startOfLocalDayUtc(today)),
    listPendingTimeOff(actor),
  ]);

  // Who is clocked in right now: users whose latest action today is "in".
  // clockToday is newest first, so the first row seen per user is their latest.
  const seen = new Set<string>();
  const currentlyIn = clockToday.filter((c) => {
    if (seen.has(c.user_id)) return false;
    seen.add(c.user_id);
    return c.action === "in";
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Dashboard</h1>
        <p className="text-stone-600 text-sm">Today is {formatInstantDate(new Date())}</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Open tasks" value={String(tasksToday.length)} href="/admin/tasks" />
        <Stat label="Shifts today" value={String(shiftsToday.length)} href="/admin/schedule" />
        <Stat label="Clocked in" value={String(currentlyIn.length)} href="/admin/clock-log" />
        <Stat label="Time-off pending" value={String(pendingTOR.length)} href="/admin/availability" />
      </div>

      <section className="card">
        <h2 className="h2 mb-3">Today&apos;s shifts</h2>
        {shiftsToday.length > 0 ? (
          <ul className="divide-y divide-stone-100">
            {shiftsToday.map((s) => (
              <li key={s.id} className="py-2 flex items-center justify-between">
                <span className="font-medium">{s.employee_name ?? "—"}</span>
                <span className="text-stone-600 text-sm">
                  {hhmm(s.start_time)} – {hhmm(s.end_time)}
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
        {ann.length > 0 ? (
          <ul className="space-y-3">
            {ann.map((a) => (
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

      {pendingTOR.length > 0 && (
        <section className="card border-amber-200 bg-amber-50">
          <h2 className="h2 mb-3">Pending time-off requests</h2>
          <ul className="space-y-2 text-sm">
            {pendingTOR.map((r) => (
              <li key={r.id} className="flex items-center justify-between">
                <span>
                  <span className="font-medium">{r.employee_name ?? "—"}</span> · {r.start_date} → {r.end_date}
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
