import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { todayUTC, toDateInput } from "@/lib/format";

async function createShift(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const date = String(formData.get("date") || "");
  const employeeId = String(formData.get("employeeId") || "");
  if (!date || !employeeId) return;
  await db.shift.create({
    data: {
      employeeId,
      date: new Date(date + "T00:00:00Z"),
      startTime: String(formData.get("startTime") || "07:00"),
      endTime: String(formData.get("endTime") || "15:00"),
      notes: String(formData.get("notes") || "").trim() || null,
    },
  });
  revalidatePath("/admin/schedule");
}

async function deleteShift(shiftId: string) {
  "use server";
  await requireRole("ADMIN");
  await db.shift.delete({ where: { id: shiftId } });
  revalidatePath("/admin/schedule");
}

export default async function SchedulePage() {
  const start = todayUTC();
  start.setUTCDate(start.getUTCDate() - start.getUTCDay()); // back to Sunday
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 14);

  const [shifts, staff] = await Promise.all([
    db.shift.findMany({
      where: { date: { gte: start, lt: end } },
      include: { employee: true },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    db.user.findMany({ where: { role: { in: ["ADMIN", "EMPLOYEE"] }, active: true }, orderBy: { name: "asc" } }),
  ]);

  const days: Date[] = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  });
  const byDay = new Map<string, typeof shifts>();
  for (const s of shifts) {
    const k = toDateInput(s.date);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  const today = toDateInput(todayUTC());

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Schedule</h1>
          <p className="sub">Two weeks of staff shifts.</p>
        </div>
      </div>

      <div className="card">
        <h2>Add a shift</h2>
        <form action={createShift}>
          <div className="fld-row--3 fld-row">
            <label className="fld">
              Employee
              <select name="employeeId" required>
                <option value="">Choose…</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="fld">Date<input type="date" name="date" required defaultValue={today} /></label>
            <label className="fld">Notes<input name="notes" /></label>
          </div>
          <div className="fld-row">
            <label className="fld">Start<input type="time" name="startTime" defaultValue="07:00" /></label>
            <label className="fld">End<input type="time" name="endTime" defaultValue="15:00" /></label>
          </div>
          <button className="btn btn--gold">Add Shift</button>
        </form>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        {days.map((d) => {
          const k = toDateInput(d);
          const dayShifts = byDay.get(k) ?? [];
          return (
            <div key={k} className="card card--tight" style={k === today ? { borderColor: "var(--gold)" } : undefined}>
              <p style={{ fontWeight: 700, fontSize: ".82rem", marginBottom: ".4rem" }}>
                {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}
                {k === today && <span className="badge badge--gold" style={{ marginLeft: ".4rem" }}>today</span>}
              </p>
              {dayShifts.length === 0 && <p className="muted" style={{ fontSize: ".8rem" }}>—</p>}
              {dayShifts.map((s) => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: ".84rem", padding: ".2rem 0" }}>
                  <span><strong>{s.employee.name}</strong> {s.startTime}–{s.endTime}{s.notes ? <span className="muted"> · {s.notes}</span> : null}</span>
                  <form action={deleteShift.bind(null, s.id)}>
                    <button className="btn btn--danger btn--sm" style={{ padding: ".1rem .4rem" }}>×</button>
                  </form>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
