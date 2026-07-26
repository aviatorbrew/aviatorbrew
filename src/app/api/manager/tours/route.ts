import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import { cancelTourAndReschedule, createTourSignup, getTourManagerData, notifyGuestOfSignup, notifyManagerOfSignup, removeTourSignup, setTourSettings, type TourSlot } from "@/lib/tours";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getTourManagerData());
}

export async function POST(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { name?: string; email?: string; tickets?: number; message?: string };
    if (!body.name || !body.email || !Number.isInteger(Number(body.tickets)) || Number(body.tickets) < 1 || Number(body.tickets) > 6) return NextResponse.json({ error: "Provide a name, email, and 1 to 6 tickets." }, { status: 400 });
    const result = await createTourSignup({ name: body.name, email: body.email, tickets: Number(body.tickets), message: body.message || "" });
    await Promise.all([notifyManagerOfSignup(result), notifyGuestOfSignup(result)]);
    return NextResponse.json({ ok: true, ...(await getTourManagerData()) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not add signup." }, { status: 400 }); }
}

export async function PATCH(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { minimum?: number; priceCents?: number; date?: string; time?: TourSlot; message?: string };
    if (body.minimum !== undefined || body.priceCents !== undefined) {
      return NextResponse.json({ ok: true, ...(await setTourSettings({ minimum: body.minimum === undefined ? undefined : Number(body.minimum), priceCents: body.priceCents === undefined ? undefined : Number(body.priceCents) })) });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || "") || (body.time !== "4:00 PM" && body.time !== "6:00 PM") || !body.message?.trim()) return NextResponse.json({ error: "Choose a scheduled tour and provide the message guests should receive." }, { status: 400 });
    return NextResponse.json({ ok: true, ...(await cancelTourAndReschedule({ date: body.date!, time: body.time, message: body.message.trim() })) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update tour settings." }, { status: 400 }); }
}

export async function DELETE(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Signup is required." }, { status: 400 });
  try { return NextResponse.json({ ok: true, ...(await removeTourSignup(id)) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not remove signup." }, { status: 404 }); }
}
