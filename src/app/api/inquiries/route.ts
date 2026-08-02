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

function labelFor(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase());
}

function detailRow(label: string, value?: string) {
  return `<tr><th style="padding:10px 12px;text-align:left;border-bottom:1px solid #d8e2e7;color:#59707d;font-size:11px;letter-spacing:.08em;text-transform:uppercase;width:34%">${escapeHtml(label)}</th><td style="padding:10px 12px;border-bottom:1px solid #d8e2e7;color:#172b3b;font-size:15px;line-height:1.45">${escapeHtml(value || "Not provided")}</td></tr>`;
}

function cateringOrderSummaryHtml(value: string) {
  const lines = value.split(/\r?\n/);
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      if (current.length) { blocks.push(current.join("\n")); current = []; }
    } else current.push(line);
  }
  if (current.length) blocks.push(current.join("\n"));
  if (!blocks.length) return `<div style="margin:0 0 22px;background:#f5f8fa;border:1px solid #d8e2e7;padding:14px;color:#172b3b;font-size:14px;line-height:1.55">No structured food-order items entered.</div>`;
  return `<div style="display:grid;gap:10px;margin:0 0 22px">${blocks.map((block) => {
    const isTotal = /^(Subtotal|Estimated tax|Estimated total|Unpriced scanned items):/i.test(block.trim());
    return `<div style="white-space:pre-wrap;background:${isTotal ? "#fff6e9" : "#f5f8fa"};border:1px solid ${isTotal ? "#efb45f" : "#d8e2e7"};padding:12px 14px;color:#172b3b;font:14px/1.55 Arial,sans-serif">${escapeHtml(block)}</div>`;
  }).join("")}</div>`;
}

function cateringEmailHtml(body: Record<string, string>, audience: "internal" | "customer") {
  const orderSummary = body.orderSummary || "No structured food-order items entered.";
  const isCustomer = audience === "customer";
  const title = isCustomer ? "We received your Catering To Go request" : "New Catering To Go request";
  const intro = isCustomer
    ? "Thank you for the business. Your request has been sent to the Aviator events team. This is not a final confirmed order yet; we will confirm availability, pickup timing, and final details."
    : "A new Catering To Go request was submitted from aviatorbrew.com. Reply directly to the customer to confirm availability, pickup timing, and final totals.";
  const footer = isCustomer
    ? "Questions? Reply to this email or contact events@aviatorbrew.com."
    : `Reply directly to ${escapeHtml(body.email || "the customer")} to follow up.`;
  const rows = [
    detailRow("Name", body.name),
    detailRow("Email", body.email),
    detailRow("Phone", body.phone),
    detailRow("Pickup date", body.pickupDate),
    detailRow("Pickup time", body.pickupTime),
    detailRow("Guest count", body.guestCount),
    detailRow("Estimated subtotal", body.estimatedSubtotal),
    detailRow("Estimated tax", body.estimatedTax),
    detailRow("Estimated total", body.estimatedTotal),
    detailRow("Food order confirmed", body.foodOrderConfirmed),
  ].join("");

  return `<!doctype html><html><body style="margin:0;background:#eef2f3;padding:32px 16px;font-family:Arial,sans-serif;color:#172b3b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border:1px solid #d5dfe3"><tr><td style="padding:30px 34px;background:#102b3e;color:#ffffff"><div style="color:#efb45f;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">Aviator Catering To Go</div><h1 style="margin:12px 0 0;font-size:28px;line-height:1.2;font-weight:700">${escapeHtml(title)}</h1></td></tr><tr><td style="padding:28px 34px"><p style="margin:0 0 22px;color:#263f50;font-size:16px;line-height:1.6">${escapeHtml(intro)}</p><div style="margin:0 0 22px;padding:14px 16px;background:#fff6e9;border-left:4px solid #efb45f;color:#4a3721;font-size:14px;line-height:1.5"><strong>Pickup hours:</strong> Catering To Go pickup is available from 10:00 AM to 7:00 PM at Aviator Hangar Bar.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 22px;border:1px solid #d8e2e7;border-bottom:0;border-collapse:collapse">${rows}</table><h2 style="margin:0 0 10px;color:#102b3e;font-size:18px">Food order</h2>${cateringOrderSummaryHtml(orderSummary)}<h2 style="margin:0 0 10px;color:#102b3e;font-size:18px">Notes</h2><div style="margin:0 0 22px;white-space:pre-wrap;background:#f8fafb;border:1px solid #d8e2e7;padding:14px;color:#172b3b;font-size:14px;line-height:1.55">${escapeHtml(body.message || "No notes provided.")}</div><p style="margin:0;color:#637783;font-size:13px;line-height:1.6">${footer}</p></td></tr></table></td></tr></table></body></html>`;
}

