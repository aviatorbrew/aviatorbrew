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
    unitAmount: 50000,
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
  const session = await response.json() as { id: string; url: string | null };
  if (!session.url) throw new Error("Stripe Checkout did not return a payment URL.");
  return session;
}
