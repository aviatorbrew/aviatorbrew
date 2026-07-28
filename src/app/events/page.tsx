import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Calendar } from "@/components/icons";
import { musicVenues } from "@/data/site";
import { getPublishedEvents } from "@/lib/managed-events";
import { EventImageViewer } from "@/components/event-image-viewer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Events + Live Music", description: "Find live music, beer releases, brunch, cars and coffee, and special events at Aviator Brewing Company." };

function formatManagedDateParts(date: string) {
  const value = new Date(date + "T12:00:00");
  return {
    weekday: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(value),
    month: new Intl.DateTimeFormat("en-US", { month: "short" }).format(value),
    day: new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(value),
  };
}


const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ordinalNames: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th", [-1]: "last" };

function formatRecurrenceLabel(event: Awaited<ReturnType<typeof getPublishedEvents>>[number]) {
  const recurrence = event.recurrence;
  if (!recurrence || recurrence.frequency === "none") return null;
  const interval = Math.max(1, recurrence.interval || 1);
  const every = interval === 1 ? "Every" : "Every " + interval;
  if (recurrence.frequency === "daily") return interval === 1 ? "Every day" : every + " days";
  if (recurrence.frequency === "weekly") return interval === 1 ? "Every week" : every + " weeks";
  if (recurrence.frequency === "biweekly") return "Every 2 weeks";
  if (recurrence.frequency === "monthly-date") return interval === 1 ? "Every month" : every + " months";
  if (recurrence.frequency === "monthly-weekday") {
    const weekday = weekdayNames[recurrence.weekday ?? new Date(event.date + "T12:00:00").getDay()] || "selected day";
    const ordinal = ordinalNames[recurrence.ordinal ?? 1] || String(recurrence.ordinal ?? 1);
    return interval === 1 ? "Every " + ordinal + " " + weekday + " every month" : "Every " + ordinal + " " + weekday + " every " + interval + " months";
  }
  if (recurrence.frequency === "yearly") return interval === 1 ? "Every year" : every + " years";
  return null;
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
      <div className="event-layout managed-event-layout">{managedEvents.map((event) => <article className="event-card managed-event-card" key={event.id}><div className="managed-event-media">{event.imageUrl ? <EventImageViewer src={event.imageUrl} alt={event.title} title={event.title} description={event.description} /> : <div className="managed-event-image-placeholder">Aviator event</div>}</div><div className="managed-event-info"><div className="managed-event-summary"><p className="card-kicker">{event.location}</p><div className="managed-event-title-row"><h3>{event.title}</h3>{formatRecurrenceLabel(event) ? <span>{formatRecurrenceLabel(event)}</span> : null}</div><div className="managed-event-schedule"><div className="managed-event-date-block"><span>{formatManagedDateParts(event.date).weekday}</span><strong>{formatManagedDateParts(event.date).month}</strong><b>{formatManagedDateParts(event.date).day}</b></div><div className="managed-event-time-block"><span>Event time</span><strong>{formatManagedTime(event.startTime)}{event.endTime ? <> <i>to</i> {formatManagedTime(event.endTime)}</> : null}</strong></div></div></div><div className="managed-event-description"><p>{event.description}</p>{event.ticketUrl ? <a href={event.ticketUrl} target="_blank" rel="noreferrer" data-analytics="managed_event_tickets">Details + tickets</a> : <a href="https://maps.google.com/?q=688+Brewing+Drive+Fuquay-Varina+NC+27526" target="_blank" rel="noreferrer" data-analytics="managed_event_directions">Get directions</a>}</div></div></article>)}</div>
    </div></section> : null}

    <section className="section live-music-dispatch"><div className="content-wrap"><div><p className="eyebrow">Aviator Live</p><h2>Your next great night has a <em>stage.</em></h2><p>See confirmed artists, times, ticket links, and the Aviator stage they&apos;re taking over. The schedule updates directly from Aviator Live.</p></div><Link href="/events/live-music" className="button button-outline" data-analytics="events_live_music_dispatch">View live music <ArrowUpRight /></Link></div></section>
    <section className="section music-venues-section"><div className="content-wrap"><div className="section-heading"><div><p className="eyebrow">Live music landing zones</p><h2>Five stages. <em>One flight plan.</em></h2></div><p>From intimate patio sets to full campus shows, Aviator has a venue ready for the next great night.</p></div><div className="music-venue-grid">{musicVenues.map((venue, index) => <article className="music-venue-card" key={venue.name}><span>{String(index + 1).padStart(2, "0")}</span><p>{venue.setting}</p><h3>{venue.name}</h3><strong>{venue.location}</strong><div>{venue.description}</div></article>)}</div></div></section>
  </>;
}
