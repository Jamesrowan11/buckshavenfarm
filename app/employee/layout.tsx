import { redirect } from "next/navigation";
import { getSessionAndProfile } from "@/lib/supabase/server";
import EmployeeShell from "@/components/EmployeeBottomNav";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getSessionAndProfile();
  if (!user) redirect("/login");
  // Admins can still browse the employee portal if they want, no redirect.

  return <EmployeeShell name={profile?.name ?? ""}>{children}</EmployeeShell>;
}
