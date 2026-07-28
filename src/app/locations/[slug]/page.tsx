import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, MapPin, Phone } from "@/components/icons";
import { locations as staticLocations } from "@/data/site";
import { getLocation } from "@/lib/managed-locations";
import { getLocationHero, getLocationPhotos } from "@/lib/location-photos";
import { getLiveMusicSchedule, getLocationLiveShows } from "@/lib/live-music";

export const dynamic = "force-dynamic";
export function generateStaticParams() { return staticLocations.map((location) => ({ slug: location.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const { slug } = await params; const location = await getLocation(slug); return { title: location ? location.name + (location.comingSoon ? " - Coming Soon" : "") : "Location" }; }

function showDate(value: string) { return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`)); }
function showTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Time TBA" : new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(date); }

export default async function LocationDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const location = await getLocation(slug);
  if (!location) notFound();
  const comingSoon = location.comingSoon === true;
  const [photos, hero, live] = await Promise.all([getLocationPhotos(location.slug), getLocationHero(location.slug, location.image), !comingSoon && location.events ? getLiveMusicSchedule() : Promise.resolve({ schedule: null, error: false })]);
  const gallery = photos.filter((photo) => photo.url !== hero);
  const liveShows = getLocationLiveShows(location.slug, live.schedule);
  const schema = comingSoon
    ? { "@context": "https://schema.org", "@type": "Place", name: location.name, address: location.address, description: location.description }
    : { "@context": "https://schema.org", "@type": "Restaurant", name: location.name, address: location.address, telephone: location.phone, openingHours: location.hours };

  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
    <section className={"detail-hero" + (comingSoon ? " is-coming-soon" : "")}><div className="detail-hero-image"><Image src={hero} alt={location.name} fill priority unoptimized sizes="(max-width: 700px) 100vw, 50vw" /></div><div className="detail-hero-copy"><p className="eyebrow">{comingSoon ? "Coming soon - not yet open" : location.type}</p>{comingSoon ? <strong className="location-status-badge">Future Aviator location</strong> : null}<h1>{location.name}</h1><p>{location.description}</p><div className="hero-actions">{comingSoon ? <Link className="button" href="/locations#menus">View open locations <ArrowUpRight /></Link> : <><a className="button" href={"https://maps.google.com/?q=" + encodeURIComponent(location.address)} target="_blank" rel="noreferrer" data-analytics={"directions_" + location.slug}><MapPin /> Get directions</a>{location.menu && <Link className="button button-outline" href={location.menu} data-analytics={"menu_" + location.slug}>View menu <ArrowUpRight /></Link>}</>}</div></div></section>
    {comingSoon ? <section className="section location-coming-soon-section"><div className="content-wrap location-coming-soon-detail"><p className="eyebrow">In development</p><h2>Not open yet.</h2><p>{location.name} is still under development and is not open to guests. Opening details, hours, menus, parking, and accessibility information will be published here when plans are finalized.</p><Link className="button button-outline" href="/locations#menus">Explore locations open now <ArrowUpRight /></Link></div></section> : <section className="section"><div className="content-wrap detail-grid"><article className="info-card"><p className="eyebrow">Plan your visit</p><h2>Hours + address</h2><p><strong>Hours</strong><br/>{location.hours}</p><p><strong>Address</strong><br/>{location.address}</p><p><a href={"tel:+1" + location.phone.replace(/\D/g, "")} data-analytics={"call_" + location.slug}><Phone /> {location.phone}</a></p></article><article className="info-card"><p className="eyebrow">Good to know</p><h2>Make it easy.</h2><p><strong>Parking</strong><br/>{location.parking}</p><p><strong>Accessibility</strong><br/>{location.accessibility}</p><p>Menus and current event details are updated here from the Aviator content system.</p></article></div></section>}
    {gallery.length > 0 && <section className="section location-photo-gallery"><div className="content-wrap"><p className="eyebrow">From the field</p><h2 className="display-title">A closer look at <em>{location.shortName}.</em></h2><div className="location-gallery-grid">{gallery.map((photo) => <div key={photo.name} className="location-gallery-image"><Image src={photo.url} alt={location.name + " gallery photo"} fill unoptimized sizes="(max-width: 700px) 100vw, 33vw" /></div>)}</div></div></section>}
    {!comingSoon && location.events ? <section className="section section-dark location-live-schedule"><div className="content-wrap"><div className="section-heading"><div><p className="eyebrow">Aviator Live - venue schedule</p><h2>Upcoming at <em>{location.shortName}.</em></h2></div><p>Confirmed artists and showtimes are pulled directly from Aviator Live.</p></div>{liveShows.length ? <div className="event-layout">{liveShows.map((show) => <article className="event-card" key={show.id}><div className="event-date"><span>{showDate(show.performanceDate)}</span><strong>{showTime(show.startsAt)}</strong></div><div className="event-content"><p className="card-kicker">{show.venueName}</p><h3>{show.band.name}</h3><p>{show.publicDescription || show.band.bio || show.title}</p>{show.ticketUrl ? <a href={show.ticketUrl} target="_blank" rel="noreferrer" data-analytics={"location_music_tickets_" + location.slug}>Tickets + details <ArrowUpRight /></a> : <Link href="/events/live-music" data-analytics={"location_music_schedule_" + location.slug}>View full live music schedule <ArrowUpRight /></Link>}</div></article>)}</div> : <div className="location-live-empty"><p>{live.error ? "The live schedule is checking in. Please check back shortly for confirmed bands and showtimes." : "No bands are currently published for this location. When Aviator Live confirms the next set, it will appear here automatically."}</p><Link className="button button-outline" href="/events/live-music">View all live music <ArrowUpRight /></Link></div>}</div></section> : null}
  </>;
}
