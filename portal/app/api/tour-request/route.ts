import { NextResponse } from "next/server";
import { spawn } from "child_process";
import {
  allowGlobalSend,
  allowRequest,
  checkFormToken,
  clientIp,
  contentSpamReason,
  isDuplicate,
  isSameOrigin,
  issueFormToken,
} from "@/lib/formGuard";

/**
 * Tour-request handler for the public website (replaces api/contact.php,
 * which no longer runs now that Node.js serves the domain).
 * Sends mail through the server's sendmail binary — the standard mail
 * pipeline on a Plesk box. Spam protection lives in lib/formGuard.ts.
 *
 * CONFIG:
 */
const TO_EMAIL = "james@northvaleunified.com"; // where requests are delivered
const FROM_EMAIL = "noreply@buckshavenfarm.com"; // must be a domain on this server
// Auto-reply to the visitor. Off: bots abuse auto-replies to send mail to
// strangers through your server, which hurts the domain's reputation.
const SEND_AUTO_REPLY = false;

export const dynamic = "force-dynamic";

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

const noStore = { "Cache-Control": "no-store" };

const RATE_LIMITED =
  "We've received several requests from you already. Please call (301) 440-7800 or try again later.";

// Bots get the same "success" answer as people, so they don't learn which
// check stopped them. The reason is logged for the farm (Plesk → Logs).
function dropAsSpam(reason: string, ip: string) {
  console.warn(`[tour-request] blocked: ${reason} ip=${ip}`);
  return NextResponse.json({ ok: true }, { headers: noStore });
}

/** Issues a fresh signed form token; the website fetches one on page load. */
export async function GET() {
  return NextResponse.json({ token: issueFormToken() }, { headers: noStore });
}

export async function POST(req: Request) {
  const ip = clientIp(req.headers);

  if (!allowRequest(ip)) {
    console.warn(`[tour-request] rate limited ip=${ip}`);
    return NextResponse.json({ ok: false, error: RATE_LIMITED }, { status: 429, headers: noStore });
  }
  if (!isSameOrigin(req.headers)) return dropAsSpam("cross-origin or no Origin header", ip);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return dropAsSpam("unreadable body", ip);
  }

  const name = clean(form.get("name"), 120);
  const email = clean(form.get("email"), 200);
  const phone = clean(form.get("phone"), 40);
  const interest = clean(form.get("interest"), 60) || "General";
  const message = String(form.get("message") ?? "").trim().slice(0, 4000);
  const honeypot = String(form.get("website") ?? "").trim();

  if (honeypot !== "") return dropAsSpam("honeypot", ip);

  const token = checkFormToken(String(form.get("token") ?? ""));
  if (token === "expired") {
    return NextResponse.json(
      { ok: false, error: "This page has been open a long time. Please reload it and send your request again." },
      { status: 422, headers: noStore }
    );
  }
  if (token !== "ok") return dropAsSpam(`token ${token}`, ip);

  if (!name || !message || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json(
      { ok: false, error: "Please fill in name, a valid email, and a message." },
      { status: 422, headers: noStore }
    );
  }

  const spam = contentSpamReason({ name, message, phone });
  if (spam) return dropAsSpam(spam, ip);
  if (isDuplicate(email, message)) return dropAsSpam("duplicate", ip);

  if (!allowGlobalSend()) {
    console.warn(`[tour-request] site-wide hourly email cap reached ip=${ip}`);
    return NextResponse.json({ ok: false, error: RATE_LIMITED }, { status: 429, headers: noStore });
  }

  const body =
    "New request from the Bucks Haven Farm website\n" +
    "------------------------------------------------\n" +
    `Name:      ${name}\n` +
    `Email:     ${email}\n` +
    `Phone:     ${phone || "—"}\n` +
    `Interest:  ${interest}\n` +
    `Sent from: ${ip}\n` +
    "------------------------------------------------\n\n" +
    message + "\n";

  try {
    await sendmail(TO_EMAIL, `Tour request (${interest}) — ${name}`, body, `${name} <${email}>`);
  } catch (err) {
    console.error("tour-request: mail failed:", err);
    return NextResponse.json({ ok: false, error: "Mail could not be sent." }, { status: 500, headers: noStore });
  }

  if (SEND_AUTO_REPLY) {
    sendmail(
      email,
      "We received your request — Bucks Haven Farm",
      `Hi ${name},\n\nThank you for reaching out to Bucks Haven Farm! We've received your ` +
        `${interest.toLowerCase()} inquiry and will get back to you shortly.\n\n` +
        "In the meantime, feel free to call us at (301) 440-7800.\n\n" +
        "Warm regards,\nBucks Haven Farm\n12459 Scaggsville Rd #216, Highland, MD 20777\n"
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true }, { headers: noStore });
}
