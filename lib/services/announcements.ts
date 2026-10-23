// Announcements (read by everyone, written by admins).
import "server-only";
import { randomUUID } from "node:crypto";
import { execute, query, toIso } from "@/lib/db";
import { assertAdmin, assertSignedIn, type Actor } from "@/lib/auth/authorize";
import { optionalText, parse, requiredText, uuid } from "@/lib/validation";
import type { AnnouncementWithAuthor } from "@/lib/types";

type Row = Omit<AnnouncementWithAuthor, "created_at"> & { created_at: Date };

const toAnnouncement = (r: Row): AnnouncementWithAuthor => ({
  id: r.id,
  title: r.title,
  body: r.body,
  created_by: r.created_by,
  created_at: toIso(r.created_at),
  author_name: r.author_name ?? null,
});

export async function listAnnouncements(actor: Actor, limit?: number): Promise<AnnouncementWithAuthor[]> {
  assertSignedIn(actor);
  const sql = `SELECT a.id, a.title, a.body, a.created_by, a.created_at, u.name AS author_name
                 FROM announcements a LEFT JOIN users u ON u.id = a.created_by
                ORDER BY a.created_at DESC${limit ? " LIMIT ?" : ""}`;
  return (await query<Row>(sql, limit ? [limit] : [])).map(toAnnouncement);
}

export async function createAnnouncement(actor: Actor, input: { title: string; body?: string }): Promise<string> {
  assertAdmin(actor);
  const id = randomUUID();
  await execute("INSERT INTO announcements (id, title, body, created_by) VALUES (?, ?, ?, ?)", [
    id,
    requiredText(input.title, "Title"),
    optionalText(input.body, 10000),
    actor.id,
  ]);
  return id;
}

export async function deleteAnnouncement(actor: Actor, id: string): Promise<void> {
  assertAdmin(actor);
  await execute("DELETE FROM announcements WHERE id = ?", [parse(uuid, id)]);
}
