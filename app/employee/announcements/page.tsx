import { requireUser } from "@/lib/auth/current";
import { listAnnouncements } from "@/lib/services/announcements";
import { formatDateTime } from "@/lib/time";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function EmployeeAnnouncementsPage() {
  const actor = await requireUser();
  const data = await listAnnouncements(actor);

  return (
    <div className="space-y-4">
      <h1 className="h1">Announcements</h1>
      {data.length === 0 ? (
        <EmptyState title="No announcements yet" />
      ) : (
        <ul className="space-y-3">
          {data.map((a) => (
            <li key={a.id} className="card">
              <div className="font-semibold">{a.title}</div>
              <div className="text-xs text-stone-500">
                {formatDateTime(a.created_at)} · {a.author_name ?? "—"}
              </div>
              {a.body && <p className="mt-2 text-stone-700 whitespace-pre-wrap">{a.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
