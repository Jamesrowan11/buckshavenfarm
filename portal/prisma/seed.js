/* Seeds the four family accounts (same people as the Supabase portal).
   Safe to re-run: existing emails are skipped, never overwritten.
   Run: npm run seed   (uses SEED_PASSWORD from .env, default ChangeMe!2026) */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const db = new PrismaClient();

const USERS = [
  { name: "James Rowan", email: "james@northvaleunified.com", role: "ADMIN" },
  { name: "Cynthia Baker", email: "cynthiarowan777@gmail.com", role: "ADMIN" },
  { name: "Theresa Rowan", email: "theresarowan777@gmail.com", role: "EMPLOYEE" },
  { name: "Landen Rowan", email: "landenrowan@gmail.com", role: "EMPLOYEE" },
];

async function main() {
  const password = process.env.SEED_PASSWORD || "ChangeMe!2026";
  const passwordHash = await bcrypt.hash(password, 12);
  for (const u of USERS) {
    const existing = await db.user.findUnique({ where: { email: u.email } });
    if (existing) {
      console.log(`skip   ${u.email} (already exists)`);
      continue;
    }
    await db.user.create({ data: { ...u, passwordHash } });
    console.log(`create ${u.email} (${u.role})`);
  }
  console.log(`\nDone. Initial password: ${password} — have everyone change it.`);
}

main().finally(() => db.$disconnect());
