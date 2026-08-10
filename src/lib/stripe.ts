import { DEFAULT_PRIVATE_EVENT_BOOKING_FEE_CENTS } from "@/lib/private-event-settings";
type CheckoutItem = {
  name: string;
  description: string;
  unitAmount: number;
  currency: string;
  successPath: string;
  cancelPath: string;
  collectPhone?: boolean;
};

export type CheckoutItemKey = "tour" | "private-event-room-booking" | "manager-payment-test";

export const checkoutCatalog: Record<CheckoutItemKey, CheckoutItem> = {
  tour: {
    name: "Aviator Brewery Tour",
    description: "Brewery tour, Aviator pint glass, one beer pour, and one flight of four pours.",
    unitAmount: 2000,
    currency: "usd",
    successPath: "/about?tour_payment=success&session_id={CHECKOUT_SESSION_ID}",
    cancelPath: "/about?tour_payment=cancel",
  },
  "private-event-room-booking": {
    name: "Private Event Room Booking Fee",
    description: "Room booking fee for a private event at Aviator Brewing Company.",
    unitAmount: DEFAULT_PRIVATE_EVENT_BOOKING_FEE_CENTS,
    currency: "usd",
    successPath: "/private-events?booking_payment=success&session_id={CHECKOUT_SESSION_ID}",
    cancelPath: "/private-events?booking_payment=cancel",
    collectPhone: true,
  },
  "manager-payment-test": {
    name: "Aviator Stripe Payment Test",
    description: "Manager-initiated live payment test. No goods or services are included.",
    unitAmount: 100,
    currency: "usd",
    successPath: "/manager/payments?payment_test=success&session_id={CHECKOUT_SESSION_ID}",
    cancelPath: "/manager/payments?payment_test=cancel",
  },
};

type CheckoutInput = {
  item: keyof typeof checkoutCatalog;
  quantity: number;
  customerEmail?: string;
  referenceId?: string;
  metadata?: Record<string, string>;
  unitAmount?: number;
  origin: string;
};

function sanitizeStripeMessage(message: string) {
  return message.replace(/(?:sk|pk)_(?:test|live)_[A-Za-z0-9_]+/g, "[redacted Stripe key]");
}

export async function createCheckoutSession(input: CheckoutInput) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const item = checkoutCatalog[input.item];
  const unitAmount = input.unitAmount ?? item?.unitAmount;
  if (!secret || !item || !Number.isInteger(input.quantity) || input.quantity < 1 || !Number.isInteger(unitAmount) || unitAmount < 100) return null;
  if (!/^sk_(test|live)_/.test(secret)) throw new Error("Stripe secret key is invalid. Use an sk_test_ or sk_live_ key for STRIPE_SECRET_KEY.");

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", input.origin + item.successPath);
  form.set("cancel_url", input.origin + item.cancelPath);
  form.set("line_items[0][price_data][currency]", item.currency);
  form.set("line_items[0][price_data][product_data][name]", item.name);
  form.set("line_items[0][price_data][product_data][description]", item.description);
  form.set("line_items[0][price_data][unit_amount]", String(unitAmount));
  form.set("line_items[0][quantity]", String(input.quantity));
  if (input.referenceId) form.set("client_reference_id", input.referenceId);
  if (input.customerEmail) form.set("customer_email", input.customerEmail);
  if (item.collectPhone) form.set("phone_number_collection[enabled]", "true");
  for (const [key, value] of Object.entries({ ...(input.metadata || {}), item: input.item })) form.set("metadata[" + key + "]", value);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: "Bearer " + secret,
      "content-type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2026-02-25.clover",
    },
    body: form,
  });
  if (!response.ok) {
    let detail = "Stripe Checkout could not be started.";
    try {
      const body = await response.json() as { error?: { message?: string } };
      if (body.error?.message) detail = "Stripe rejected checkout: " + sanitizeStripeMessage(body.error.message);
    } catch {}
    throw new Error(detail);
  }
  const session = await response.json() as { id: string; url: string | null; expires_at?: number };
  if (!session.url) throw new Error("Stripe Checkout did not return a payment URL.");
  return session;
}

type DynamicCheckoutInput = {
  name: string;
  description: string;
  unitAmount: number;
  quantity: number;
  customerEmail?: string;
  referenceId?: string;
  metadata?: Record<string, string>;
  successPath: string;
  cancelPath: string;
  origin: string;
};

