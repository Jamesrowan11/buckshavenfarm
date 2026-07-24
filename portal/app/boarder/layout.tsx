import Link from "next/link";
import { requireRole } from "@/lib/auth";
import NavLink from "@/components/NavLink";

const NAV = [
  { href: "/boarder", label: "My Horses", exact: true },
  { href: "/boarder/account", label: "My Account" },
  { href: "/boarder/announcements", label: "Farm News" },
];

export default async function BoarderLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("BOARDER", "ADMIN");
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/boarder" className="sidebar__brand">
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
        <NavLink href="/boarder" className="" exact><span>🐴</span>Horses</NavLink>
        <NavLink href="/boarder/account" className=""><span>👤</span>Account</NavLink>
        <NavLink href="/boarder/announcements" className=""><span>📰</span>News</NavLink>
      </nav>
    </div>
  );
}
