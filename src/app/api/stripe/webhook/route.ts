import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { notifyPrivateEventPayment, type PrivateEventCheckoutSession } from "@/lib/private-event-payments";
import { markTourPaid } from "@/lib/tours";
import { markShopOrderPaid } from "@/lib/shop";

export const runtime = "nodejs";

function signedPayload(secret: string, header: string, body: string) {
  const timestamp = header.split(",").find((part) => part.startsWith("t="))?.slice(2);
  const signature = header.split(",").find((part) => part.startsWith("v1="))?.slice(3);
  if (!timestamp || !signature || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(timestamp + "." + body).digest("hex");
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

type StripeCheckoutEvent = {
  type?: string;
  data?: {
    object?: PrivateEventCheckoutSession & {
      payment_status?: string;
    };
  };
};

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  const raw = await request.text();
  if (!signedPayload(secret, request.headers.get("stripe-signature") || "", raw)) return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  const event = JSON.parse(raw) as StripeCheckoutEvent;
  const session = event.data?.object;
  if (event.type === "checkout.session.completed" && session?.payment_status === "paid") {
    const signupId = session.metadata?.tourSignupId;
    if (signupId) await markTourPaid(signupId, session.id || "");
    if (session.metadata?.item === "shop-new" && session.id) {
      const notified = await markShopOrderPaid(session.id);
      if (!notified) return NextResponse.json({ error: "Payment received, but the shop order notification email could not be sent." }, { status: 503 });
    }
    if (session.metadata?.item === "private-event-room-booking") {
      if (!session.id) return NextResponse.json({ error: "Stripe Checkout session ID is missing." }, { status: 400 });
      const notified = await notifyPrivateEventPayment(session);
      if (!notified) return NextResponse.json({ error: "Payment received, but the event notification email could not be sent." }, { status: 503 });
    }
  }
  return NextResponse.json({ received: true });
}
