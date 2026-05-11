"use client";

import { createBrowserClient } from "@supabase/ssr";

// Fallbacks let the prerender/build pass when env vars are absent
// (e.g., Cloudflare Pages preview builds without secrets bound).
// At runtime the real values are required; the fallback can never auth.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
