import { NextRequest, NextResponse } from "next/server";
import { prepareShopCart, ShopCartAvailabilityError, type ShopCartRequestItem } from "@/lib/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { items?: ShopCartRequestItem[] };
    const cart = await prepareShopCart(body.items || []);
    return NextResponse.json({
      ...cart,
      settings: {
        bonusEnabled: cart.settings.bonusEnabled,
        bonusThresholdCents: cart.settings.bonusThresholdCents,
        bonusLabel: cart.settings.bonusLabel,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not validate your cart.", unavailableVariantIds: error instanceof ShopCartAvailabilityError ? error.variantIds : [] }, { status: error instanceof ShopCartAvailabilityError ? 409 : 400 });
  }
}
