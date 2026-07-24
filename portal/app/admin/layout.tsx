import Link from "next/link";
import { requireRole } from "@/lib/auth";
import NavLink from "@/components/NavLink";

const NAV = [
  { section: "Farm", items: [
    { href: "/admin", label: "Dashboard", exact: true },
    { href: "/admin/horses", label: "Horses" },
    { href: "/admin/boarders", label: "Boarders" },
    { href: "/admin/import", label: "Import" },
  ]},
  { section: "Barn Ops", items: [
    { href: "/admin/tasks", label: "Tasks" },
    { href: "/admin/schedule", label: "Schedule" },
    { href: "/admin/availability", label: "Availability" },
    { href: "/admin/feeding-charts", label: "Feeding Charts" },
    { href: "/admin/time-off", label: "Time Off" },
    { href: "/admin/clock-log", label: "Clock Log" },
  ]},
  { section: "Office", items: [
    { href: "/admin/announcements", label: "Announcements" },
    { href: "/admin/notes", label: "Notes" },
    { href: "/admin/users", label: "Users" },
  ]},
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("ADMIN");
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/admin" className="sidebar__brand">
          <img src="/logo-mark.svg" alt="" />
          <span>Bucks Haven <em>Farm</em></span>
        </Link>
        {NAV.map((group) => (
          <div key={group.section}>
            <div className="sidebar__section">{group.section}</div>
            {group.items.map((item) => (
              <NavLink key={item.href} href={item.href} exact={item.exact}>
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
        <div className="sidebar__foot">
          {session.name}
          <br />
          <a href="/logout" style={{ color: "#c9a35c" }}>Sign out</a>
        </div>
      </aside>
      <main className="main">{children}</main>
      <nav className="bottom-nav">
        <NavLink href="/admin" className="" exact><span>⌂</span>Home</NavLink>
        <NavLink href="/admin/horses" className=""><span>🐴</span>Horses</NavLink>
        <NavLink href="/admin/tasks" className=""><span>☑</span>Tasks</NavLink>
        <NavLink href="/admin/schedule" className=""><span>📅</span>Schedule</NavLink>
        <NavLink href="/admin/users" className=""><span>👥</span>Users</NavLink>
      </nav>
    </div>
  );
}
