import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import { createManagedEvent, deleteManagedEvent, getManagedEvents, updateManagedEvent, type ManagedEventInput } from "@/lib/managed-events";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ events: await getManagedEvents() });
}

export async function POST(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { await createManagedEvent(await request.json()); return NextResponse.json({ ok: true, events: await getManagedEvents() }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create event." }, { status: 400 }); }
}

export async function PATCH(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as Partial<ManagedEventInput> & { id?: string };
    if (!body.id) return NextResponse.json({ error: "Event is required." }, { status: 400 });
    await updateManagedEvent(body.id, body);
    return NextResponse.json({ ok: true, events: await getManagedEvents() });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update event." }, { status: 400 }); }
}

export async function DELETE(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Event is required." }, { status: 400 });
  try { await deleteManagedEvent(id); return NextResponse.json({ ok: true, events: await getManagedEvents() }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete event." }, { status: 404 }); }
}
