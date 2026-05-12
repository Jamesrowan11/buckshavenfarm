import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

async function createHorse(formData: FormData) {
  "use server";
  const supabase = createClient();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await supabase.from("horses").insert({
    name,
    notes: (formData.get("notes") as string) || null,
  });
  revalidatePath("/admin/feeding-charts");
}

async function deleteHorse(id: string) {
  "use server";
  const supabase = createClient();
  await supabase.from("horses").delete().eq("id", id);
  revalidatePath("/admin/feeding-charts");
}

async function upsertChart(horseId: string, formData: FormData) {
  "use server";
  const supabase = createClient();
  const existingId = (formData.get("id") as string) || null;
  const rawBarn = (formData.get("barn") as string) || "";
  const barn = rawBarn === "log-barn" || rawBarn === "arena-barn" ? rawBarn : null;

  const payload = {
    horse_id: horseId,
    am_feed: (formData.get("am_feed") as string) || null,
    pm_feed: (formData.get("pm_feed") as string) || null,
    supplements: (formData.get("supplements") as string) || null,
    special_notes: (formData.get("special_notes") as string) || null,
    responsible_employee: (formData.get("responsible_employee") as string) || null,
    barn,
  };

  if (existingId) {
    await supabase.from("feeding_charts").update(payload).eq("id", existingId);
  } else {
    await supabase.from("feeding_charts").insert(payload);
  }
  // Keep horses.barn in sync so the public /barn-display/<barn> page can
  // filter on horse.barn directly without a chart join.
  await supabase.from("horses").update({ barn }).eq("id", horseId);
  revalidatePath("/admin/feeding-charts");
}

export default async function AdminFeedingChartsPage() {
  const supabase = createClient();
  const [{ data: horses }, { data: charts }, { data: employees }] = await Promise.all([
    supabase.from("horses").select("*").order("name"),
    supabase.from("feeding_charts").select("*"),
    supabase.from("profiles").select("id, name").order("name"),
  ]);

  const chartByHorse = new Map<string, any>();
  (charts ?? []).forEach((c: any) => chartByHorse.set(c.horse_id, c));

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

      {(horses?.length ?? 0) === 0 ? (
        <EmptyState title="No horses yet" hint="Add one above to start." />
      ) : (
        <div className="space-y-4">
          {horses!.map((h: any) => {
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
                  {chart && <input type="hidden" name="id" value={chart.id} />}
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
                        {employees?.map((e: any) => (
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
