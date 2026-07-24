import { NextResponse } from "next/server";
import fs from "fs/promises";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { uploadPath } from "@/lib/uploads";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const doc = await db.document.findUnique({
    where: { id },
    include: { horse: { include: { owners: true } } },
  });
  if (!doc) return new NextResponse("Not found", { status: 404 });

  // Staff see everything; a boarder only their own horses' documents.
  const isStaff = session.role === "ADMIN" || session.role === "EMPLOYEE";
  const isOwner = doc.horse.owners.some((o) => o.userId === session.uid);
  if (!isStaff && !isOwner) return new NextResponse("Forbidden", { status: 403 });

  try {
    const data = await fs.readFile(uploadPath("documents", doc.filename));
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `inline; filename="${doc.originalName.replace(/[^\w.\- ]/g, "_")}"`,
        "Cache-Control": "private, max-age=0",
      },
    });
  } catch {
    return new NextResponse("File missing on disk", { status: 404 });
  }
}
