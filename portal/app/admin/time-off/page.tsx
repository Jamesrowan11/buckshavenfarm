import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { fmtDate } from "@/lib/format";

async function review(requestId: string, status: "APPROVED" | "DENIED") {
  "use server";
  const session = await requireRole("ADMIN");
  await db.timeOffRequest.update({
    where: { id: requestId },
    data: { status, reviewedById: session.uid },
  });
  revalidatePath("/admin/time-off");
}

export default async function TimeOffAdminPage() {
  await requireRole("ADMIN");
  const requests = await db.timeOffRequest.findMany({
    include: { employee: true, reviewedBy: true },
    orderBy: [{ status: "asc" }, { startDate: "asc" }],
    take: 100,
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Time off</h1>
          <p className="sub">{requests.filter((r) => r.status === "PENDING").length} awaiting review.</p>
        </div>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Employee</th><th>Dates</th><th>Reason</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {requests.length === 0 && <tr><td colSpan={5} className="empty">No requests.</td></tr>}
            {requests.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{r.employee.name}</td>
                <td>{fmtDate(r.startDate)} – {fmtDate(r.endDate)}</td>
                <td className="muted">{r.reason ?? "—"}</td>
                <td>
                  <span className={`badge badge--${r.status === "APPROVED" ? "green" : r.status === "DENIED" ? "red" : "amber"}`}>
                    {r.status.toLowerCase()}
                  </span>
                  {r.reviewedBy && <span className="muted"> by {r.reviewedBy.name}</span>}
                </td>
                <td>
                  {r.status === "PENDING" && (
                    <div style={{ display: "flex", gap: ".4rem" }}>
                      <form action={review.bind(null, r.id, "APPROVED")}>
                        <button className="btn btn--sm">Approve</button>
                      </form>
                      <form action={review.bind(null, r.id, "DENIED")}>
                        <button className="btn btn--danger btn--sm">Deny</button>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
