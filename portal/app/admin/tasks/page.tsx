import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import type { Priority } from "@prisma/client";

async function createTask(formData: FormData) {
  "use server";
  const session = await requireRole("ADMIN");
  const due = String(formData.get("dueDate") || "");
  const priority = String(formData.get("priority") || "MEDIUM") as Priority;
  await db.task.create({
    data: {
      title: String(formData.get("title") || "").trim(),
      notes: String(formData.get("notes") || "").trim() || null,
      assignedToId: String(formData.get("assignedToId") || "") || null,
      createdById: session.uid,
      dueDate: due ? new Date(due + "T00:00:00Z") : null,
      priority: ["LOW", "MEDIUM", "HIGH"].includes(priority) ? priority : "MEDIUM",
    },
  });
  revalidatePath("/admin/tasks");
}

async function toggleDone(taskId: string) {
  "use server";
  await requireRole("ADMIN");
  const t = await db.task.findUnique({ where: { id: taskId } });
  if (t) await db.task.update({ where: { id: taskId }, data: { done: !t.done } });
  revalidatePath("/admin/tasks");
}

async function deleteTask(taskId: string) {
  "use server";
  await requireRole("ADMIN");
  await db.task.delete({ where: { id: taskId } });
  revalidatePath("/admin/tasks");
}

export default async function TasksPage() {
  const [tasks, staff] = await Promise.all([
    db.task.findMany({
      orderBy: [{ done: "asc" }, { priority: "desc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      include: { assignedTo: true },
    }),
    db.user.findMany({ where: { role: { in: ["ADMIN", "EMPLOYEE"] }, active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tasks</h1>
          <p className="sub">{tasks.filter((t) => !t.done).length} open.</p>
        </div>
      </div>

      <div className="card">
        <h2>New task</h2>
        <form action={createTask}>
          <div className="fld-row">
            <label className="fld">Title<input name="title" required /></label>
            <label className="fld">
              Assign to
              <select name="assignedToId" defaultValue="">
                <option value="">Anyone</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>
          <div className="fld-row--3 fld-row">
            <label className="fld">Due date<input type="date" name="dueDate" /></label>
            <label className="fld">
              Priority
              <select name="priority" defaultValue="MEDIUM">
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </label>
            <label className="fld">Notes<input name="notes" /></label>
          </div>
          <button className="btn btn--gold">Add Task</button>
        </form>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th></th><th>Task</th><th>Assigned</th><th>Due</th><th>Priority</th><th></th></tr></thead>
          <tbody>
            {tasks.length === 0 && <tr><td colSpan={6} className="empty">No tasks yet.</td></tr>}
            {tasks.map((t) => (
              <tr key={t.id} style={t.done ? { opacity: 0.55 } : undefined}>
                <td>
                  <form action={toggleDone.bind(null, t.id)}>
                    <button className="btn btn--sm btn--ghost" title={t.done ? "Reopen" : "Mark done"}>
                      {t.done ? "↺" : "✓"}
                    </button>
                  </form>
                </td>
                <td>
                  <span style={{ fontWeight: 600, textDecoration: t.done ? "line-through" : "none" }}>{t.title}</span>
                  {t.notes && <div className="muted">{t.notes}</div>}
                </td>
                <td>{t.assignedTo?.name ?? <span className="muted">anyone</span>}</td>
                <td>{t.dueDate ? fmtDate(t.dueDate) : "—"}</td>
                <td>
                  <span className={`badge badge--${t.priority === "HIGH" ? "red" : t.priority === "MEDIUM" ? "amber" : "gray"}`}>
                    {t.priority.toLowerCase()}
                  </span>
                </td>
                <td>
                  <form action={deleteTask.bind(null, t.id)}>
                    <button className="btn btn--danger btn--sm">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
