import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

/**
 * Self-updating gallery for the public website (replaces api/gallery.php,
 * which no longer runs now that Node.js serves the domain).
 * Lists images in httpdocs/assets/img/gallery — drop photos in that folder
 * via Plesk File Manager and the website gallery updates itself.
 */
export async function GET() {
  const dir = path.join(process.cwd(), "httpdocs", "assets", "img", "gallery");
  let out: string[] = [];
  try {
    const files = await fs.readdir(dir);
    out = files
      .filter((f) => /\.(jpe?g|png|webp|gif|avif)$/i.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
      .map((f) => "assets/img/gallery/" + encodeURIComponent(f));
  } catch {
    // folder missing → empty gallery, site shows placeholder tiles
  }
  return NextResponse.json(out, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
