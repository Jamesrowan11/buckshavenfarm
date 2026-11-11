import { spawn } from "child_process";
import fs from "fs";

/**
 * Outgoing email for the website and portal, in order of preference:
 * 1. ZeptoMail (Zoho's sending service) when ZEPTOMAIL_TOKEN is set — what the
 *    DigitalOcean server uses (set it with: sudo buckshavenfarm-secret ZEPTOMAIL_TOKEN);
 * 2. the server's sendmail, if it has one (older Plesk setup);
 * 3. otherwise the whole message is written to the app log
 *    (journalctl -u buckshavenfarm), so a tour request is never lost.
 * Returns how it was delivered.
 */

export const MAIL_FROM = process.env.MAIL_FROM || "Bucks Haven Farm Website <noreply@buckshavenfarm.com>";

type Mail = { to: string; subject: string; text: string; replyTo?: string };

function parseAddress(s: string): { address: string; name?: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(s);
  return m ? { name: m[1].replace(/^"|"$/g, "") || undefined, address: m[2].trim() } : { address: s.trim() };
}

async function viaZeptoMail(token: string, mail: Mail) {
  const host = process.env.ZEPTOMAIL_API_HOST || "api.zeptomail.com";
  if (!/^api\.zeptomail\.[a-z.]+$/.test(host)) throw new Error("ZEPTOMAIL_API_HOST must look like api.zeptomail.com");
  const reply = mail.replyTo ? parseAddress(mail.replyTo) : null;
  const res = await fetch(`https://${host}/v1.1/email`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Zoho-enczapikey ${token.replace(/^Zoho-enczapikey\s+/i, "")}`,
    },
    body: JSON.stringify({
      from: parseAddress(MAIL_FROM),
      to: [{ email_address: parseAddress(mail.to) }],
      ...(reply ? { reply_to: [reply] } : {}),
      subject: mail.subject,
      textbody: mail.text,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`ZeptoMail HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

function viaSendmail(mail: Mail): Promise<void> {
  return new Promise((resolve, reject) => {
    const msg =
      `To: ${mail.to}\nFrom: ${MAIL_FROM}\n` +
      (mail.replyTo ? `Reply-To: ${mail.replyTo}\n` : "") +
      `Subject: ${mail.subject}\nContent-Type: text/plain; charset=utf-8\n\n${mail.text}`;
    const child = spawn("/usr/sbin/sendmail", ["-t", "-i"], { stdio: ["pipe", "ignore", "ignore"] });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`sendmail exit ${code}`))));
    child.stdin.write(msg);
    child.stdin.end();
  });
}

export async function sendMail(mail: Mail): Promise<"zeptomail" | "sendmail" | "logged"> {
  const token = process.env.ZEPTOMAIL_TOKEN?.trim();
  if (token) {
    await viaZeptoMail(token, mail);
    return "zeptomail";
  }
  if (fs.existsSync("/usr/sbin/sendmail")) {
    await viaSendmail(mail);
    return "sendmail";
  }
  console.log(
    ["", "=========== EMAIL (not sent: no ZEPTOMAIL_TOKEN on the server) ===========",
      `To: ${mail.to}`, mail.replyTo ? `Reply-To: ${mail.replyTo}` : "", `Subject: ${mail.subject}`, "",
      mail.text, "==========================================================================="]
      .filter((l) => l !== "")
      .join("\n"),
  );
  return "logged";
}
