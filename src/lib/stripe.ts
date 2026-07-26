type CheckoutItem = {
  name: string;
  description: string;
  unitAmount: number;
  currency: string;
};

export const checkoutCatalog: Record<string, CheckoutItem> = {
  tour: {
    name: "Aviator Brewery Tour",
    description: "Brewery tour, Aviator pint glass, one beer pour, and one flight of four pours.",
    unitAmount: 2000,
    currency: "usd",
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

export async function createCheckoutSession(input: CheckoutInput) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const item = checkoutCatalog[input.item];
  const unitAmount = input.unitAmount ?? item?.unitAmount;
  if (!secret || !item || !Number.isInteger(input.quantity) || input.quantity < 1 || !Number.isInteger(unitAmount) || unitAmount < 100) return null;

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", input.origin + "/about?tour_payment=success&session_id={CHECKOUT_SESSION_ID}");
  form.set("cancel_url", input.origin + "/about?tour_payment=cancel");
  form.set("line_items[0][price_data][currency]", item.currency);
  form.set("line_items[0][price_data][product_data][name]", item.name);
  form.set("line_items[0][price_data][product_data][description]", item.description);
  form.set("line_items[0][price_data][unit_amount]", String(unitAmount));
  form.set("line_items[0][quantity]", String(input.quantity));
  form.set("client_reference_id", input.referenceId || "");
  if (input.customerEmail) form.set("customer_email", input.customerEmail);
  for (const [key, value] of Object.entries({ item: input.item, ...(input.metadata || {}) })) form.set("metadata[" + key + "]", value);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: "Bearer " + secret,
      "content-type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2026-02-25.clover",
    },
    body: form,
  });
  if (!response.ok) throw new Error("Stripe Checkout could not be started.");
  const session = await response.json() as { id: string; url: string | null };
  if (!session.url) throw new Error("Stripe Checkout did not return a payment URL.");
  return session;
}
