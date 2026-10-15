import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current";
import { createNote as create, deleteNote as remove, listNotes } from "@/lib/services/notes";
import { field } from "@/lib/validation";
import { formatDateTime } from "@/lib/time";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

async function createNote(formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  if (!field(formData, "title")) return;
  await create(actor, { title: field(formData, "title"), body: field(formData, "body") });
  revalidatePath("/admin/notes");
}

async function deleteNote(id: string) {
  "use server";
  const actor = await requireAdmin();
  await remove(actor, id);
  revalidatePath("/admin/notes");
}

export default async function AdminNotesPage() {
  const actor = await requireAdmin();
  const data = await listNotes(actor);

  return (
    <div className="space-y-6">
      <h1 className="h1">Admin notes</h1>
      <p className="text-sm text-stone-600">Private to admins. Employees can&apos;t see these.</p>

      <form action={createNote} className="card space-y-3">
        <h2 className="h2">New note</h2>
        <input name="title" required placeholder="Title" className="input" />
        <textarea name="body" rows={4} placeholder="Body" className="input" />
        <button className="btn-primary">Save note</button>
      </form>

      {data.length === 0 ? (
        <EmptyState title="No notes yet" />
      ) : (
        <ul className="space-y-3">
          {data.map((n) => (
            <li key={n.id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{n.title}</div>
                  <div className="text-xs text-stone-500">
                    {formatDateTime(n.created_at)} · {n.author_name ?? "—"}
                  </div>
                </div>
                <form action={deleteNote.bind(null, n.id)}>
                  <button className="text-stone-400 hover:text-red-600 text-sm">Delete</button>
                </form>
              </div>
              {n.body && <p className="mt-2 text-stone-700 whitespace-pre-wrap">{n.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
