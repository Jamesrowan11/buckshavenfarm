// Authorization rules, enforced on the server for every read and write.
// These mirror the Row Level Security policies of the old Supabase schema.
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import type { Profile } from "@/lib/types";

export type Actor = Pick<Profile, "id" | "email" | "name" | "role">;

export function assertSignedIn(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor) throw new UnauthorizedError();
}

export function assertAdmin(actor: Actor | null | undefined): asserts actor is Actor {
  assertSignedIn(actor);
  if (actor.role !== "admin") throw new ForbiddenError();
}

export function isAdmin(actor: Actor | null | undefined): boolean {
  return actor?.role === "admin";
}
