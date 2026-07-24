import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { fmtDate } from "@/lib/format";

async function toggleDone(taskId: string) {
  "use server";
  const session = await requireRole("EMPLOYEE", "ADMIN");
  const t = await db.task.findUnique({ where: { id: taskId } });
  // employees may only toggle tasks assigned to them or unassigned
  if (!t || (t.assignedToId && t.assignedToId !== session.uid && session.role !== "ADMIN")) return;
  await db.task.update({ where: { id: taskId }, data: { done: !t.done } });
  revalidatePath("/employee/tasks");
}

export default async function EmployeeTasks() {
  const session = await requireRole("EMPLOYEE", "ADMIN");
  const tasks = await db.task.findMany({
    where: { OR: [{ assignedToId: session.uid }, { assignedToId: null }] },
    orderBy: [{ done: "asc" }, { priority: "desc" }, { dueDate: "asc" }],
    take: 100,
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tasks</h1>
          <p className="sub">Yours and anything unassigned.</p>
        </div>
      </div>
      {tasks.length === 0 && <p className="empty">Nothing here.</p>}
      {tasks.map((t) => (
        <div key={t.id} className="card card--tight" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", opacity: t.done ? 0.55 : 1 }}>
          <div>
            <strong style={{ textDecoration: t.done ? "line-through" : "none" }}>{t.title}</strong>{" "}
            <span className={`badge badge--${t.priority === "HIGH" ? "red" : t.priority === "MEDIUM" ? "amber" : "gray"}`}>{t.priority.toLowerCase()}</span>
            {t.dueDate && <span className="muted"> · due {fmtDate(t.dueDate)}</span>}
            {t.notes && <div className="muted" style={{ fontSize: ".84rem" }}>{t.notes}</div>}
          </div>
          <form action={toggleDone.bind(null, t.id)}>
            <button className={`btn ${t.done ? "btn--ghost" : "btn--gold"} btn--sm`}>{t.done ? "Reopen" : "Done"}</button>
          </form>
        </div>
      ))}
    </>
  );
}
