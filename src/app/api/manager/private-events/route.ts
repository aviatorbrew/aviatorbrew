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
    const body = await request.json() as { bookingFeeCents?: unknown; aviatorWayCopy?: unknown; aviatorWayCopyText?: unknown; inquiryCopy?: unknown; inquiryCopyText?: unknown };
    const input = {
      ...(body.bookingFeeCents === undefined ? {} : { bookingFeeCents: Number(body.bookingFeeCents) }),
      ...(body.aviatorWayCopyText === undefined ? {} : { aviatorWayCopyText: body.aviatorWayCopyText }),
      ...(body.aviatorWayCopy === undefined || body.aviatorWayCopyText !== undefined ? {} : { aviatorWayCopy: body.aviatorWayCopy }),
      ...(body.inquiryCopyText === undefined ? {} : { inquiryCopyText: body.inquiryCopyText }),
      ...(body.inquiryCopy === undefined || body.inquiryCopyText !== undefined ? {} : { inquiryCopy: body.inquiryCopy }),
    };
    return NextResponse.json({ ok: true, ...(await setPrivateEventSettings(input)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save private event settings." }, { status: 400 });
  }
}
