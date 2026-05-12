import Link from "next/link";
import { createClient, getSessionAndProfile } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EmployeeHome() {
  const supabase = createClient();
  const { user, profile } = await getSessionAndProfile();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: myTasks }, { data: shiftToday }, { data: ann }] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .eq("assigned_to", user!.id)
      .eq("done", false)
      .order("due_date", { ascending: true })
      .limit(5),
    supabase.from("shifts").select("*").eq("employee_id", user!.id).eq("date", today),
    supabase.from("announcements").select("*").order("created_at", { ascending: false }).limit(3),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="h1">Hi {profile?.name?.split(" ")[0] ?? "there"}</h1>
        <p className="text-stone-600 text-sm">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
      </div>

      <section className="card">
        <h2 className="h2 mb-2">Today&apos;s shift</h2>
        {shiftToday && shiftToday.length > 0 ? (
          <ul className="space-y-1">
            {shiftToday.map((s: any) => (
              <li key={s.id} className="text-stone-700">
                {s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}
                {s.notes ? ` · ${s.notes}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-stone-500 text-sm">No shift today.</p>
        )}
      </section>

      <section className="card">
        <div className="flex items-center justify-between mb-2">
          <h2 className="h2">My open tasks</h2>
          <Link href="/employee/tasks" className="text-sm text-farm font-medium">
            All →
          </Link>
        </div>
        {myTasks && myTasks.length > 0 ? (
          <ul className="space-y-2">
            {myTasks.map((t: any) => (
              <li key={t.id} className="text-stone-700">
                • {t.title}
                {t.due_date && <span className="text-stone-500 text-xs ml-2">due {t.due_date}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-stone-500 text-sm">All caught up.</p>
        )}
      </section>

      <section className="card">
        <div className="flex items-center justify-between mb-2">
          <h2 className="h2">Announcements</h2>
          <Link href="/employee/announcements" className="text-sm text-farm font-medium">
            All →
          </Link>
        </div>
        {ann && ann.length > 0 ? (
          <ul className="space-y-3">
            {ann.map((a: any) => (
              <li key={a.id}>
                <div className="font-medium">{a.title}</div>
                <div className="text-sm text-stone-600 line-clamp-2">{a.body}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-stone-500 text-sm">No announcements.</p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/employee/clock" className="btn-primary w-full">Clock in / out</Link>
        <Link href="/employee/feeding-charts" className="btn-secondary w-full">Today&apos;s feeding</Link>
      </div>
    </div>
  );
}
