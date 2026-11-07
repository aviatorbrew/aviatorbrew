"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ticketGuestLists, ticketGuest, type TicketGuest, type TicketGuestLists } from "@/lib/shop-tickets";
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
  productType?: string;
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

export function ShopCartCheckout({ checkoutStatus, sessionId }: { checkoutStatus?: string; sessionId?: string }) {
  const { items, hydrated, updateQuantity, removeItem, clearCart } = useShopCart();
  const formRef = useRef<HTMLFormElement>(null), checkoutBusy = useRef(false);
  const [firstName,setFirstName]=useState(""),[lastName,setLastName]=useState(""),[guestLists,setGuestLists]=useState<TicketGuestLists>({});
  const [paymentState,setPaymentState]=useState<"checking"|"paid"|"pending"|"invalid">("checking");
  const [cart, setCart] = useState<PreparedCart | null>(null);
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [selectedToken, setSelectedToken] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState<Address>({ name: "", street1: "", street2: "", city: "", state: "NC", zip: "", country: "US", phone: "" });
  const [state, setState] = useState<"idle" | "loading" | "shipping" | "checkout" | "error">("idle");
  const [message, setMessage] = useState("");
  const [unavailableVariantIds, setUnavailableVariantIds] = useState<number[]>([]);
  const requestItems = useMemo(() => items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })), [items]);
  const requestKey = JSON.stringify(requestItems);

  useEffect(()=>{
    if(checkoutStatus!=="success")return;
    if(!sessionId){setPaymentState("invalid");return;}
    const c=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function check(){try{const r=await fetch("/api/shop/order-status?sessionId="+encodeURIComponent(sessionId!),{cache:"no-store",signal:c.signal}),b=await r.json();if(!r.ok){setPaymentState("invalid");return;}setPaymentState(b.status==="paid"?"paid":"pending");if(b.status==="paid")clearCart();else timer=setTimeout(check,3000);}catch{if(!c.signal.aborted)setPaymentState("pending");}}
    check();return()=>{c.abort();clearTimeout(timer);};
  },[checkoutStatus,sessionId,clearCart]);

  useEffect(() => {
    if (!hydrated || checkoutStatus === "success") return;
    setRates([]); setSelectedToken("");
    if (!requestItems.length) { setCart(null); setState("idle"); return; }
    const controller = new AbortController();
    setState("loading"); setMessage(""); setUnavailableVariantIds([]);
    fetch("/api/shop/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: requestItems }), signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          setCart(null);
          setUnavailableVariantIds(Array.isArray(body.unavailableVariantIds) ? body.unavailableVariantIds.map(Number).filter(Number.isInteger) : []);
          throw new Error(body.error || "Could not validate your cart.");
        }
        setCart(body as PreparedCart); setUnavailableVariantIds([]); setState("idle");
      })
      .catch((error) => { if (error.name !== "AbortError") { setCart(null); setState("error"); setMessage(error.message); } });
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
      const purchaser=ticketGroups.length?ticketGuest({firstName,lastName}):null;
      const response = await fetch("/api/shop/shipping-rates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: requestItems, address: {...address,name:purchaser?`${purchaser.firstName} ${purchaser.lastName}`:address.name} }) });
      const body = await response.json() as { rates?: ShippingRate[]; cart?: PreparedCart; error?: string };
      if (!response.ok || !body.rates?.length) throw new Error(body.error || "USPS did not return a shipping rate.");
      setCart(body.cart || cart); setRates(body.rates); setSelectedToken(body.rates[0].token); setState("idle");
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Could not calculate USPS shipping."); }
  }

  const ticketGroups=useMemo(()=>{const groups=new Map<number,{productId:number;productName:string;quantity:number}>();for(const item of cart?.merchandiseItems||[])if(item.productType==="ticket"){const g=groups.get(item.productId);groups.set(item.productId,{productId:item.productId,productName:item.productName,quantity:(g?.quantity||0)+item.quantity});}return [...groups.values()];},[cart]);
  function namesFor(group:{productId:number;quantity:number}):TicketGuest[]{return Array.from({length:group.quantity},(_,i)=>({firstName:guestLists[group.productId]?.[i]?.firstName??(i===0?firstName:""),lastName:guestLists[group.productId]?.[i]?.lastName??(i===0?lastName:"")}));}
  function guestField(group:{productId:number;quantity:number},index:number,key:keyof TicketGuest,value:string){const names=namesFor(group);names[index]={...names[index],[key]:value};setGuestLists(old=>({...old,[group.productId]:names}));}
  async function checkout() {
    if(checkoutBusy.current||!formRef.current?.reportValidity())return;
    let ticketNames:TicketGuestLists={};
    try{if(ticketGroups.length)ticketGuest({firstName,lastName});ticketNames=ticketGuestLists(Object.fromEntries(ticketGroups.map(g=>[g.productId,namesFor(g)])),(cart?.merchandiseItems||[]).map(i=>({...i,productType:i.productType||"merchandise"})));}catch(e){setMessage(e instanceof Error?e.message:"Check every guest name.");setState("error");return;}
    if (cart?.requiresShipping && !selectedToken) { setState("error"); setMessage("Calculate and choose a shipping rate first."); return; }
    checkoutBusy.current=true;setState("checkout"); setMessage("");
    try {
      const response = await fetch("/api/shop/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: requestItems, email, name: address.name, firstName,lastName,ticketGuests:ticketNames,phone: address.phone,address:{...address,name:ticketGroups.length?firstName+" "+lastName:address.name},shippingToken: selectedToken }) });
      const body = await response.json() as { url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error || "Checkout could not be opened.");
      window.location.assign(body.url);
    } catch (error) { checkoutBusy.current=false;setState("error"); setMessage(error instanceof Error ? error.message : "Checkout could not be opened."); }
  }

  function emptyCart() {
    if (!window.confirm("Empty every item from your Aviator cart?")) return;
    clearCart();
    setCart(null); setRates([]); setSelectedToken(""); setUnavailableVariantIds([]); setMessage(""); setState("idle");
  }

  if(checkoutStatus==="success")return <section className="section shop-cart-page"><div className="content-wrap shop-order-confirmation"><p className="eyebrow">{paymentState==="paid"?"Order confirmed":"Payment status"}</p><h1>{paymentState==="paid"?"Payment received.":paymentState==="invalid"?"We could not verify this order.":"Confirming your payment…"}</h1><p>{paymentState==="paid"?"Your paid order is recorded. Check your email for your confirmation and any ticket-holder details.":paymentState==="invalid"?"Use the confirmation link from your checkout or contact Aviator with your receipt. This page does not confirm a payment.":"Stripe is still confirming your order. Your guest list is added only after payment is verified. Please do not pay again while this is pending."}</p><Link className="button" href="/shop-new">Return to shop</Link></div></section>;

  if (!hydrated || state === "loading") return <section className="section shop-cart-page"><div className="content-wrap shop-cart-empty"><p className="eyebrow">Loading manifest</p><h1>Checking your cart...</h1></div></section>;
  if (!items.length) return <section className="section shop-cart-page"><div className="content-wrap shop-cart-empty"><p className="eyebrow">Cart 00</p><h1>Your cargo hold is empty.</h1><p>Choose something from the Aviator catalog and it will stay here until checkout.</p><Link className="button" href="/shop-new">Browse the catalog</Link></div></section>;

  const shipping = rates.find((rate) => rate.token === selectedToken);
  const total = (cart?.subtotalCents || 0) + (shipping?.amountCents || 0);
  const threshold = cart?.settings.bonusThresholdCents || 2000;
  const bonusRemaining = Math.max(0, threshold + 1 - (cart?.subtotalCents || 0));
  const freeShippingRemaining = Math.max(0, 7500 - (cart?.subtotalCents || 0));
  const displayItems: PreparedItem[] = cart?.merchandiseItems || items.map((item) => ({ ...item, productId: 0, isBonus: false }));
  const cartNeedsAttention = !cart && state === "error";

  return <section className="section shop-cart-page"><div className="content-wrap">
    <header className="shop-cart-heading"><div><p className="eyebrow">Cargo manifest</p><h1>Your Aviator cart.</h1></div><div className="shop-cart-heading-actions"><Link href="/shop-new">Continue shopping</Link><button className="button button-outline shop-empty-cart-button" type="button" onClick={emptyCart}>Empty cart</button></div></header>
    {checkoutStatus === "cancel" ? <p className="shop-cart-notice">Checkout was canceled. Your cart is still here.</p> : null}
    {message ? <p className="shop-new-error" role="alert">{message}</p> : null}
    <div className="shop-checkout-grid"><div className="shop-cart-manifest">
      <div className="shop-cart-items">{displayItems.map((item) => {
        const stored = items.find((entry) => entry.variantId === item.variantId);
        const unavailable = unavailableVariantIds.includes(item.variantId);
        return <article className={unavailable ? "is-unavailable" : ""} key={item.variantId}>{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <div className="shop-cart-image-placeholder">AVIATOR</div>}<div><h2>{item.productName}</h2><p>{item.variantLabel}</p>{unavailable ? <span className="shop-cart-item-warning">Needs attention</span> : null}<strong>{money(item.unitPriceCents)}</strong></div><label>Qty<input type="number" min="1" max={stored?.maxQuantity || 25} value={stored?.quantity || item.quantity} onChange={(event) => updateQuantity(item.variantId, Number(event.currentTarget.value))} /></label><button type="button" onClick={() => removeItem(item.variantId)} aria-label={"Remove " + item.productName}>Remove</button></article>;
      })}</div>
      {cart && !cart.ticketOnly ? <div className={"shop-bonus-panel " + (cart?.bonusItem ? "is-earned" : "")}><span aria-hidden="true">{cart?.bonusItem ? "BONUS LOADED" : "BONUS APPROACH"}</span><div><strong>{cart?.bonusItem ? cart.bonusItem.productName : "Free Aviator sticker over " + money(threshold)}</strong><p>{cart?.bonusItem ? "Added automatically at no charge." : "Add " + money(bonusRemaining) + " more in merchandise to unlock it."}</p></div></div> : null}
      {cart?.bonusItem ? <article className="shop-cart-bonus-line">{cart.bonusItem.imageUrl ? <img src={cart.bonusItem.imageUrl} alt="" /> : null}<div><h2>{cart.bonusItem.productName}</h2><p>{cart.bonusItem.variantLabel}</p></div><strong>FREE</strong></article> : null}
    </div>
    {cartNeedsAttention ? <aside className="shop-cart-recovery"><p className="eyebrow">Cart update required</p><h2>Review the highlighted item.</h2><p>Its availability changed after it was added. Adjust its quantity, remove it, or empty the cart to continue.</p><button className="button" type="button" onClick={emptyCart}>Empty cart</button><Link href="/shop-new">Return to catalog</Link></aside> : <form ref={formRef} className="shop-shipping-form" onSubmit={cart?.requiresShipping ? calculateShipping : (event) => { event.preventDefault(); checkout(); }}>
      <p className="eyebrow">{cart?.ticketOnly ? "Ticket holder" : "Delivery coordinates"}</p><h2>{cart?.ticketOnly ? "Event admission" : "USPS shipping"}</h2>{cart?.requiresShipping ? <p className="shop-free-shipping-note">{freeShippingRemaining ? "Add " + money(freeShippingRemaining) + " more for free shipping." : "Free shipping unlocked for this order."}</p> : <p className="shop-free-shipping-note">Tickets are delivered by email. No shipping address is needed.</p>}
      <label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.currentTarget.value)} autoComplete="email" /></label>
      {ticketGroups.length?<div className="shop-ticket-name-row"><label>Purchaser first name<input required maxLength={60} value={firstName} onChange={e=>setFirstName(e.target.value)} autoComplete="given-name"/></label><label>Purchaser last name<input required maxLength={60} value={lastName} onChange={e=>setLastName(e.target.value)} autoComplete="family-name"/></label></div>:<label>Full name<input required value={address.name} onChange={(event) => addressField("name", event.currentTarget.value)} autoComplete="name" /></label>}
      {cart?.requiresShipping ? <><label>Street address<input required value={address.street1} onChange={(event) => addressField("street1", event.currentTarget.value)} autoComplete="shipping address-line1" /></label><label>Apartment, suite, etc. <small>(optional)</small><input value={address.street2} onChange={(event) => addressField("street2", event.currentTarget.value)} autoComplete="shipping address-line2" /></label><div className="shop-address-row"><label>City<input required value={address.city} onChange={(event) => addressField("city", event.currentTarget.value)} autoComplete="shipping address-level2" /></label><label>State<input required maxLength={2} value={address.state} onChange={(event) => addressField("state", event.currentTarget.value)} autoComplete="shipping address-level1" /></label><label>ZIP<input required value={address.zip} onChange={(event) => addressField("zip", event.currentTarget.value)} autoComplete="shipping postal-code" /></label></div></> : null}
      <label>Phone <small>(optional)</small><input type="tel" value={address.phone} onChange={(event) => addressField("phone", event.currentTarget.value)} autoComplete="tel" /></label>
      {ticketGroups.map(group=><fieldset className="shop-ticket-guests" key={group.productId}><legend>{group.productName} · {group.quantity} ticket holders</legend><p>Enter one first and last name per ticket. Include yourself if attending; you can change the first guest if you are buying for someone else. These names appear on the check-in list.</p>{namesFor(group).map((guest,index)=><div className="shop-ticket-name-row" key={index}><label>Ticket {index+1} first name<input required maxLength={60} value={guest.firstName} onChange={e=>guestField(group,index,"firstName",e.target.value)} autoComplete="off"/></label><label>Ticket {index+1} last name<input required maxLength={60} value={guest.lastName} onChange={e=>guestField(group,index,"lastName",e.target.value)} autoComplete="off"/></label></div>)}</fieldset>)}
      {cart?.requiresShipping ? <button className="button button-outline" disabled={state === "shipping"}>{state === "shipping" ? "Calling USPS..." : "Calculate USPS shipping"}</button> : null}
      {rates.length ? <fieldset className="shop-shipping-rates"><legend>Choose shipping</legend>{rates.map((rate) => <label key={rate.token}><input type="radio" name="shippingRate" checked={selectedToken === rate.token} onChange={() => setSelectedToken(rate.token)} /><span><strong>{rate.carrier} {rate.service}</strong><small>{rate.deliveryDays ? rate.deliveryDays + " estimated business days" : "Delivery estimate at checkout"}{rate.isEstimate ? " · Based on ZIP code and package weight" : ""}</small></span><b>{money(rate.amountCents)}</b></label>)}</fieldset> : null}
      <dl className="shop-order-totals"><div><dt>Merchandise</dt><dd>{money(cart?.subtotalCents || 0)}</dd></div><div><dt>Shipping</dt><dd>{cart?.requiresShipping ? shipping ? money(shipping.amountCents) : "Calculate above" : "Not required"}</dd></div><div><dt>Total</dt><dd>{cart?.requiresShipping && !shipping ? "--" : money(total)}</dd></div></dl>
      <button className="button shop-checkout-button" type="button" onClick={checkout} disabled={(cart?.requiresShipping && !selectedToken) || state === "checkout"}>{state === "checkout" ? "Opening secure checkout..." : "Checkout"}</button>
      <p className="shop-secure-note">{cart?.requiresShipping ? "ZIP-based rates are estimates until live USPS rates are connected. Prices and inventory are checked again before payment. Stripe securely handles card details." : "Ticket availability is checked again before payment. Stripe securely handles card details."}</p>
    </form>}</div>
  </div></section>;
}
