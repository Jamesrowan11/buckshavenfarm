import { revalidatePath } from "next/cache";
import { createClient, getSessionAndProfile } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "edge";

async function clockAction(action: "in" | "out") {
  "use server";
  const supabase = createClient();
  const { user, profile } = await getSessionAndProfile();
  if (!user) return;
  await supabase.from("clock_logs").insert({
    user_id: user.id,
    user_name: profile?.name ?? user.email ?? "",
    action,
  });
  revalidatePath("/employee/clock");
}

export default async function EmployeeClockPage() {
  const supabase = createClient();
  const { user, profile } = await getSessionAndProfile();

  const { data: history } = await supabase
    .from("clock_logs")
    .select("*")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const last = history?.[0];
  const isClockedIn = last?.action === "in";

  return (
    <div className="space-y-4">
      <h1 className="h1">Clock</h1>

      <section className="card text-center py-8">
        <div className="text-sm text-stone-500 uppercase tracking-wider">Current status</div>
        <div className={`mt-2 text-3xl font-bold ${isClockedIn ? "text-farm" : "text-stone-500"}`}>
          {isClockedIn ? "Clocked in" : "Clocked out"}
        </div>
        {last && (
          <div className="text-xs text-stone-500 mt-1">since {new Date(last.created_at).toLocaleString()}</div>
        )}
        <div className="mt-5 flex justify-center gap-3">
          {isClockedIn ? (
            <form action={clockAction.bind(null, "out")}>
              <button className="btn-danger px-8">Clock out</button>
            </form>
          ) : (
            <form action={clockAction.bind(null, "in")}>
              <button className="btn-primary px-8">Clock in</button>
            </form>
          )}
        </div>
        <div className="text-xs text-stone-500 mt-3">Signed in as {profile?.name}</div>
      </section>

      <section className="card">
        <h2 className="h2 mb-2">Recent activity</h2>
        {(history?.length ?? 0) === 0 ? (
          <p className="text-stone-500 text-sm">No activity yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {history!.map((c: any) => (
              <li key={c.id} className="py-2 flex justify-between">
                <span>{c.action === "in" ? "Clocked in" : "Clocked out"}</span>
                <span className="text-stone-500">{new Date(c.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
