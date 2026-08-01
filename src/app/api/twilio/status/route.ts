import { NextRequest, NextResponse } from "next/server";
import { databaseConfigured, withDatabase } from "@/lib/database";

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "twilio-status" });
}

export async function POST(request: NextRequest) {
  const expected = process.env.TWILIO_STATUS_CALLBACK_SECRET?.trim();
  if (expected && request.nextUrl.searchParams.get("key") !== expected) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await request.formData();
  const messageSid = String(form.get("MessageSid") || form.get("SmsSid") || "");
  const status = String(form.get("MessageStatus") || form.get("SmsStatus") || "");
  const errorCode = String(form.get("ErrorCode") || "");
  if (messageSid && databaseConfigured()) {
    await withDatabase((client) => client.query(
      "UPDATE flight_log.friend_invites SET twilio_message_status=NULLIF($2,''), twilio_error_code=NULLIF($3,''), twilio_status_updated_at=now() WHERE twilio_message_sid=$1",
      [messageSid, status, errorCode],
    ));
  }
  return NextResponse.json({ ok: true });
}
