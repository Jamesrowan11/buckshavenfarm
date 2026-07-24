import Link from "next/link";
import { requireRole } from "@/lib/auth";
import NavLink from "@/components/NavLink";

const NAV = [
  { href: "/employee", label: "Home", exact: true },
  { href: "/employee/tasks", label: "Tasks" },
  { href: "/employee/schedule", label: "Schedule" },
  { href: "/employee/feeding", label: "Feeding" },
  { href: "/employee/availability", label: "Availability" },
  { href: "/employee/time-off", label: "Time Off" },
  { href: "/employee/clock", label: "Clock" },
  { href: "/employee/announcements", label: "News" },
];

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("EMPLOYEE", "ADMIN");
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/employee" className="sidebar__brand">
          <img src="/logo-mark.svg" alt="" />
          <span>Bucks Haven <em>Farm</em></span>
        </Link>
        {NAV.map((item) => (
          <NavLink key={item.href} href={item.href} exact={item.exact}>{item.label}</NavLink>
        ))}
        <div className="sidebar__foot">
          {session.name}
          <br />
          <a href="/logout" style={{ color: "#c9a35c" }}>Sign out</a>
        </div>
      </aside>
      <main className="main">{children}</main>
      <nav className="bottom-nav">
        <NavLink href="/employee" className="" exact><span>⌂</span>Home</NavLink>
        <NavLink href="/employee/tasks" className=""><span>☑</span>Tasks</NavLink>
        <NavLink href="/employee/feeding" className=""><span>🌾</span>Feed</NavLink>
        <NavLink href="/employee/schedule" className=""><span>📅</span>Shifts</NavLink>
        <NavLink href="/employee/clock" className=""><span>⏱</span>Clock</NavLink>
      </nav>
    </div>
  );
}
