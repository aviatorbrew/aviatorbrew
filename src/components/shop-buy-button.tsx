"use client";

import { useState } from "react";
import { ArrowUpRight } from "@/components/icons";
import type { ShopProduct } from "@/lib/shop";

function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }

export function ShopBuyBox({ product }: { product: ShopProduct }) {
  const first = product.variants[0];
  const [variantId, setVariantId] = useState(first?.id || 0);
  const selected = product.variants.find((variant) => variant.id === variantId) || first;
  const [quantity, setQuantity] = useState(1);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const max = selected?.inventoryCount || 0;

  async function checkout() {
    if (!selected) return;
    setState("loading"); setMessage("");
    try {
      const response = await fetch("/api/shop/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ variantId: selected.id, quantity, email: email.trim() || undefined }) });
      const body = await response.json() as { error?: string; url?: string };
      if (!response.ok || !body.url) throw new Error(body.error || "Checkout could not be opened.");
      window.location.assign(body.url);
    } catch (error) {
      setState("error"); setMessage(error instanceof Error ? error.message : "Checkout could not be opened.");
    }
  }

  if (!selected) return <p className="shop-new-unavailable">Sold out</p>;
  return <div className="shop-new-buy-box">
    <label>Option<select value={variantId} onChange={(event) => { const next = Number(event.currentTarget.value); setVariantId(next); const found = product.variants.find((variant) => variant.id === next); setQuantity(Math.min(quantity, found?.inventoryCount || 1)); }}>{product.variants.map((variant) => <option value={variant.id} key={variant.id}>{variant.label} - {money(variant.priceCents)} ({variant.inventoryCount} available)</option>)}</select></label>
    <label>Quantity<input type="number" min="1" max={max} value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(max, Number(event.currentTarget.value) || 1)))} /></label>
    <label>Email for receipt <small>(optional)</small><input type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} placeholder="you@example.com" /></label>
    <button className="button" type="button" onClick={checkout} disabled={state === "loading" || max < 1}>{state === "loading" ? "Opening checkout..." : "Buy with Stripe"}<ArrowUpRight /></button>
    {state === "error" ? <p className="shop-new-error" role="alert">{message}</p> : null}
  </div>;
}
