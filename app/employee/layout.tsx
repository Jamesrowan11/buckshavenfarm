import { requireUser } from "@/lib/auth/current";
import EmployeeShell from "@/components/EmployeeBottomNav";

export const dynamic = "force-dynamic";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Admins can still browse the employee portal if they want, no redirect.

  return <EmployeeShell name={user.name}>{children}</EmployeeShell>;
}
