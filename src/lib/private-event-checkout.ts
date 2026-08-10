import type { PrivateEventCheckoutSession } from "@/lib/private-event-payments";
import { DEFAULT_PRIVATE_EVENT_BOOKING_FEE_CENTS, getPrivateEventSettings, validPrivateEventBookingFeeCents } from "@/lib/private-event-settings";

export type PrivateEventPaymentStatus = "paid" | "pending" | "invalid";

export type PrivateEventPaymentResult = {
  status: PrivateEventPaymentStatus;
  session?: PrivateEventCheckoutSession;
};

export async function getPrivateEventPaymentResult(sessionId: string): Promise<PrivateEventPaymentResult> {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return { status: "invalid" };
  try {
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(sessionId) + "?expand[]=payment_intent", {
      headers: {
        authorization: "Bearer " + secret,
        "Stripe-Version": "2026-02-25.clover",
      },
      cache: "no-store",
    });
    if (!response.ok) return { status: "invalid" };
    const session = await response.json() as PrivateEventCheckoutSession & { payment_status?: string };
    const configured = await getPrivateEventSettings();
    const metadataAmount = session.metadata?.bookingFeeCents ? Number(session.metadata.bookingFeeCents) : undefined;
    const expectedAmount = metadataAmount && Number.isInteger(metadataAmount) ? validPrivateEventBookingFeeCents(metadataAmount) : configured.bookingFeeCents;
    const legacyDefaultValid = !metadataAmount && session.amount_total === DEFAULT_PRIVATE_EVENT_BOOKING_FEE_CENTS;
    if (session.metadata?.item !== "private-event-room-booking" || session.currency !== "usd" || (session.amount_total !== expectedAmount && !legacyDefaultValid)) return { status: "invalid" };
    return {
      status: session.payment_status === "paid" ? "paid" : "pending",
      session,
    };
  } catch {
    return { status: "pending" };
  }
}
