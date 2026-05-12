import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/components/EmptyState";
import PriorityBadge from "@/components/PriorityBadge";

export const dynamic = "force-dynamic";
export const runtime = "edge";

async function toggleDone(id: string, done: boolean) {
  "use server";
  const supabase = createClient();
  await supabase.from("tasks").update({ done: !done }).eq("id", id);
  revalidatePath("/employee/tasks");
}

async function addComment(id: string, current: string | null, formData: FormData) {
  "use server";
  const supabase = createClient();
  const comment = String(formData.get("comment") ?? "").trim();
  if (!comment) return;
  const stamp = new Date().toLocaleString();
  const next = `${current ?? ""}${current ? "\n" : ""}[${stamp}] ${comment}`;
  await supabase.from("tasks").update({ notes: next }).eq("id", id);
  revalidatePath("/employee/tasks");
}

export default async function EmployeeTasksPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .or(`assigned_to.eq.${user!.id},assigned_to.is.null`)
    .order("done")
    .order("due_date");

  return (
    <div className="space-y-4">
      <h1 className="h1">My tasks</h1>
      {(tasks?.length ?? 0) === 0 ? (
        <EmptyState title="Nothing assigned" />
      ) : (
        tasks!.map((t: any) => (
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
            <form action={addComment.bind(null, t.id, t.notes)} className="flex gap-2">
              <input name="comment" placeholder="Add a comment..." className="input !py-1" />
              <button className="btn-secondary !py-1 !px-3 text-sm">Post</button>
            </form>
          </div>
        ))
      )}
    </div>
  );
}
