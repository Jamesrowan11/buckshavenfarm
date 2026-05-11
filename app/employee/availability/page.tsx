import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function nextMonday() {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7) + 7);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

async function submitAvailability(formData: FormData) {
  "use server";
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const week_start = String(formData.get("week_start"));
  const available_days: Record<string, { start?: string; end?: string }> = {};
  for (const day of DAYS) {
    const start = String(formData.get(`${day}_start`) ?? "");
    const end = String(formData.get(`${day}_end`) ?? "");
    if (start || end) available_days[day] = { start: start || undefined, end: end || undefined };
  }
  const notes = String(formData.get("notes") ?? "") || null;
  await supabase.from("availability").insert({
    employee_id: user!.id,
    week_start,
    available_days,
    notes,
  });
  revalidatePath("/employee/availability");
}

export default async function EmployeeAvailabilityPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: history } = await supabase
    .from("availability")
    .select("*")
    .eq("employee_id", user!.id)
    .order("week_start", { ascending: false })
    .limit(8);

  return (
    <div className="space-y-4">
      <h1 className="h1">Submit availability</h1>

      <form action={submitAvailability} className="card space-y-3">
        <div>
          <label className="label">Week starting (Monday)</label>
          <input type="date" name="week_start" required defaultValue={nextMonday()} className="input" />
        </div>
        <div className="space-y-2">
          {DAYS.map((d) => (
            <div key={d} className="grid grid-cols-3 gap-2 items-center">
              <div className="font-medium">{d}</div>
              <input type="time" name={`${d}_start`} className="input" />
              <input type="time" name={`${d}_end`} className="input" />
            </div>
          ))}
        </div>
        <textarea name="notes" rows={2} placeholder="Notes (optional)" className="input" />
        <button className="btn-primary">Submit</button>
      </form>

      <h2 className="h2">Past submissions</h2>
      {(history?.length ?? 0) === 0 ? (
        <EmptyState title="No submissions yet" />
      ) : (
        <ul className="space-y-2">
          {history!.map((a: any) => (
            <li key={a.id} className="card text-sm">
              <div className="font-medium">Week of {a.week_start}</div>
              <pre className="text-xs text-stone-600 mt-1 whitespace-pre-wrap break-words bg-stone-50 rounded p-2">
                {JSON.stringify(a.available_days, null, 2)}
              </pre>
              {a.notes && <div className="mt-1">{a.notes}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
