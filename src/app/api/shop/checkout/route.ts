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
      name?: string;
      phone?: string;
      address?: Partial<ShopShippingAddress>;
      shippingToken?: string;
    };
    const email = String(body.email || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    const cart = await prepareShopCart(body.items || []);
    const customerName = String(body.name || body.address?.name || "").trim().slice(0, 120);
    if (!customerName) return NextResponse.json({ error: "Enter the ticket purchaser or shipping name." }, { status: 400 });
    let address: ShopShippingAddress | undefined;
    let shipping: { carrier: string; service: string; amountCents: number; rateId: string } | undefined;
    if (cart.requiresShipping) {
      address = normalizeShippingAddress({ ...(body.address || {}), name: customerName, phone: body.phone || body.address?.phone || "" });
      if (!body.shippingToken) return NextResponse.json({ error: "Calculate and choose a shipping rate." }, { status: 400 });
      shipping = verifyShippingToken(body.shippingToken, cart, address);
    }
    const origin = publicSiteUrl(request.nextUrl.origin);
    const session = await createShopCartCheckoutSession({
      items: cart.items.map((item) => ({ name: item.productName, description: item.variantLabel, unitAmount: item.unitPriceCents, quantity: item.quantity })),
      customerEmail: email,
      metadata: { item: "shop-new", cartItems: String(cart.merchandiseItems.length), bonusApplied: cart.bonusItem ? "true" : "false", containsTickets: cart.merchandiseItems.some((item) => item.productType === "ticket") ? "true" : "false" },
      shipping: shipping && address ? { displayName: shipping.carrier + " " + shipping.service, amountCents: shipping.amountCents, address, phone: String(body.phone || "") } : undefined,
      successPath: "/shop-new/cart?checkout=success&session_id={CHECKOUT_SESSION_ID}",
      cancelPath: "/shop-new/cart?checkout=cancel",
      origin,
    });
    if (!session) return NextResponse.json({ error: "Online shop payments are not configured yet." }, { status: 503 });
    await recordShopCheckout({
      stripeSessionId: session.id,
      checkoutExpiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : undefined,
      cart,
      customerEmail: email,
      customerName,
      customerPhone: String(body.phone || ""),
      shippingCents: shipping?.amountCents || 0,
      shippingAddress: address,
      shippingProvider: shipping?.carrier || (cart.ticketOnly ? "ticket" : ""),
      shippingService: shipping?.service || (cart.ticketOnly ? "Event admission" : ""),
      shippingRateId: shipping?.rateId || (cart.ticketOnly ? "no-shipping-ticket" : ""),
    });
    return NextResponse.json({ url: session.url, id: session.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start shop checkout." }, { status: 400 });
  }
}