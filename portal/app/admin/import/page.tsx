import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseCsv } from "@/lib/csv";
import type { Barn } from "@prisma/client";

async function runImport(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) redirect("/admin/import?err=Choose+a+CSV+file");

  const rows = parseCsv(await file.text());
  if (rows.length < 2) redirect("/admin/import?err=CSV+has+no+data+rows");

  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z_]/g, ""));
  const col = (name: string) => header.indexOf(name);
  const iName = col("name"), iEmail = col("email");
  if (iName === -1 || iEmail === -1) {
    redirect("/admin/import?err=CSV+needs+at+least+name+and+email+columns");
  }
  const iPhone = col("phone"), iHorse = col("horse_name"), iShow = col("show_name"),
    iStall = col("stall"), iBarn = col("barn"), iNotes = col("notes");

  let created = 0, matched = 0, horsesCreated = 0, horsesLinked = 0, skipped = 0;

  for (const row of rows.slice(1)) {
    const name = (row[iName] ?? "").trim();
    const email = (row[iEmail] ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) { skipped++; continue; }

    // match by email — safe to re-run, nothing overwritten
    let user = await db.user.findUnique({ where: { email } });
    if (!user) {
      user = await db.user.create({
        data: {
          name: name || email.split("@")[0],
          email,
          phone: iPhone >= 0 ? (row[iPhone] ?? "").trim() || null : null,
          passwordHash: await bcrypt.hash(Math.random().toString(36).slice(2) + "Bh!9", 12),
          role: "BOARDER",
        },
      });
      created++;
    } else {
      matched++;
    }

    const horseName = iHorse >= 0 ? (row[iHorse] ?? "").trim() : "";
    if (horseName) {
      // match horse by name among this owner's horses first, then farm-wide
      let horse = await db.horse.findFirst({
        where: { name: horseName, owners: { some: { userId: user.id } } },
      });
      if (!horse) horse = await db.horse.findFirst({ where: { name: horseName, owners: { none: {} } } });
      if (!horse) {
        const rawBarn = iBarn >= 0 ? (row[iBarn] ?? "").trim().toUpperCase().replace(/[^A-Z]/g, "_") : "";
        const barn: Barn | null =
          rawBarn.includes("LOG") ? "LOG_BARN" : rawBarn.includes("ARENA") ? "ARENA_BARN" : null;
        horse = await db.horse.create({
          data: {
            name: horseName,
            showName: iShow >= 0 ? (row[iShow] ?? "").trim() || null : null,
            stall: iStall >= 0 ? (row[iStall] ?? "").trim() || null : null,
            barn,
            notes: iNotes >= 0 ? (row[iNotes] ?? "").trim() || null : null,
          },
        });
        horsesCreated++;
      }
      const link = await db.horseOwner.findUnique({
        where: { horseId_userId: { horseId: horse.id, userId: user.id } },
      });
      if (!link) {
        await db.horseOwner.create({ data: { horseId: horse.id, userId: user.id } });
        horsesLinked++;
      }
    }
  }

  revalidatePath("/admin/boarders");
  revalidatePath("/admin/horses");
  redirect(
    `/admin/import?ok=${created}+boarders+created,+${matched}+matched,+${horsesCreated}+horses+created,+${horsesLinked}+linked,+${skipped}+rows+skipped`
  );
}

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const { ok, err } = await searchParams;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Import boarders</h1>
          <p className="sub">One CSV seeds boarder accounts and their horses. Safe to re-run — rows match by email and nothing is overwritten.</p>
        </div>
      </div>

      <div className="card">
        <h2>Upload CSV</h2>
        <p className="muted" style={{ marginBottom: ".8rem" }}>
          Columns (header row required): <code>name,email,phone,horse_name,show_name,stall,barn,notes</code>.
          Only <code>name</code> and <code>email</code> are required. One row per horse — repeat the
          boarder's email on each row and the horses all attach to one account. <code>barn</code> accepts
          "log" or "arena". Accounts are created with random passwords; use each boarder's page to set one, and no
          emails are sent during import.
        </p>
        <form action={runImport}>
          <label className="fld">CSV file<input type="file" name="file" accept=".csv,text/csv" required /></label>
          <button className="btn btn--gold">Run Import</button>
        </form>
        {ok && <p className="msg-ok">Done: {ok.replace(/\+/g, " ")}</p>}
        {err && <p className="msg-err">{err.replace(/\+/g, " ")}</p>}
      </div>

      <div className="card">
        <h2>Example</h2>
        <pre style={{ fontSize: ".8rem", background: "#fbfaf6", padding: ".8rem", borderRadius: 8, overflowX: "auto" }}>
{`name,email,phone,horse_name,show_name,stall,barn,notes
Sarah Miller,sarah@example.com,301-555-0101,Beau,Beau Monde,L4,log,retired eventer
Sarah Miller,sarah@example.com,301-555-0101,Pepper,,L5,log,
Dan Ortiz,dan@example.com,240-555-0102,Whiskey,Whiskey Business,A2,arena,cribber — collar in tack box`}
        </pre>
      </div>
    </>
  );
}
