import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "@/components/icons";
import { KegOrderForm } from "@/components/keg-order-form";
import { getUploadedKegInventory, type KegInventory } from "@/lib/keg-inventory";

type KegResponse = KegInventory;

export const metadata: Metadata = { title: "Kegs for Sale | Aviator Brewing Company", description: "Live Aviator Brewing keg availability in Fuquay-Varina, North Carolina." };
export const dynamic = "force-dynamic";

async function getKegs(): Promise<KegResponse | null> { return getUploadedKegInventory(); }

export default async function KegsPage() {
  const kegData = await getKegs();
  const stamp = kegData?.updatedAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(kegData.updatedAt)) : null;
  return <main>
    <section className="page-hero kegs-hero"><div className="content-wrap"><p className="eyebrow">Keg sales inventory</p><h1>Kegs cleared for <em>takeoff.</em></h1><p>Choose a beer below to request a keg. Availability is maintained by the Aviator keg-sales team and checked again before the request reaches them.</p><div className="hero-actions"><a className="button" href="#keg-order" data-analytics="keg_order_start">Order a keg <ArrowUpRight /></a></div></div></section>
    <section className="section keg-inventory-section"><div className="content-wrap"><div className="section-heading"><div><p className="eyebrow">Current inventory</p><h2>Cleared for <em>takeoff.</em></h2></div><p>{stamp ? "Inventory updated " + stamp + "." : "Today's keg inventory will be posted shortly."}</p></div>
      {kegData ? <><KegOrderForm items={kegData.items} />{kegData.backfillPickupNote ? <p className="keg-note">{kegData.backfillPickupNote}</p> : null}</> : <div className="keg-unavailable"><p className="eyebrow">Temporarily unavailable</p><h2>Keg inventory is <em>coming soon.</em></h2><p>Please contact the Aviator team for today&apos;s keg availability, or check back after the current inventory is posted.</p><a className="button" href="mailto:orders@aviatorbrew.com?subject=Keg%20Sales%20Request">Contact keg sales <ArrowUpRight /></a></div>}
      <Link className="section-link" href="/more">Back to more Aviator services <ArrowUpRight /></Link>
    </div></section>
  </main>;
}
