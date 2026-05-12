import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";
export const runtime = "edge";

async function reviewRequest(id: string, status: "approved" | "denied") {
  "use server";
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase.from("time_off_requests").update({ status, reviewed_by: user?.id ?? null }).eq("id", id);
  revalidatePath("/admin/availability");
}

export default async function AdminAvailabilityPage() {
  const supabase = createClient();
  const [{ data: requests }, { data: availability }] = await Promise.all([
    supabase
      .from("time_off_requests")
      .select("*, profiles:employee_id(name)")
      .order("status")
      .order("start_date"),
    supabase
      .from("availability")
      .select("*, profiles:employee_id(name)")
      .order("week_start", { ascending: false })
      .limit(20),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="h1">Availability & time off</h1>

      <section className="card">
        <h2 className="h2 mb-3">Time-off requests</h2>
        {(requests?.length ?? 0) === 0 ? (
          <EmptyState title="No requests yet" />
        ) : (
          <ul className="divide-y divide-stone-100">
            {requests!.map((r: any) => (
              <li key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{r.profiles?.name ?? "—"}</div>
                  <div className="text-sm text-stone-600">
                    {r.start_date} → {r.end_date}
                    {r.reason ? ` · ${r.reason}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge-${r.status}`}>{r.status}</span>
                  {r.status === "pending" && (
                    <>
                      <form action={reviewRequest.bind(null, r.id, "approved")}>
                        <button className="btn-primary !py-1 !px-3 text-sm">Approve</button>
                      </form>
                      <form action={reviewRequest.bind(null, r.id, "denied")}>
                        <button className="btn-secondary !py-1 !px-3 text-sm">Deny</button>
                      </form>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="h2 mb-3">Submitted availability</h2>
        {(availability?.length ?? 0) === 0 ? (
          <EmptyState title="Nothing submitted yet" />
        ) : (
          <ul className="divide-y divide-stone-100">
            {availability!.map((a: any) => (
              <li key={a.id} className="py-3">
                <div className="font-medium">
                  {a.profiles?.name ?? "—"}{" "}
                  <span className="text-xs text-stone-500 font-normal">week of {a.week_start}</span>
                </div>
                <pre className="text-xs text-stone-600 mt-1 whitespace-pre-wrap break-words bg-stone-50 rounded p-2">
                  {JSON.stringify(a.available_days, null, 2)}
                </pre>
                {a.notes && <div className="text-sm text-stone-600 mt-1">{a.notes}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
