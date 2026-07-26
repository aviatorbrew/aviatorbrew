"use client";

import { useMemo, useState } from "react";

export type KegItem = { beerName: string; sixthBblKegs: number; fiftyLKegs: number; totalBbl: number; sixtelsAvailableViaBackfill?: number };

export function KegOrderForm({ items }: { items: KegItem[] }) {
  const [selected, setSelected] = useState<KegItem | null>(null);
  const [packageSize, setPackageSize] = useState<"1/6 bbl" | "50 L">("1/6 bbl");
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const available = selected ? (packageSize === "1/6 bbl" ? selected.sixthBblKegs : selected.fiftyLKegs) : 0;
  const orderable = useMemo(() => items.filter((item) => item.sixthBblKegs > 0 || item.fiftyLKegs > 0), [items]);

  function choose(item: KegItem) {
    setSelected(item);
    setPackageSize(item.sixthBblKegs > 0 ? "1/6 bbl" : "50 L");
    setState("idle"); setMessage("");
    document.getElementById("keg-order")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setState("sending"); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/keg-orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...Object.fromEntries(form.entries()), beerName: selected.beerName, packageSize }) });
      const body = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error || "We could not send your request.");
      setState("success"); setMessage(body.message || "Your keg request is on its way.");
      event.currentTarget.reset();
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Please try again."); }
  }

  return <><div className="keg-table-wrap"><table className="keg-table"><thead><tr><th scope="col">Beer</th><th scope="col">1/6 bbl</th><th scope="col">50 L</th><th scope="col">Total bbl</th><th scope="col"><span className="sr-only">Order</span></th></tr></thead><tbody>{items.map((keg) => <tr key={keg.beerName}><th scope="row">{keg.beerName}{keg.sixtelsAvailableViaBackfill ? <small>{keg.sixtelsAvailableViaBackfill} possible sixtels via backfill</small> : null}</th><td>{keg.sixthBblKegs}</td><td>{keg.fiftyLKegs}</td><td>{Number(keg.totalBbl).toFixed(1)}</td><td><button className="keg-order-button" type="button" onClick={() => choose(keg)} disabled={keg.sixthBblKegs < 1 && keg.fiftyLKegs < 1}>Order this keg</button></td></tr>)}</tbody></table></div>
    <section id="keg-order" className="keg-order-panel" aria-live="polite"><div><p className="eyebrow">Keg request</p><h2>{selected ? selected.beerName : "Select a keg to order."}</h2><p>{selected ? "Choose a package and quantity, then send your request to the Aviator keg-sales team." : "Click Order this keg in the live inventory to begin."}</p></div>{selected ? <form className="inquiry-form" onSubmit={submit}><input name="website" className="honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" /><label>Package<select value={packageSize} onChange={(event) => setPackageSize(event.target.value as "1/6 bbl" | "50 L")}><option value="1/6 bbl" disabled={selected.sixthBblKegs < 1}>1/6 bbl ({selected.sixthBblKegs} available)</option><option value="50 L" disabled={selected.fiftyLKegs < 1}>50 L ({selected.fiftyLKegs} available)</option></select></label><label>How many?<input name="quantity" type="number" min="1" max={available} defaultValue="1" key={selected.beerName + packageSize} required /><small>{available} currently available. Your request is confirmed by the keg-sales team.</small></label><label>Name<input name="name" autoComplete="name" required /></label><label>Phone<input name="phone" type="tel" autoComplete="tel" required /></label><label>Email<input name="email" type="email" autoComplete="email" required /></label><label>Business or organization (optional)<input name="business" autoComplete="organization" /></label><label>Pickup notes (optional)<textarea name="notes" rows={3} /></label><p className="keg-newsletter-note">Submitting this request also adds you to the Aviator newsletter for beer releases, events, and specials.</p><button className="button" disabled={state === "sending"}>{state === "sending" ? "Sending request..." : "Send keg request"}</button>{state !== "idle" ? <p className={"keg-order-message " + state} role={state === "error" ? "alert" : "status"}>{message}</p> : null}</form> : null}</section>
  </>;
}
