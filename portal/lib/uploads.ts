import path from "path";
import fs from "fs/promises";
import crypto from "crypto";

/** Uploads live OUTSIDE the web root; served only through access-checked routes. */
export function uploadsDir() {
  return process.env.UPLOADS_DIR?.trim() || path.join(process.cwd(), "uploads");
}

export async function saveUpload(file: File, subdir: string): Promise<{
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
}> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name).slice(0, 12).replace(/[^.a-zA-Z0-9]/g, "");
  const filename = `${crypto.randomBytes(16).toString("hex")}${ext}`;
  const dir = path.join(uploadsDir(), subdir);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), bytes);
  return { filename, originalName: file.name, mimeType: file.type || "application/octet-stream", size: bytes.length };
}

export function uploadPath(subdir: string, filename: string) {
  // filename is always our own random hex — but never trust path pieces
  return path.join(uploadsDir(), subdir, path.basename(filename));
}
