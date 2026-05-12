import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";
export const runtime = "edge";

function getWeek(offset = 0) {
  const now = new Date();
  const day = now.getDay(); // 0 Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
}

async function createShift(formData: FormData) {
  "use server";
  const supabase = createClient();
  await supabase.from("shifts").insert({
    employee_id: formData.get("employee_id") as string,
    date: formData.get("date") as string,
    start_time: formData.get("start_time") as string,
    end_time: formData.get("end_time") as string,
    notes: (formData.get("notes") as string) || null,
  });
  revalidatePath("/admin/schedule");
}

async function deleteShift(id: string) {
  "use server";
  const supabase = createClient();
  await supabase.from("shifts").delete().eq("id", id);
  revalidatePath("/admin/schedule");
}

export default async function AdminSchedulePage() {
  const supabase = createClient();
  const week = getWeek(0);
  const start = week[0].toISOString().slice(0, 10);
  const end = week[6].toISOString().slice(0, 10);
  const [{ data: shifts }, { data: employees }] = await Promise.all([
    supabase
      .from("shifts")
      .select("*, profiles:employee_id(name)")
      .gte("date", start)
      .lte("date", end)
      .order("date")
      .order("start_time"),
    supabase.from("profiles").select("id, name").eq("role", "employee").order("name"),
  ]);

  const byDate = new Map<string, any[]>();
  (shifts ?? []).forEach((s: any) => {
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
              {employees?.map((e: any) => (
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
        {week.map((d) => {
          const key = d.toISOString().slice(0, 10);
          const list = byDate.get(key) ?? [];
          return (
            <div key={key} className="card">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">
                  {d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                </div>
                <div className="text-xs text-stone-500">{key}</div>
              </div>
              {list.length === 0 ? (
                <div className="text-sm text-stone-500">No shifts.</div>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {list.map((s: any) => (
                    <li key={s.id} className="py-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">{s.profiles?.name ?? "—"}</div>
                        <div className="text-sm text-stone-600">
                          {s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}
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
        {(shifts?.length ?? 0) === 0 && <EmptyState title="No shifts this week" hint="Add one above." />}
      </section>
    </div>
  );
}
