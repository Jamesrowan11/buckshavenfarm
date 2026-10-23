import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current";
import { DAYS, listMyAvailability, submitAvailability as submit } from "@/lib/services/availability";
import { field } from "@/lib/validation";
import { nextMonday } from "@/lib/time";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

async function submitAvailability(formData: FormData) {
  "use server";
  const actor = await requireUser();
  const days: Record<string, { start?: string; end?: string }> = {};
  for (const day of DAYS) {
    const start = field(formData, `${day}_start`);
    const end = field(formData, `${day}_end`);
    if (start || end) days[day] = { start: start || undefined, end: end || undefined };
  }
  await submit(actor, { week_start: field(formData, "week_start"), days, notes: field(formData, "notes") });
  revalidatePath("/employee/availability");
}

export default async function EmployeeAvailabilityPage() {
  const actor = await requireUser();
  const history = await listMyAvailability(actor, 8);

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
      {history.length === 0 ? (
        <EmptyState title="No submissions yet" />
      ) : (
        <ul className="space-y-2">
          {history.map((a) => (
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
