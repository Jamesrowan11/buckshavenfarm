import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

async function createAnnouncement(formData: FormData) {
  "use server";
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  await supabase.from("announcements").insert({
    title,
    body: (formData.get("body") as string) || null,
    created_by: user?.id ?? null,
  });
  revalidatePath("/admin/announcements");
}

async function deleteAnnouncement(id: string) {
  "use server";
  const supabase = createClient();
  await supabase.from("announcements").delete().eq("id", id);
  revalidatePath("/admin/announcements");
}

export default async function AdminAnnouncementsPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("announcements")
    .select("*, profiles:created_by(name)")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="h1">Announcements</h1>

      <form action={createAnnouncement} className="card space-y-3">
        <h2 className="h2">New announcement</h2>
        <input name="title" required placeholder="Title" className="input" />
        <textarea name="body" rows={4} placeholder="Body" className="input" />
        <button className="btn-primary">Post</button>
      </form>

      {(data?.length ?? 0) === 0 ? (
        <EmptyState title="No announcements yet" />
      ) : (
        <ul className="space-y-3">
          {data!.map((a: any) => (
            <li key={a.id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{a.title}</div>
                  <div className="text-xs text-stone-500">
                    {new Date(a.created_at).toLocaleString()} · {a.profiles?.name ?? "—"}
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
