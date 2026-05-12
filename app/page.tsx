import { redirect } from "next/navigation";
import { getSessionAndProfile } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function Home() {
  const { user, profile } = await getSessionAndProfile();
  if (!user) redirect("/login");
  if (profile?.role === "admin") redirect("/admin");
  redirect("/employee");
}
