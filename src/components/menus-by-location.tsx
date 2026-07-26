import { promises as fs } from "node:fs";
import path from "node:path";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, MapPin } from "@/components/icons";
import { menuLocations } from "@/data/menu-library";
import { getLocationHero } from "@/lib/location-photos";
import { getAllLocations } from "@/lib/managed-locations";

type PublishedMenu = { name: string; url: string } | null;
type LocationMenus = { slug: string; name: string; food: PublishedMenu; drinks: PublishedMenu };

function labelForMenu(location: string, type: "food" | "drinks") {
  if (location === "catering-events") return type === "food" ? "Onsite event buffet" : "Catering to-go";
  return type === "food" ? "Food" : "Drinks";
}

async function latestMenu(location: string, type: "food" | "drinks"): Promise<PublishedMenu> {
  const directory = path.join(process.cwd(), "public", "media", "menus", location, type);
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const candidates = await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => ({ name: entry.name, stats: await fs.stat(path.join(directory, entry.name)) })));
    candidates.sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);
    const current = candidates[0];
    return current ? { name: current.name, url: "/media/menus/" + location + "/" + type + "/" + encodeURIComponent(current.name) } : null;
  } catch { return null; }
}

async function getLocationMenus(): Promise<LocationMenus[]> {
  return Promise.all(menuLocations.map(async (location) => ({ slug: location.slug, name: location.name, food: await latestMenu(location.slug, "food"), drinks: await latestMenu(location.slug, "drinks") })));
}

function MenuAction({ location, type, item }: { location: LocationMenus; type: "food" | "drinks"; item: PublishedMenu }) {
  const label = labelForMenu(location.slug, type);
  return item ? <a className="location-menu-action" href={item.url} target="_blank" rel="noreferrer" data-analytics={type + "_menu_" + location.slug}><strong>{label}</strong><span>View menu <ArrowUpRight /></span></a> : <div className="location-menu-pending"><strong>{label}</strong><span>Coming soon!</span></div>;
}

/** One complete directory: location details and its current food/drink menus live together. */
export async function MenusByLocation() {
  const [locationMenus, locations] = await Promise.all([getLocationMenus(), getAllLocations()]);
  const menusBySlug = new Map(locationMenus.map((item) => [item.slug, item]));
  const locationDirectory = await Promise.all(locations.map(async (location, index) => ({ location, index, menus: menusBySlug.get(location.slug) || { slug: location.slug, name: location.name, food: null, drinks: null }, image: await getLocationHero(location.slug, location.image) })));
  const catering = menusBySlug.get("catering-events");

  return <section className="section location-manifest location-directory-section" id="menus"><div className="content-wrap">
    <div className="section-heading location-directory-heading"><div><p className="eyebrow">Locations + dining</p><h2>Choose a <em>landing spot.</em></h2></div><p>Everything you need for each stop is in one place: the atmosphere, hours, address, directions, and the latest Food and Drinks menus.</p></div>
    <div className="location-manifest-grid">{locationDirectory.map(({ location, index, menus, image }) => <article id={location.slug} className="field-location-card location-directory-card" key={location.slug}>
      <div className="field-location-image"><Image src={image} alt={location.name + " Aviator Brewing Company"} fill sizes="(max-width: 700px) 100vw, 50vw" /></div>
      <div className="field-location-body"><div className="field-location-top"><span className="field-number">{String(index + 1).padStart(2, "0")}</span><span>{location.type}</span></div><h2>{location.name}</h2><p>{location.description}</p><div className="field-location-status"><span>Hours + address</span><strong>{location.hours}</strong><small>{location.address}</small></div><div className="location-directory-menu-actions"><MenuAction location={menus} type="food" item={menus.food} /><MenuAction location={menus} type="drinks" item={menus.drinks} /></div><div className="field-location-actions"><Link href={"/locations/" + location.slug} data-analytics={"fieldguide_" + location.slug}>Location details <ArrowUpRight /></Link><a href={"https://maps.google.com/?q=" + encodeURIComponent(location.address)} target="_blank" rel="noreferrer" data-analytics={"fieldguide_directions_" + location.slug}><MapPin /> Directions</a></div></div>
    </article>)}</div>
    {catering ? <aside className="catering-menu-card" id="catering-events"><div><p className="eyebrow">Group orders + private events</p><h2>Hosting the crew?</h2><p>Browse the current onsite buffet and catering-to-go menus, then let the Aviator team help make the plan.</p></div><div className="location-directory-menu-actions"><MenuAction location={catering} type="food" item={catering.food} /><MenuAction location={catering} type="drinks" item={catering.drinks} /></div><Link className="button button-outline" href="/private-events">Plan an event <ArrowUpRight /></Link></aside> : null}
  </div></section>;
}
