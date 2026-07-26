import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Calendar } from "@/components/icons";
import { EventCard } from "@/components/cards";
import { events, musicVenues } from "@/data/site";
import { getPublishedEvents } from "@/lib/managed-events";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Events + Live Music", description: "Find live music, beer releases, brunch, cars and coffee, and special events at Aviator Brewing Company." };

function formatManagedDate(date: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function formatManagedTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(2020, 0, 1, hour, minute));
}

export default async function EventsPage() {
  const managedEvents = await getPublishedEvents();
  return <>
    <section className="page-hero"><div className="content-wrap">
      <p className="eyebrow">Events + live music</p>
      <h1>What&apos;s <em>taking off?</em></h1>
      <p>Live bands, amphitheater shows, beer releases, watch parties, weekly specials, Cars + Coffee, and the kind of plans worth putting on the calendar.</p>
      <div className="hero-actions"><Link className="button" href="/events/live-music" data-analytics="events_live_music_schedule"><Calendar />Live music schedule</Link></div>
    </div></section>

    {managedEvents.length ? <section className="section special-events-section"><div className="content-wrap">
      <div className="section-heading"><div><p className="eyebrow">Special event dispatch</p><h2>Worth putting on the <em>calendar.</em></h2></div><p>Limited releases, campus gatherings, watch parties, tastings, and more—fresh from Aviator operations.</p></div>
      <div className="event-layout managed-event-layout">{managedEvents.map((event) => <article className="event-card managed-event-card" key={event.id}><div className="event-date"><span>{formatManagedDate(event.date)}</span><strong>{formatManagedTime(event.startTime)}{event.endTime ? `–${formatManagedTime(event.endTime)}` : ""}</strong></div><div className="event-content"><p className="card-kicker">{event.location}</p><h3>{event.title}</h3><p>{event.description}</p>{event.ticketUrl ? <a href={event.ticketUrl} target="_blank" rel="noreferrer" data-analytics="managed_event_tickets">Details + tickets <ArrowUpRight /></a> : <a href="https://maps.google.com/?q=688+Brewing+Drive+Fuquay-Varina+NC+27526" target="_blank" rel="noreferrer" data-analytics="managed_event_directions">Get directions <ArrowUpRight /></a>}</div></article>)}</div>
    </div></section> : null}

    <section className="section live-music-dispatch"><div className="content-wrap"><div><p className="eyebrow">Aviator Live</p><h2>Your next great night has a <em>stage.</em></h2><p>See confirmed artists, times, ticket links, and the Aviator stage they&apos;re taking over. The schedule updates directly from Aviator Live.</p></div><Link href="/events/live-music" className="button button-outline" data-analytics="events_live_music_dispatch">View live music <ArrowUpRight /></Link></div></section>
    <section className="section music-venues-section"><div className="content-wrap"><div className="section-heading"><div><p className="eyebrow">Live music landing zones</p><h2>Five stages. <em>One flight plan.</em></h2></div><p>From intimate patio sets to full campus shows, Aviator has a venue ready for the next great night.</p></div><div className="music-venue-grid">{musicVenues.map((venue, index) => <article className="music-venue-card" key={venue.name}><span>{String(index + 1).padStart(2, "0")}</span><p>{venue.setting}</p><h3>{venue.name}</h3><strong>{venue.location}</strong><div>{venue.description}</div></article>)}</div></div></section>
    <section className="section"><div className="content-wrap"><div className="event-layout">{events.map((event) => <EventCard key={event.slug} event={event} />)}</div></div></section>
  </>;
}
