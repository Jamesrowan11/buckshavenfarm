import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current";
import {
  createHorse as create,
  deleteHorse as remove,
  listAllHorses,
  listCharts,
  saveFeedingChart,
} from "@/lib/services/feeding";
import { listUserOptions } from "@/lib/services/users";
import { field } from "@/lib/validation";
import type { FeedingChartWithResponsible } from "@/lib/types";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

async function createHorse(formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  if (!field(formData, "name")) return;
  await create(actor, { name: field(formData, "name"), notes: field(formData, "notes") });
  revalidatePath("/admin/feeding-charts");
}

async function deleteHorse(id: string) {
  "use server";
  const actor = await requireAdmin();
  await remove(actor, id);
  revalidatePath("/admin/feeding-charts");
}

async function upsertChart(horseId: string, formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  // Creates or updates the horse's chart and keeps horses.barn in sync so the
  // public /barn-display/<barn> page can filter on it (one transaction).
  await saveFeedingChart(actor, horseId, {
    am_feed: field(formData, "am_feed"),
    pm_feed: field(formData, "pm_feed"),
    supplements: field(formData, "supplements"),
    special_notes: field(formData, "special_notes"),
    responsible_employee: field(formData, "responsible_employee"),
    barn: field(formData, "barn"),
  });
  revalidatePath("/admin/feeding-charts");
}

export default async function AdminFeedingChartsPage() {
  const actor = await requireAdmin();
  const [horses, charts, employees] = await Promise.all([
    listAllHorses(actor),
    listCharts(actor),
    listUserOptions(actor),
  ]);

  const chartByHorse = new Map<string, FeedingChartWithResponsible>();
  charts.forEach((c) => chartByHorse.set(c.horse_id, c));

  return (
    <div className="space-y-6">
      <h1 className="h1">Feeding charts</h1>

      <form action={createHorse} className="card space-y-3">
        <h2 className="h2">Add horse</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <input name="name" required placeholder="Horse name" className="input" />
          <input name="notes" placeholder="Notes (optional)" className="input" />
        </div>
        <button className="btn-primary">Add horse</button>
      </form>

      {horses.length === 0 ? (
        <EmptyState title="No horses yet" hint="Add one above to start." />
      ) : (
        <div className="space-y-4">
          {horses.map((h) => {
            const chart = chartByHorse.get(h.id);
            return (
              <div key={h.id} className="card">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">{h.name}</span>
                      {h.barn === "log-barn" && (
                        <span className="badge bg-amber-100 text-amber-800">Log Barn</span>
                      )}
                      {h.barn === "arena-barn" && (
                        <span className="badge bg-sky-100 text-sky-800">Arena Barn</span>
                      )}
                    </div>
                    {h.notes && <div className="text-sm text-stone-600">{h.notes}</div>}
                  </div>
                  <form action={deleteHorse.bind(null, h.id)}>
                    <button className="text-stone-400 hover:text-red-600 text-sm">Remove</button>
                  </form>
                </div>
                <form action={upsertChart.bind(null, h.id)} className="space-y-3">
                                    <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label">AM feed</label>
                      <textarea name="am_feed" rows={2} defaultValue={chart?.am_feed ?? ""} className="input" />
                    </div>
                    <div>
                      <label className="label">PM feed</label>
                      <textarea name="pm_feed" rows={2} defaultValue={chart?.pm_feed ?? ""} className="input" />
                    </div>
                    <div>
                      <label className="label">Supplements</label>
                      <input name="supplements" defaultValue={chart?.supplements ?? ""} className="input" />
                    </div>
                    <div>
                      <label className="label">Responsible employee</label>
                      <select name="responsible_employee" defaultValue={chart?.responsible_employee ?? ""} className="input">
                        <option value="">—</option>
                        {employees.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Barn</label>
                      <select
                        name="barn"
                        defaultValue={chart?.barn ?? h.barn ?? ""}
                        className="input"
                      >
                        <option value="">— unassigned —</option>
                        <option value="log-barn">Log Barn</option>
                        <option value="arena-barn">Arena Barn</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label">Special notes</label>
                      <textarea
                        name="special_notes"
                        rows={2}
                        defaultValue={chart?.special_notes ?? ""}
                        className="input"
                      />
                    </div>
                  </div>
                  <button className="btn-primary">{chart ? "Update chart" : "Save chart"}</button>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
