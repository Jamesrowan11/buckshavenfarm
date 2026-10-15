// Admin notes (private to administrators).
import "server-only";
import { randomUUID } from "node:crypto";
import { execute, query, toIso } from "@/lib/db";
import { assertAdmin, type Actor } from "@/lib/auth/authorize";
import { optionalText, parse, requiredText, uuid } from "@/lib/validation";
import type { AdminNoteWithAuthor } from "@/lib/types";

type Row = Omit<AdminNoteWithAuthor, "created_at"> & { created_at: Date };

export async function listNotes(actor: Actor): Promise<AdminNoteWithAuthor[]> {
  assertAdmin(actor);
  const rows = await query<Row>(
    `SELECT n.id, n.title, n.body, n.created_by, n.created_at, u.name AS author_name
       FROM admin_notes n LEFT JOIN users u ON u.id = n.created_by
      ORDER BY n.created_at DESC`
  );
  return rows.map((r) => ({ ...r, created_at: toIso(r.created_at), author_name: r.author_name ?? null }));
}

export async function createNote(actor: Actor, input: { title: string; body?: string }): Promise<string> {
  assertAdmin(actor);
  const id = randomUUID();
  await execute("INSERT INTO admin_notes (id, title, body, created_by) VALUES (?, ?, ?, ?)", [
    id,
    requiredText(input.title, "Title"),
    optionalText(input.body, 20000),
    actor.id,
  ]);
  return id;
}

export async function deleteNote(actor: Actor, id: string): Promise<void> {
  assertAdmin(actor);
  await execute("DELETE FROM admin_notes WHERE id = ?", [parse(uuid, id)]);
}
