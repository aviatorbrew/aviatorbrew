import { NextRequest, NextResponse } from "next/server";
import { rateLimit, rateLimitKey, requestFlightLogPasswordReset } from "@/lib/flight-log-auth";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try { const body = await request.json() as { email?: string }; rateLimit(rateLimitKey(request, "forgot-password", body.email || ""), 4, 60 * 60 * 1000); await requestFlightLogPasswordReset(body.email || "", request); return NextResponse.json({ ok: true, message: "If that email has a Flight Log account, a reset link has been sent." }); }
  catch (error) { const message = error instanceof Error ? error.message : "Could not request password reset."; return NextResponse.json({ error: message }, { status: message.startsWith("Too many") ? 429 : 400 }); }
}
