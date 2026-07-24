import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { fmtDate, BARN_LABEL } from "@/lib/format";

export default async function BoarderHome() {
  const session = await requireRole("BOARDER", "ADMIN");
  const links = await db.horseOwner.findMany({
    where: { userId: session.uid },
    include: {
      horse: {
        include: {
          documents: { orderBy: { createdAt: "desc" } },
          feedingChart: true,
        },
      },
    },
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My horses</h1>
          <p className="sub">Everything the barn has on file for your crew.</p>
        </div>
      </div>

      {links.length === 0 && (
        <p className="empty">No horses are linked to your account yet — ask the barn office and they'll connect them.</p>
      )}

      {links.map(({ horse }) => (
        <div key={horse.id} className="card">
          <h2>
            {horse.name}
            {horse.showName && <span className="muted" style={{ fontWeight: 400 }}> “{horse.showName}”</span>}
          </h2>
          <p className="muted" style={{ marginBottom: ".7rem" }}>
            {horse.barn ? BARN_LABEL[horse.barn] : "—"}{horse.stall ? ` · Stall ${horse.stall}` : ""}
          </p>

          <div className="grid grid--2">
            <div>
              <h2 style={{ fontSize: ".95rem" }}>Care team</h2>
              <p style={{ fontSize: ".9rem" }}>
                Vet: {horse.vetName ?? "—"}{horse.vetPhone ? ` (${horse.vetPhone})` : ""}<br />
                Farrier: {horse.farrierName ?? "—"}{horse.farrierPhone ? ` (${horse.farrierPhone})` : ""}
              </p>
              {horse.feedingChart && (
                <>
                  <h2 style={{ fontSize: ".95rem", marginTop: ".8rem" }}>Feed program</h2>
                  <p style={{ fontSize: ".9rem" }}>
                    AM: {horse.feedingChart.amFeed ?? "—"}<br />
                    PM: {horse.feedingChart.pmFeed ?? "—"}
                    {horse.feedingChart.supplements && <><br />Supplements: {horse.feedingChart.supplements}</>}
                  </p>
                </>
              )}
            </div>
            <div>
              <h2 style={{ fontSize: ".95rem" }}>Documents</h2>
              {horse.documents.length === 0 && <p className="muted">Nothing on file yet.</p>}
              {horse.documents.map((d) => (
                <p key={d.id} style={{ padding: ".25rem 0", fontSize: ".9rem" }}>
                  <a href={`/portal/api/documents/${d.id}`} style={{ fontWeight: 600, color: "var(--green-900)", textDecoration: "underline" }}>
                    {d.title}
                  </a>
                  <span className="muted"> · {fmtDate(d.createdAt)}</span>
                </p>
              ))}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
