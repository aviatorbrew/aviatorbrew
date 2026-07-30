import { NextRequest, NextResponse } from "next/server";
import { loginFlightLogCustomer, rateLimit, rateLimitKey, setFlightLogSessionCookie } from "@/lib/flight-log-auth";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try { const body = await request.json() as Record<string, unknown>; rateLimit(rateLimitKey(request, "login", String(body.emailOrCallsign || body.email || "")), 10, 15 * 60 * 1000); const result = await loginFlightLogCustomer(body, body.remember === true); const response = NextResponse.json({ ok: true, customer: result.customer }); setFlightLogSessionCookie(response, result.token, result.expiresAt); return response; }
  catch (error) { const message = error instanceof Error ? error.message : "Could not sign in."; return NextResponse.json({ error: message }, { status: message.startsWith("Too many") ? 429 : 401 }); }
}
