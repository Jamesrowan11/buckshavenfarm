import Link from "next/link";
import { db } from "@/lib/db";
import { createBoarder } from "./actions";

export default async function BoardersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const boarders = await db.user.findMany({
    where: {
      role: "BOARDER",
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { email: { contains: q } },
              { phone: { contains: q } },
              { horses: { some: { horse: { name: { contains: q } } } } },
            ],
          }
        : {}),
    },
    include: { horses: { include: { horse: true } } },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Boarders</h1>
          <p className="sub">{boarders.filter((b) => b.active).length} active boarding families.</p>
        </div>
        <form method="get" style={{ display: "flex", gap: ".5rem" }}>
          <input name="q" defaultValue={q ?? ""} placeholder="Search name, email, horse…"
            style={{ padding: ".5rem .7rem", border: "1px solid #d4d0c2", borderRadius: 7, fontSize: ".9rem" }} />
          <button className="btn btn--ghost">Search</button>
        </form>
      </div>

      <div className="card">
        <h2>Add a boarder</h2>
        <form action={createBoarder}>
          <div className="fld-row">
            <label className="fld">Name<input name="name" required /></label>
            <label className="fld">Email<input type="email" name="email" required /></label>
          </div>
          <div className="fld-row--3 fld-row">
            <label className="fld">Phone<input name="phone" /></label>
            <label className="fld">Billing email (if different)<input type="email" name="billingEmail" /></label>
            <label className="fld">Temp password<input name="password" placeholder="auto-generated if blank" /></label>
          </div>
          <button className="btn btn--gold">Create Boarder</button>
        </form>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Boarder</th><th>Contact</th><th>Horses</th><th>Status</th></tr></thead>
          <tbody>
            {boarders.length === 0 && (
              <tr><td colSpan={4} className="empty">No boarders yet — add one above or use <Link href="/admin/import" style={{ textDecoration: "underline" }}>Import</Link>.</td></tr>
            )}
            {boarders.map((b) => (
              <tr key={b.id}>
                <td><Link href={`/admin/boarders/${b.id}`} style={{ fontWeight: 600, color: "var(--green-900)" }}>{b.name}</Link></td>
                <td>{b.email}{b.phone ? <span className="muted"> · {b.phone}</span> : null}</td>
                <td>{b.horses.length ? b.horses.map((h) => h.horse.name).join(", ") : <span className="muted">—</span>}</td>
                <td>{b.active ? <span className="badge badge--green">active</span> : <span className="badge badge--gray">inactive</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
