import { NextRequest, NextResponse } from "next/server";
import { getAllBeers } from "@/lib/managed-beers";
import { getAllBeyondBeer } from "@/lib/managed-beyond-beer";
import { getAllLocations } from "@/lib/managed-locations";
import { getPublishedEvents, getPublishedLiveMusicCheckInEvents, getPublishedLiveMusicEvents } from "@/lib/managed-events";
import { createFlightLogCheckIn, getCurrentFlightLogCustomer, getFlightLogProfileSummary, rateLimit, rateLimitKey, type FlightLogCheckInKind } from "@/lib/flight-log-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" };
const kinds = new Set<FlightLogCheckInKind>(["beer", "location", "event"]);
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

async function resolveTarget(kind: FlightLogCheckInKind, slug: string) {
  if (kind === "beer") {
    const [beers, beverages] = await Promise.all([getAllBeers(), getAllBeyondBeer()]);
    const item = [...beers, ...beverages].find((entry) => entry.slug === slug);
    return item ? { slug: item.slug, label: item.name } : null;
  }
  if (kind === "location") {
    const location = (await getAllLocations()).find((item) => item.slug === slug);
    return location ? { slug: location.slug, label: location.name } : null;
  }
  const events = await Promise.all([getPublishedEvents({ monthsAhead: 2 }), getPublishedLiveMusicEvents({ monthsAhead: 2 }), getPublishedLiveMusicCheckInEvents({ daysBack: 10 })]);
  const event = events.flat().find((item) => item.id === slug);
  return event ? { slug: event.id, label: event.title } : null;
}

export async function GET() {
  const customer = await getCurrentFlightLogCustomer();
  if (!customer) return NextResponse.json({ error: "Sign in to view check-ins." }, { status: 401, headers: noStore });
  return NextResponse.json({ ok: true, checkIns: await getFlightLogProfileSummary(customer.id) }, { headers: noStore });
}

export async function POST(request: NextRequest) {
  const customer = await getCurrentFlightLogCustomer();
  if (!customer) return NextResponse.json({ error: "Sign in to check in." }, { status: 401, headers: noStore });
  if (!customer.emailVerified) return NextResponse.json({ error: "Verify your email before checking in." }, { status: 403, headers: noStore });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const kind = clean(body.kind, 30) as FlightLogCheckInKind;
  const targetSlug = clean(body.targetSlug, 180);
  const notes = clean(body.notes, 500);
  if (!kinds.has(kind) || !targetSlug) return NextResponse.json({ error: "Choose a valid check-in." }, { status: 400, headers: noStore });

  try {
    rateLimit(rateLimitKey(request, "check-in", customer.id + ":" + kind + ":" + targetSlug), 10, 15 * 60 * 1000);
    const target = await resolveTarget(kind, targetSlug);
    if (!target) return NextResponse.json({ error: "That check-in item is not currently available." }, { status: 404, headers: noStore });
    const checkIn = await createFlightLogCheckIn(customer.id, { kind, targetSlug: target.slug, targetLabel: target.label, notes });
    return NextResponse.json({ ok: true, checkIn }, { status: 201, headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save this check-in.";
    return NextResponse.json({ error: message }, { status: message.startsWith("Too many") ? 429 : 400, headers: noStore });
  }
}
