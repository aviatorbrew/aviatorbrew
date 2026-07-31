import { NextRequest, NextResponse } from "next/server";
import { getCurrentFlightLogCustomer, rateLimit, rateLimitKey } from "@/lib/flight-log-auth";
import { getFlightLogFriendSummary, requestFlightLogFriend, respondToFlightLogFriendRequest } from "@/lib/flight-log-social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store" };

export async function GET() {
  const customer = await getCurrentFlightLogCustomer();
  if (!customer) return NextResponse.json({ error: "Sign in to view friends." }, { status: 401, headers: noStore });
  return NextResponse.json({ ok: true, friends: await getFlightLogFriendSummary(customer.id) }, { headers: noStore });
}

export async function POST(request: NextRequest) {
  const customer = await getCurrentFlightLogCustomer();
  if (!customer) return NextResponse.json({ error: "Sign in to add friends." }, { status: 401, headers: noStore });
  if (!customer.emailVerified) return NextResponse.json({ error: "Verify your email before adding friends." }, { status: 403, headers: noStore });
  const body = await request.json().catch(() => ({})) as { identifier?: string };
  try {
    rateLimit(rateLimitKey(request, "friend", customer.id + ":" + (body.identifier || "")), 8, 60 * 60 * 1000);
    const result = await requestFlightLogFriend(customer.id, { identifier: body.identifier || "", request });
    return NextResponse.json({ ok: true, result, friends: await getFlightLogFriendSummary(customer.id) }, { status: 201, headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add this friend.";
    return NextResponse.json({ error: message }, { status: message.startsWith("Too many") ? 429 : 400, headers: noStore });
  }
}

export async function PATCH(request: NextRequest) {
  const customer = await getCurrentFlightLogCustomer();
  if (!customer) return NextResponse.json({ error: "Sign in to manage friends." }, { status: 401, headers: noStore });
  if (!customer.emailVerified) return NextResponse.json({ error: "Verify your email before managing friends." }, { status: 403, headers: noStore });
  const body = await request.json().catch(() => ({})) as { requesterId?: number; action?: "accept" | "decline" };
  try {
    const requesterId = Number(body.requesterId);
    if (!Number.isFinite(requesterId) || !["accept", "decline"].includes(String(body.action))) throw new Error("Choose a valid friend request.");
    await respondToFlightLogFriendRequest(customer.id, requesterId, body.action!);
    return NextResponse.json({ ok: true, friends: await getFlightLogFriendSummary(customer.id) }, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update this friend request." }, { status: 400, headers: noStore });
  }
}
