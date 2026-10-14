import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "twilio-status" });
}

export async function POST(request: NextRequest) {
  const expected = process.env.TWILIO_STATUS_CALLBACK_SECRET?.trim();
  if (expected && request.nextUrl.searchParams.get("key") !== expected) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ ok: true });
}
