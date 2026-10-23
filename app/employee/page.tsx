import Link from "next/link";
import { requireUser } from "@/lib/auth/current";
import { listMyOpenTasks } from "@/lib/services/tasks";
import { listMyShiftsBetween } from "@/lib/services/shifts";
import { listAnnouncements } from "@/lib/services/announcements";
import { formatInstantDate, hhmm, todayLocal } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function EmployeeHome() {
  const actor = await requireUser();
  const today = todayLocal();

  const [myTasks, shiftToday, ann] = await Promise.all([
    listMyOpenTasks(actor, 5),
    listMyShiftsBetween(actor, today, today),
    listAnnouncements(actor, 3),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="h1">Hi {actor.name.split(" ")[0] || "there"}</h1>
        <p className="text-stone-600 text-sm">{formatInstantDate(new Date(), { weekday: "long", month: "long", day: "numeric" })}</p>
      </div>

      <section className="card">
        <h2 className="h2 mb-2">Today&apos;s shift</h2>
        {shiftToday.length > 0 ? (
          <ul className="space-y-1">
            {shiftToday.map((s) => (
              <li key={s.id} className="text-stone-700">
                {hhmm(s.start_time)} – {hhmm(s.end_time)}
                {s.notes ? ` · ${s.notes}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-stone-500 text-sm">No shift today.</p>
        )}
      </section>

      <section className="card">
        <div className="flex items-center justify-between mb-2">
          <h2 className="h2">My open tasks</h2>
          <Link href="/employee/tasks" className="text-sm text-farm font-medium">
            All →
          </Link>
        </div>
        {myTasks.length > 0 ? (
          <ul className="space-y-2">
            {myTasks.map((t) => (
              <li key={t.id} className="text-stone-700">
                • {t.title}
                {t.due_date && <span className="text-stone-500 text-xs ml-2">due {t.due_date}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-stone-500 text-sm">All caught up.</p>
        )}
      </section>

      <section className="card">
        <div className="flex items-center justify-between mb-2">
          <h2 className="h2">Announcements</h2>
          <Link href="/employee/announcements" className="text-sm text-farm font-medium">
            All →
          </Link>
        </div>
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
          <p className="text-stone-500 text-sm">No announcements.</p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/employee/clock" className="btn-primary w-full">Clock in / out</Link>
        <Link href="/employee/feeding-charts" className="btn-secondary w-full">Today&apos;s feeding</Link>
      </div>
    </div>
  );
}
