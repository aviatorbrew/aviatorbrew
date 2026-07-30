import type { Metadata } from "next";
import Link from "next/link";
import { getAllBeers } from "@/lib/managed-beers";
import { getAllLocations } from "@/lib/managed-locations";
import { getCurrentFlightLogCustomer } from "@/lib/flight-log-auth";
import { flightLogCategoryLabels, getPublishedFlightLogPosts, type FlightLogPost } from "@/lib/flight-log";
import { getPublishedEvents } from "@/lib/managed-events";
import { musicVenues } from "@/data/site";
import { FlightLogSignOutButton } from "@/components/flight-log-auth-forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Aviator Flight Log", description: "The Aviator community feed for official dispatches, questions, check-ins, events, music, beer, and location updates." };

type Section = "home" | "events" | "live-music" | "beer" | "locations";
const sections: Array<{ id: Section; label: string; href: string }> = [
  { id: "home", label: "Flight Log Home", href: "/flight-log" },
  { id: "events", label: "Events", href: "/flight-log?section=events" },
  { id: "live-music", label: "Live Music", href: "/flight-log?section=live-music" },
  { id: "beer", label: "Beer Check-In", href: "/flight-log?section=beer" },
  { id: "locations", label: "Location Check-In", href: "/flight-log?section=locations" },
];
function activeSection(value?: string): Section { return sections.some((section) => section.id === value) ? value as Section : "home"; }
function postDate(post: FlightLogPost) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }).format(new Date(post.publishedAt || post.updatedAt)); }
function formatEventDate(date: string, time?: string) { return [date, time].filter(Boolean).join(" · "); }

function AccountCard({ customer }: { customer: Awaited<ReturnType<typeof getCurrentFlightLogCustomer>> }) {
  if (!customer) return <section className="flight-log-account-card"><p className="eyebrow">Flight Crew</p><h2>Join the conversation</h2><p>View the public feed now. Sign in to post, comment, and check in once those features are enabled.</p><div><Link className="button" href="/flight-log/join">Join Flight Crew</Link><Link className="button button-outline" href="/flight-log/sign-in">Sign In</Link></div></section>;
  return <section className="flight-log-account-card"><p className="eyebrow">Signed in</p><h2>{customer.callsign}</h2><p>{customer.emailVerified ? "Email verified. Posting and check-ins will unlock as those tools go live." : "Verify your email before posting, commenting, or checking in."}</p><div><Link className="button button-outline" href="/flight-log/profile">My Profile</Link>{!customer.emailVerified ? <Link className="button button-outline" href="/flight-log/verify/resend">Resend verification</Link> : null}<FlightLogSignOutButton /></div></section>;
}
function LeftNav({ active }: { active: Section }) {
  return <aside className="flight-log-left"><nav aria-label="Flight Log navigation">{sections.map((section) => <Link key={section.id} href={section.href} className={active === section.id ? "is-active" : undefined} aria-current={active === section.id ? "page" : undefined}>{section.label}</Link>)}</nav></aside>;
}
function Composer({ customer }: { customer: Awaited<ReturnType<typeof getCurrentFlightLogCustomer>> }) {
  const locked = !customer || !customer.emailVerified;
  return <section className="flight-log-composer" aria-label="Ask Aviator"><div className="flight-log-avatar">{customer?.callsign?.slice(0, 2).toUpperCase() || "AB"}</div><div><label htmlFor="flight-log-question" className="sr-only">Ask Aviator a question</label><input id="flight-log-question" placeholder="Ask Aviator a question..." disabled={locked} /><p>{locked ? "Sign in and verify your email to ask questions when posting opens." : "Question posting is staged for the next Flight Log phase."}</p></div><button className="button" disabled>Ask</button></section>;
}
function Feed({ posts }: { posts: FlightLogPost[] }) {
  return <div className="flight-log-activity-feed">{posts.map((post) => <article className="flight-log-activity-card" key={post.id}>{post.imageUrl ? <img src={post.imageUrl} alt="" loading="lazy" /> : null}<div><p className="flight-log-activity-meta"><span>{post.isPinned ? "Pinned · " : ""}{flightLogCategoryLabels[post.category]}</span><strong>Official Aviator</strong></p><h2><Link href={`/flight-log/${post.slug}`}>{post.title}</Link></h2><p>{post.excerpt}</p><footer><time dateTime={post.publishedAt || post.updatedAt}>{postDate(post)}</time><span>Comments soon</span><span>Check-ins soon</span></footer></div></article>)}</div>;
}
function EventsPanel({ events }: { events: Awaited<ReturnType<typeof getPublishedEvents>> }) {
  return <div className="flight-log-data-panel"><h2>Events inside Flight Log</h2><p>These are pulled from the existing Aviator event data.</p>{events.slice(0, 8).map((event) => <article key={event.id}><strong>{event.title}</strong><span>{formatEventDate(event.date, event.startTime)} · {event.location}</span><p>{event.description}</p><button disabled>Event check-in coming soon</button></article>)}</div>;
}
function MusicPanel() {
  return <div className="flight-log-data-panel"><h2>Live Music inside Flight Log</h2><p>Venue information is pulled from the existing Aviator music data.</p>{musicVenues.map((venue) => <article key={venue.name}><strong>{venue.name}</strong><span>{venue.setting} · {venue.location}</span><p>{venue.description}</p><button disabled>Follow venue coming soon</button></article>)}</div>;
}
function BeerPanel({ beers }: { beers: Awaited<ReturnType<typeof getAllBeers>> }) {
  return <div className="flight-log-data-panel"><h2>Beer Check-In</h2><p>Beer cards are pulled from the website beer catalog. Check-ins open in a later phase.</p>{beers.slice(0, 12).map((beer) => <article key={beer.slug}><strong>{beer.name}</strong><span>{beer.style} · {beer.abv}</span><p>{beer.description}</p><button disabled>Check in coming soon</button></article>)}</div>;
}
function LocationPanel({ locations }: { locations: Awaited<ReturnType<typeof getAllLocations>> }) {
  return <div className="flight-log-data-panel"><h2>Location Check-In</h2><p>Locations are pulled from the existing website location data.</p>{locations.map((location) => <article key={location.slug}><strong>{location.name}</strong><span>{location.type} · {location.phone}</span><p>{location.description}</p><button disabled>Check in coming soon</button></article>)}</div>;
}

