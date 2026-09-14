"use client";

import { useMemo, useState } from "react";

import { BeerPicker } from "@/components/beer-picker";
import { countForPackage, money, packageOptions, priceForPackage, isOffered, type KegItem, type PackageSize } from "@/lib/keg-packages";
export type { KegItem } from "@/lib/keg-packages";

function StockCell({ count, price, offered = Number(price || 0) > 0 }: { count: number; price?: number; offered?: boolean }) {
  if (!offered) return <span className="keg-stock-empty">-</span>;
  const formattedPrice = money(price);
  if (count < 1) return <span className="keg-stock-cell"><span className="keg-stock-main"><b>0<small>sold out</small></b>{formattedPrice ? <strong>{formattedPrice}</strong> : null}</span></span>;
  return <span className="keg-stock-cell"><span className="keg-stock-main"><b>{count}<small>avail</small></b>{formattedPrice ? <strong>{formattedPrice}</strong> : null}</span></span>;
}

export function KegOrderForm({ items }: { items: KegItem[] }) {
  const [selected, setSelected] = useState<KegItem | null>(null);
  const [packageSize, setPackageSize] = useState<PackageSize>("1/6 bbl");
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const available = selected ? countForPackage(selected, packageSize) : 0;
  const orderable = useMemo(() => items.filter((item) => packageOptions(item).length > 0), [items]);

  function choose(item: KegItem, preferredPackage?: PackageSize) {
    const options = packageOptions(item);
    const firstOption = options.find((option) => option.value === preferredPackage)?.value || options[0]?.value;
    if (!firstOption) return;
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
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/keg-orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...Object.fromEntries(form.entries()), beerName: selected.beerName, packageSize }) });
      const body = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error || "We could not send your request.");
      setState("success");
      setMessage(body.message || "Your order request is on its way.");
      formElement.reset();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Please try again.");
    }
  }

  return <><BeerPicker items={items} onChoose={choose} /><div id="all-keg-inventory" className="keg-table-wrap" role="region" aria-label="Available beer, package sizes, and prices" tabIndex={0}><table className="keg-table keg-table-compact"><thead><tr><th scope="col">Beer</th><th scope="col">1/6 BBL</th><th scope="col">50 L</th><th scope="col">12 oz case</th><th scope="col">12 oz 6-pack</th><th scope="col">12 oz 4-pack</th><th scope="col">16 oz case</th><th scope="col">16 oz 4-pack</th><th scope="col"><span className="sr-only">Order</span></th></tr></thead><tbody>{items.map((keg) => {
    const isOrderable = orderable.includes(keg);
    return <tr key={keg.beerName}><th scope="row"><span>{keg.beerName}</span><small>{keg.category} / {keg.packaging}{keg.quantityNote ? " / " + keg.quantityNote : ""}{keg.sixtelsAvailableViaBackfill ? " / +" + keg.sixtelsAvailableViaBackfill + " backfill" : ""}</small></th><td><StockCell count={keg.sixthBblKegs} price={priceForPackage(keg, "1/6 bbl")} /></td><td><StockCell count={keg.fiftyLKegs} price={priceForPackage(keg, "50 L")} /></td><td><StockCell count={keg.case12Count || 0} price={priceForPackage(keg, "12 oz cases")} /></td><td><StockCell count={keg.case12SixPackCount || 0} price={priceForPackage(keg, "12 oz 6-packs")} offered={isOffered(keg, "12 oz 6-packs")} /></td><td><StockCell count={keg.case12FourPackCount || 0} price={priceForPackage(keg, "12 oz 4-packs")} offered={isOffered(keg, "12 oz 4-packs")} /></td><td><StockCell count={keg.case16Count || 0} price={priceForPackage(keg, "16 oz cases")} /></td><td><StockCell count={keg.case16FourPackCount || 0} price={priceForPackage(keg, "16 oz 4-packs")} offered={isOffered(keg, "16 oz 4-packs")} /></td><td><button className="keg-order-button" type="button" onClick={() => choose(keg)} disabled={!isOrderable}>Order</button></td></tr>;
  })}</tbody></table></div>
    <section id="keg-order" className="keg-order-panel" aria-live="polite"><div><p className="eyebrow">Keg/package request</p><h2>{selected ? selected.beerName : "Your next gathering starts here."}</h2><p>{selected ? "Choose a package and quantity, then send your request to the Aviator sales team." : "Choose Order beside your favorite beer above. We’ll help with the rest."}</p></div>{selected ? <form className="inquiry-form" onSubmit={submit}><input name="website" className="honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" /><label>Package<select value={packageSize} onChange={(event) => setPackageSize(event.target.value as PackageSize)}>{packageOptions(selected).map((option) => <option value={option.value} key={option.value}>{option.label} ({countForPackage(selected, option.value)} available now / {money(priceForPackage(selected, option.value))})</option>)}</select></label><label>How many?<input name="quantity" type="number" min="1" max={available} defaultValue="1" key={selected.beerName + packageSize} required /><small>{available} currently available. Your request is confirmed by the sales team.</small></label><label>Name<input name="name" autoComplete="name" required /></label><label>Phone<input name="phone" type="tel" autoComplete="tel" required /></label><label>Email<input name="email" type="email" required /></label><label>Business or organization (optional)<input name="business" autoComplete="organization" /></label><label>Gathering date &amp; pickup notes (optional)<textarea name="notes" rows={3} placeholder="Tell us when you’re gathering and ask any questions about pickup or keg equipment." /></label><label className="captcha-check keg-human-check"><input name="human" type="checkbox" value="yes" required /><span>I&apos;m a real person</span></label><p className="keg-newsletter-note">Submitting this request also sends an invitation to confirm your place in the Aviator Flight Crew for beer releases, events, and specials.</p><button className="button" disabled={state === "sending"}>{state === "sending" ? "Sending request..." : "Send order request"}</button>{state !== "idle" ? <p className={"keg-order-message " + state} role={state === "error" ? "alert" : "status"}>{message}</p> : null}</form> : null}</section>
  </>;
}
