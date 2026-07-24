/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/portal", // embedded in the main site: buckshavenfarm.com/portal
  // No standalone output: Plesk's Node.js manager (Passenger) runs server.js
  // directly — deploys happen entirely through the Plesk UI, no terminal.
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb", // document vault uploads
    },
  },
};

module.exports = nextConfig;
