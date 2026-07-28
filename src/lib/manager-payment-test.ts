export type ManagerPaymentTestResult = {
  status: "paid" | "pending" | "invalid";
  liveMode?: boolean;
};

type StripeCheckoutSession = {
  amount_total?: number | null;
  currency?: string | null;
  livemode?: boolean;
  metadata?: Record<string, string>;
  payment_status?: string;
};

export async function getManagerPaymentTestResult(sessionId: string): Promise<ManagerPaymentTestResult> {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return { status: "invalid" };

  try {
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(sessionId), {
      headers: {
        authorization: "Bearer " + secret,
        "Stripe-Version": "2026-02-25.clover",
      },
      cache: "no-store",
    });
    if (!response.ok) return { status: "invalid" };

    const session = await response.json() as StripeCheckoutSession;
    if (
      session.metadata?.item !== "manager-payment-test"
      || session.amount_total !== 100
      || session.currency !== "usd"
    ) return { status: "invalid" };

    return {
      status: session.payment_status === "paid" ? "paid" : "pending",
      liveMode: session.livemode === true,
    };
  } catch {
    return { status: "pending" };
  }
}
