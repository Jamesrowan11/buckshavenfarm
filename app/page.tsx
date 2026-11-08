import { redirect } from "next/navigation";
import { getSessionAndProfile } from "@/lib/db/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { user, profile } = await getSessionAndProfile();
  if (!user) redirect("/login");
  if (profile?.role === "admin") redirect("/admin");
  redirect("/employee");
}
