import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current";
import { createTask as create, deleteTask as remove, listAllTasks, setTaskDone } from "@/lib/services/tasks";
import { listUserOptions } from "@/lib/services/users";
import { field } from "@/lib/validation";
import EmptyState from "@/components/EmptyState";
import PriorityBadge from "@/components/PriorityBadge";

export const dynamic = "force-dynamic";

async function createTask(formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  if (!field(formData, "title")) return;
  await create(actor, {
    title: field(formData, "title"),
    notes: field(formData, "notes"),
    assigned_to: field(formData, "assigned_to"),
    due_date: field(formData, "due_date"),
    priority: field(formData, "priority"),
  });
  revalidatePath("/admin/tasks");
}

async function toggleDone(id: string, done: boolean) {
  "use server";
  const actor = await requireAdmin();
  await setTaskDone(actor, id, !done);
  revalidatePath("/admin/tasks");
}

async function deleteTask(id: string) {
  "use server";
  const actor = await requireAdmin();
  await remove(actor, id);
  revalidatePath("/admin/tasks");
}

export default async function AdminTasksPage() {
  const actor = await requireAdmin();
  const [tasks, employees] = await Promise.all([listAllTasks(actor), listUserOptions(actor)]);

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
              {employees.map((e) => (
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
        {tasks.length === 0 ? (
          <EmptyState title="No tasks yet" hint="Create a task above." />
        ) : (
          tasks.map((t) => (
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
                  {t.assignee_name ? `Assigned: ${t.assignee_name}` : "Unassigned"}
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
