"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { CateringMenuItem } from "@/lib/catering-menu-scanner";

type SubmitState = "idle" | "submitting" | "success" | "error";
type SelectedOrderRow = { id: string; group: string; name: string; quantity: number; option: string; note: string; priceCents?: number; optionPriceCents: number };

const CATERING_TAX_RATE = 0.0725;
const PICKUP_START_TIME = "10:00";
const PICKUP_END_TIME = "19:00";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function optionPriceCents(option: string) {
  const matches = Array.from(option.matchAll(/\+\$(\d+(?:\.\d{2})?)/g));
  return matches.reduce((sum, match) => sum + Math.round(Number(match[1]) * 100), 0);
}

function pickupTimeIsAvailable(value: string) {
  return !value || (value >= PICKUP_START_TIME && value <= PICKUP_END_TIME);
}

export function CateringOrderForm({ items, menuUrl, scanSource }: { items: CateringMenuItem[]; menuUrl?: string; scanSource: "scanned" | "fallback" }) {
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");
  const [showOrder, setShowOrder] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [pickupDate, setPickupDate] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<Record<string, string>>({});
  const groups = useMemo(() => Array.from(new Set(items.map((item) => item.group))), [items]);

  const selectedRows = useMemo<SelectedOrderRow[]>(() => items.flatMap((item) => {
    const quantity = Number(quantities[item.id] || 0);
    if (!quantity) return [];
    const option = options[item.id] || "";
    return [{ id: item.id, group: item.group, name: item.name, quantity, option, note: item.note || "", priceCents: item.priceCents, optionPriceCents: optionPriceCents(option) }];
  }), [items, quantities, options]);

  const itemCount = selectedRows.reduce((sum, row) => sum + row.quantity, 0);
  const subtotalCents = selectedRows.reduce((sum, row) => sum + row.quantity * ((row.priceCents || 0) + row.optionPriceCents), 0);
  const taxCents = Math.round(subtotalCents * CATERING_TAX_RATE);
  const totalCents = subtotalCents + taxCents;
  const unpricedCount = selectedRows.filter((row) => !row.priceCents).length;

  useEffect(() => {
    if (!showOrder) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) { if (event.key === "Escape") setShowOrder(false); }
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [showOrder]);

  function updateQuantity(id: string, value: string) {
    setConfirmed(false);
    setQuantities((current) => ({ ...current, [id]: value }));
  }

  function updateOption(id: string, value: string) {
    setConfirmed(false);
    setOptions((current) => ({ ...current, [id]: value }));
  }

  function lineTotal(row: SelectedOrderRow) {
    return row.quantity * ((row.priceCents || 0) + row.optionPriceCents);
  }

  function orderSummary() {
    const lines = selectedRows.map((row) => {
      const unitCents = (row.priceCents || 0) + row.optionPriceCents;
      const lineCents = lineTotal(row);
      return row.group + " - " + row.name + ": qty " + row.quantity + (row.option ? "; option: " + row.option : "") + (row.note ? "; menu note: " + row.note : "") + "; unit " + (row.priceCents ? money(unitCents) : "price to confirm") + "; line " + (row.priceCents ? money(lineCents) : "price to confirm");
    });
    if (lines.length) {
      lines.push("", "Subtotal: " + money(subtotalCents), "Estimated tax: " + money(taxCents), "Estimated total: " + money(totalCents));
      if (unpricedCount) lines.push("Unpriced scanned items: " + unpricedCount + " item(s) require final pricing confirmation.");
    }
    return lines.join("\n");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pickupTimeIsAvailable(pickupTime)) { setState("error"); setMessage("Catering pickup is available from 10:00 AM to 7:00 PM. Please choose a pickup time in that window."); return; }
    if (!confirmed) { setState("error"); setMessage("Please confirm the food order before sending the catering request."); return; }
    setState("submitting");
    setMessage("");
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const summary = orderSummary();
    try {
      const response = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "catering", ...payload, cateringMenu: menuUrl || "", menuScanSource: scanSource, estimatedSubtotal: money(subtotalCents), estimatedTax: money(taxCents), estimatedTotal: money(totalCents), foodOrderConfirmed: confirmed ? "yes" : "no", orderSummary: summary || "No structured food-order items entered." }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not send catering request.");
      setState("success");
      setMessage("Thanks - your catering request is in the flight plan. The events team will confirm availability, total, timing, and pickup details.");
      form.reset();
      setPickupDate("");
      setPickupTime("");
      setQuantities({});
      setOptions({});
      setConfirmed(false);
      setShowOrder(false);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Could not send catering request.");
    }
  }

  return <form className="inquiry-form catering-order-form" onSubmit={submit}>
    <input name="website" className="honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" />
    <label>Name<input name="name" required autoComplete="name" /></label>
    <label>Email<input type="email" name="email" required autoComplete="email" /></label>
    <label>Phone<input name="phone" type="tel" autoComplete="tel" /></label>
    <label>Pickup date<input name="pickupDate" type="date" value={pickupDate} onChange={(event) => setPickupDate(event.currentTarget.value)} /></label>
    <label>Preferred pickup time<input name="pickupTime" type="time" min={PICKUP_START_TIME} max={PICKUP_END_TIME} value={pickupTime} onChange={(event) => setPickupTime(event.currentTarget.value)} /><small>Pickup available 10:00 AM to 7:00 PM.</small></label>
    <label>Estimated guest count<input name="guestCount" inputMode="numeric" /></label>
    <div className="catering-order-toggle"><button className="button button-outline" type="button" onClick={() => setShowOrder(true)}>Enter food order</button><span>{selectedRows.length ? selectedRows.length + " menu item" + (selectedRows.length === 1 ? "" : "s") + " selected - " + money(totalCents) + " est. total" : "Food order not entered yet"}</span></div>
    <div className="catering-order-summary" aria-live="polite">
      <p className="eyebrow">Food order review</p>
      {selectedRows.length ? <>
        <ul>{selectedRows.map((row) => <li key={row.id}><strong>{row.quantity} x {row.name}</strong><span>{row.group}{row.option ? " - " + row.option : ""}{row.note ? " - " + row.note : ""}{row.priceCents ? " - " + money(lineTotal(row)) : " - price to confirm"}</span></li>)}</ul>
        <div className="catering-order-totals" aria-label="Estimated catering order totals"><div><span>Subtotal</span><strong>{money(subtotalCents)}</strong></div><div><span>Estimated tax</span><strong>{money(taxCents)}</strong></div><div><span>Total</span><strong>{money(totalCents)}</strong></div></div>
        {unpricedCount ? <p className="catering-price-note">Some scanned items do not have prices. The events team will confirm final pricing.</p> : null}
        <label className="captcha-check catering-confirm-check"><input type="checkbox" name="foodOrderConfirmed" value="yes" checked={confirmed} onChange={(event) => setConfirmed(event.currentTarget.checked)} required /><span>Food order confirmed</span></label>
      </> : <>
        <p>No menu items selected yet. Click Enter food order to choose items from the current Catering To Go menu.</p>
        <label className="captcha-check catering-confirm-check"><input type="checkbox" name="foodOrderConfirmed" value="yes" checked={confirmed} onChange={(event) => setConfirmed(event.currentTarget.checked)} required /><span>I confirm I am sending notes only or will discuss food items with the events team.</span></label>
      </>}
    </div>
    {showOrder ? <div className="catering-order-modal" role="dialog" aria-modal="true" aria-labelledby="catering-order-title"><div className="catering-order-modal-card"><div className="catering-order-modal-body"><div className="catering-order-menu-pane"><div className="catering-order-modal-intro"><p className="eyebrow">Catering To Go menu</p><h2 id="catering-order-title">Enter food order</h2><p>Rows are generated from the latest uploaded Catering To Go menu. Final pricing and availability are confirmed by the Aviator events team.</p></div><div className="catering-order-builder" aria-label="Catering To Go menu and pricing">{groups.map((group) => <section key={group}><h3>{group}</h3><div>{items.filter((item) => item.group === group).map((item) => <article key={item.id}><div><strong>{item.name}</strong>{item.note ? <small>{item.note}</small> : null}</div><label>Qty<input type="number" min="0" max="99" inputMode="numeric" value={quantities[item.id] || ""} onChange={(event) => updateQuantity(item.id, event.currentTarget.value)} /></label>{item.options?.length ? <label>Option<select value={options[item.id] || ""} onChange={(event) => updateOption(item.id, event.currentTarget.value)}><option value="">Choose</option>{item.options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label> : null}</article>)}</div></section>)}</div></div><aside className="catering-order-live-summary" aria-label="Selected items and live catering order summary"><button className="catering-order-close" type="button" onClick={() => setShowOrder(false)} aria-label="Close food order window">Close</button><p className="eyebrow">Selected items</p><h3>Order total</h3><dl><div><dt>Pickup date</dt><dd>{pickupDate || "Not set"}</dd></div><div><dt>Pickup time</dt><dd>{pickupTime || "Not set"}</dd></div><div><dt>Items</dt><dd>{itemCount}</dd></div></dl><div className="catering-live-selected-items" aria-label="Selected menu items">{selectedRows.length ? selectedRows.map((row) => <article key={row.id}><div><strong>{row.quantity} x {row.name}</strong><span>{row.option || row.note || row.group}</span></div><b>{row.priceCents ? money(lineTotal(row)) : "Confirm"}</b></article>) : <p>No items selected yet.</p>}</div><div className="catering-order-total-list"><div><span>Subtotal</span><strong>{money(subtotalCents)}</strong></div><div><span>Estimated tax</span><strong>{money(taxCents)}</strong></div><div><span>Total</span><strong>{money(totalCents)}</strong></div></div>{unpricedCount ? <p>Some scanned items do not have prices. The events team will confirm final pricing.</p> : null}<button className="button" type="button" onClick={() => setShowOrder(false)}>Done reviewing food order</button></aside></div></div></div> : null}
    <label>Questions, notes, or special requests<textarea name="message" required rows={5} placeholder="Tell us anything the menu form does not cover, including food allergies, timing details, setup requests, beer or THC beverage questions, or delivery/setup requests." /></label>
    <label className="captcha-check"><input type="checkbox" name="humanCheck" value="yes" required /><span>I am a real person submitting this form.</span></label>
    <button className="button" disabled={state === "submitting"}>{state === "submitting" ? "Sending..." : "Send catering request"}</button>
    {state !== "idle" && <p className={"form-message " + (state === "error" ? "error" : "success")} role={state === "error" ? "alert" : "status"}>{message}</p>}
  </form>;
}
