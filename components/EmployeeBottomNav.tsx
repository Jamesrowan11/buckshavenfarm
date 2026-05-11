"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "./SignOutButton";

const tabs = [
  { href: "/employee", label: "Home", icon: "▦" },
  { href: "/employee/tasks", label: "Tasks", icon: "✓" },
  { href: "/employee/feeding-charts", label: "Feed", icon: "♞" },
  { href: "/employee/clock", label: "Clock", icon: "◴" },
  { href: "/employee/more", label: "More", icon: "⋯" },
];

export default function EmployeeShell({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen pb-20">
      <header className="bg-farm text-white sticky top-0 z-30 px-4 py-3 flex items-center justify-between">
        <Link href="/employee" className="flex items-center gap-2 font-bold">
          <div className="h-8 w-8 rounded-lg bg-white text-farm flex items-center justify-center">B</div>
          Bucks Haven Farm
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs opacity-90 hidden sm:inline">{name}</span>
          <SignOutButton className="!py-1 !px-2" />
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-stone-200 grid grid-cols-5 safe-area-inset-bottom">
        {tabs.map((t) => {
          const active = pathname === t.href || (t.href !== "/employee" && pathname.startsWith(t.href));
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-col items-center justify-center py-2 text-xs ${
                active ? "text-farm font-semibold" : "text-stone-500"
              }`}
            >
              <span className="text-lg">{t.icon}</span>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
