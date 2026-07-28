import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "@/components/icons";
import { MenusByLocation } from "@/components/menus-by-location";
import { getAllLocations } from "@/lib/managed-locations";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Locations + Dining",
  description: "Explore Aviator Brewing Company locations, food and drink menus, hours, and directions in Fuquay-Varina, North Carolina.",
};

export default async function LocationsPage() {
  const locations = await getAllLocations();
  const openCount = locations.filter((location) => !location.comingSoon).length;
  const comingSoonCount = locations.length - openCount;
  const routeCount = locations.length + 1;

  return <>
    <section className="page-hero locations-hero">
      <div className="content-wrap">
        <p className="eyebrow">Aviator field guide - locations + dining</p>
        <h1>Aviator locations. <em>{comingSoonCount} coming soon.</em></h1>
        <p>{openCount} locations are open now. {comingSoonCount} more are on the way: the future HardDeck Restaurant and C-54 Airplane Bar. Current status, menus, and directions are listed below.</p>
        <div className="hero-actions"><Link className="button" href="#menus" data-analytics="locations_find_menus">Explore locations + menus <ArrowUpRight /></Link><Link className="button button-outline" href="/itinerary" data-analytics="locations_build_itinerary">Build a night out <ArrowUpRight /></Link></div>
      </div>
    </section>

    <section className="flight-plan-section">
      <div className="content-wrap">
        <div className="flight-plan-head">
          <div><p className="eyebrow">Choose your route</p><h2>One field. <em>{routeCount} routes.</em></h2></div>
          <p>Start downtown, head to the brewery campus, find the next amphitheater show, or plan catering for the whole crew. HardDeck Restaurant and the C-54 Airplane Bar are listed for future planning and are not open yet.</p>
        </div>
        <ol className="flight-plan">
          {locations.map((location, index) => <li className={location.comingSoon ? "is-coming-soon" : ""} key={location.slug}>
            <Link href={"#" + location.slug}><b>{String(index + 1).padStart(2, "0")}</b><span>{location.shortName}</span>{location.comingSoon ? <small>Coming soon</small> : null}<i aria-hidden="true">-&gt;</i></Link>
          </li>)}
          <li key="catering-events">
            <Link href="#catering-events"><b>{String(routeCount).padStart(2, "0")}</b><span>Hosting the Crew Catering</span><i aria-hidden="true">-&gt;</i></Link>
          </li>
        </ol>
      </div>
    </section>

    <MenusByLocation />
  </>;
}
