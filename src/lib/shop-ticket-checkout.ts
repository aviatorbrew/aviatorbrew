import { withDatabase } from "@/lib/database";
import { expireShopCheckout } from "@/lib/shop";

export async function attachShopCheckout(reference: string, session: { id: string; expires_at?: number }) {
  const saved = await withDatabase(async c => c.query("UPDATE website.shop_orders SET stripe_session_id=$2,checkout_expires_at=COALESCE($3::timestamptz,checkout_expires_at),updated_at=now() WHERE stripe_session_id=$1 AND status='pending' AND (metadata->>'ticketCutoffAt' IS NULL OR (metadata->>'ticketCutoffAt')::timestamptz>now()) RETURNING id", [reference, session.id, session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null]), { skipSchema: true });
  if (!saved.rows.length) throw new Error("Online ticket sales have closed. No payment link was issued.");
}
export async function readShopStripeSession(sessionId: string) {
  if (!/^cs_(?:test|live)_[A-Za-z0-9_]+$/.test(sessionId)) throw new Error("Invalid checkout reference.");
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("Stripe is not configured.");
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(sessionId), { headers: { authorization: "Bearer " + secret }, signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (!r.ok) throw new Error("Stripe checkout verification is temporarily unavailable.");
  return r.json() as Promise<{ id: string; status: string; payment_status: string; amount_total?: number; currency?: string }>;
}
export async function closeShopStripeSession(sessionId: string, known?: Awaited<ReturnType<typeof readShopStripeSession>>) {
  const session = known || await readShopStripeSession(sessionId);
  if (session.status === "expired") return true;
  if (session.status !== "open") return false;
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(sessionId) + "/expire", { method: "POST", headers: { authorization: "Bearer " + process.env.STRIPE_SECRET_KEY, "Idempotency-Key": "shop-expire-" + sessionId }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) return (await readShopStripeSession(sessionId)).status === "expired";
  return (await r.json()).status === "expired";
}
export async function abandonShopCheckout(reference: string, sessionId?: string) {
  if (sessionId && !await closeShopStripeSession(sessionId)) return;
  await expireShopCheckout(reference);
}
