import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import { sendTwilioSms, twilioSmsConfigured, twilioStatusCallbackUrl } from "@/lib/twilio";
import { publicSiteUrl } from "@/lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
const recipient = process.env.MANAGER_TEST_SMS_TO || "+19196015497";

export async function POST(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  if (!twilioSmsConfigured()) return NextResponse.json({ error: "Twilio SMS is not configured. Check TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID." }, { status: 503, headers: noStore });

  const now = new Date();
  const origin = publicSiteUrl(request.nextUrl.origin);
  try {
    const sms = await sendTwilioSms({
      to: recipient,
      body: `Aviator website test SMS. Sent ${now.toISOString()} from ${origin}`,
      statusCallbackUrl: twilioStatusCallbackUrl(request),
    });
    return NextResponse.json({ ok: true, recipient, sid: sms.sid, status: sms.status, message: `Test SMS queued to ${recipient} (${sms.status}).` }, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send test SMS." }, { status: 500, headers: noStore });
  }
}
