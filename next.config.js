/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Cloudflare Pages doesn't run the Next.js image optimizer.
  images: {
    unoptimized: true,
  },
  // Static prerender is opted out per-route via `export const dynamic = "force-dynamic"`
  // (see app/login/page.tsx, app/page.tsx, app/admin/**, app/employee/**).
  // This avoids accessing Supabase env vars at build time when secrets aren't bound,
  // e.g., Cloudflare Pages preview builds.
};

module.exports = nextConfig;
