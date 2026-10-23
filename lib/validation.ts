// Input validation for everything that arrives from the browser: form fields
// and the IDs bound into server actions (which the client can tamper with).
import { z } from "zod";
import { ValidationError } from "@/lib/errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const uuid = z.string().regex(UUID_RE, "Invalid ID").transform((s) => s.toLowerCase());

export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d && y >= 1900 && y <= 2200;
  }, "Invalid date");

export const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Invalid time")
  .transform((s) => (s.length === 5 ? `${s}:00` : s));

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email address.");

export const role = z.enum(["admin", "employee"]);
export const priority = z.enum(["low", "medium", "high"]);
export const barn = z.enum(["log-barn", "arena-barn"]);
export const feedingType = z.enum(["AM", "PM"]);
export const clockAction = z.enum(["in", "out"]);
export const reviewStatus = z.enum(["approved", "denied"]);

/** Throws ValidationError (safe message) if the value doesn't match. */
export function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message ?? undefined);
  }
  return result.data;
}

/** Trimmed string form field ('' when missing). */
export function field(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
}

/** Trimmed optional text: null when empty, ValidationError when too long. */
export function optionalText(value: string | null | undefined, max = 5000): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (v.length > max) throw new ValidationError(`Text must be at most ${max} characters.`);
  return v;
}

/** Trimmed required text, ValidationError when empty or too long. */
export function requiredText(value: string | null | undefined, label: string, max = 300): string {
  const v = (value ?? "").trim();
  if (!v) throw new ValidationError(`${label} is required.`);
  if (v.length > max) throw new ValidationError(`${label} must be at most ${max} characters.`);
  return v;
}
