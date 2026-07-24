import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";

async function punch() {
  "use server";
  const session = await requireRole("EMPLOYEE", "ADMIN");
  const last = await db.clockLog.findFirst({
    where: { userId: session.uid },
    orderBy: { createdAt: "desc" },
  });
  await db.clockLog.create({
    data: {
      userId: session.uid,
      userName: session.name,
      action: last?.action === "IN" ? "OUT" : "IN",
    },
  });
  revalidatePath("/employee/clock");
}

export default async function ClockPage() {
  const session = await requireRole("EMPLOYEE", "ADMIN");
  const logs = await db.clockLog.findMany({
    where: { userId: session.uid },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const clockedIn = logs[0]?.action === "IN";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Time clock</h1>
          <p className="sub">You are currently clocked {clockedIn ? "IN" : "OUT"}.</p>
        </div>
      </div>

      <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
        <form action={punch}>
          <button className={`btn ${clockedIn ? "btn--danger" : "btn--gold"}`} style={{ fontSize: "1.05rem", padding: ".9rem 2.6rem" }}>
            {clockedIn ? "Clock Out" : "Clock In"}
          </button>
        </form>
      </div>

      <h2>Recent punches</h2>
      {logs.map((l) => (
        <div key={l.id} className="card card--tight">
          <span className={`badge badge--${l.action === "IN" ? "green" : "gray"}`}>{l.action === "IN" ? "in" : "out"}</span>{" "}
          <span className="muted">{fmtDateTime(l.createdAt)}</span>
        </div>
      ))}
      {logs.length === 0 && <p className="empty">No punches yet.</p>}
    </>
  );
}
