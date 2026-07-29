"use client";

import { useMemo, useState } from "react";

export type KegItem = {
  beerName: string;
  category: string;
  packaging: string;
  sixthBblKegs: number;
  fiftyLKegs: number;
  totalBbl: number;
  sixthBblPriceCents?: number;
  fiftyLPriceCents?: number;
  caseSize?: string;
  casePriceCents?: number;
  case12PriceCents?: number;
  case16PriceCents?: number;
  case12Count?: number;
  case16Count?: number;
  caseCount?: number;
  sixtelsAvailableViaBackfill?: number;
};

type PackageSize = "1/6 bbl" | "50 L";

function money(cents?: number) {
  return typeof cents === "number" ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100) : "-";
}

function canOrder(item: KegItem, packageSize: PackageSize) {
  return packageSize === "1/6 bbl" ? item.sixthBblKegs > 0 && typeof item.sixthBblPriceCents === "number" : item.fiftyLKegs > 0 && typeof item.fiftyLPriceCents === "number";
}

function hasInventory(item: KegItem, packageSize: PackageSize) {
  return packageSize === "1/6 bbl" ? item.sixthBblKegs > 0 : item.fiftyLKegs > 0;
}

function caseCount(item: KegItem) { return (item.case12Count || 0) + (item.case16Count || 0) || (item.caseCount || 0); }
type CaseLine = { label: string; count: number; price: number | undefined };
function caseLines(item: KegItem): CaseLine[] {
  const lines = [
    (item.case12Count || item.case12PriceCents) ? { label: "12 oz cases", count: item.case12Count || 0, price: item.case12PriceCents } : null,
    (item.case16Count || item.case16PriceCents) ? { label: "16 oz cases", count: item.case16Count || 0, price: item.case16PriceCents } : null,
  ].filter((line): line is CaseLine => Boolean(line));
  if (lines.length) return lines;
  return (item.caseCount || item.casePriceCents) ? [{ label: item.caseSize || "Cases", count: item.caseCount || 0, price: item.casePriceCents }] : [];
}
function canShowCases(item: KegItem) {
  return caseCount(item) > 0 || caseLines(item).length > 0;
}

export function KegOrderForm({ items }: { items: KegItem[] }) {
  const [selected, setSelected] = useState<KegItem | null>(null);
  const [packageSize, setPackageSize] = useState<PackageSize>("1/6 bbl");
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const available = selected ? (packageSize === "1/6 bbl" ? selected.sixthBblKegs : selected.fiftyLKegs) : 0;
  const orderable = useMemo(() => items.filter((item) => canOrder(item, "1/6 bbl") || canOrder(item, "50 L")), [items]);

  function choose(item: KegItem) {
    setSelected(item);
    setPackageSize(canOrder(item, "1/6 bbl") ? "1/6 bbl" : "50 L");
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

  return <><div className="keg-table-wrap"><table className="keg-table"><thead><tr><th scope="col">Beer</th><th scope="col">Package size</th><th scope="col">1/6 BBL</th><th scope="col">1/6 price</th><th scope="col">50 L</th><th scope="col">50 L price</th><th scope="col">Cases</th><th scope="col"><span className="sr-only">Order</span></th></tr></thead><tbody>{items.map((keg) => {
    const isOrderable = orderable.includes(keg);
    return <tr key={keg.beerName}><th scope="row"><span>{keg.beerName}</span><small>{keg.category}{keg.sixtelsAvailableViaBackfill ? " · " + keg.sixtelsAvailableViaBackfill + " sixtels available by backfill" : ""}</small></th><td>{keg.packaging}</td><td>{hasInventory(keg, "1/6 bbl") ? <small>{keg.sixthBblKegs} available now</small> : "-"}</td><td><strong>{money(keg.sixthBblPriceCents)}</strong></td><td>{hasInventory(keg, "50 L") ? <small>{keg.fiftyLKegs} available now</small> : "-"}</td><td><strong>{money(keg.fiftyLPriceCents)}</strong></td><td>{canShowCases(keg) ? <div className="keg-case-lines">{caseLines(keg).map((line) => <span key={line.label}><strong>{line.label}: {money(line.price)}</strong><small>{line.count} available</small></span>)}</div> : "-"}</td><td><button className="keg-order-button" type="button" onClick={() => choose(keg)} disabled={!isOrderable}>Order this keg</button></td></tr>;
  })}</tbody></table></div>
    <section id="keg-order" className="keg-order-panel" aria-live="polite"><div><p className="eyebrow">Keg request</p><h2>{selected ? selected.beerName : "Select a keg to order."}</h2><p>{selected ? "Choose a package and quantity, then send your request to the Aviator keg-sales team." : "Click Order this keg in the live inventory to begin."}</p></div>{selected ? <form className="inquiry-form" onSubmit={submit}><input name="website" className="honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" /><label>Package<select value={packageSize} onChange={(event) => setPackageSize(event.target.value as PackageSize)}><option value="1/6 bbl" disabled={!canOrder(selected, "1/6 bbl")}>1/6 BBL ({selected.sixthBblKegs} available now · {money(selected.sixthBblPriceCents)})</option><option value="50 L" disabled={!canOrder(selected, "50 L")}>50 L ({selected.fiftyLKegs} available now · {money(selected.fiftyLPriceCents)})</option></select></label><label>How many?<input name="quantity" type="number" min="1" max={available} defaultValue="1" key={selected.beerName + packageSize} required /><small>{available} currently available. Your request is confirmed by the keg-sales team.</small></label><label>Name<input name="name" autoComplete="name" required /></label><label>Phone<input name="phone" type="tel" autoComplete="tel" required /></label><label>Email<input name="email" type="email" autoComplete="email" required /></label><label>Business or organization (optional)<input name="business" autoComplete="organization" /></label><label>Pickup notes (optional)<textarea name="notes" rows={3} /></label><p className="keg-newsletter-note">Submitting this request also sends an invitation to confirm your place in the Aviator Flight Crew for beer releases, events, and specials.</p><button className="button" disabled={state === "sending"}>{state === "sending" ? "Sending request..." : "Send keg request"}</button>{state !== "idle" ? <p className={"keg-order-message " + state} role={state === "error" ? "alert" : "status"}>{message}</p> : null}</form> : null}</section>
  </>;
}
