/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // Plesk/Passenger runs .next/standalone/server.js
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb", // document vault uploads
    },
  },
};

module.exports = nextConfig;
