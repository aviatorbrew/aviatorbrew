import { NextRequest, NextResponse } from "next/server";
import { prepareShopCart, recordShopCheckout, type ShopCartRequestItem } from "@/lib/shop";
import { normalizeShippingAddress, verifyShippingToken, type ShopShippingAddress } from "@/lib/shop-shipping";
import { createShopCartCheckoutSession } from "@/lib/stripe";
import { publicSiteUrl } from "@/lib/site-url";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      items?: ShopCartRequestItem[];
      email?: string;
      phone?: string;
      address?: Partial<ShopShippingAddress>;
      shippingToken?: string;
    };
    const email = String(body.email || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    const cart = await prepareShopCart(body.items || []);
    const address = normalizeShippingAddress({ ...(body.address || {}), phone: body.phone || body.address?.phone || "" });
    if (!body.shippingToken) return NextResponse.json({ error: "Calculate and choose a shipping rate." }, { status: 400 });
    const shipping = verifyShippingToken(body.shippingToken, cart, address);
    const origin = publicSiteUrl(request.nextUrl.origin);
    const session = await createShopCartCheckoutSession({
      items: cart.items.map((item) => ({ name: item.productName, description: item.variantLabel, unitAmount: item.unitPriceCents, quantity: item.quantity })),
      customerEmail: email,
      metadata: { item: "shop-new", cartItems: String(cart.merchandiseItems.length), bonusApplied: cart.bonusItem ? "true" : "false" },
      shipping: { displayName: shipping.carrier + " " + shipping.service, amountCents: shipping.amountCents, address, phone: String(body.phone || "") },
      successPath: "/shop-new/cart?checkout=success&session_id={CHECKOUT_SESSION_ID}",
      cancelPath: "/shop-new/cart?checkout=cancel",
      origin,
    });
    if (!session) return NextResponse.json({ error: "Online shop payments are not configured yet." }, { status: 503 });
    await recordShopCheckout({
      stripeSessionId: session.id,
      cart,
      customerEmail: email,
      customerName: address.name,
      customerPhone: String(body.phone || ""),
      shippingCents: shipping.amountCents,
      shippingAddress: address,
      shippingProvider: shipping.carrier,
      shippingService: shipping.service,
      shippingRateId: shipping.rateId,
    });
    return NextResponse.json({ url: session.url, id: session.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start shop checkout." }, { status: 400 });
  }
}
