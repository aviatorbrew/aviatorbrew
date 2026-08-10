import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import { getPrivateEventSettings, setPrivateEventSettings } from "@/lib/private-event-settings";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getPrivateEventSettings());
}

export async function PATCH(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { bookingFeeCents?: number };
    return NextResponse.json({ ok: true, ...(await setPrivateEventSettings({ bookingFeeCents: Number(body.bookingFeeCents) })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save private event settings." }, { status: 400 });
  }
}
