/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/portal", // embedded in the main site: buckshavenfarm.com/portal
  output: "standalone", // Plesk runs .next/standalone/server.js behind an nginx proxy
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb", // document vault uploads
    },
  },
};

module.exports = nextConfig;
