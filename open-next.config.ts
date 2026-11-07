// OpenNext configuration — https://opennext.js.org/cloudflare/config
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// `defineCloudflareConfig` only exposes Cloudflare-specific overrides;
// `buildCommand` lives on the underlying AWS OpenNext config. We override it
// here so OpenNext invokes `next build` directly. (Cloudflare is the older
// deployment; the app now runs on DigitalOcean, see infra/digitalocean.)
export default {
  ...defineCloudflareConfig({}),
  buildCommand: "npx next build",
};
