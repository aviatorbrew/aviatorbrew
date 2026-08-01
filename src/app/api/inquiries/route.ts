import { NextResponse } from "next/server";
import { isMailConfigured, sendMail, verifySmtpOnStart } from "@/lib/mail";
import { databaseConfigured, withDatabase } from "@/lib/database";
import { requestNewsletterSubscription } from "@/lib/newsletter";
import { buildFlightCrewConfirmationMessage } from "@/lib/newsletter-email";

const allowedKinds = new Set(["newsletter", "contact", "event", "career", "tour", "band", "donation", "job"]);
const captchaKinds = new Set(["newsletter", "event"]);
const labels: Record<string, string> = { contact: "Contact request", event: "Private event inquiry", career: "Career interest", band: "Band booking request", donation: "Donation request", job: "Job application" };

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[character] || character);
}

export const runtime = "nodejs";
verifySmtpOnStart();

async function recordInquiry(body: Record<string, string>) {
  if (!databaseConfigured() || body.kind === "newsletter") return;
  await withDatabase(async (client) => {
    await client.query("INSERT INTO website.form_inquiries (kind,email,name,payload,source) VALUES ($1,$2,$3,$4::jsonb,$5)", [body.kind, body.email, body.name || null, JSON.stringify(body), "aviatorbrew.com"]);
  }).catch(() => undefined);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, string>;
    if (!allowedKinds.has(body.kind) || body.website || !body.email || !/^\S+@\S+\.\S+$/.test(body.email)) return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });
    if (captchaKinds.has(body.kind) && body.humanCheck !== "yes") return NextResponse.json({ error: "Please confirm you are a real person." }, { status: 400 });
    if (body.kind !== "newsletter" && (!body.name || (!body.message && body.kind !== "career"))) return NextResponse.json({ error: "Please complete the required fields." }, { status: 400 });
    const webhook = process.env.FORM_WEBHOOK_URL;
    if (webhook) {
      const response = await fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, source: "aviatorbrew.com" }) });
      if (!response.ok) throw new Error("Submission endpoint unavailable");
    }

    await recordInquiry(body);

    if (body.kind === "newsletter") {
      const signup = await requestNewsletterSubscription({ email: body.email, source: "website-flight-crew" });
      if (signup.confirmationRequired) {
        if (!isMailConfigured() && process.env.MAIL_MODE !== "record") throw new Error("Email delivery is not configured");
        const message = buildFlightCrewConfirmationMessage(signup.subscriber.email, signup.subscriber.confirmationExpiresAt!);
        const sent = await sendMail({ to: signup.subscriber.email, subject: message.subject, text: message.text, html: message.html });
        if (!sent) throw new Error("Email delivery is not configured");
      }
      return NextResponse.json({ ok: true, confirmationRequired: signup.confirmationRequired });
    }

    if (isMailConfigured()) {
      const text = Object.entries(body).filter(([key]) => key !== "website" && key !== "humanCheck").map(([key, value]) => key + ": " + value).join("\n");
      const recipient = body.kind === "event" || body.kind === "contact" ? process.env.PRIVATE_EVENT_INQUIRY_RECIPIENT_EMAIL || "events@aviatorbrew.com" : process.env.FORM_RECIPIENT_EMAIL || process.env.MAIL_FROM_EMAIL!;
      const subject = labels[body.kind] || "Aviator website inquiry";
      const html = body.kind === "event" ? `<!doctype html><html><body style="margin:0;background:#eef2f3;padding:32px 16px;font-family:Arial,sans-serif;color:#172b3b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:650px;background:#ffffff;border:1px solid #d5dfe3"><tr><td style="padding:32px 36px;background:#102b3e;color:#ffffff"><div style="color:#efb45f;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">Aviator Private Events</div><h1 style="margin:12px 0 0;font-size:28px;line-height:1.2;font-weight:700">New event inquiry</h1></td></tr><tr><td style="padding:30px 36px">${Object.entries(body).filter(([key]) => key !== "website" && key !== "humanCheck").map(([key, value]) => `<div style="padding:0 0 20px;margin:0 0 20px;border-bottom:1px solid #e0e7ea"><div style="margin:0 0 7px;color:#637783;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">${escapeHtml(key.replace(/([A-Z])/g, " $1"))}</div><div style="color:#172b3b;font-size:16px;line-height:1.6;white-space:pre-wrap">${escapeHtml(value)}</div></div>`).join("")}<p style="margin:28px 0 0;color:#637783;font-size:13px;line-height:1.6">Reply directly to <a href="mailto:${escapeHtml(body.email)}" style="color:#a76125">${escapeHtml(body.email)}</a> to follow up.</p></td></tr></table></td></tr></table></body></html>` : undefined;
      const sent = await sendMail({ to: recipient, subject, text: subject + "\n\n" + text, html, replyTo: body.email });
      if (!sent) throw new Error("Email delivery is not configured");
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "We could not send that just yet. Please try again or call us." }, { status: 500 });
  }
}
