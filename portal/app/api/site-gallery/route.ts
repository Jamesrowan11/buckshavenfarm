import { NextResponse } from "next/server";
import fs from "fs/promises";
import { galleryDirs } from "@/lib/siteFiles";

/**
 * Self-updating gallery for the public website. Lists the photos in the
 * gallery folders (website/assets/img/gallery in the repo, plus GALLERY_DIR on
 * the server, which survives deploys); server.js serves them at
 * /assets/img/gallery/<name>. Add a photo to either and the website shows it.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const names = new Set<string>();
  for (const dir of galleryDirs()) {
    try {
      for (const f of await fs.readdir(dir)) {
        if (/\.(jpe?g|png|webp|gif|avif)$/i.test(f) && !f.startsWith(".")) names.add(f);
      }
    } catch {
      // folder missing → skip
    }
  }
  const out = [...names]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    .map((f) => "assets/img/gallery/" + encodeURIComponent(f));
  return NextResponse.json(out, { headers: { "Cache-Control": "public, max-age=300" } });
}
