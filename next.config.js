/** @type {import('next').NextConfig} */
// Configured for Cloudflare Pages (NOT Cloudflare Workers).
// The build is driven by @cloudflare/next-on-pages, which transforms the
// standard Next.js output into the Pages-compatible `.vercel/output/static`
// directory. Do NOT set `output: 'standalone'` or `output: 'export'` —
// next-on-pages handles output transformation itself, and overriding it
// breaks the Pages deployment.
const nextConfig = {
  reactStrictMode: true,
  // Cloudflare Pages doesn't run the Next.js image optimizer.
  images: {
    unoptimized: true,
  },
  // Per-route opt-out of static prerender lives in each page via:
  //   export const dynamic = "force-dynamic";
  //   export const runtime  = "edge";
  // The edge runtime is required by @cloudflare/next-on-pages for
  // server-rendered routes.
};

module.exports = nextConfig;
