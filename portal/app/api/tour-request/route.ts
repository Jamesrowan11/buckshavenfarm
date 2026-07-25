import { NextResponse } from "next/server";
import { spawn } from "child_process";

/**
 * Tour-request handler for the public website (replaces api/contact.php,
 * which no longer runs now that Node.js serves the domain).
 * Sends mail through the server's sendmail binary — the standard mail
 * pipeline on a Plesk box — with the same spam gates as before.
 *
 * CONFIG:
 */
const TO_EMAIL = "james@northvaleunified.com"; // where requests are delivered
const FROM_EMAIL = "noreply@buckshavenfarm.com"; // must be a domain on this server

function sendmail(to: string, subject: string, body: string, replyTo?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const msg =
      `To: ${to}\n` +
      `From: Bucks Haven Farm Website <${FROM_EMAIL}>\n` +
      (replyTo ? `Reply-To: ${replyTo}\n` : "") +
      `Subject: ${subject}\n` +
      `Content-Type: text/plain; charset=utf-8\n\n` +
      body;
    const child = spawn("/usr/sbin/sendmail", ["-t", "-i"], { stdio: ["pipe", "ignore", "ignore"] });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`sendmail exit ${code}`))));
    child.stdin.write(msg);
    child.stdin.end();
  });
}

const clean = (v: unknown, max = 500) =>
  String(v ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);

export async function POST(req: Request) {
  const form = await req.formData();

  const name = clean(form.get("name"), 120);
  const email = clean(form.get("email"), 200);
  const phone = clean(form.get("phone"), 40);
  const interest = clean(form.get("interest"), 60) || "General";
  const message = String(form.get("message") ?? "").trim().slice(0, 4000);
  const honeypot = String(form.get("website") ?? "").trim();
  const tsRaw = String(form.get("ts") ?? "");
  const elapsed = tsRaw === "" ? -1 : parseInt(tsRaw, 10) || 0;

  // Spam gates: honeypot filled, or submitted in under 3 seconds.
  if (honeypot !== "" || (elapsed >= 0 && elapsed < 3000)) {
    return NextResponse.json({ ok: true }); // pretend success so bots move on
  }

  if (!name || !message || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json(
      { ok: false, error: "Please fill in name, a valid email, and a message." },
      { status: 422 }
    );
  }

  const body =
    "New request from the Bucks Haven Farm website\n" +
    "------------------------------------------------\n" +
    `Name:      ${name}\n` +
    `Email:     ${email}\n` +
    `Phone:     ${phone || "—"}\n` +
    `Interest:  ${interest}\n` +
    "------------------------------------------------\n\n" +
    message + "\n";

  try {
    await sendmail(TO_EMAIL, `Tour request (${interest}) — ${name}`, body, `${name} <${email}>`);
  } catch (err) {
    console.error("tour-request: mail failed:", err);
    return NextResponse.json({ ok: false, error: "Mail could not be sent." }, { status: 500 });
  }

  // Auto-reply to the visitor (best-effort).
  sendmail(
    email,
    "We received your request — Bucks Haven Farm",
    `Hi ${name},\n\nThank you for reaching out to Bucks Haven Farm! We've received your ` +
      `${interest.toLowerCase()} inquiry and will get back to you shortly.\n\n` +
      "In the meantime, feel free to call us at (301) 440-7800.\n\n" +
      "Warm regards,\nBucks Haven Farm\n12459 Scaggsville Rd #216, Highland, MD 20777\n"
  ).catch(() => {});

  return NextResponse.json({ ok: true });
}
