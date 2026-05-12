import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function EmployeeAnnouncementsPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("announcements")
    .select("*, profiles:created_by(name)")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <h1 className="h1">Announcements</h1>
      {(data?.length ?? 0) === 0 ? (
        <EmptyState title="No announcements yet" />
      ) : (
        <ul className="space-y-3">
          {data!.map((a: any) => (
            <li key={a.id} className="card">
              <div className="font-semibold">{a.title}</div>
              <div className="text-xs text-stone-500">
                {new Date(a.created_at).toLocaleString()} · {a.profiles?.name ?? "—"}
              </div>
              {a.body && <p className="mt-2 text-stone-700 whitespace-pre-wrap">{a.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
