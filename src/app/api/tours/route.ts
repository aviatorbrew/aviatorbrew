import { NextResponse } from "next/server";
import { createTourSignup, formatTourDate, getTourSummary, isTourEmailConfigured, notifyGuestOfSignup, notifyManagerOfSignup, TOUR_CAPACITY } from "@/lib/tours";
import { createCheckoutSession } from "@/lib/stripe";

export const runtime = "nodejs";

const emailPattern = /^\S+@\S+\.\S+$/;

export async function GET() {
  const summary = await getTourSummary();
  return NextResponse.json({ ...summary, capacity: TOUR_CAPACITY, minimum: summary.minimum });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const tickets = Number(body.tickets);
    if (body.website || name.length < 2 || !emailPattern.test(email) || !Number.isInteger(tickets) || tickets < 1 || tickets > 6) {
      return NextResponse.json({ error: "Please provide your name, a valid email, and 1 to 6 tickets." }, { status: 400 });
    }
    if (message.length > 1000) return NextResponse.json({ error: "Please keep your note under 1,000 characters." }, { status: 400 });
    const result = await createTourSignup({ name, email, tickets, message });
    const [managerNotified, guestNotified] = await Promise.all([notifyManagerOfSignup(result), notifyGuestOfSignup(result)]);
    let paymentUrl = process.env.TOUR_PAYMENT_URL || null;
    try {
      const checkout = await createCheckoutSession({
        item: "tour",
        quantity: tickets,
        customerEmail: email,
        referenceId: result.signup.id,
        metadata: {
          tourSignupId: result.signup.id,
          tourDate: result.signup.tourDate,
          tourTime: result.signup.tourTime,
          tickets: String(tickets),
          priceCents: String(result.priceCents),
        },
        unitAmount: result.priceCents,
        origin: new URL(request.url).origin,
      });
      paymentUrl = checkout?.url || paymentUrl;
    } catch {
      // The tour list remains available if Checkout is temporarily unavailable.
    }
    return NextResponse.json({
      ok: true,
      tourDate: formatTourDate(result.signup.tourDate),
      tourTime: result.signup.tourTime,
      currentTotal: result.currentTotal,
      capacity: TOUR_CAPACITY,
      minimum: result.minimum,
      qualified: result.qualified,
      priceCents: result.priceCents,
      managerNotified,
      guestNotified,
      emailConfigured: isTourEmailConfigured(),
      paymentUrl,
    });
  } catch {
    return NextResponse.json({ error: "We could not save your tour signup. Please try again or email tours@aviatorbrew.com." }, { status: 500 });
  }
}
