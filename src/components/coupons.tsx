"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Offer = { id: string; title: string; description: string; terms: string; code: string; expiresAt: string; limit?: number; issued?: number; redeemed?: number };
type Blackout = { date: string; label: string };

export function CouponDeck({ offers, allowed, reason }: { offers: Offer[]; allowed: boolean; reason: string }) {
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState("");

  async function claim(offerId: string) {
    setBusy(offerId); setMessage(""); setImageUrl("");
    try {
      const response = await fetch("/api/coupons", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ offerId }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Coupon unavailable.");
      setImageUrl(body.imageUrl); setMessage("Your coupon is ready. Save the image and show its QR code at the bar before ordering.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Coupon unavailable."); }
    finally { setBusy(""); }
  }

  return <section className="section coupon-deck-section"><div className="content-wrap"><div className="section-heading"><div><p className="eyebrow">Current specials</p><h2>Clearance for <em>something good.</em></h2></div><p>{allowed ? "Choose a current offer, save the coupon image, and show its QR code at the bar." : reason}</p></div>{message && <p className="coupon-message" role="status">{message}</p>}{imageUrl && <div className="coupon-issued"><img src={imageUrl} alt="Your Aviator coupon with QR code" /><a className="button" href={imageUrl} download="aviator-coupon.svg">Save coupon image</a></div>}{offers.length ? <div className="coupon-grid">{offers.map((offer) => <article className="coupon-offer" key={offer.id}><p className="eyebrow">{offer.code}</p><h3>{offer.title}</h3><p>{offer.description}</p><dl><div><dt>Expires</dt><dd>{offer.expiresAt}</dd></div><div><dt>Restrictions</dt><dd>{offer.terms || "Not valid Fridays, Saturdays, or special events."}</dd></div></dl><button className="button" onClick={() => claim(offer.id)} disabled={!allowed || busy === offer.id}>{busy === offer.id ? "Preparing..." : "Get coupon"}</button></article>)}</div> : <div className="coupon-empty"><p className="eyebrow">No active offers</p><h2>Check back soon.</h2><p>New Aviator specials will appear here when they are cleared for takeoff.</p></div>}</div></section>;
}

export function CouponSpotlight({ offers, allowed, reason }: { offers: Offer[]; allowed: boolean; reason: string }) {
  const [busy, setBusy] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [message, setMessage] = useState("");
  async function claim(offerId: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/coupons", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ offerId }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Coupon unavailable.");
      setImageUrl(body.imageUrl); setMessage("Coupon ready. Open it full size or save the image before ordering.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Coupon unavailable."); }
    finally { setBusy(false); }
  }
  return <section className="home-coupon-spotlight"><div className="content-wrap"><div><p className="eyebrow">Current Aviator offer</p><h2>{offers[0].title}</h2><p>{offers[0].description}</p><p className="home-coupon-instructions"><strong>How to use it:</strong> Get your unique QR code, show it to your bartender or server before ordering, and follow the staff instructions shown on the coupon.</p><p className="home-coupon-terms">{offers[0].terms || "Not valid Fridays, Saturdays, or during special events."} Expires {offers[0].expiresAt}.</p><button className="button" type="button" onClick={() => claim(offers[0].id)} disabled={!allowed || busy}>{busy ? "Preparing..." : "Get this coupon"}</button>{!allowed ? <p className="home-coupon-unavailable">{reason}</p> : null}{message ? <p className="coupon-message" role="status">{message}</p> : null}{imageUrl ? <div className="home-coupon-issued" aria-live="polite"><div className="home-coupon-issued-copy"><p className="eyebrow">Coupon issued</p><h3>{offers[0].title}</h3><dl><div><dt>Code</dt><dd>{offers[0].code}</dd></div><div><dt>Expires</dt><dd>{offers[0].expiresAt}</dd></div></dl><p>Open the coupon full size, then save it to your phone. Show the QR code to staff before ordering.</p><div className="home-coupon-issued-actions"><a className="button" href={imageUrl} target="_blank" rel="noreferrer">Open full size</a><a className="button button-outline" href={imageUrl} download="aviator-coupon.svg">Save coupon image</a></div></div><div className="home-coupon-qr"><img src={imageUrl} alt="Your Aviator coupon with QR code" /></div></div> : null}</div><div className="home-coupon-count"><span>{offers.length > 1 ? "+" + (offers.length - 1) + " more current offer" + (offers.length === 2 ? "" : "s") : "Limited-time offer"}</span><a href="/coupons">View all coupons</a></div></div></section>;
}

