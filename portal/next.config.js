/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/portal", // embedded in the main site: buckshavenfarm.com/portal
  // Style-only lint rules (e.g. unescaped quotes in text) must not block a
  // production deploy. TypeScript errors still fail the build.
  eslint: { ignoreDuringBuilds: true },
  // No standalone output: Plesk's Node.js manager (Passenger) runs server.js
  // directly — deploys happen entirely through the Plesk UI, no terminal.
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb", // document vault uploads
    },
  },
};

module.exports = nextConfig;
