import { NextRequest, NextResponse } from "next/server";
import { rateLimit, rateLimitKey, registerFlightLogCustomer } from "@/lib/flight-log-auth";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try { const body = await request.json() as Record<string, unknown>; rateLimit(rateLimitKey(request, "register", String(body.email || "")), 5, 60 * 60 * 1000); const customer = await registerFlightLogCustomer(body, request); return NextResponse.json({ ok: true, customer, message: "Check your email to verify your Flight Log account." }, { status: 201 }); }
  catch (error) { const message = error instanceof Error ? error.message : "Could not create your account."; return NextResponse.json({ error: message }, { status: message.startsWith("Too many") ? 429 : 400 }); }
}
