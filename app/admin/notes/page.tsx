import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";
export const runtime = "edge";

async function createNote(formData: FormData) {
  "use server";
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  await supabase.from("admin_notes").insert({
    title,
    body: (formData.get("body") as string) || null,
    created_by: user?.id ?? null,
  });
  revalidatePath("/admin/notes");
}

async function deleteNote(id: string) {
  "use server";
  const supabase = createClient();
  await supabase.from("admin_notes").delete().eq("id", id);
  revalidatePath("/admin/notes");
}

export default async function AdminNotesPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("admin_notes")
    .select("*, profiles:created_by(name)")
    .order("created_at", { ascending: false });

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

      {(data?.length ?? 0) === 0 ? (
        <EmptyState title="No notes yet" />
      ) : (
        <ul className="space-y-3">
          {data!.map((n: any) => (
            <li key={n.id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{n.title}</div>
                  <div className="text-xs text-stone-500">
                    {new Date(n.created_at).toLocaleString()} · {n.profiles?.name ?? "—"}
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
