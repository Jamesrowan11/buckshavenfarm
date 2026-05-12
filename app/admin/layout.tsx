import { redirect } from "next/navigation";
import { getSessionAndProfile } from "@/lib/supabase/server";
import AdminSidebar from "@/components/AdminSidebar";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getSessionAndProfile();
  if (!user) redirect("/login");
  if (profile?.role !== "admin") redirect("/employee");

  return (
    <div className="min-h-screen md:flex bg-stone-50">
      <AdminSidebar name={profile?.name ?? ""} />
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 max-w-6xl">{children}</main>
    </div>
  );
}
