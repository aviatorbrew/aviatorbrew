import { NextRequest, NextResponse } from "next/server";
import { clearFlightLogSessionCookie, destroyFlightLogSession, flightLogSessionCookie } from "@/lib/flight-log-auth";
export const runtime = "nodejs";
export async function POST(request: NextRequest) { await destroyFlightLogSession(request.cookies.get(flightLogSessionCookie)?.value); const response = NextResponse.json({ ok: true }); clearFlightLogSessionCookie(response); return response; }
