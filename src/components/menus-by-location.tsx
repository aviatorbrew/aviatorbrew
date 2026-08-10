import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, MapPin } from "@/components/icons";
import { menuLocations } from "@/data/menu-library";
import { getLocationHero } from "@/lib/location-photos";
import { getAllLocations } from "@/lib/managed-locations";
import { latestPublicMenu, type PublishedMenuFile } from "@/lib/menu-files";

type PublishedMenu = PublishedMenuFile | null;
type LocationMenus = { slug: string; name: string; food: PublishedMenu; drinks: PublishedMenu };

function labelForMenu(location: string, type: "food" | "drinks") {
  if (location === "catering-events") return type === "food" ? "Onsite event buffet" : "Catering to-go";
  return type === "food" ? "Food" : "Drinks";
}

async function getLocationMenus(): Promise<LocationMenus[]> {
  return Promise.all(menuLocations.map(async (location) => ({ slug: location.slug, name: location.name, food: await latestPublicMenu(location.slug, "food"), drinks: await latestPublicMenu(location.slug, "drinks") })));
}

function MenuAction({ location, type, item }: { location: LocationMenus; type: "food" | "drinks"; item: PublishedMenu }) {
  const label = labelForMenu(location.slug, type);
  return item ? <a className="location-menu-action" href={item.url} target="_blank" rel="noreferrer" data-analytics={type + "_menu_" + location.slug}><strong>{label}</strong><span><em>View menu</em> <ArrowUpRight /></span></a> : <div className="location-menu-pending"><strong>{label}</strong><span><em>Coming soon!</em></span></div>;
}

/** One complete directory: location details and its current food/drink menus live together. */
export async function MenusByLocation() {
  const [locationMenus, locations] = await Promise.all([getLocationMenus(), getAllLocations()]);
  const menusBySlug = new Map(locationMenus.map((item) => [item.slug, item]));
  const locationDirectory = await Promise.all(locations.map(async (location, index) => ({ location, index, menus: menusBySlug.get(location.slug) || { slug: location.slug, name: location.name, food: null, drinks: null }, image: await getLocationHero(location.slug, location.image) })));
  const catering = menusBySlug.get("catering-events");

  return <section className="section location-manifest location-directory-section" id="menus"><div className="content-wrap">
    <div className="section-heading location-directory-heading"><div><p className="eyebrow">Locations + dining</p><h2>Choose a <em>landing spot.</em></h2></div><p>Everything you need for each stop is in one place: the atmosphere, hours, address, directions, and the latest Food and Drinks menus.</p></div>
    <div className="location-manifest-grid">{locationDirectory.map(({ location, index, menus, image }) => <article id={location.slug} className={"field-location-card location-directory-card" + (location.comingSoon ? " is-coming-soon" : "")} key={location.slug}>
      <div className="field-location-image"><Image src={image} alt={location.name + " Aviator Brewing Company"} fill unoptimized sizes="(max-width: 700px) 100vw, 50vw" /></div>
      <div className="field-location-body"><div className="field-location-top"><span className="field-number">{String(index + 1).padStart(2, "0")}</span><span>{location.comingSoon ? "Coming soon" : location.type}</span></div><h2>{location.name}</h2>{location.comingSoon ? <strong className="location-status-badge">Coming soon - not yet open</strong> : null}<p>{location.description}</p><div className="field-location-status"><span>{location.comingSoon ? "Location status" : "Hours + address"}</span><strong>{location.comingSoon ? "Coming soon - not yet open" : location.hours}</strong><small>{location.address}</small></div>{location.comingSoon ? <div className="location-coming-soon-note"><strong>Menus</strong><span>Available when this location opens.</span></div> : <div className="location-directory-menu-actions"><MenuAction location={menus} type="food" item={menus.food} /><MenuAction location={menus} type="drinks" item={menus.drinks} /></div>}<div className="field-location-actions"><Link href={"/locations/" + location.slug} data-analytics={"fieldguide_" + location.slug}>{location.comingSoon ? "Coming soon details" : "Location details"} <ArrowUpRight /></Link>{!location.comingSoon ? <a href={"https://maps.google.com/?q=" + encodeURIComponent(location.address)} target="_blank" rel="noreferrer" data-analytics={"fieldguide_directions_" + location.slug}><MapPin /> Directions</a> : null}</div></div>
    </article>)}</div>
    {catering ? <aside className="catering-menu-card" id="catering-events"><div><p className="eyebrow">Group orders + private events</p><h2>Hosting the Crew Catering</h2><p>Browse the current onsite buffet and catering-to-go menus, then let the Aviator team help make the plan.</p></div><div className="location-directory-menu-actions"><MenuAction location={catering} type="food" item={catering.food} /><MenuAction location={catering} type="drinks" item={catering.drinks} /></div><Link className="button button-outline" href="/private-events">Plan an event <ArrowUpRight /></Link></aside> : null}
  </div></section>;
}
