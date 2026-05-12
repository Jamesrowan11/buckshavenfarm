// OpenNext configuration — https://opennext.js.org/cloudflare/config
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// `defineCloudflareConfig` only exposes Cloudflare-specific overrides;
// `buildCommand` lives on the underlying AWS OpenNext config. We override it
// here so OpenNext invokes `next build` directly instead of `npm run build`
// (which IS this OpenNext command — without the override the inner build
// would re-enter this script and infinite-loop).
export default {
  ...defineCloudflareConfig({}),
  buildCommand: "npx next build",
};
