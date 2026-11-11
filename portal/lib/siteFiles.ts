import path from "path";

/** The public website's folder (../website next to this portal app). */
export function websiteDir() {
  return process.env.WEBSITE_DIR?.trim() || path.join(process.cwd(), "..", "website");
}

/** Gallery photo folders: the server's own (GALLERY_DIR) first, then the repo's. */
export function galleryDirs() {
  const dirs = [path.join(websiteDir(), "assets", "img", "gallery")];
  const extra = process.env.GALLERY_DIR?.trim();
  return extra ? [extra, ...dirs] : dirs;
}
