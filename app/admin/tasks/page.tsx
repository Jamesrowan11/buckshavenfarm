import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/components/EmptyState";
import PriorityBadge from "@/components/PriorityBadge";

export const dynamic = "force-dynamic";

async function createTask(formData: FormData) {
  "use server";
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  await supabase.from("tasks").insert({
    title,
    notes: String(formData.get("notes") ?? "") || null,
    assigned_to: (formData.get("assigned_to") as string) || null,
    due_date: (formData.get("due_date") as string) || null,
    priority: (formData.get("priority") as string) || "medium",
    created_by: user?.id ?? null,
  });
  revalidatePath("/admin/tasks");
}

async function toggleDone(id: string, done: boolean) {
  "use server";
  const supabase = createClient();
  await supabase.from("tasks").update({ done: !done }).eq("id", id);
  revalidatePath("/admin/tasks");
}

async function deleteTask(id: string) {
  "use server";
  const supabase = createClient();
  await supabase.from("tasks").delete().eq("id", id);
  revalidatePath("/admin/tasks");
}

export default async function AdminTasksPage() {
  const supabase = createClient();
  const [{ data: tasks }, { data: employees }] = await Promise.all([
    supabase.from("tasks").select("*, profiles:assigned_to(name)").order("done").order("due_date"),
    supabase.from("profiles").select("id, name").order("name"),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="h1">Tasks</h1>

      <form action={createTask} className="card space-y-3">
        <h2 className="h2">New task</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="label">Title</label>
            <input name="title" required className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notes</label>
            <textarea name="notes" rows={2} className="input" />
          </div>
          <div>
            <label className="label">Assign to</label>
            <select name="assigned_to" className="input">
              <option value="">— All / unassigned —</option>
              {employees?.map((e: any) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Due date</label>
            <input type="date" name="due_date" className="input" />
          </div>
          <div>
            <label className="label">Priority</label>
            <select name="priority" defaultValue="medium" className="input">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>
        <button className="btn-primary">Create task</button>
      </form>

      <section className="space-y-2">
        {(tasks?.length ?? 0) === 0 ? (
          <EmptyState title="No tasks yet" hint="Create a task above." />
        ) : (
          tasks!.map((t: any) => (
            <div key={t.id} className={`card flex items-start gap-3 ${t.done ? "opacity-60" : ""}`}>
              <form action={toggleDone.bind(null, t.id, t.done)}>
                <button
                  aria-label="toggle"
                  className={`mt-1 h-5 w-5 rounded border-2 flex items-center justify-center ${
                    t.done ? "bg-farm border-farm text-white" : "border-stone-300"
                  }`}
                >
                  {t.done ? "✓" : ""}
                </button>
              </form>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-medium ${t.done ? "line-through" : ""}`}>{t.title}</span>
                  <PriorityBadge p={t.priority} />
                  {t.due_date && <span className="text-xs text-stone-500">due {t.due_date}</span>}
                </div>
                {t.notes && <div className="text-sm text-stone-600 mt-1 whitespace-pre-wrap">{t.notes}</div>}
                <div className="text-xs text-stone-500 mt-1">
                  {t.profiles?.name ? `Assigned: ${t.profiles.name}` : "Unassigned"}
                </div>
              </div>
              <form action={deleteTask.bind(null, t.id)}>
                <button className="text-stone-400 hover:text-red-600 text-sm">Delete</button>
              </form>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
