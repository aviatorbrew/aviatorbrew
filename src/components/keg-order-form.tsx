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
  case12FourPackPriceCents?: number;
  case12SixPackPriceCents?: number;
  case16PriceCents?: number;
  case16FourPackPriceCents?: number;
  case12Count?: number;
  case16Count?: number;
  caseCount?: number;
  sixtelsAvailableViaBackfill?: number;
};

type PackageSize = "1/6 bbl" | "50 L" | "12 oz cases" | "16 oz cases";
type PackageOption = { value: PackageSize; label: string };
type PackPrice = { price?: number };

const packageChoices: PackageOption[] = [
  { value: "1/6 bbl", label: "1/6 BBL" },
  { value: "50 L", label: "50 L" },
  { value: "12 oz cases", label: "12 oz cases" },
  { value: "16 oz cases", label: "16 oz cases" },
];

function money(cents?: number) {
  return typeof cents === "number" && cents > 0
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100)
    : "";
}


function countForPackage(item: KegItem, packageSize: PackageSize) {
  if (packageSize === "1/6 bbl") return item.sixthBblKegs;
  if (packageSize === "50 L") return item.fiftyLKegs;
  if (packageSize === "12 oz cases") return item.case12Count || 0;
  return item.case16Count || 0;
}

function priceForPackage(item: KegItem, packageSize: PackageSize) {
  if (packageSize === "1/6 bbl") return item.sixthBblPriceCents;
  if (packageSize === "50 L") return item.fiftyLPriceCents;
  if (packageSize === "12 oz cases") return item.case12PriceCents || (/^12\s*oz$/i.test(item.caseSize || "") ? item.casePriceCents : undefined);
  return item.case16PriceCents || (/^16\s*oz$/i.test(item.caseSize || "") ? item.casePriceCents : undefined);
}

function packPrice(price?: number): PackPrice | null {
  return Number(price || 0) > 0 ? { price } : null;
}

function canOrder(item: KegItem, packageSize: PackageSize) {
  return countForPackage(item, packageSize) > 0 && Number(priceForPackage(item, packageSize) || 0) > 0;
}

function packageOptions(item: KegItem) {
  return packageChoices.filter((option) => canOrder(item, option.value));
}

function StockCell({ count, price }: { count: number; price?: number }) {
  if (count < 1) return <span className="keg-stock-empty">-</span>;
  const formattedPrice = money(price);
  return <span className="keg-stock-cell"><span className="keg-stock-main"><b>{count}<small>avail</small></b>{formattedPrice ? <strong>{formattedPrice}</strong> : <em>Price pending</em>}</span></span>;
}

function PackPriceCell({ item }: { item: PackPrice | null }) {
  if (!item || !money(item.price)) return <span className="keg-stock-empty">-</span>;
  return <span className="keg-pack-price-cell"><strong>{money(item.price)}</strong></span>;
}

export function KegOrderForm({ items }: { items: KegItem[] }) {
  const [selected, setSelected] = useState<KegItem | null>(null);
  const [packageSize, setPackageSize] = useState<PackageSize>("1/6 bbl");
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const available = selected ? countForPackage(selected, packageSize) : 0;
  const orderable = useMemo(() => items.filter((item) => packageOptions(item).length > 0), [items]);

  function choose(item: KegItem) {
    const firstOption = packageOptions(item)[0]?.value || "1/6 bbl";
    setSelected(item);
    setPackageSize(firstOption);
    setState("idle");
    setMessage("");
    document.getElementById("keg-order")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setState("sending");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/keg-orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...Object.fromEntries(form.entries()), beerName: selected.beerName, packageSize }) });
      const body = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error || "We could not send your request.");
      setState("success");
      setMessage(body.message || "Your order request is on its way.");
      event.currentTarget.reset();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Please try again.");
    }
  }

  return <><div className="keg-table-wrap"><table className="keg-table keg-table-compact"><thead><tr><th scope="col">Beer</th><th scope="col">1/6 BBL</th><th scope="col">50 L</th><th scope="col">12 oz case</th><th scope="col">12 oz 6-pack</th><th scope="col">12 oz 4-pack</th><th scope="col">16 oz case</th><th scope="col">16 oz 4-pack</th><th scope="col"><span className="sr-only">Order</span></th></tr></thead><tbody>{items.map((keg) => {
    const isOrderable = orderable.includes(keg);
    return <tr key={keg.beerName}><th scope="row"><span>{keg.beerName}</span><small>{keg.category} / {keg.packaging}{keg.sixtelsAvailableViaBackfill ? " / +" + keg.sixtelsAvailableViaBackfill + " backfill" : ""}</small></th><td><StockCell count={keg.sixthBblKegs} price={priceForPackage(keg, "1/6 bbl")} /></td><td><StockCell count={keg.fiftyLKegs} price={priceForPackage(keg, "50 L")} /></td><td><StockCell count={keg.case12Count || 0} price={priceForPackage(keg, "12 oz cases")} /></td><td><PackPriceCell item={packPrice(keg.case12SixPackPriceCents)} /></td><td><PackPriceCell item={packPrice(keg.case12FourPackPriceCents)} /></td><td><StockCell count={keg.case16Count || 0} price={priceForPackage(keg, "16 oz cases")} /></td><td><PackPriceCell item={packPrice(keg.case16FourPackPriceCents)} /></td><td><button className="keg-order-button" type="button" onClick={() => choose(keg)} disabled={!isOrderable}>Order</button></td></tr>;
  })}</tbody></table></div>
    <section id="keg-order" className="keg-order-panel" aria-live="polite"><div><p className="eyebrow">Keg/package request</p><h2>{selected ? selected.beerName : "Select an item to order."}</h2><p>{selected ? "Choose a package and quantity, then send your request to the Aviator sales team." : "Click Order in the live inventory to begin."}</p></div>{selected ? <form className="inquiry-form" onSubmit={submit}><input name="website" className="honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" /><label>Package<select value={packageSize} onChange={(event) => setPackageSize(event.target.value as PackageSize)}>{packageOptions(selected).map((option) => <option value={option.value} key={option.value}>{option.label} ({countForPackage(selected, option.value)} available now / {money(priceForPackage(selected, option.value))})</option>)}</select></label><label>How many?<input name="quantity" type="number" min="1" max={available} defaultValue="1" key={selected.beerName + packageSize} required /><small>{available} currently available. Your request is confirmed by the sales team.</small></label><label>Name<input name="name" autoComplete="name" required /></label><label>Phone<input name="phone" type="tel" autoComplete="tel" required /></label><label>Email<input name="email" type="email" required /></label><label>Business or organization (optional)<input name="business" autoComplete="organization" /></label><label>Pickup notes (optional)<textarea name="notes" rows={3} /></label><label className="captcha-check keg-human-check"><input name="human" type="checkbox" value="yes" required /><span>I&apos;m a real person</span></label><p className="keg-newsletter-note">Submitting this request also sends an invitation to confirm your place in the Aviator Flight Crew for beer releases, events, and specials.</p><button className="button" disabled={state === "sending"}>{state === "sending" ? "Sending request..." : "Send order request"}</button>{state !== "idle" ? <p className={"keg-order-message " + state} role={state === "error" ? "alert" : "status"}>{message}</p> : null}</form> : null}</section>
  </>;
}
