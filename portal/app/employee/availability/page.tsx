import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { fmtDate, todayUTC, toDateInput } from "@/lib/format";

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function nextWeekStart(): Date {
  const d = todayUTC();
  d.setUTCDate(d.getUTCDate() - d.getUTCDay() + 7);
  return d;
}

async function submitAvailability(formData: FormData) {
  "use server";
  const session = await requireRole("EMPLOYEE", "ADMIN");
  const weekStartRaw = String(formData.get("weekStart") || "");
  if (!weekStartRaw) return;
  const weekStart = new Date(weekStartRaw + "T00:00:00Z");
  const availableDays: Record<string, boolean> = {};
  for (const d of DAYS) availableDays[d] = formData.get(`day_${d}`) === "on";
  const notes = String(formData.get("notes") || "").trim() || null;
  await db.availability.upsert({
    where: { employeeId_weekStart: { employeeId: session.uid, weekStart } },
    create: { employeeId: session.uid, weekStart, availableDays, notes },
    update: { availableDays, notes },
  });
  revalidatePath("/employee/availability");
}

export default async function EmployeeAvailability() {
  const session = await requireRole("EMPLOYEE", "ADMIN");
  const weekStart = nextWeekStart();
  const existing = await db.availability.findUnique({
    where: { employeeId_weekStart: { employeeId: session.uid, weekStart } },
  });
  const days = (existing?.availableDays ?? {}) as Record<string, boolean>;
  const history = await db.availability.findMany({
    where: { employeeId: session.uid },
    orderBy: { weekStart: "desc" },
    take: 6,
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Availability</h1>
          <p className="sub">For the week of {fmtDate(weekStart)}.</p>
        </div>
      </div>

      <div className="card">
        <form action={submitAvailability}>
          <input type="hidden" name="weekStart" value={toDateInput(weekStart)} />
          <div className="pill-row" style={{ marginBottom: "1rem" }}>
            {DAYS.map((d) => (
              <label key={d} className="check" style={{ marginBottom: 0, border: "1px solid var(--line)", borderRadius: 8, padding: ".4rem .7rem" }}>
                <input type="checkbox" name={`day_${d}`} defaultChecked={days[d] ?? false} /> {d}
              </label>
            ))}
          </div>
          <label className="fld">Notes<input name="notes" defaultValue={existing?.notes ?? ""} placeholder="e.g. after 3pm only on Tuesday" /></label>
          <button className="btn btn--gold">{existing ? "Update" : "Submit"}</button>
        </form>
      </div>

      <h2>Previous weeks</h2>
      {history.map((a) => {
        const d = (a.availableDays ?? {}) as Record<string, boolean>;
        return (
          <div key={a.id} className="card card--tight">
            <strong>{fmtDate(a.weekStart)}</strong>{" "}
            <span className="muted">{DAYS.filter((x) => d[x]).join(", ") || "none"}{a.notes ? ` · ${a.notes}` : ""}</span>
          </div>
        );
      })}
    </>
  );
}
