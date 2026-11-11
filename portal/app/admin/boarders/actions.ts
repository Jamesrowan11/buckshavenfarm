"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

function strOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

export async function createBoarder(formData: FormData) {
  await requireRole("ADMIN");
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "") || Math.random().toString(36).slice(2, 10) + "Bh!";
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) redirect(`/admin/boarders/${existing.id}?exists=1`);

  const user = await db.user.create({
    data: {
      name: String(formData.get("name") || "").trim(),
      email,
      phone: strOrNull(formData.get("phone")),
      billingEmail: strOrNull(formData.get("billingEmail")),
      passwordHash: await bcrypt.hash(password, 12),
      role: "BOARDER",
    },
  });
  revalidatePath("/admin/boarders");
  redirect(`/admin/boarders/${user.id}`);
}

export async function updateBoarder(userId: string, formData: FormData) {
  await requireRole("ADMIN");
  await db.user.update({
    where: { id: userId },
    data: {
      name: String(formData.get("name") || "").trim(),
      phone: strOrNull(formData.get("phone")),
      billingEmail: strOrNull(formData.get("billingEmail")),
      active: formData.get("active") === "on",
    },
  });
  revalidatePath(`/admin/boarders/${userId}`);
  revalidatePath("/admin/boarders");
}

export async function addEmergencyContact(userId: string, formData: FormData) {
  await requireRole("ADMIN");
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  if (!name || !phone) return;
  const count = await db.emergencyContact.count({ where: { userId } });
  await db.emergencyContact.create({
    data: {
      userId,
      name,
      phone,
      relation: strOrNull(formData.get("relation")),
      priority: count + 1,
    },
  });
  revalidatePath(`/admin/boarders/${userId}`);
}

export async function deleteEmergencyContact(userId: string, contactId: string) {
  await requireRole("ADMIN");
  await db.emergencyContact.delete({ where: { id: contactId } });
  revalidatePath(`/admin/boarders/${userId}`);
}

export async function resetBoarderPassword(userId: string, formData: FormData) {
  await requireRole("ADMIN");
  const password = String(formData.get("password") || "").trim();
  if (password.length < 8) return;
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(password, 12) },
  });
  revalidatePath(`/admin/boarders/${userId}`);
}
