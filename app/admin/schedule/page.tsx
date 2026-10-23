import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current";
import { createShift as create, deleteShift as remove, listShiftsBetween } from "@/lib/services/shifts";
import { listUserOptions } from "@/lib/services/users";
import { field } from "@/lib/validation";
import { formatCalendarDate, hhmm, weekDates } from "@/lib/time";
import type { ShiftWithEmployee } from "@/lib/types";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

async function createShift(formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  await create(actor, {
    employee_id: field(formData, "employee_id"),
    date: field(formData, "date"),
    start_time: field(formData, "start_time"),
    end_time: field(formData, "end_time"),
    notes: field(formData, "notes"),
  });
  revalidatePath("/admin/schedule");
}

async function deleteShift(id: string) {
  "use server";
  const actor = await requireAdmin();
  await remove(actor, id);
  revalidatePath("/admin/schedule");
}

export default async function AdminSchedulePage() {
  const actor = await requireAdmin();
  const week = weekDates();
  const [shifts, employees] = await Promise.all([
    listShiftsBetween(actor, week[0], week[6]),
    listUserOptions(actor, { role: "employee" }),
  ]);

  const byDate = new Map<string, ShiftWithEmployee[]>();
  shifts.forEach((s) => {
    const arr = byDate.get(s.date) ?? [];
    arr.push(s);
    byDate.set(s.date, arr);
  });

  return (
    <div className="space-y-6">
      <h1 className="h1">Schedule (this week)</h1>

      <form action={createShift} className="card space-y-3">
        <h2 className="h2">New shift</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Employee</label>
            <select name="employee_id" required className="input">
              <option value="">— select —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" name="date" required className="input" />
          </div>
          <div>
            <label className="label">Start</label>
            <input type="time" name="start_time" required className="input" />
          </div>
          <div>
            <label className="label">End</label>
            <input type="time" name="end_time" required className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notes</label>
            <input name="notes" className="input" />
          </div>
        </div>
        <button className="btn-primary">Create shift</button>
      </form>

      <section className="space-y-3">
        {week.map((key) => {
          const list = byDate.get(key) ?? [];
          return (
            <div key={key} className="card">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">
                  {formatCalendarDate(key, { weekday: "long", month: "short", day: "numeric" })}
                </div>
                <div className="text-xs text-stone-500">{key}</div>
              </div>
              {list.length === 0 ? (
                <div className="text-sm text-stone-500">No shifts.</div>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {list.map((s) => (
                    <li key={s.id} className="py-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">{s.employee_name ?? "—"}</div>
                        <div className="text-sm text-stone-600">
                          {hhmm(s.start_time)} – {hhmm(s.end_time)}
                          {s.notes ? ` · ${s.notes}` : ""}
                        </div>
                      </div>
                      <form action={deleteShift.bind(null, s.id)}>
                        <button className="text-stone-400 hover:text-red-600 text-sm">Delete</button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {shifts.length === 0 && <EmptyState title="No shifts this week" hint="Add one above." />}
      </section>
    </div>
  );
}