function cateringCustomerText(body: Record<string, string>) {
  return [
    "Aviator Catering To Go",
    "",
    "Thank you for the business. We received your Catering To Go request.",
    "This is not a final confirmed order yet. The Aviator events team will confirm availability, pickup timing, and final details.",
    "",
    "Pickup hours: 10:00 AM to 7:00 PM at Aviator Hangar Bar.",
    "",
    cateringOrderText(body),
    "",
    "Questions? Reply to this email or contact events@aviatorbrew.com.",
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
      const text = Object.entries(body).filter(([key]) => key !== "website" && key !== "humanCheck").map(([key, value]) => labelFor(key) + ": " + value).join("\n");
      const recipient = body.kind === "event" || body.kind === "contact" || body.kind === "catering" ? process.env.PRIVATE_EVENT_INQUIRY_RECIPIENT_EMAIL || "events@aviatorbrew.com" : process.env.FORM_RECIPIENT_EMAIL || process.env.MAIL_FROM_EMAIL!;
      const subject = labels[body.kind] || "Aviator website inquiry";
      if (body.kind === "catering") {
        const attachmentPath = path.join(os.tmpdir(), "aviator-catering-order-" + Date.now() + ".txt");
        await fs.writeFile(attachmentPath, cateringOrderText(body), "utf8");
        const internalSent = await sendMail({
          to: recipient,
          subject: "New Catering To Go request",
          text: "New Catering To Go request\n\n" + cateringOrderText(body),
          html: cateringEmailHtml(body, "internal"),
          replyTo: body.email,
          attachments: [{ filename: "catering-order.txt", path: attachmentPath, contentType: "text/plain" }],
        });
        await fs.unlink(attachmentPath).catch(() => undefined);
        if (!internalSent) throw new Error("Email delivery is not configured");
        const customerSent = await sendMail({
          to: body.email,
          subject: "We received your Aviator Catering To Go request",
          text: cateringCustomerText(body),
          html: cateringEmailHtml(body, "customer"),
          replyTo: process.env.PRIVATE_EVENT_INQUIRY_RECIPIENT_EMAIL || "events@aviatorbrew.com",
        });
        if (!customerSent) throw new Error("Email delivery is not configured");
      } else {
        const html = body.kind === "event" ? `<!doctype html><html><body style="margin:0;background:#eef2f3;padding:32px 16px;font-family:Arial,sans-serif;color:#172b3b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:650px;background:#ffffff;border:1px solid #d5dfe3"><tr><td style="padding:32px 36px;background:#102b3e;color:#ffffff"><div style="color:#efb45f;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">Aviator Private Events</div><h1 style="margin:12px 0 0;font-size:28px;line-height:1.2;font-weight:700">New event inquiry</h1></td></tr><tr><td style="padding:30px 36px">${Object.entries(body).filter(([key]) => key !== "website" && key !== "humanCheck").map(([key, value]) => `<div style="padding:0 0 20px;margin:0 0 20px;border-bottom:1px solid #e0e7ea"><div style="margin:0 0 7px;color:#637783;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">${escapeHtml(labelFor(key))}</div><div style="color:#172b3b;font-size:16px;line-height:1.6;white-space:pre-wrap">${escapeHtml(value)}</div></div>`).join("")}<p style="margin:28px 0 0;color:#637783;font-size:13px;line-height:1.6">Reply directly to <a href="mailto:${escapeHtml(body.email)}" style="color:#a76125">${escapeHtml(body.email)}</a> to follow up.</p></td></tr></table></td></tr></table></body></html>` : undefined;
        const sent = await sendMail({ to: recipient, subject, text: subject + "\n\n" + text, html, replyTo: body.email });
        if (!sent) throw new Error("Email delivery is not configured");
      }
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "We could not send that just yet. Please try again or call us." }, { status: 500 });
  }
}
