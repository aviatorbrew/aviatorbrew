import { NextRequest, NextResponse } from "next/server";
import { getCurrentFlightLogCustomer, rateLimit, rateLimitKey, updateFlightLogProfile } from "@/lib/flight-log-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

export async function PATCH(request: NextRequest) {
  const customer = await getCurrentFlightLogCustomer();
  if (!customer) return NextResponse.json({ error: "Sign in to update your profile." }, { status: 401, headers: noStore });
  try {
    rateLimit(rateLimitKey(request, "profile-update", String(customer.id)), 20, 60 * 60 * 1000);
    const body = await request.json() as Record<string, unknown>;
    const profile = await updateFlightLogProfile(customer.id, {
      firstName: text(body.firstName, 80),
      lastName: text(body.lastName, 80),
      callsign: text(body.callsign, 32),
      displayName: text(body.displayName, 160),
      bio: text(body.bio, 500),
    });
    return NextResponse.json({ ok: true, profile }, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update your profile." }, { status: 400, headers: noStore });
  }
}