export function CouponManager({ accessKey }: { accessKey: string }) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [blackouts, setBlackouts] = useState<Blackout[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useCallback((init: RequestInit = {}) => fetch("/api/coupons/manage", { ...init, headers: { "content-type": "application/json", ...(init.headers || {}), "x-menu-library-key": accessKey } }), [accessKey]);
  const load = useCallback(async () => {
    const response = await request();
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load coupons.");
    setOffers(body.offers); setBlackouts(body.blackouts);
  }, [request]);

  useEffect(() => { load().catch((error) => setMessage(error instanceof Error ? error.message : "Could not load coupons.")); }, [load]);

  async function submitOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await request({ method: "POST", body: JSON.stringify({ action: "offer", ...values }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not create coupon.");
      event.currentTarget.reset(); setOffers(body.offers); setBlackouts(body.blackouts); setMessage("Coupon is live on the public Coupons page.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create coupon."); }
    finally { setBusy(false); }
  }

  async function submitBlackout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await request({ method: "POST", body: JSON.stringify({ action: "blackout", ...values }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not add blackout.");
      event.currentTarget.reset(); setOffers(body.offers); setBlackouts(body.blackouts); setMessage("Special-event blackout added.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not add blackout."); }
    finally { setBusy(false); }
  }

  async function remove(type: "offer" | "blackout", id: string) {
    if (!window.confirm("Remove this item?")) return;
    const response = await fetch("/api/coupons/manage?type=" + type + "&id=" + encodeURIComponent(id), { method: "DELETE", headers: { "x-menu-library-key": accessKey } });
    const body = await response.json();
    if (!response.ok) { setMessage(body.error || "Could not remove item."); return; }
    setOffers(body.offers); setBlackouts(body.blackouts);
  }

  return <section className="coupon-manager"><div><p className="eyebrow">Coupon operations</p><h2>Coupons + blackouts</h2><p>Create the exact special you want guests to see. Every claimed coupon has a unique QR code and is redeemed once at the bar.</p></div><p className="media-message" role="status">{message}</p><div className="coupon-manager-grid"><form onSubmit={submitOffer}><h3>Feature a coupon</h3><label>Offer title<input name="title" required placeholder="Example: Sunday pint special" /></label><label>Offer description<textarea name="description" required rows={3} placeholder="Describe exactly what guests receive." /></label><label>Coupon code (optional)<input name="code" placeholder="SUNDAYPOUR" /></label><label>Expiration date<input name="expiresAt" type="date" required /></label><label>Coupon quantity<input name="limit" type="number" min="1" max="10000" defaultValue="25" required /></label><label>Bartender + server instructions<textarea name="terms" rows={3} placeholder="Scan the guest QR code before ordering. Apply one free pint. Mark redeemed after use." /></label><button className="button" disabled={busy}>{busy ? "Saving..." : "Publish coupon"}</button></form><form onSubmit={submitBlackout}><h3>Block a special event</h3><label>Event date<input name="date" type="date" required /></label><label>Event name<input name="label" required placeholder="Amphitheater concert" /></label><button className="button button-outline" disabled={busy}>{busy ? "Saving..." : "Add blackout"}</button><h3>Scheduled blackouts</h3><ul className="coupon-manager-list">{blackouts.length ? blackouts.map((item) => <li key={item.date}><span>{item.date} - {item.label}</span><button type="button" onClick={() => remove("blackout", item.date)}>Remove</button></li>) : <li>No special-event blackouts added.</li>}</ul></form></div><div><h3>Published coupons</h3><ul className="coupon-manager-list">{offers.length ? offers.map((offer) => <li key={offer.id}><span><strong>{offer.title}</strong> - expires {offer.expiresAt}<br />Issued: {offer.issued || 0}; Redeemed: {offer.redeemed || 0}; Remaining: {Math.max((offer.limit || 0) - (offer.issued || 0), 0)}</span><button type="button" onClick={() => remove("offer", offer.id)}>Remove</button></li>) : <li>No coupons published.</li>}</ul></div></section>;
}
