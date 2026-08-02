import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { isMailConfigured, sendMail, verifySmtpOnStart } from "@/lib/mail";
import { databaseConfigured, withDatabase } from "@/lib/database";
import { requestNewsletterSubscription } from "@/lib/newsletter";
import { buildFlightCrewConfirmationMessage } from "@/lib/newsletter-email";

const allowedKinds = new Set(["newsletter", "contact", "event", "catering", "career", "tour", "band", "donation", "job"]);
const captchaKinds = new Set(["newsletter", "event", "catering"]);
const labels: Record<string, string> = { contact: "Contact request", event: "Private event inquiry", catering: "Catering To Go inquiry", career: "Career interest", band: "Band booking request", donation: "Donation request", job: "Job application" };

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[character] || character);
}

export const runtime = "nodejs";
verifySmtpOnStart();

function pickupTimeIsAvailable(value: string) {
  return !value || (value >= "10:00" && value <= "19:00");
}

function cateringOrderText(body: Record<string, string>) {
  return [
    "AVIATOR CATERING TO GO REQUEST",
    "",
    "Name: " + (body.name || ""),
    "Email: " + (body.email || ""),
    "Phone: " + (body.phone || ""),
    "Pickup date: " + (body.pickupDate || ""),
    "Pickup time: " + (body.pickupTime || ""),
    "Guest count: " + (body.guestCount || ""),
    "Menu source: " + (body.cateringMenu || ""),
    "Menu scan source: " + (body.menuScanSource || ""),
    "",
    "FOOD ORDER",
    body.orderSummary || "No structured food-order items entered.",
    "",
    "NOTES",
    body.message || "",
  ].join("\n");
}

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
    if (body.kind === "catering" && !pickupTimeIsAvailable(body.pickupTime || "")) return NextResponse.json({ error: "Catering pickup is available from 10:00 AM to 7:00 PM. Please choose a pickup time in that window." }, { status: 400 });
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
      let attachmentPath = "";
      if (body.kind === "catering") {
        attachmentPath = path.join(os.tmpdir(), "aviator-catering-order-" + Date.now() + ".txt");
        await fs.writeFile(attachmentPath, cateringOrderText(body), "utf8");
      }
      const recipient = body.kind === "event" || body.kind === "contact" || body.kind === "catering" ? process.env.PRIVATE_EVENT_INQUIRY_RECIPIENT_EMAIL || "events@aviatorbrew.com" : process.env.FORM_RECIPIENT_EMAIL || process.env.MAIL_FROM_EMAIL!;
      const subject = labels[body.kind] || "Aviator website inquiry";
      const html = body.kind === "event" || body.kind === "catering" ? `<!doctype html><html><body style="margin:0;background:#eef2f3;padding:32px 16px;font-family:Arial,sans-serif;color:#172b3b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:650px;background:#ffffff;border:1px solid #d5dfe3"><tr><td style="padding:32px 36px;background:#102b3e;color:#ffffff"><div style="color:#efb45f;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">${body.kind === "catering" ? "Aviator Catering To Go" : "Aviator Private Events"}</div><h1 style="margin:12px 0 0;font-size:28px;line-height:1.2;font-weight:700">${body.kind === "catering" ? "New catering to go request" : "New event inquiry"}</h1></td></tr><tr><td style="padding:30px 36px">${Object.entries(body).filter(([key]) => key !== "website" && key !== "humanCheck").map(([key, value]) => `<div style="padding:0 0 20px;margin:0 0 20px;border-bottom:1px solid #e0e7ea"><div style="margin:0 0 7px;color:#637783;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">${escapeHtml(key.replace(/([A-Z])/g, " $1"))}</div><div style="color:#172b3b;font-size:16px;line-height:1.6;white-space:pre-wrap">${escapeHtml(value)}</div></div>`).join("")}<p style="margin:28px 0 0;color:#637783;font-size:13px;line-height:1.6">Reply directly to <a href="mailto:${escapeHtml(body.email)}" style="color:#a76125">${escapeHtml(body.email)}</a> to follow up.</p></td></tr></table></td></tr></table></body></html>` : undefined;
      const sent = await sendMail({ to: recipient, subject, text: subject + "\n\n" + text, html, replyTo: body.email, attachments: attachmentPath ? [{ filename: "catering-order.txt", path: attachmentPath, contentType: "text/plain" }] : undefined });
      if (attachmentPath) await fs.unlink(attachmentPath).catch(() => undefined);
      if (!sent) throw new Error("Email delivery is not configured");
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "We could not send that just yet. Please try again or call us." }, { status: 500 });
  }
}