export default async function FlightLogPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const [{ section }, customer, posts, events, beers, locations] = await Promise.all([searchParams, getCurrentFlightLogCustomer(), getPublishedFlightLogPosts("all"), getPublishedEvents({ monthsAhead: 2 }), getAllBeers(), getAllLocations()]);
  const active = activeSection(section);
  return <div className="flight-log-community-shell"><header className="flight-log-community-hero"><div><p className="eyebrow">Aviator community</p><h1>Aviator Flight Log</h1><p>Official dispatches, customer questions, check-ins, event chatter, beer reports, and Flight Crew updates inside aviatorbrew.com.</p></div><div className="flight-log-hero-actions">{customer ? <><Link className="button" href="/flight-log/profile">My Profile</Link><FlightLogSignOutButton /></> : <><Link className="button" href="/flight-log/join">Join Flight Crew</Link><Link className="button button-outline" href="/flight-log/sign-in">Sign In</Link></>}</div></header><div className="flight-log-community-grid"><LeftNav active={active} /><main className="flight-log-main-feed"><Composer customer={customer} />{active === "home" ? <Feed posts={posts} /> : null}{active === "events" ? <EventsPanel events={events} /> : null}{active === "live-music" ? <MusicPanel /> : null}{active === "beer" ? <BeerPanel beers={beers} /> : null}{active === "locations" ? <LocationPanel locations={locations} /> : null}</main><aside className="flight-log-right"><AccountCard customer={customer} /><section><p className="eyebrow">Coming next</p><ul><li>Customer posting</li><li>Comments and reactions</li><li>Beer and location check-ins</li><li>Event discussion threads</li></ul></section></aside></div></div>;
}
