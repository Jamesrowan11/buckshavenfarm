"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "./SignOutButton";

const links = [
  { href: "/admin", label: "Dashboard", icon: "▦" },
  { href: "/admin/tasks", label: "Tasks", icon: "✓" },
  { href: "/admin/schedule", label: "Schedule", icon: "▤" },
  { href: "/admin/availability", label: "Availability", icon: "⏱" },
  { href: "/admin/feeding-charts", label: "Feeding Charts", icon: "♞" },
  { href: "/admin/announcements", label: "Announcements", icon: "✎" },
  { href: "/admin/employees", label: "Employees", icon: "☺" },
  { href: "/admin/clock-log", label: "Clock Log", icon: "◴" },
  { href: "/admin/notes", label: "Admin Notes", icon: "✐" },
];

export default function AdminSidebar({ name }: { name: string }) {
  const pathname = usePathname();
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-64 bg-farm text-white min-h-screen sticky top-0">
        <div className="p-5 border-b border-farm-700">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-white text-farm flex items-center justify-center font-bold">B</div>
            <div>
              <div className="font-bold leading-tight">Bucks Haven</div>
              <div className="text-xs opacity-80">Admin portal</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {links.map((l) => {
            const active = pathname === l.href || (l.href !== "/admin" && pathname.startsWith(l.href));
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  active ? "bg-farm-700 text-white" : "text-white/90 hover:bg-farm-700/70"
                }`}
              >
                <span className="w-5 text-center text-base">{l.icon}</span>
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-farm-700">
          <div className="text-xs opacity-80 mb-2 truncate">{name}</div>
          <SignOutButton className="w-full" />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden bg-farm text-white sticky top-0 z-30 px-4 py-3 flex items-center justify-between">
        <Link href="/admin" className="flex items-center gap-2 font-bold">
          <div className="h-8 w-8 rounded-lg bg-white text-farm flex items-center justify-center">B</div>
          Bucks Haven Admin
        </Link>
        <SignOutButton className="!py-1 !px-2" />
      </header>

      {/* Mobile bottom nav (admins on phone) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-stone-200 grid grid-cols-5">
        {[
          { href: "/admin", label: "Home", icon: "▦" },
          { href: "/admin/tasks", label: "Tasks", icon: "✓" },
          { href: "/admin/feeding-charts", label: "Feed", icon: "♞" },
          { href: "/admin/announcements", label: "News", icon: "✎" },
          { href: "/admin/employees", label: "Team", icon: "☺" },
        ].map((l) => {
          const active = pathname === l.href || (l.href !== "/admin" && pathname.startsWith(l.href));
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex flex-col items-center justify-center py-2 text-xs ${
                active ? "text-farm font-semibold" : "text-stone-500"
              }`}
            >
              <span className="text-lg">{l.icon}</span>
              {l.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
