import { requireUser } from "@/lib/auth/current";
import { listMyShiftsBetween } from "@/lib/services/shifts";
import { formatCalendarDate, hhmm, weekDates } from "@/lib/time";
import type { ShiftWithEmployee } from "@/lib/types";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function EmployeeSchedulePage() {
  const actor = await requireUser();
  const week = weekDates();
  const shifts = await listMyShiftsBetween(actor, week[0], week[6]);

  const byDate = new Map<string, ShiftWithEmployee[]>();
  shifts.forEach((s) => {
    const arr = byDate.get(s.date) ?? [];
    arr.push(s);
    byDate.set(s.date, arr);
  });

  return (
    <div className="space-y-4">
      <h1 className="h1">My schedule (this week)</h1>
      {shifts.length === 0 ? (
        <EmptyState title="No shifts scheduled" />
      ) : (
        <div className="space-y-2">
          {week.map((key) => {
            const list = byDate.get(key) ?? [];
            return (
              <div key={key} className="card">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">
                    {formatCalendarDate(key, { weekday: "short", month: "short", day: "numeric" })}
                  </div>
                  <div className="text-xs text-stone-500">{key}</div>
                </div>
                {list.length === 0 ? (
                  <div className="text-sm text-stone-500 mt-1">Off</div>
                ) : (
                  list.map((s) => (
                    <div key={s.id} className="text-stone-700 mt-1">
                      {hhmm(s.start_time)} – {hhmm(s.end_time)}
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
