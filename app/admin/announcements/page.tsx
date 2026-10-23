import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current";
import { createAnnouncement as create, deleteAnnouncement as remove, listAnnouncements } from "@/lib/services/announcements";
import { field } from "@/lib/validation";
import { formatDateTime } from "@/lib/time";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

async function createAnnouncement(formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  if (!field(formData, "title")) return;
  await create(actor, { title: field(formData, "title"), body: field(formData, "body") });
  revalidatePath("/admin/announcements");
}

async function deleteAnnouncement(id: string) {
  "use server";
  const actor = await requireAdmin();
  await remove(actor, id);
  revalidatePath("/admin/announcements");
}

export default async function AdminAnnouncementsPage() {
  const actor = await requireAdmin();
  const data = await listAnnouncements(actor);

  return (
    <div className="space-y-6">
      <h1 className="h1">Announcements</h1>

      <form action={createAnnouncement} className="card space-y-3">
        <h2 className="h2">New announcement</h2>
        <input name="title" required placeholder="Title" className="input" />
        <textarea name="body" rows={4} placeholder="Body" className="input" />
        <button className="btn-primary">Post</button>
      </form>

      {data.length === 0 ? (
        <EmptyState title="No announcements yet" />
      ) : (
        <ul className="space-y-3">
          {data.map((a) => (
            <li key={a.id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{a.title}</div>
                  <div className="text-xs text-stone-500">
                    {formatDateTime(a.created_at)} · {a.author_name ?? "—"}
                  </div>
                </div>
                <form action={deleteAnnouncement.bind(null, a.id)}>
                  <button className="text-stone-400 hover:text-red-600 text-sm">Delete</button>
                </form>
              </div>
              {a.body && <p className="mt-2 text-stone-700 whitespace-pre-wrap">{a.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
