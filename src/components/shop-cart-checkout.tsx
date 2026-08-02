"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useShopCart } from "@/components/shop-cart";

type PreparedItem = {
  variantId: number;
  productId: number;
  productName: string;
  variantLabel: string;
  imageUrl: string;
  unitPriceCents: number;
  quantity: number;
  isBonus: boolean;
};

type PreparedCart = {
  items: PreparedItem[];
  merchandiseItems: PreparedItem[];
  bonusItem: PreparedItem | null;
  subtotalCents: number;
  requiresShipping: boolean;
  ticketOnly: boolean;
  settings: { bonusEnabled: boolean; bonusThresholdCents: number; bonusLabel: string };
};

type ShippingRate = { id: string; carrier: string; service: string; amountCents: number; deliveryDays: number | null; token: string; isEstimate?: boolean };
type Address = { name: string; street1: string; street2: string; city: string; state: string; zip: string; country: string; phone: string };

function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }

export function ShopCartCheckout({ checkoutStatus }: { checkoutStatus?: string }) {
  const { items, hydrated, updateQuantity, removeItem, clearCart } = useShopCart();
  const [cart, setCart] = useState<PreparedCart | null>(null);
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [selectedToken, setSelectedToken] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState<Address>({ name: "", street1: "", street2: "", city: "", state: "NC", zip: "", country: "US", phone: "" });
  const [state, setState] = useState<"idle" | "loading" | "shipping" | "checkout" | "error">("idle");
  const [message, setMessage] = useState("");
  const requestItems = useMemo(() => items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })), [items]);
  const requestKey = JSON.stringify(requestItems);

  useEffect(() => {
    if (checkoutStatus === "success") clearCart();
  }, [checkoutStatus, clearCart]);

  useEffect(() => {
    if (!hydrated || checkoutStatus === "success") return;
    setRates([]); setSelectedToken("");
    if (!requestItems.length) { setCart(null); setState("idle"); return; }
    const controller = new AbortController();
    setState("loading"); setMessage("");
    fetch("/api/shop/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: requestItems }), signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not validate your cart.");
        setCart(body as PreparedCart); setState("idle");
      })
      .catch((error) => { if (error.name !== "AbortError") { setState("error"); setMessage(error.message); } });
    return () => controller.abort();
  }, [hydrated, requestKey, checkoutStatus]);

  function addressField(field: keyof Address, value: string) {
    setAddress((current) => ({ ...current, [field]: value }));
    setRates([]); setSelectedToken("");
  }

  async function calculateShipping(event: FormEvent) {
    event.preventDefault();
    setState("shipping"); setMessage("");
    try {
      const response = await fetch("/api/shop/shipping-rates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: requestItems, address }) });
      const body = await response.json() as { rates?: ShippingRate[]; cart?: PreparedCart; error?: string };
      if (!response.ok || !body.rates?.length) throw new Error(body.error || "USPS did not return a shipping rate.");
      setCart(body.cart || cart); setRates(body.rates); setSelectedToken(body.rates[0].token); setState("idle");
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Could not calculate USPS shipping."); }
  }

  async function checkout() {
    if (cart?.requiresShipping && !selectedToken) { setState("error"); setMessage("Calculate and choose a shipping rate first."); return; }
    setState("checkout"); setMessage("");
    try {
      const response = await fetch("/api/shop/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: requestItems, email, name: address.name, phone: address.phone, address, shippingToken: selectedToken }) });
      const body = await response.json() as { url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error || "Checkout could not be opened.");
      window.location.assign(body.url);
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Checkout could not be opened."); }
  }

  if (checkoutStatus === "success") return <section className="section shop-cart-page"><div className="content-wrap shop-order-confirmation"><p className="eyebrow">Order confirmed</p><h1>Payment received.</h1><p>Your order is in the Aviator queue. A Stripe receipt has been sent to your email address.</p><Link className="button" href="/shop-new">Continue shopping</Link></div></section>;

  if (!hydrated || state === "loading") return <section className="section shop-cart-page"><div className="content-wrap shop-cart-empty"><p className="eyebrow">Loading manifest</p><h1>Checking your cart...</h1></div></section>;
  if (!items.length) return <section className="section shop-cart-page"><div className="content-wrap shop-cart-empty"><p className="eyebrow">Cart 00</p><h1>Your cargo hold is empty.</h1><p>Choose something from the Aviator catalog and it will stay here until checkout.</p><Link className="button" href="/shop-new">Browse the catalog</Link></div></section>;

  const shipping = rates.find((rate) => rate.token === selectedToken);
  const total = (cart?.subtotalCents || 0) + (shipping?.amountCents || 0);
  const threshold = cart?.settings.bonusThresholdCents || 2000;
  const bonusRemaining = Math.max(0, threshold + 1 - (cart?.subtotalCents || 0));
  const freeShippingRemaining = Math.max(0, 7500 - (cart?.subtotalCents || 0));

  return <section className="section shop-cart-page"><div className="content-wrap">
    <header className="shop-cart-heading"><div><p className="eyebrow">Cargo manifest</p><h1>Your Aviator cart.</h1></div><Link href="/shop-new">Continue shopping</Link></header>
    {checkoutStatus === "cancel" ? <p className="shop-cart-notice">Checkout was canceled. Your cart is still here.</p> : null}
    {message ? <p className="shop-new-error" role="alert">{message}</p> : null}
    <div className="shop-checkout-grid"><div className="shop-cart-manifest">
      <div className="shop-cart-items">{cart?.merchandiseItems.map((item) => {
        const stored = items.find((entry) => entry.variantId === item.variantId);
        return <article key={item.variantId}>{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <div className="shop-cart-image-placeholder">AVIATOR</div>}<div><h2>{item.productName}</h2><p>{item.variantLabel}</p><strong>{money(item.unitPriceCents)}</strong></div><label>Qty<input type="number" min="1" max={stored?.maxQuantity || 25} value={stored?.quantity || item.quantity} onChange={(event) => updateQuantity(item.variantId, Number(event.currentTarget.value))} /></label><button type="button" onClick={() => removeItem(item.variantId)} aria-label={"Remove " + item.productName}>Remove</button></article>;
      })}</div>
      {!cart?.ticketOnly ? <div className={"shop-bonus-panel " + (cart?.bonusItem ? "is-earned" : "")}><span aria-hidden="true">{cart?.bonusItem ? "BONUS LOADED" : "BONUS APPROACH"}</span><div><strong>{cart?.bonusItem ? cart.bonusItem.productName : "Free Aviator sticker over " + money(threshold)}</strong><p>{cart?.bonusItem ? "Added automatically at no charge." : "Add " + money(bonusRemaining) + " more in merchandise to unlock it."}</p></div></div> : null}
      {cart?.bonusItem ? <article className="shop-cart-bonus-line">{cart.bonusItem.imageUrl ? <img src={cart.bonusItem.imageUrl} alt="" /> : null}<div><h2>{cart.bonusItem.productName}</h2><p>{cart.bonusItem.variantLabel}</p></div><strong>FREE</strong></article> : null}
    </div>
    <form className="shop-shipping-form" onSubmit={cart?.requiresShipping ? calculateShipping : (event) => { event.preventDefault(); checkout(); }}>
      <p className="eyebrow">{cart?.ticketOnly ? "Ticket holder" : "Delivery coordinates"}</p><h2>{cart?.ticketOnly ? "Event admission" : "USPS shipping"}</h2>{cart?.requiresShipping ? <p className="shop-free-shipping-note">{freeShippingRemaining ? "Add " + money(freeShippingRemaining) + " more for free shipping." : "Free shipping unlocked for this order."}</p> : <p className="shop-free-shipping-note">Tickets are delivered by email. No shipping address is needed.</p>}
      <label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.currentTarget.value)} autoComplete="email" /></label>
      <label>Full name<input required value={address.name} onChange={(event) => addressField("name", event.currentTarget.value)} autoComplete="name" /></label>
      {cart?.requiresShipping ? <><label>Street address<input required value={address.street1} onChange={(event) => addressField("street1", event.currentTarget.value)} autoComplete="shipping address-line1" /></label><label>Apartment, suite, etc. <small>(optional)</small><input value={address.street2} onChange={(event) => addressField("street2", event.currentTarget.value)} autoComplete="shipping address-line2" /></label><div className="shop-address-row"><label>City<input required value={address.city} onChange={(event) => addressField("city", event.currentTarget.value)} autoComplete="shipping address-level2" /></label><label>State<input required maxLength={2} value={address.state} onChange={(event) => addressField("state", event.currentTarget.value)} autoComplete="shipping address-level1" /></label><label>ZIP<input required value={address.zip} onChange={(event) => addressField("zip", event.currentTarget.value)} autoComplete="shipping postal-code" /></label></div></> : null}
      <label>Phone <small>(optional)</small><input type="tel" value={address.phone} onChange={(event) => addressField("phone", event.currentTarget.value)} autoComplete="tel" /></label>
      {cart?.requiresShipping ? <button className="button button-outline" disabled={state === "shipping"}>{state === "shipping" ? "Calling USPS..." : "Calculate USPS shipping"}</button> : null}
      {rates.length ? <fieldset className="shop-shipping-rates"><legend>Choose shipping</legend>{rates.map((rate) => <label key={rate.token}><input type="radio" name="shippingRate" checked={selectedToken === rate.token} onChange={() => setSelectedToken(rate.token)} /><span><strong>{rate.carrier} {rate.service}</strong><small>{rate.deliveryDays ? rate.deliveryDays + " estimated business days" : "Delivery estimate at checkout"}{rate.isEstimate ? " · Based on ZIP code and package weight" : ""}</small></span><b>{money(rate.amountCents)}</b></label>)}</fieldset> : null}
      <dl className="shop-order-totals"><div><dt>Merchandise</dt><dd>{money(cart?.subtotalCents || 0)}</dd></div><div><dt>Shipping</dt><dd>{cart?.requiresShipping ? shipping ? money(shipping.amountCents) : "Calculate above" : "Not required"}</dd></div><div><dt>Total</dt><dd>{cart?.requiresShipping && !shipping ? "--" : money(total)}</dd></div></dl>
      <button className="button shop-checkout-button" type="button" onClick={checkout} disabled={(cart?.requiresShipping && !selectedToken) || state === "checkout"}>{state === "checkout" ? "Opening secure checkout..." : "Checkout"}</button>
      <p className="shop-secure-note">{cart?.requiresShipping ? "ZIP-based rates are estimates until live USPS rates are connected. Prices and inventory are checked again before payment. Stripe securely handles card details." : "Ticket availability is checked again before payment. Stripe securely handles card details."}</p>
    </form></div>
  </div></section>;
}
