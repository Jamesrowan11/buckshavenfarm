import { requireAdmin } from "@/lib/auth/current";
import { listClockLogs } from "@/lib/services/clock";
import { formatDateTime } from "@/lib/time";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function AdminClockLogPage() {
  const actor = await requireAdmin();
  const data = await listClockLogs(actor, 200);

  return (
    <div className="space-y-6">
      <h1 className="h1">Clock log</h1>
      {data.length === 0 ? (
        <EmptyState title="No clock-ins yet" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-stone-500">
              <tr>
                <th className="py-2 pr-4">When</th>
                <th className="py-2 pr-4">Who</th>
                <th className="py-2 pr-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 pr-4 whitespace-nowrap">{formatDateTime(c.created_at)}</td>
                  <td className="py-2 pr-4">{c.user_name}</td>
                  <td className="py-2 pr-4">
                    <span className={c.action === "in" ? "badge-approved" : "badge-low"}>
                      {c.action === "in" ? "Clocked in" : "Clocked out"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
