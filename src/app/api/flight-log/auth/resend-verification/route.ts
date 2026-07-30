import { NextRequest, NextResponse } from "next/server";
import { rateLimit, rateLimitKey, resendFlightLogVerification } from "@/lib/flight-log-auth";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try { const body = await request.json() as { email?: string }; rateLimit(rateLimitKey(request, "resend-verification", body.email || ""), 3, 60 * 60 * 1000); await resendFlightLogVerification(body.email || "", request); return NextResponse.json({ ok: true, message: "If that account needs verification, a new link has been sent." }); }
  catch (error) { const message = error instanceof Error ? error.message : "Could not send verification email."; return NextResponse.json({ error: message }, { status: message.startsWith("Too many") ? 429 : 400 }); }
}
