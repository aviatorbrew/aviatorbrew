import { NextResponse } from "next/server";
import { redeemCoupon } from "@/lib/coupons";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const key = process.env.COUPON_VALIDATION_KEY;
  if (!key || request.headers.get("x-coupon-validation-key") !== key) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json() as { token?: string };
  if (!body.token) return NextResponse.json({ error: "Scan or enter a coupon code." }, { status: 400 });
  const result = await redeemCoupon(body.token);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
