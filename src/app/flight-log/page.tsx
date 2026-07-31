import type { Metadata } from "next";
import Link from "next/link";
import { getAllBeers } from "@/lib/managed-beers";
import { getAllLocations } from "@/lib/managed-locations";
import { getCurrentFlightLogCustomer } from "@/lib/flight-log-auth";
import { flightLogCategoryLabels, getPublishedFlightLogPosts, type FlightLogPost } from "@/lib/flight-log";
import { getPublishedCustomerFlightLogPosts, type FlightLogCustomerPost } from "@/lib/flight-log-social";
import { getPublishedEvents, getPublishedLiveMusicEvents, type ManagedEvent } from "@/lib/managed-events";
import { FlightLogSignOutButton } from "@/components/flight-log-auth-forms";
import { FlightLogCheckInButton } from "@/components/flight-log/check-in-button";
import { FlightLogPostComposer } from "@/components/flight-log/post-composer";
import { FlightLogPostActions } from "@/components/flight-log/post-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Aviator Flight Log", description: "The Aviator community feed for official dispatches, questions, check-ins, events, music, beer, and location updates." };

type Section = "home" | "events" | "live-music" | "beer" | "locations";
type Customer = Awaited<ReturnType<typeof getCurrentFlightLogCustomer>>;
const sections: Array<{ id: Section; label: string; href: string }> = [
  { id: "home", label: "Flight Log Home", href: "/flight-log" },
  { id: "events", label: "Events", href: "/flight-log?section=events" },
  { id: "live-music", label: "Live Music", href: "/flight-log?section=live-music" },
  { id: "beer", label: "Beer Check-In", href: "/flight-log?section=beer" },
  { id: "locations", label: "Location Check-In", href: "/flight-log?section=locations" },
];
function activeSection(value?: string): Section { return sections.some((section) => section.id === value) ? value as Section : "home"; }
function postDate(post: FlightLogPost | FlightLogCustomerPost) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }).format(new Date("publishedAt" in post ? post.publishedAt || post.updatedAt : post.createdAt)); }
function formatEventDate(date: string, time?: string) { return [date, time].filter(Boolean).join(" · "); }
function canInteract(customer: Customer) { return Boolean(customer?.emailVerified); }

function AccountCard({ customer }: { customer: Customer }) {
  if (!customer) return <section className="flight-log-account-card"><p className="eyebrow">Flight Crew</p><h2>Join the conversation</h2><p>View the public feed now. Sign in to post, comment, and check in.</p><div><Link className="button" href="/flight-log/join">Join Flight Crew</Link><Link className="button button-outline" href="/flight-log/sign-in">Sign In</Link></div></section>;
  return <section className="flight-log-account-card"><p className="eyebrow">Signed in</p><h2>{customer.callsign}</h2><p>{customer.emailVerified ? "Email verified. You can post, comment, react, and check in." : "Verify your email before posting, commenting, or checking in."}</p><div><Link className="button button-outline" href="/flight-log/profile">My Profile</Link>{!customer.emailVerified ? <Link className="button button-outline" href="/flight-log/verify/resend">Resend verification</Link> : null}<FlightLogSignOutButton /></div></section>;
}
function LeftNav({ active }: { active: Section }) {
  return <aside className="flight-log-left"><nav aria-label="Flight Log navigation">{sections.map((section) => <Link key={section.id} href={section.href} className={active === section.id ? "is-active" : undefined} aria-current={active === section.id ? "page" : undefined}>{section.label}</Link>)}</nav></aside>;
}

