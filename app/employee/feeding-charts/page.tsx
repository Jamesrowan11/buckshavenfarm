import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";
export const runtime = "edge";

async function markFeeding(horseId: string, chartId: string | null, type: "AM" | "PM", currentDone: boolean) {
  "use server";
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const today = new Date().toISOString().slice(0, 10);

  const { data: existing } = await supabase
    .from("feeding_logs")
    .select("id")
    .eq("horse_id", horseId)
    .eq("feeding_type", type)
    .eq("date", today)
    .maybeSingle();

  if (existing) {
    await supabase.from("feeding_logs").update({ done: !currentDone, employee_id: user?.id ?? null }).eq("id", existing.id);
  } else {
    await supabase.from("feeding_logs").insert({
      horse_id: horseId,
      chart_id: chartId,
      feeding_type: type,
      done: !currentDone,
      employee_id: user?.id ?? null,
      date: today,
    });
  }
  revalidatePath("/employee/feeding-charts");
}

export default async function EmployeeFeedingPage() {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: horses }, { data: charts }, { data: logs }] = await Promise.all([
    supabase.from("horses").select("*").eq("active", true).order("name"),
    supabase.from("feeding_charts").select("*, profiles:responsible_employee(name)"),
    supabase.from("feeding_logs").select("*").eq("date", today),
  ]);

  const chartByHorse = new Map<string, any>();
  (charts ?? []).forEach((c: any) => chartByHorse.set(c.horse_id, c));
  const logKey = (h: string, t: "AM" | "PM") => `${h}|${t}`;
  const logMap = new Map<string, any>();
  (logs ?? []).forEach((l: any) => logMap.set(logKey(l.horse_id, l.feeding_type), l));

  return (
    <div className="space-y-4">
      <h1 className="h1">Feeding chart — {new Date().toLocaleDateString()}</h1>
      {(horses?.length ?? 0) === 0 ? (
        <EmptyState title="No horses on file" />
      ) : (
        <div className="space-y-3">
          {horses!.map((h: any) => {
            const chart = chartByHorse.get(h.id);
            const amLog = logMap.get(logKey(h.id, "AM"));
            const pmLog = logMap.get(logKey(h.id, "PM"));
            return (
              <div key={h.id} className="card space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-lg">{h.name}</div>
                    {chart?.profiles?.name && (
                      <div className="text-xs text-stone-500">Responsible: {chart.profiles.name}</div>
                    )}
                  </div>
                </div>

                {chart?.supplements && (
                  <div className="text-sm">
                    <span className="font-medium">Supplements: </span>
                    {chart.supplements}
                  </div>
                )}
                {chart?.special_notes && (
                  <div className="text-sm text-amber-800 bg-amber-50 rounded p-2">
                    <span className="font-medium">Note: </span>
                    {chart.special_notes}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FeedBlock
                    label="AM feed"
                    text={chart?.am_feed}
                    done={!!amLog?.done}
                    action={markFeeding.bind(null, h.id, chart?.id ?? null, "AM", !!amLog?.done)}
                  />
                  <FeedBlock
                    label="PM feed"
                    text={chart?.pm_feed}
                    done={!!pmLog?.done}
                    action={markFeeding.bind(null, h.id, chart?.id ?? null, "PM", !!pmLog?.done)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FeedBlock({
  label,
  text,
  done,
  action,
}: {
  label: string;
  text: string | null | undefined;
  done: boolean;
  action: () => void;
}) {
  return (
    <div className={`rounded-lg border p-3 ${done ? "bg-farm-50 border-farm-200" : "border-stone-200"}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="font-medium">{label}</div>
        <span className={done ? "badge-done" : "badge-low"}>{done ? "Done" : "Pending"}</span>
      </div>
      <div className="text-sm text-stone-700 whitespace-pre-wrap min-h-[1.25rem]">{text || "—"}</div>
      <form action={action} className="mt-2">
        <button className={done ? "btn-secondary w-full" : "btn-primary w-full"}>
          {done ? "Mark not done" : "Mark done"}
        </button>
      </form>
    </div>
  );
}
