import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { todayUTC } from "@/lib/format";
import type { Barn } from "@prisma/client";

export const dynamic = "force-dynamic";

const SLUGS: Record<string, { barn: Barn; label: string }> = {
  "log-barn": { barn: "LOG_BARN", label: "Log Barn" },
  "arena-barn": { barn: "ARENA_BARN", label: "Arena Barn" },
};

// Public TV display — no login (matches the old portal's anon barn-display).
// The <meta http-equiv="refresh"> below reloads it every 60s.
export default async function BarnDisplay({ params }: { params: Promise<{ barn: string }> }) {
  const { barn: slug } = await params;
  const cfg = SLUGS[slug];
  if (!cfg) notFound();

  const today = todayUTC();
  const [horses, announcements] = await Promise.all([
    db.horse.findMany({
      where: { active: true, barn: cfg.barn },
      include: {
        feedingChart: { include: { responsibleEmployee: true } },
        feedingLogs: { where: { date: today } },
      },
      orderBy: { name: "asc" },
    }),
    db.announcement.findMany({
      where: { audience: "ALL" },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
  ]);

  return (
    <div className="tv">
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <meta httpEquiv="refresh" content="60" />
      <h1>{cfg.label} — Feeding</h1>
      <table>
        <thead>
          <tr><th>Horse</th><th>AM Feed</th><th>PM Feed</th><th>Supplements</th><th>Notes</th><th>AM</th><th>PM</th></tr>
        </thead>
        <tbody>
          {horses.map((h) => {
            const am = h.feedingLogs.find((l) => l.feedingType === "AM")?.done;
            const pm = h.feedingLogs.find((l) => l.feedingType === "PM")?.done;
            return (
              <tr key={h.id}>
                <td style={{ fontWeight: 700 }}>{h.name}{h.stall ? ` (${h.stall})` : ""}</td>
                <td>{h.feedingChart?.amFeed ?? "—"}</td>
                <td>{h.feedingChart?.pmFeed ?? "—"}</td>
                <td>{h.feedingChart?.supplements ?? "—"}</td>
                <td style={{ color: "#e2c98a" }}>{h.feedingChart?.specialNotes ?? ""}</td>
                <td>{am ? <span className="done">✓</span> : <span className="pending-dot">○</span>}</td>
                <td>{pm ? <span className="done">✓</span> : <span className="pending-dot">○</span>}</td>
              </tr>
            );
          })}
          {horses.length === 0 && (
            <tr><td colSpan={7} style={{ color: "#93a094", padding: "2rem" }}>No horses assigned to this barn yet.</td></tr>
          )}
        </tbody>
      </table>

      {announcements.length > 0 && (
        <>
          <h1 style={{ marginTop: "2.2rem", fontSize: "1.4rem" }}>Announcements</h1>
          {announcements.map((a) => (
            <p key={a.id} style={{ padding: ".35rem 0", borderBottom: "1px solid #1d3527" }}>
              <strong>{a.title}</strong>{a.body ? <span style={{ color: "#b9c4ba" }}> — {a.body}</span> : null}
            </p>
          ))}
        </>
      )}
    </div>
  );
}
