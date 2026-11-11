import Link from "next/link";
import { db } from "@/lib/db";
import { BARN_LABEL } from "@/lib/format";
import { createHorse } from "./actions";

export default async function HorsesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const horses = await db.horse.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q } },
            { showName: { contains: q } },
            { stall: { contains: q } },
            { owners: { some: { user: { name: { contains: q } } } } },
          ],
        }
      : undefined,
    include: { owners: { include: { user: true } } },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Horses</h1>
          <p className="sub">{horses.filter((h) => h.active).length} active on the farm.</p>
        </div>
        <form method="get" style={{ display: "flex", gap: ".5rem" }}>
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search horse, stall, owner…"
            style={{ padding: ".5rem .7rem", border: "1px solid #d4d0c2", borderRadius: 7, fontSize: ".9rem" }}
          />
          <button className="btn btn--ghost">Search</button>
        </form>
      </div>

      <div className="card">
        <h2>Add a horse</h2>
        <form action={createHorse}>
          <div className="fld-row--3 fld-row">
            <label className="fld">Barn name<input name="name" required /></label>
            <label className="fld">Show name<input name="showName" /></label>
            <label className="fld">Stall<input name="stall" placeholder="e.g. L4" /></label>
          </div>
          <div className="fld-row">
            <label className="fld">
              Barn
              <select name="barn" defaultValue="">
                <option value="">—</option>
                <option value="LOG_BARN">Log Barn</option>
                <option value="ARENA_BARN">Arena Barn</option>
              </select>
            </label>
            <label className="fld">Notes<input name="notes" /></label>
          </div>
          <button className="btn btn--gold">Add Horse</button>
        </form>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Horse</th><th>Barn / Stall</th><th>Owner(s)</th><th>Status</th></tr>
          </thead>
          <tbody>
            {horses.length === 0 && (
              <tr><td colSpan={4} className="empty">No horses yet — add the first one above.</td></tr>
            )}
            {horses.map((h) => (
              <tr key={h.id}>
                <td>
                  <Link href={`/admin/horses/${h.id}`} style={{ fontWeight: 600, color: "var(--green-900)" }}>
                    {h.name}
                  </Link>
                  {h.showName && <span className="muted"> “{h.showName}”</span>}
                </td>
                <td>{h.barn ? BARN_LABEL[h.barn] : "—"}{h.stall ? ` · ${h.stall}` : ""}</td>
                <td>{h.owners.length ? h.owners.map((o) => o.user.name).join(", ") : <span className="muted">farm</span>}</td>
                <td>{h.active ? <span className="badge badge--green">active</span> : <span className="badge badge--gray">inactive</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
