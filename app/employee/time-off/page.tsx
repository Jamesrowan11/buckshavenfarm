import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";
export const runtime = "edge";

async function requestTimeOff(formData: FormData) {
  "use server";
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase.from("time_off_requests").insert({
    employee_id: user!.id,
    start_date: formData.get("start_date") as string,
    end_date: formData.get("end_date") as string,
    reason: (formData.get("reason") as string) || null,
  });
  revalidatePath("/employee/time-off");
}

export default async function EmployeeTimeOffPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: list } = await supabase
    .from("time_off_requests")
    .select("*")
    .eq("employee_id", user!.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <h1 className="h1">Time off</h1>
      <form action={requestTimeOff} className="card space-y-3">
        <h2 className="h2">Request time off</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">From</label>
            <input type="date" name="start_date" required className="input" />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" name="end_date" required className="input" />
          </div>
        </div>
        <textarea name="reason" rows={3} placeholder="Reason (optional)" className="input" />
        <button className="btn-primary">Submit request</button>
      </form>

      <h2 className="h2">My requests</h2>
      {(list?.length ?? 0) === 0 ? (
        <EmptyState title="No requests yet" />
      ) : (
        <ul className="space-y-2">
          {list!.map((r: any) => (
            <li key={r.id} className="card flex items-center justify-between gap-2">
              <div>
                <div className="font-medium">
                  {r.start_date} → {r.end_date}
                </div>
                {r.reason && <div className="text-sm text-stone-600">{r.reason}</div>}
                <div className="text-xs text-stone-500">{new Date(r.created_at).toLocaleString()}</div>
              </div>
              <span className={`badge-${r.status}`}>{r.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
