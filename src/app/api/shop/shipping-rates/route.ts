import { NextRequest, NextResponse } from "next/server";
import { prepareShopCart, type ShopCartRequestItem } from "@/lib/shop";
import { calculateUspsRates, type ShopShippingAddress } from "@/lib/shop-shipping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { items?: ShopCartRequestItem[]; address?: Partial<ShopShippingAddress> };
    const cart = await prepareShopCart(body.items || []);
    const rates = await calculateUspsRates(cart, body.address || {});
    return NextResponse.json({ rates, cart: { ...cart, settings: { bonusEnabled: cart.settings.bonusEnabled, bonusThresholdCents: cart.settings.bonusThresholdCents, bonusLabel: cart.settings.bonusLabel } } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not calculate USPS shipping." }, { status: 400 });
  }
}
