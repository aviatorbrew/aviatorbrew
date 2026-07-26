import { NextResponse } from "next/server";
import { claimCoupon, couponAvailability, getCouponOffers } from "@/lib/coupons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [offers, availability] = await Promise.all([getCouponOffers(), couponAvailability()]);
  return NextResponse.json({ offers, availability });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { offerId?: string };
    if (!body.offerId) return NextResponse.json({ error: "Choose a coupon." }, { status: 400 });
    const { claim, offer } = await claimCoupon(body.offerId);
    return NextResponse.json({ ok: true, title: offer.title, expiresAt: offer.expiresAt, imageUrl: "/api/coupons/" + claim.token + "/image", validationUrl: "/coupon-validate?code=" + claim.token });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Coupon unavailable." }, { status: 400 });
  }
}
