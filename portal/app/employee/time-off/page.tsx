import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { fmtDate } from "@/lib/format";

async function requestTimeOff(formData: FormData) {
  "use server";
  const session = await requireRole("EMPLOYEE", "ADMIN");
  const start = String(formData.get("startDate") || "");
  const end = String(formData.get("endDate") || "");
  if (!start || !end) return;
  await db.timeOffRequest.create({
    data: {
      employeeId: session.uid,
      startDate: new Date(start + "T00:00:00Z"),
      endDate: new Date(end + "T00:00:00Z"),
      reason: String(formData.get("reason") || "").trim() || null,
    },
  });
  revalidatePath("/employee/time-off");
}

export default async function EmployeeTimeOff() {
  const session = await requireRole("EMPLOYEE", "ADMIN");
  const requests = await db.timeOffRequest.findMany({
    where: { employeeId: session.uid },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Time off</h1>
          <p className="sub">Requests go to the office for review.</p>
        </div>
      </div>

      <div className="card">
        <h2>Request time off</h2>
        <form action={requestTimeOff}>
          <div className="fld-row--3 fld-row">
            <label className="fld">First day<input type="date" name="startDate" required /></label>
            <label className="fld">Last day<input type="date" name="endDate" required /></label>
            <label className="fld">Reason<input name="reason" /></label>
          </div>
          <button className="btn btn--gold">Submit</button>
        </form>
      </div>

      {requests.map((r) => (
        <div key={r.id} className="card card--tight">
          <strong>{fmtDate(r.startDate)} – {fmtDate(r.endDate)}</strong>{" "}
          <span className={`badge badge--${r.status === "APPROVED" ? "green" : r.status === "DENIED" ? "red" : "amber"}`}>
            {r.status.toLowerCase()}
          </span>
          {r.reason && <span className="muted"> · {r.reason}</span>}
        </div>
      ))}
      {requests.length === 0 && <p className="empty">No requests yet.</p>}
    </>
  );
}
