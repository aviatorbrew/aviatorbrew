import { NextRequest, NextResponse } from "next/server";
import { addCouponBlackout, addCouponOffer, getCouponManagerData, removeCoupon } from "@/lib/coupons";
import { canManageMedia } from "@/lib/manager-auth";

export const runtime = "nodejs";

function authorized(request: NextRequest) { return canManageMedia(request); }
function deny() { return NextResponse.json({ error: "Access denied." }, { status: 401 }); }

export async function GET(request: NextRequest) {
  if (!authorized(request)) return deny();
  return NextResponse.json(await getCouponManagerData());
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return deny();
  try {
    const body = await request.json() as Record<string, string>;
    if (body.action === "offer") await addCouponOffer(body as { title: string; description: string; terms: string; code: string; expiresAt: string; limit: string });
    else if (body.action === "blackout") await addCouponBlackout({ date: body.date || "", label: body.label || "" });
    else return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    return NextResponse.json({ ok: true, ...(await getCouponManagerData()) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save coupon settings." }, { status: 400 }); }
}

export async function DELETE(request: NextRequest) {
  if (!authorized(request)) return deny();
  const type = request.nextUrl.searchParams.get("type");
  const id = request.nextUrl.searchParams.get("id");
  if ((type !== "offer" && type !== "blackout") || !id) return NextResponse.json({ error: "Invalid item." }, { status: 400 });
  await removeCoupon(type, id);
  return NextResponse.json({ ok: true, ...(await getCouponManagerData()) });
}
