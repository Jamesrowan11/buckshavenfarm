import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function AdminClockLogPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("clock_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <h1 className="h1">Clock log</h1>
      {(data?.length ?? 0) === 0 ? (
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
              {data!.map((c: any) => (
                <tr key={c.id}>
                  <td className="py-2 pr-4 whitespace-nowrap">{new Date(c.created_at).toLocaleString()}</td>
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