function OfficialCard({ post, customer }: { post: FlightLogPost; customer: Customer }) {
  return <article className="flight-log-activity-card" key={post.id}>{post.imageUrl ? <img src={post.imageUrl} alt="" loading="lazy" /> : null}<div><p className="flight-log-activity-meta"><span>{post.isPinned ? "Pinned · " : ""}{flightLogCategoryLabels[post.category]}</span><strong>Official Aviator</strong></p><h2><Link href={`/flight-log/${post.slug}`}>{post.title}</Link></h2><p>{post.excerpt}</p><footer><time dateTime={post.publishedAt || post.updatedAt}>{postDate(post)}</time><span>Official dispatch</span></footer><FlightLogPostActions targetType="official" targetId={post.id} signedIn={Boolean(customer)} canInteract={canInteract(customer)} /></div></article>;
}
function CustomerCard({ post, customer }: { post: FlightLogCustomerPost; customer: Customer }) {
  return <article className="flight-log-activity-card" key={`customer-${post.id}`}>{post.media.map((item) => item.mediaType.startsWith("video/") ? <video key={item.url} src={item.url} controls preload="metadata" /> : <img key={item.url} src={item.url} alt="" loading="lazy" />)}<div><p className="flight-log-activity-meta"><span>Flight Crew Post</span><strong>@{post.authorHandle}</strong></p>{post.title ? <h2>{post.title}</h2> : null}<p>{post.body}</p>{post.taggedHandles.length ? <p className="flight-log-tags">With {post.taggedHandles.map((handle) => "@" + handle).join(", ")}</p> : null}<footer><time dateTime={post.createdAt}>{postDate(post)}</time><span>{post.authorName}</span></footer><FlightLogPostActions targetType="customer" targetId={String(post.id)} signedIn={Boolean(customer)} canInteract={canInteract(customer)} /></div></article>;
}
function Feed({ posts, customerPosts, customer }: { posts: FlightLogPost[]; customerPosts: FlightLogCustomerPost[]; customer: Customer }) {
  const mixed = [...customerPosts.map((post) => ({ kind: "customer" as const, stamp: post.createdAt, post })), ...posts.map((post) => ({ kind: "official" as const, stamp: post.publishedAt || post.updatedAt, post }))].sort((a, b) => Number((b.kind === "official" ? b.post.isPinned : false)) - Number((a.kind === "official" ? a.post.isPinned : false)) || b.stamp.localeCompare(a.stamp));
  return <div className="flight-log-activity-feed">{mixed.map((item) => item.kind === "official" ? <OfficialCard key={item.post.id} post={item.post} customer={customer} /> : <CustomerCard key={`customer-${item.post.id}`} post={item.post} customer={customer} />)}</div>;
}
function EventRows({ events, customer, empty }: { events: ManagedEvent[]; customer: Customer; empty: string }) {
  return <>{events.length ? events.slice(0, 12).map((event) => <article key={event.id}><strong>{event.title}</strong><span>{formatEventDate(event.date, event.startTime)} · {event.location}</span><p>{event.description}</p><FlightLogCheckInButton kind="event" targetSlug={event.id} targetLabel={event.title} signedIn={Boolean(customer)} canCheckIn={canInteract(customer)} /></article>) : <p>{empty}</p>}</>;
}
function EventsPanel({ events, customer }: { events: ManagedEvent[]; customer: Customer }) {
  return <div className="flight-log-data-panel"><h2>Events inside Flight Log</h2><p>These are pulled from manager-published event rows in the database.</p><EventRows events={events} customer={customer} empty="No manager-published special events are listed for the next two months." /></div>;
}
function MusicPanel({ events, customer }: { events: ManagedEvent[]; customer: Customer }) {
  return <div className="flight-log-data-panel"><h2>Live Music inside Flight Log</h2><p>These are pulled from manager-published live-music rows in the database.</p><EventRows events={events} customer={customer} empty="No manager-published live music is listed for the next two months." /></div>;
}
function BeerPanel({ beers, customer }: { beers: Awaited<ReturnType<typeof getAllBeers>>; customer: Customer }) {
  return <div className="flight-log-data-panel"><h2>Beer Check-In</h2><p>Beer cards are pulled from the website beer catalog.</p>{beers.slice(0, 12).map((beer) => <article key={beer.slug}><strong>{beer.name}</strong><span>{beer.style} · {beer.abv}</span><p>{beer.description}</p><FlightLogCheckInButton kind="beer" targetSlug={beer.slug} targetLabel={beer.name} signedIn={Boolean(customer)} canCheckIn={canInteract(customer)} /></article>)}</div>;
}
function LocationPanel({ locations, customer }: { locations: Awaited<ReturnType<typeof getAllLocations>>; customer: Customer }) {
  return <div className="flight-log-data-panel"><h2>Location Check-In</h2><p>Locations are pulled from the existing website location data.</p>{locations.map((location) => <article key={location.slug}><strong>{location.name}</strong><span>{location.type} · {location.phone}</span><p>{location.description}</p><FlightLogCheckInButton kind="location" targetSlug={location.slug} targetLabel={location.name} signedIn={Boolean(customer)} canCheckIn={canInteract(customer)} /></article>)}</div>;
}

export default async function FlightLogPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const [{ section }, customer, posts, customerPosts, events, liveMusicEvents, beers, locations] = await Promise.all([searchParams, getCurrentFlightLogCustomer(), getPublishedFlightLogPosts("all"), getPublishedCustomerFlightLogPosts(), getPublishedEvents({ monthsAhead: 2 }), getPublishedLiveMusicEvents({ monthsAhead: 2 }), getAllBeers(), getAllLocations()]);
  const active = activeSection(section);
  return <div className="flight-log-community-shell"><header className="flight-log-community-hero"><div><p className="eyebrow">Aviator community</p><h1>Aviator Flight Log</h1><p>Official dispatches, customer questions, check-ins, event chatter, beer reports, and Flight Crew updates inside aviatorbrew.com.</p></div><div className="flight-log-hero-actions">{customer ? <><Link className="button" href="/flight-log/profile">My Profile</Link><FlightLogSignOutButton /></> : <><Link className="button" href="/flight-log/join">Join Flight Crew</Link><Link className="button button-outline" href="/flight-log/sign-in">Sign In</Link></>}</div></header><div className="flight-log-community-grid"><LeftNav active={active} /><main className="flight-log-main-feed"><FlightLogPostComposer signedIn={Boolean(customer)} canPost={canInteract(customer)} callsign={customer?.callsign} />{active === "home" ? <Feed posts={posts} customerPosts={customerPosts} customer={customer} /> : null}{active === "events" ? <EventsPanel events={events} customer={customer} /> : null}{active === "live-music" ? <MusicPanel events={liveMusicEvents} customer={customer} /> : null}{active === "beer" ? <BeerPanel beers={beers} customer={customer} /> : null}{active === "locations" ? <LocationPanel locations={locations} customer={customer} /> : null}</main><aside className="flight-log-right"><AccountCard customer={customer} /><section><p className="eyebrow">Now online</p><ul><li>Customer posting</li><li>Comments and reactions</li><li>Beer, location, and event check-ins</li><li>Friend requests and invites</li></ul></section></aside></div></div>;
}
