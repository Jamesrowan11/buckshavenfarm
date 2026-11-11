"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { saveUpload } from "@/lib/uploads";
import type { Barn } from "@prisma/client";

function barnOrNull(v: FormDataEntryValue | null): Barn | null {
  return v === "LOG_BARN" || v === "ARENA_BARN" ? v : null;
}
function strOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

export async function createHorse(formData: FormData) {
  await requireRole("ADMIN");
  const horse = await db.horse.create({
    data: {
      name: String(formData.get("name") || "").trim(),
      showName: strOrNull(formData.get("showName")),
      barn: barnOrNull(formData.get("barn")),
      stall: strOrNull(formData.get("stall")),
      notes: strOrNull(formData.get("notes")),
    },
  });
  revalidatePath("/admin/horses");
  redirect(`/admin/horses/${horse.id}`);
}

export async function updateHorse(horseId: string, formData: FormData) {
  await requireRole("ADMIN");
  const limit = String(formData.get("emergencySpendLimit") || "").replace(/[^0-9]/g, "");
  await db.horse.update({
    where: { id: horseId },
    data: {
      name: String(formData.get("name") || "").trim(),
      showName: strOrNull(formData.get("showName")),
      barn: barnOrNull(formData.get("barn")),
      stall: strOrNull(formData.get("stall")),
      notes: strOrNull(formData.get("notes")),
      vetName: strOrNull(formData.get("vetName")),
      vetPhone: strOrNull(formData.get("vetPhone")),
      farrierName: strOrNull(formData.get("farrierName")),
      farrierPhone: strOrNull(formData.get("farrierPhone")),
      emergencySpendLimit: limit ? parseInt(limit, 10) : null,
      active: formData.get("active") === "on",
    },
  });
  revalidatePath(`/admin/horses/${horseId}`);
  revalidatePath("/admin/horses");
}

export async function addOwner(horseId: string, formData: FormData) {
  await requireRole("ADMIN");
  const userId = String(formData.get("userId") || "");
  if (userId) {
    await db.horseOwner.upsert({
      where: { horseId_userId: { horseId, userId } },
      create: { horseId, userId },
      update: {},
    });
  }
  revalidatePath(`/admin/horses/${horseId}`);
}

export async function removeOwner(horseId: string, userId: string) {
  await requireRole("ADMIN");
  await db.horseOwner.delete({ where: { horseId_userId: { horseId, userId } } });
  revalidatePath(`/admin/horses/${horseId}`);
}

export async function uploadDocument(horseId: string, formData: FormData) {
  const session = await requireRole("ADMIN");
  const file = formData.get("file") as File | null;
  const title = String(formData.get("title") || "").trim();
  if (!file || file.size === 0) return;
  const saved = await saveUpload(file, "documents");
  await db.document.create({
    data: {
      horseId,
      title: title || file.name,
      filename: saved.filename,
      originalName: saved.originalName,
      mimeType: saved.mimeType,
      size: saved.size,
      uploadedById: session.uid,
    },
  });
  revalidatePath(`/admin/horses/${horseId}`);
}

export async function deleteDocument(horseId: string, documentId: string) {
  await requireRole("ADMIN");
  await db.document.delete({ where: { id: documentId } });
  revalidatePath(`/admin/horses/${horseId}`);
}

export async function saveFeedingChart(horseId: string, formData: FormData) {
  await requireRole("ADMIN");
  const data = {
    amFeed: strOrNull(formData.get("amFeed")),
    pmFeed: strOrNull(formData.get("pmFeed")),
    supplements: strOrNull(formData.get("supplements")),
    specialNotes: strOrNull(formData.get("specialNotes")),
    responsibleEmployeeId: strOrNull(formData.get("responsibleEmployeeId")),
  };
  await db.feedingChart.upsert({
    where: { horseId },
    create: { horseId, ...data },
    update: data,
  });
  revalidatePath(`/admin/horses/${horseId}`);
  revalidatePath("/admin/feeding-charts");
}
