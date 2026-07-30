import { NextRequest, NextResponse } from "next/server";
import { rateLimit, rateLimitKey, resetFlightLogPassword } from "@/lib/flight-log-auth";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try { const body = await request.json() as { token?: string; password?: string; confirmation?: string }; rateLimit(rateLimitKey(request, "reset-password", body.token || ""), 6, 60 * 60 * 1000); await resetFlightLogPassword(body.token || "", body.password || "", body.confirmation || ""); return NextResponse.json({ ok: true, message: "Your password has been reset. You can sign in now." }); }
  catch (error) { const message = error instanceof Error ? error.message : "Could not reset password."; return NextResponse.json({ error: message }, { status: message.startsWith("Too many") ? 429 : 400 }); }
}
