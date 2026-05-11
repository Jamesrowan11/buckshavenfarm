export default function PriorityBadge({ p }: { p: "low" | "medium" | "high" }) {
  const cls = p === "high" ? "badge-high" : p === "medium" ? "badge-medium" : "badge-low";
  return <span className={cls}>{p}</span>;
}
