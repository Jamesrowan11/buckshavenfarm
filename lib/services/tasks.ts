// Tasks and task assignments.
import "server-only";
import { randomUUID } from "node:crypto";
import { execute, query, queryOne, toBool, toIso, withTransaction, type Queryable } from "@/lib/db";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { assertAdmin, assertSignedIn, isAdmin, type Actor } from "@/lib/auth/authorize";
import { formatDateTime } from "@/lib/time";
import { calendarDate, optionalText, parse, priority as prioritySchema, requiredText, uuid } from "@/lib/validation";
import type { Task, TaskWithAssignee } from "@/lib/types";

type TaskRow = Omit<Task, "done" | "created_at"> & {
  done: number;
  created_at: Date;
  assignee_name?: string | null;
};

const COLUMNS = "t.id, t.title, t.notes, t.assigned_to, t.created_by, t.due_date, t.priority, t.done, t.created_at";

function toTask(r: TaskRow): TaskWithAssignee {
  return {
    id: r.id,
    title: r.title,
    notes: r.notes,
    assigned_to: r.assigned_to,
    created_by: r.created_by,
    due_date: r.due_date,
    priority: r.priority,
    done: toBool(r.done),
    created_at: toIso(r.created_at),
    assignee_name: r.assignee_name ?? null,
  };
}

// Postgres sorted NULL due dates last in ascending order; MySQL sorts them
// first, so `due_date IS NULL` keeps the original ordering.
const ORDER_DUE = "t.due_date IS NULL, t.due_date";

/** Admin task list (open first, then by due date) with assignee names. */
export async function listAllTasks(actor: Actor): Promise<TaskWithAssignee[]> {
  assertAdmin(actor);
  const rows = await query<TaskRow>(
    `SELECT ${COLUMNS}, u.name AS assignee_name
       FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to
      ORDER BY t.done, ${ORDER_DUE}, t.created_at`
  );
  return rows.map(toTask);
}

export async function listOpenTasks(actor: Actor, limit = 5): Promise<TaskWithAssignee[]> {
  assertAdmin(actor);
  const rows = await query<TaskRow>(
    `SELECT ${COLUMNS} FROM tasks t WHERE t.done = FALSE ORDER BY ${ORDER_DUE} LIMIT ?`,
    [limit]
  );
  return rows.map(toTask);
}

/** Tasks visible to an employee: assigned to them, or to everyone (unassigned). */
export async function listTasksForEmployee(actor: Actor): Promise<TaskWithAssignee[]> {
  assertSignedIn(actor);
  const rows = await query<TaskRow>(
    `SELECT ${COLUMNS} FROM tasks t
      WHERE t.assigned_to = ? OR t.assigned_to IS NULL
      ORDER BY t.done, ${ORDER_DUE}, t.created_at`,
    [actor.id]
  );
  return rows.map(toTask);
}

export async function listMyOpenTasks(actor: Actor, limit = 5): Promise<TaskWithAssignee[]> {
  assertSignedIn(actor);
  const rows = await query<TaskRow>(
    `SELECT ${COLUMNS} FROM tasks t WHERE t.assigned_to = ? AND t.done = FALSE ORDER BY ${ORDER_DUE} LIMIT ?`,
    [actor.id, limit]
  );
  return rows.map(toTask);
}

export async function createTask(
  actor: Actor,
  input: { title: string; notes?: string; assigned_to?: string; due_date?: string; priority?: string }
): Promise<string> {
  assertAdmin(actor);
  const id = randomUUID();
  await execute(
    `INSERT INTO tasks (id, title, notes, assigned_to, created_by, due_date, priority)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      requiredText(input.title, "Title"),
      optionalText(input.notes),
      input.assigned_to ? parse(uuid, input.assigned_to) : null,
      actor.id,
      input.due_date ? parse(calendarDate, input.due_date) : null,
      parse(prioritySchema, input.priority || "medium"),
    ]
  );
  return id;
}

/**
 * Employees may update tasks assigned to them or to everyone (unassigned);
 * admins may update any task.
 */
async function assertCanWorkOn(actor: Actor, taskId: string, lock = false, tx?: Queryable) {
  const task = await queryOne<{ assigned_to: string | null; notes: string | null }>(
    `SELECT assigned_to, notes FROM tasks WHERE id = ?${lock ? " FOR UPDATE" : ""}`,
    [taskId],
    tx
  );
  if (!task) throw new NotFoundError();
  if (!isAdmin(actor) && task.assigned_to !== null && task.assigned_to !== actor.id) {
    throw new ForbiddenError();
  }
  return task;
}

export async function setTaskDone(actor: Actor, taskId: string, done: boolean): Promise<void> {
  assertSignedIn(actor);
  const id = parse(uuid, taskId);
  await assertCanWorkOn(actor, id);
  await execute("UPDATE tasks SET done = ? WHERE id = ?", [Boolean(done), id]);
}

/** Appends a timestamped comment to the task notes (atomic read-modify-write). */
export async function addTaskComment(actor: Actor, taskId: string, comment: string): Promise<void> {
  assertSignedIn(actor);
  const id = parse(uuid, taskId);
  const text = optionalText(comment, 2000);
  if (!text) return;
  await withTransaction(async (tx) => {
    const task = await assertCanWorkOn(actor, id, true, tx);
    const line = `[${formatDateTime(new Date())}] ${text}`;
    const next = task.notes ? `${task.notes}\n${line}` : line;
    await execute("UPDATE tasks SET notes = ? WHERE id = ?", [next, id], tx);
  });
}

export async function deleteTask(actor: Actor, taskId: string): Promise<void> {
  assertAdmin(actor);
  await execute("DELETE FROM tasks WHERE id = ?", [parse(uuid, taskId)]);
}
