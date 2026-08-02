"use client";

import { FormEvent, useMemo, useState } from "react";
import type { CateringMenuItem } from "@/lib/catering-menu-scanner";

type SubmitState = "idle" | "submitting" | "success" | "error";

export function CateringOrderForm({ items, menuUrl, scanSource }: { items: CateringMenuItem[]; menuUrl?: string; scanSource: "scanned" | "fallback" }) {
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");
  const [showOrder, setShowOrder] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<Record<string, string>>({});
  const groups = useMemo(() => Array.from(new Set(items.map((item) => item.group))), [items]);
  const selectedCount = useMemo(() => Object.values(quantities).filter((value) => Number(value) > 0).length, [quantities]);

  function orderSummary() {
    return items.flatMap((item) => {
      const quantity = Number(quantities[item.id] || 0);
      if (!quantity) return [];
      const option = options[item.id];
      return [item.group + " - " + item.name + ": qty " + quantity + (option ? "; option: " + option : "") + (item.note ? "; menu note: " + item.note : "")];
    }).join("\n");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage("");
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const summary = orderSummary();
    try {
      const response = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "catering", ...payload, cateringMenu: menuUrl || "", menuScanSource: scanSource, orderSummary: summary || "No structured food-order items entered." }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not send catering request.");
      setState("success");
      setMessage("Thanks - your catering request is in the flight plan. The events team will confirm availability, total, timing, and pickup details.");
      form.reset();
      setQuantities({});
      setOptions({});
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
    <label>Pickup date<input name="pickupDate" type="date" /></label>
    <label>Preferred pickup time<input name="pickupTime" type="time" /></label>
    <label>Estimated guest count<input name="guestCount" inputMode="numeric" /></label>
    <div className="catering-order-toggle"><button className="button button-outline" type="button" onClick={() => setShowOrder((value) => !value)}>{showOrder ? "Hide food order" : "Enter food order"}</button><span>{selectedCount ? selectedCount + " menu item" + (selectedCount === 1 ? "" : "s") + " selected" : "Food order section is collapsed"}</span></div>
    {showOrder ? <div className="catering-order-builder" aria-label="Catering To Go menu order form">
      <p className="catering-scan-note">Food order rows are generated from the latest uploaded Catering To Go menu. Final pricing and availability are confirmed by the Aviator events team.</p>
      {groups.map((group) => <section key={group}><h3>{group}</h3><div>{items.filter((item) => item.group === group).map((item) => <article key={item.id}><div><strong>{item.name}</strong>{item.note ? <small>{item.note}</small> : null}</div><label>Qty<input type="number" min="0" max="99" inputMode="numeric" value={quantities[item.id] || ""} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.currentTarget.value }))} /></label>{item.options?.length ? <label>Option<select value={options[item.id] || ""} onChange={(event) => setOptions((current) => ({ ...current, [item.id]: event.currentTarget.value }))}><option value="">Choose</option>{item.options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label> : null}</article>)}</div></section>)}
    </div> : null}
    <label>Questions, notes, or special requests<textarea name="message" required rows={5} placeholder="Tell us anything the menu form does not cover, including food allergies, timing details, setup requests, beer or THC beverage questions, or delivery/setup requests." /></label>
    <label className="captcha-check"><input type="checkbox" name="humanCheck" value="yes" required /><span>I am a real person submitting this form.</span></label>
    <button className="button" disabled={state === "submitting"}>{state === "submitting" ? "Sending..." : "Send catering request"}</button>
    {state !== "idle" && <p className={"form-message " + (state === "error" ? "error" : "success")} role={state === "error" ? "alert" : "status"}>{message}</p>}
  </form>;
}
