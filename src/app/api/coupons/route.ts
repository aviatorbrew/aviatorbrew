import { NextResponse } from "next/server";
import { claimCoupon, couponAvailability, getCouponOffers } from "@/lib/coupons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicSiteUrl(request: Request) {
  const value = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  if (/^https?:\/\/(localhost|127\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/i.test(value)) return "https://aviatorbrew.com";
  return value.replace(/\/$/, "");
}

export async function GET() {
  const [offers, availability] = await Promise.all([getCouponOffers(), couponAvailability()]);
  return NextResponse.json({ offers, availability });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { offerId?: string };
    if (!body.offerId) return NextResponse.json({ error: "Choose a coupon." }, { status: 400 });
    const { claim, offer } = await claimCoupon(body.offerId);
    const validationUrl = publicSiteUrl(request) + "/coupon-validate?code=" + encodeURIComponent(claim.token);
    return NextResponse.json({ ok: true, title: offer.title, expiresAt: offer.expiresAt, imageUrl: "/api/coupons/" + claim.token + "/image", validationUrl });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Coupon unavailable." }, { status: 400 });
  }
}
