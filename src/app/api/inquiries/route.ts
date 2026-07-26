import { NextResponse } from "next/server";
import { isMailConfigured, sendMail, verifySmtpOnStart } from "@/lib/mail";
import { subscribeNewsletter } from "@/lib/newsletter";

const allowedKinds = new Set(["newsletter", "contact", "event", "career", "tour", "band", "donation", "job"]);
const labels: Record<string, string> = { newsletter: "Newsletter signup", contact: "Contact request", event: "Private event inquiry", career: "Career interest", band: "Band booking request", donation: "Donation request", job: "Job application" };

export const runtime = "nodejs";
verifySmtpOnStart();

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, string>;
    if (!allowedKinds.has(body.kind) || body.website || !body.email || !/^\S+@\S+\.\S+$/.test(body.email)) return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });
    if (body.kind !== "newsletter" && (!body.name || (!body.message && body.kind !== "career"))) return NextResponse.json({ error: "Please complete the required fields." }, { status: 400 });
    const webhook = process.env.FORM_WEBHOOK_URL;
    if (webhook) {
      const response = await fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, source: "aviatorbrew.com" }) });
      if (!response.ok) throw new Error("Submission endpoint unavailable");
    }
    if (body.kind === "newsletter") await subscribeNewsletter({ email: body.email, source: "website-newsletter" });
    if (isMailConfigured()) {
      const text = Object.entries(body).filter(([key]) => key !== "website").map(([key, value]) => key + ": " + value).join("\n");
      const sent = await sendMail({ to: process.env.FORM_RECIPIENT_EMAIL || process.env.MAIL_FROM_EMAIL!, subject: labels[body.kind] || "Aviator website inquiry", text: labels[body.kind] + "\n\n" + text, replyTo: body.email });
      if (!sent) throw new Error("Email delivery is not configured");
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "We could not send that just yet. Please try again or call us." }, { status: 500 });
  }
}
