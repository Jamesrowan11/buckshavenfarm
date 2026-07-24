import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { BARN_LABEL, todayUTC } from "@/lib/format";
import type { FeedingType } from "@prisma/client";

async function toggleFeed(horseId: string, chartId: string | null, feedingType: FeedingType) {
  "use server";
  const session = await requireRole("EMPLOYEE", "ADMIN");
  const date = todayUTC();
  const existing = await db.feedingLog.findUnique({
    where: { horseId_feedingType_date: { horseId, feedingType, date } },
  });
  if (existing) {
    await db.feedingLog.update({
      where: { id: existing.id },
      data: { done: !existing.done, employeeId: session.uid },
    });
  } else {
    await db.feedingLog.create({
      data: { horseId, chartId, feedingType, date, done: true, employeeId: session.uid },
    });
  }
  revalidatePath("/employee/feeding");
}

export default async function FeedingPage() {
  await requireRole("EMPLOYEE", "ADMIN");
  const today = todayUTC();
  const horses = await db.horse.findMany({
    where: { active: true },
    include: { feedingChart: true, feedingLogs: { where: { date: today } } },
    orderBy: [{ barn: "asc" }, { name: "asc" }],
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Feeding — today</h1>
          <p className="sub">Tap AM/PM when a horse is fed. The barn TVs update too.</p>
        </div>
      </div>

      {horses.length === 0 && <p className="empty">No active horses.</p>}
      {horses.map((h) => {
        const am = h.feedingLogs.find((l) => l.feedingType === "AM")?.done ?? false;
        const pm = h.feedingLogs.find((l) => l.feedingType === "PM")?.done ?? false;
        return (
          <div key={h.id} className="card card--tight" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <strong>{h.name}</strong>
              <span className="muted"> {h.barn ? `· ${BARN_LABEL[h.barn]}` : ""}{h.stall ? ` · ${h.stall}` : ""}</span>
              <div className="muted" style={{ fontSize: ".82rem" }}>
                AM: {h.feedingChart?.amFeed ?? "—"} · PM: {h.feedingChart?.pmFeed ?? "—"}
                {h.feedingChart?.supplements ? ` · ${h.feedingChart.supplements}` : ""}
              </div>
              {h.feedingChart?.specialNotes && (
                <div style={{ fontSize: ".82rem", color: "var(--amber)" }}>⚠ {h.feedingChart.specialNotes}</div>
              )}
            </div>
            <div style={{ display: "flex", gap: ".5rem" }}>
              <form action={toggleFeed.bind(null, h.id, h.feedingChart?.id ?? null, "AM")}>
                <button className={`btn ${am ? "" : "btn--ghost"}`}>{am ? "✓ AM" : "AM"}</button>
              </form>
              <form action={toggleFeed.bind(null, h.id, h.feedingChart?.id ?? null, "PM")}>
                <button className={`btn ${pm ? "" : "btn--ghost"}`}>{pm ? "✓ PM" : "PM"}</button>
              </form>
            </div>
          </div>
        );
      })}
    </>
  );
}
