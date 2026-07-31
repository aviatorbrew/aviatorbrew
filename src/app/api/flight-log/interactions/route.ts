import { NextRequest, NextResponse } from "next/server";
import { getCurrentFlightLogCustomer, rateLimit, rateLimitKey } from "@/lib/flight-log-auth";
import { addFlightLogComment, addFlightLogReaction, getFlightLogInteractionSummary, type FlightLogReaction, type FlightLogTargetType } from "@/lib/flight-log-social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store" };
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const targetType = clean(url.searchParams.get("targetType"), 30) as FlightLogTargetType;
  const targetId = clean(url.searchParams.get("targetId"), 120);
  if (!targetType || !targetId) return NextResponse.json({ error: "Choose a post." }, { status: 400, headers: noStore });
  return NextResponse.json({ ok: true, summary: await getFlightLogInteractionSummary(targetType, targetId) }, { headers: noStore });
}

export async function POST(request: NextRequest) {
  const customer = await getCurrentFlightLogCustomer();
  if (!customer) return NextResponse.json({ error: "Sign in to interact with Flight Log." }, { status: 401, headers: noStore });
  if (!customer.emailVerified) return NextResponse.json({ error: "Verify your email before reacting or commenting." }, { status: 403, headers: noStore });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = clean(body.action, 20);
  const targetType = clean(body.targetType, 30) as FlightLogTargetType;
  const targetId = clean(body.targetId, 120);
  try {
    rateLimit(rateLimitKey(request, "interaction", customer.id + ":" + targetType + ":" + targetId), 60, 15 * 60 * 1000);
    if (action === "reaction") await addFlightLogReaction(customer.id, { targetType, targetId, reaction: clean(body.reaction, 30) as FlightLogReaction });
    else if (action === "comment") await addFlightLogComment(customer.id, { targetType, targetId, body: clean(body.body, 1000) });
    else throw new Error("Choose a valid Flight Log action.");
    return NextResponse.json({ ok: true, summary: await getFlightLogInteractionSummary(targetType, targetId) }, { headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save that action.";
    return NextResponse.json({ error: message }, { status: message.startsWith("Too many") ? 429 : 400, headers: noStore });
  }
}
