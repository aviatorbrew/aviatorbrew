import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import { isMailConfigured, sendMail } from "@/lib/mail";
import { publicSiteUrl } from "@/lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
const recipient = process.env.MANAGER_TEST_EMAIL_TO || "mark@aviatorbrew.com";

export async function POST(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  if (!isMailConfigured() && process.env.MAIL_MODE !== "record") return NextResponse.json({ error: "Email delivery is not configured. Check MAIL_MODE, SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and MAIL_FROM_EMAIL." }, { status: 503, headers: noStore });

  const now = new Date();
  const origin = publicSiteUrl(request.nextUrl.origin);
  try {
    const delivered = await sendMail({
      to: recipient,
      subject: "Aviator website test email",
      text: `This is a test email from the Aviator Brewing Company website manager portal.\n\nSent: ${now.toISOString()}\nSite: ${origin}`,
      html: `<p>This is a test email from the Aviator Brewing Company website manager portal.</p><p><strong>Sent:</strong> ${now.toISOString()}<br><strong>Site:</strong> ${origin}</p>`,
    });
    if (!delivered) throw new Error("Email delivery is not configured.");
    return NextResponse.json({ ok: true, recipient, message: `Test email sent to ${recipient}.` }, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send test email." }, { status: 500, headers: noStore });
  }
}
