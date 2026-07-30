import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Calendar } from "@/components/icons";
import { musicVenues } from "@/data/site";
import { getPublishedEvents } from "@/lib/managed-events";
import { getLiveMusicSchedule, liveMusicPageUrl, type LiveMusicShow } from "@/lib/live-music";
import { EventImageViewer } from "@/components/event-image-viewer";
import { listUploadedPhotos, type StoredWebsitePhoto } from "@/lib/website-photo-storage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Events + Live Music", description: "Find live music, beer releases, brunch, cars and coffee, and special events at Aviator Brewing Company." };

function EventsPageMediaItem({ item }: { item: StoredWebsitePhoto }) {
  return <figure className={item.mediaType === "video" ? "is-video" : ""}>{item.mediaType === "video" ? <video src={item.url} controls muted playsInline preload="metadata" /> : <img src={item.url} alt={item.name.replace(/^[0-9]+-/, "")} loading="lazy" />}<figcaption>{item.mediaType === "video" ? "Short movie" : "Photo"}</figcaption></figure>;
}

function eventGalleryImages(event: Awaited<ReturnType<typeof getPublishedEvents>>[number]) {
  return [...new Set([...(event.imageUrl ? [event.imageUrl] : []), ...(event.galleryImages || [])])];
}

function ManagedEventGallery({ event }: { event: Awaited<ReturnType<typeof getPublishedEvents>>[number] }) {
  const images = eventGalleryImages(event);
  if (!images.length) return <div className="managed-event-image-placeholder">Aviator event</div>;
  return <div className={"managed-event-gallery" + (images.length > 1 ? " has-multiple" : "")}>{images.slice(0, 6).map((image, index) => <EventImageViewer src={image} alt={event.title + " event photo " + (index + 1)} title={event.title} description={event.description} key={image} />)}</div>;
}

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

function todayInEastern() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function showDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function showTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time TBA" : new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(date);
}

function LiveMusicDispatchShow({ show }: { show: LiveMusicShow }) {
  return <article className="live-music-dispatch-show">
    <time dateTime={show.performanceDate}><span>{showDate(show.performanceDate)}</span><strong>{showTime(show.startsAt)}</strong></time>
    <div>
      <p>{show.venueName}</p>
      <h3>{show.band.name}</h3>
      {show.title && show.title !== show.band.name ? <small>{show.title}</small> : null}
    </div>
    {show.ticketUrl ? <a href={show.ticketUrl} target="_blank" rel="noreferrer" aria-label={"Tickets for " + show.band.name}><ArrowUpRight /></a> : null}
  </article>;
}

export default async function EventsPage() {
  const [managedEvents, live, eventMedia] = await Promise.all([getPublishedEvents({ monthsAhead: 2 }), getLiveMusicSchedule(), listUploadedPhotos("events")]);
  const today = todayInEastern();
  const through = addDays(today, 14);
  const liveShows = (live.schedule?.shows || [])
    .filter((show) => show.performanceDate >= today && show.performanceDate <= through)
    .sort((a, b) => `${a.performanceDate} ${a.startsAt}`.localeCompare(`${b.performanceDate} ${b.startsAt}`));
  return <>
    <section className="page-hero"><div className="content-wrap">
      <p className="eyebrow">Events + live music</p>
      <h1>What&apos;s <em>taking off?</em></h1>
      <p>Live bands, amphitheater shows, beer releases, watch parties, weekly specials, Cars + Coffee, and the kind of plans worth putting on the calendar.</p>
      <div className="hero-actions"><a className="button" href={liveMusicPageUrl} target="_blank" rel="noreferrer" data-analytics="events_live_music_schedule"><Calendar />Live music schedule</a></div>
    </div></section>



    <section className="section live-music-dispatch"><div className="content-wrap live-music-dispatch-wrap"><div className="live-music-dispatch-copy"><p className="eyebrow">Aviator Live</p><h2>Your next great night has a <em>stage.</em></h2><p>See confirmed artists, times, ticket links, and the Aviator stage they&apos;re taking over. The schedule updates directly from Aviator Live.</p><a href={liveMusicPageUrl} className="button button-outline" target="_blank" rel="noreferrer" data-analytics="events_live_music_dispatch">Show full live music schedule <ArrowUpRight /></a></div><div className="live-music-dispatch-schedule" aria-label="Live music for the next two weeks">{liveShows.length ? liveShows.slice(0, 8).map((show) => <LiveMusicDispatchShow key={show.id} show={show} />) : <div className="live-music-dispatch-empty"><strong>{live.error ? "Schedule checking in" : "Next shows coming soon"}</strong><p>{live.error ? "Aviator Live could not be reached just now." : "No live music is published for the next two weeks yet."}</p></div>}</div></div></section>
    <section className="section music-venues-section"><div className="content-wrap"><div className="section-heading"><div><p className="eyebrow">Live music landing zones</p><h2>Five stages. <em>One flight plan.</em></h2></div><p>From intimate patio sets to full campus shows, Aviator has a venue ready for the next great night.</p></div><div className="music-venue-grid">{musicVenues.map((venue, index) => <article className="music-venue-card" key={venue.name}><span>{String(index + 1).padStart(2, "0")}</span><p>{venue.setting}</p><h3>{venue.name}</h3><strong>{venue.location}</strong><div>{venue.description}</div></article>)}</div></div></section>
    {managedEvents.length ? <section className="section special-events-section"><div className="content-wrap">
      <div className="section-heading"><div><p className="eyebrow">Special event dispatch</p><h2>Worth putting on the <em>calendar.</em></h2></div><p>Limited releases, campus gatherings, watch parties, tastings, and more—fresh from Aviator operations.</p></div>
      <div className="event-layout managed-event-layout">{managedEvents.map((event) => <article className="event-card managed-event-card" key={event.id}><div className="managed-event-media"><ManagedEventGallery event={event} /></div><div className="managed-event-info"><div className="managed-event-summary"><p className="card-kicker">{event.location}</p><div className="managed-event-title-row"><h3>{event.title}</h3>{formatRecurrenceLabel(event) ? <span>{formatRecurrenceLabel(event)}</span> : null}</div><div className="managed-event-schedule"><div className="managed-event-date-block"><span>{formatManagedDateParts(event.date).weekday}</span><strong>{formatManagedDateParts(event.date).month}</strong><b>{formatManagedDateParts(event.date).day}</b></div><div className="managed-event-time-block"><span>Event time</span><strong>{formatManagedTime(event.startTime)}{event.endTime ? <> <i>to</i> {formatManagedTime(event.endTime)}</> : null}</strong></div></div></div><div className="managed-event-description"><p>{event.description}</p>{event.ticketUrl ? <a href={event.ticketUrl} target="_blank" rel="noreferrer" data-analytics="managed_event_tickets">Details + tickets</a> : <a href="https://maps.google.com/?q=688+Brewing+Drive+Fuquay-Varina+NC+27526" target="_blank" rel="noreferrer" data-analytics="managed_event_directions">Get directions</a>}</div></div></article>)}</div>
    </div></section> : null}

    {eventMedia.length ? <section className="section events-page-media-section"><div className="content-wrap"><div className="section-heading"><div><p className="eyebrow">Friends + field reports</p><h2>Scenes from <em>Aviator events.</em></h2></div><p>Photos and short movies from the campus, concerts, releases, and nights worth remembering.</p></div><div className="events-page-media-grid">{eventMedia.slice(0, 12).map((item) => <EventsPageMediaItem item={item} key={item.name} />)}</div></div></section> : null}

  </>;
}