export async function createDynamicCheckoutSession(input: DynamicCheckoutInput) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret || !Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 25 || !Number.isInteger(input.unitAmount) || input.unitAmount < 100) return null;
  if (!/^sk_(test|live)_/.test(secret)) throw new Error("Stripe secret key is invalid. Use an sk_test_ or sk_live_ key for STRIPE_SECRET_KEY.");

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", input.origin + input.successPath);
  form.set("cancel_url", input.origin + input.cancelPath);
  form.set("line_items[0][price_data][currency]", "usd");
  form.set("line_items[0][price_data][product_data][name]", input.name);
  form.set("line_items[0][price_data][product_data][description]", input.description.slice(0, 900));
  form.set("line_items[0][price_data][unit_amount]", String(input.unitAmount));
  form.set("line_items[0][quantity]", String(input.quantity));
  if (input.referenceId) form.set("client_reference_id", input.referenceId);
  if (input.customerEmail) form.set("customer_email", input.customerEmail);
  for (const [key, value] of Object.entries(input.metadata || {})) form.set("metadata[" + key + "]", value);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: "Bearer " + secret, "content-type": "application/x-www-form-urlencoded", "Stripe-Version": "2026-02-25.clover" },
    body: form,
  });
  if (!response.ok) {
    let detail = "Stripe Checkout could not be started.";
    try {
      const body = await response.json() as { error?: { message?: string } };
      if (body.error?.message) detail = "Stripe rejected checkout: " + sanitizeStripeMessage(body.error.message);
    } catch {}
    throw new Error(detail);
  }
  const session = await response.json() as { id: string; url: string | null; expires_at?: number };
  if (!session.url) throw new Error("Stripe Checkout did not return a payment URL.");
  return session;
}


type ShopCartCheckoutInput = {
  items: Array<{ name: string; description: string; unitAmount: number; quantity: number }>;
  customerEmail: string;
  metadata: Record<string, string>;
  shipping?: {
    displayName: string;
    amountCents: number;
    address: { name: string; street1: string; street2: string; city: string; state: string; zip: string; country: string };
    phone: string;
  };
  successPath: string;
  cancelPath: string;
  origin: string;
};

export async function createShopCartCheckoutSession(input: ShopCartCheckoutInput) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret || !input.items.length || input.items.length > 100) return null;
  if (!/^sk_(test|live)_/.test(secret)) throw new Error("Stripe secret key is invalid. Use an sk_test_ or sk_live_ key for STRIPE_SECRET_KEY.");

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", input.origin + input.successPath);
  form.set("cancel_url", input.origin + input.cancelPath);
  form.set("customer_email", input.customerEmail);
  form.set("billing_address_collection", "auto");
  form.set("customer_creation", "always");
  form.set("expires_at", String(Math.floor(Date.now() / 1000) + 31 * 60));
  if (input.shipping) {
    form.set("payment_intent_data[shipping][name]", input.shipping.address.name);
    form.set("payment_intent_data[shipping][phone]", input.shipping.phone);
    form.set("payment_intent_data[shipping][address][line1]", input.shipping.address.street1);
    if (input.shipping.address.street2) form.set("payment_intent_data[shipping][address][line2]", input.shipping.address.street2);
    form.set("payment_intent_data[shipping][address][city]", input.shipping.address.city);
    form.set("payment_intent_data[shipping][address][state]", input.shipping.address.state);
    form.set("payment_intent_data[shipping][address][postal_code]", input.shipping.address.zip);
    form.set("payment_intent_data[shipping][address][country]", input.shipping.address.country);
  }
  input.items.forEach((item, index) => {
    form.set(`line_items[${index}][price_data][currency]`, "usd");
    form.set(`line_items[${index}][price_data][product_data][name]`, item.name.slice(0, 120));
    form.set(`line_items[${index}][price_data][product_data][description]`, item.description.slice(0, 900));
    form.set(`line_items[${index}][price_data][unit_amount]`, String(item.unitAmount));
    form.set(`line_items[${index}][quantity]`, String(item.quantity));
  });
  if (input.shipping && input.shipping.amountCents > 0) {
    form.set("shipping_options[0][shipping_rate_data][type]", "fixed_amount");
    form.set("shipping_options[0][shipping_rate_data][fixed_amount][amount]", String(input.shipping.amountCents));
    form.set("shipping_options[0][shipping_rate_data][fixed_amount][currency]", "usd");
    form.set("shipping_options[0][shipping_rate_data][display_name]", input.shipping.displayName.slice(0, 100));
  }
  for (const [key, value] of Object.entries(input.metadata)) form.set("metadata[" + key + "]", value);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: "Bearer " + secret, "content-type": "application/x-www-form-urlencoded", "Stripe-Version": "2026-02-25.clover" },
    body: form,
  });
  if (!response.ok) {
    let detail = "Stripe Checkout could not be started.";
    try {
      const body = await response.json() as { error?: { message?: string } };
      if (body.error?.message) detail = "Stripe rejected checkout: " + sanitizeStripeMessage(body.error.message);
    } catch {}
    throw new Error(detail);
  }
  const session = await response.json() as { id: string; url: string | null; expires_at?: number };
  if (!session.url) throw new Error("Stripe Checkout did not return a payment URL.");
  return session;
}
