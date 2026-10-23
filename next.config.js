/** @type {import('next').NextConfig} */

// Extra hostnames allowed to submit Server Actions (comma-separated), e.g.
// when the site is reached through more than one domain. The request's own
// Host / X-Forwarded-Host is always allowed.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((h) => h.trim().replace(/^https?:\/\//, ""))
  .filter(Boolean);

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
  // Native / Node-only modules stay as runtime requires instead of being
  // bundled (mysql2 and the Argon2 binary).
  serverExternalPackages: ["mysql2", "@node-rs/argon2"],
  experimental: {
    serverActions: { allowedOrigins },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

module.exports = nextConfig;
