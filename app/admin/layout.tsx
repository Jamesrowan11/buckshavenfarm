import { requireAdmin } from "@/lib/auth/current";
import AdminSidebar from "@/components/AdminSidebar";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();

  return (
    <div className="min-h-screen md:flex bg-stone-50">
      <AdminSidebar name={user.name} />
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 max-w-6xl">{children}</main>
    </div>
  );
}
