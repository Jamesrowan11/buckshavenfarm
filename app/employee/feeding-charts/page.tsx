import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current";
import { getFeedingDay, setFeedingDone } from "@/lib/services/feeding";
import { formatCalendarDate } from "@/lib/time";
import type { FeedingChartWithResponsible, FeedingLog } from "@/lib/types";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

async function markFeeding(horseId: string, type: "AM" | "PM", currentDone: boolean) {
  "use server";
  const actor = await requireUser();
  await setFeedingDone(actor, horseId, type, !currentDone);
  revalidatePath("/employee/feeding-charts");
}

export default async function EmployeeFeedingPage() {
  const actor = await requireUser();
  const { date, horses, charts, logs } = await getFeedingDay(actor);

  const chartByHorse = new Map<string, FeedingChartWithResponsible>();
  charts.forEach((c) => chartByHorse.set(c.horse_id, c));
  const logKey = (h: string, t: "AM" | "PM") => `${h}|${t}`;
  const logMap = new Map<string, FeedingLog>();
  logs.forEach((l) => logMap.set(logKey(l.horse_id ?? "", l.feeding_type), l));

  return (
    <div className="space-y-4">
      <h1 className="h1">Feeding chart — {formatCalendarDate(date)}</h1>
      {horses.length === 0 ? (
        <EmptyState title="No horses on file" />
      ) : (
        <div className="space-y-3">
          {horses.map((h) => {
            const chart = chartByHorse.get(h.id);
            const amLog = logMap.get(logKey(h.id, "AM"));
            const pmLog = logMap.get(logKey(h.id, "PM"));
            return (
              <div key={h.id} className="card space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-lg">{h.name}</div>
                    {chart?.responsible_name && (
                      <div className="text-xs text-stone-500">Responsible: {chart.responsible_name}</div>
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
                    action={markFeeding.bind(null, h.id, "AM", !!amLog?.done)}
                  />
                  <FeedBlock
                    label="PM feed"
                    text={chart?.pm_feed}
                    done={!!pmLog?.done}
                    action={markFeeding.bind(null, h.id, "PM", !!pmLog?.done)}
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
  action: () => Promise<void>;
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
