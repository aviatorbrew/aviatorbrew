import { NextRequest, NextResponse } from "next/server";
import { getShopVariantForCheckout, recordShopCheckout } from "@/lib/shop";
import { createDynamicCheckoutSession } from "@/lib/stripe";
import { publicSiteUrl } from "@/lib/site-url";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { variantId?: number; quantity?: number; email?: string };
    const variantId = Number(body.variantId);
    const quantity = Number(body.quantity);
    if (!Number.isInteger(variantId) || variantId < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 25) return NextResponse.json({ error: "Choose a valid shop item and quantity." }, { status: 400 });
    const item = await getShopVariantForCheckout(variantId);
    if (quantity > item.variant.inventoryCount) return NextResponse.json({ error: "Only " + item.variant.inventoryCount + " available right now." }, { status: 400 });
    const origin = publicSiteUrl(request.nextUrl.origin);
    const session = await createDynamicCheckoutSession({
      name: item.productName + (item.variant.label === "Default" ? "" : " - " + item.variant.label),
      description: item.productDescription || "Aviator Brewing Company shop item.",
      unitAmount: item.variant.priceCents,
      quantity,
      customerEmail: body.email,
      referenceId: "shop-variant-" + item.variant.id,
      metadata: { item: "shop-new", variantId: String(item.variant.id), productId: String(item.variant.productId), productSlug: item.productSlug },
      successPath: "/shop-new?checkout=success&session_id={CHECKOUT_SESSION_ID}",
      cancelPath: "/shop-new?checkout=cancel",
      origin,
    });
    if (!session) return NextResponse.json({ error: "Online shop payments are not configured yet." }, { status: 503 });
    await recordShopCheckout({ stripeSessionId: session.id, variantId: item.variant.id, quantity, customerEmail: body.email, amountCents: item.variant.priceCents * quantity });
    return NextResponse.json({ url: session.url, id: session.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start shop checkout." }, { status: 500 });
  }
}
