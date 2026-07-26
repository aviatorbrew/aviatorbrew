import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "@/components/icons";
import { MenusByLocation } from "@/components/menus-by-location";
import { getAllLocations } from "@/lib/managed-locations";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Locations + Dining", description: "Explore Aviator Brewing Company locations, food and drink menus, hours, and directions in Fuquay-Varina, North Carolina." };

export default async function LocationsPage() {
  const locations = await getAllLocations();
  return <><section className="page-hero locations-hero"><div className="content-wrap"><p className="eyebrow">Aviator field guide · locations + dining</p><h1>Seven places <em>to land.</em></h1><p>From a fresh brewery pour to pizza, cocktails, steak, music, and after-dark energy, choose the Aviator stop that fits the moment. Every location, menu, and direction lives in one field guide.</p><div className="hero-actions"><Link className="button" href="#menus" data-analytics="locations_find_menus">Explore locations + menus <ArrowUpRight /></Link></div></div></section><section className="flight-plan-section"><div className="content-wrap"><div className="flight-plan-head"><div><p className="eyebrow">Choose your route</p><h2>One field. <em>Seven stories.</em></h2></div><p>Start downtown, head to the brewery campus, or make a night out of every stop. Pick a spot below to jump straight to its details and menus.</p></div><ol className="flight-plan">{locations.map((location,index)=><li key={location.slug}><Link href={"#" + location.slug}><b>{String(index+1).padStart(2,"0")}</b><span>{location.shortName}</span><i aria-hidden="true">-&gt;</i></Link></li>)}</ol></div></section><MenusByLocation /></>;
}
