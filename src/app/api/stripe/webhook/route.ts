import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { markTourPaid } from "@/lib/tours";

export const runtime = "nodejs";

function signedPayload(secret: string, header: string, body: string) {
  const timestamp = header.split(",").find((part) => part.startsWith("t="))?.slice(2);
  const signature = header.split(",").find((part) => part.startsWith("v1="))?.slice(3);
  if (!timestamp || !signature || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(timestamp + "." + body).digest("hex");
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  const raw = await request.text();
  if (!signedPayload(secret, request.headers.get("stripe-signature") || "", raw)) return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  const event = JSON.parse(raw) as { type?: string; data?: { object?: { payment_status?: string; metadata?: Record<string, string>; id?: string } } };
  if (event.type === "checkout.session.completed" && event.data?.object?.payment_status === "paid") {
    const signupId = event.data.object.metadata?.tourSignupId;
    if (signupId) await markTourPaid(signupId, event.data.object.id || "");
  }
  return NextResponse.json({ received: true });
}
