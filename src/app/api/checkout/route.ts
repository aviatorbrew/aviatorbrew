import { NextRequest, NextResponse } from "next/server";
import { checkoutCatalog, createCheckoutSession } from "@/lib/stripe";
import { publicSiteUrl } from "@/lib/site-url";
import { formatPrivateEventBookingFee, getPrivateEventSettings } from "@/lib/private-event-settings";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { item?: keyof typeof checkoutCatalog; quantity?: number; email?: string; referenceId?: string; metadata?: Record<string, string> };
    if (!body.item || !checkoutCatalog[body.item] || typeof body.quantity !== "number" || !Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 25) return NextResponse.json({ error: "Choose a valid item and quantity." }, { status: 400 });
    if (body.item === "manager-payment-test") return NextResponse.json({ error: "This checkout is available only in the manager portal." }, { status: 403 });
    let unitAmount: number | undefined;
    let metadata = body.metadata;
    if (body.item === "private-event-room-booking") {
      const settings = await getPrivateEventSettings();
      if (body.quantity !== 1) return NextResponse.json({ error: "The room booking fee must be paid as one " + formatPrivateEventBookingFee(settings.bookingFeeCents) + " item." }, { status: 400 });
      unitAmount = settings.bookingFeeCents;
      metadata = { ...(metadata || {}), bookingFeeCents: String(settings.bookingFeeCents) };
    }
    const origin = publicSiteUrl(request.nextUrl.origin);
    const session = await createCheckoutSession({ item: body.item, quantity: body.quantity, customerEmail: body.email, referenceId: body.referenceId, metadata, unitAmount, origin });
    if (!session) return NextResponse.json({ error: "Online payments are not configured yet." }, { status: 503 });
    return NextResponse.json({ url: session.url, id: session.id });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start checkout." }, { status: 500 }); }
}
