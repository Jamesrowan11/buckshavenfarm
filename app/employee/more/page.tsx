import Link from "next/link";

export const dynamic = "force-dynamic";

const items = [
  { href: "/employee/schedule", label: "My schedule", icon: "▤" },
  { href: "/employee/availability", label: "Submit availability", icon: "⏱" },
  { href: "/employee/time-off", label: "Time-off requests", icon: "✈" },
  { href: "/employee/announcements", label: "Announcements", icon: "✎" },
];

export default function EmployeeMorePage() {
  return (
    <div className="space-y-4">
      <h1 className="h1">More</h1>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              className="card flex items-center gap-3 hover:shadow-md transition"
            >
              <span className="h-10 w-10 rounded-lg bg-farm-50 text-farm flex items-center justify-center text-lg">
                {i.icon}
              </span>
              <span className="font-medium">{i.label}</span>
              <span className="ml-auto text-stone-400">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
