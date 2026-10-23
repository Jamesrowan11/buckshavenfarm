import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current";
import { addTaskComment, listTasksForEmployee, setTaskDone } from "@/lib/services/tasks";
import { field } from "@/lib/validation";
import EmptyState from "@/components/EmptyState";
import PriorityBadge from "@/components/PriorityBadge";

export const dynamic = "force-dynamic";

async function toggleDone(id: string, done: boolean) {
  "use server";
  const actor = await requireUser();
  await setTaskDone(actor, id, !done);
  revalidatePath("/employee/tasks");
}

async function addComment(id: string, formData: FormData) {
  "use server";
  const actor = await requireUser();
  // The comment is appended to the current notes on the server, inside a
  // transaction, so concurrent comments never overwrite each other.
  await addTaskComment(actor, id, field(formData, "comment"));
  revalidatePath("/employee/tasks");
}

export default async function EmployeeTasksPage() {
  const actor = await requireUser();
  const tasks = await listTasksForEmployee(actor);

  return (
    <div className="space-y-4">
      <h1 className="h1">My tasks</h1>
      {tasks.length === 0 ? (
        <EmptyState title="Nothing assigned" />
      ) : (
        tasks.map((t) => (
          <div key={t.id} className={`card space-y-2 ${t.done ? "opacity-60" : ""}`}>
            <div className="flex items-start gap-3">
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
                {t.notes && <div className="text-sm text-stone-700 mt-1 whitespace-pre-wrap">{t.notes}</div>}
              </div>
            </div>
            <form action={addComment.bind(null, t.id)} className="flex gap-2">
              <input name="comment" placeholder="Add a comment..." className="input !py-1" />
              <button className="btn-secondary !py-1 !px-3 text-sm">Post</button>
            </form>
          </div>
        ))
      )}
    </div>
  );
}
