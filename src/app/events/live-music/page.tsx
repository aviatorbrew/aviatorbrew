import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Calendar, MapPin } from "@/components/icons";
import { getLiveMusicSchedule, liveMusicPageUrl, type LiveMusicShow } from "@/lib/live-music";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Live Music Schedule",
  description: "See every confirmed Aviator live-music show in Fuquay-Varina, including venue, showtime, tickets, and the artists taking the stage.",
};

function dateParts(date: string) {
  const value = new Date(`${date}T12:00:00`);
  return {
    month: new Intl.DateTimeFormat("en-US", { month: "short" }).format(value).toUpperCase(),
    day: new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(value),
    weekday: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(value).toUpperCase(),
    long: new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(value),
  };
}

function clock(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time TBA" : new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(date);
}

function ShowCard({ show, stage }: { show: LiveMusicShow; stage?: string }) {
  const date = dateParts(show.performanceDate);
  const genre = show.band.genres?.filter(Boolean).join(" · ") || "Live music";
  const initials = show.band.name.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
  return <article className="aviator-live-card">
    <div className="aviator-live-date" aria-label={date.long}><span>{date.month}</span><strong>{date.day}</strong><small>{date.weekday}</small></div>
    <div className="aviator-live-signal" style={{ "--band-color": show.band.color || "#efb45f" } as CSSProperties}><i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" /><b>{initials}</b><span>LIVE</span></div>
    <div className="aviator-live-copy">
      <p className="eyebrow">{genre}</p>
      <h2>{show.band.name}</h2>
      {show.title && show.title !== show.band.name ? <h3>{show.title}</h3> : null}
      <p>{show.publicDescription || show.band.bio || "A live set is cleared for the stage. Grab your crew and make a night of it."}</p>
    </div>
    <aside className="aviator-live-details">
      <strong>{show.venueName}</strong>
      <dl>
        <div><dt>Showtime</dt><dd>{clock(show.startsAt)}</dd></div>
        {show.doorsAt ? <div><dt>Doors</dt><dd>{clock(show.doorsAt)}</dd></div> : null}
        <div><dt>Ends</dt><dd>{clock(show.endsAt)}</dd></div>
        {stage ? <div><dt>Stage</dt><dd>{stage}</dd></div> : null}
      </dl>
      <div className="aviator-live-actions">
        {show.ticketUrl ? <a className="button button-small" href={show.ticketUrl} target="_blank" rel="noreferrer" data-analytics="live_music_tickets">Tickets <ArrowUpRight /></a> : null}
        <a className="text-link" href="https://maps.google.com/?q=688+Brewing+Drive+Fuquay-Varina+NC+27526" target="_blank" rel="noreferrer" data-analytics="live_music_directions"><MapPin />Directions</a>
      </div>
    </aside>
  </article>;
}

export default async function LiveMusicPage() {
  const { schedule, error } = await getLiveMusicSchedule();
  const shows = schedule?.shows || [];
  const venues = schedule?.venues || [];
  return <>
    <section className="page-hero live-music-hero"><div className="content-wrap">
      <p className="eyebrow">Aviator Live · Flight schedule</p>
      <h1>Catch the next <em>set.</em></h1>
      <p>Every confirmed Aviator Live show, from intimate rooms to full-campus sound. Choose your stage, find your night, and get here early.</p>
      <div className="hero-actions"><Link className="button" href="#shows" data-analytics="live_music_view_shows"><Calendar />View schedule</Link><a className="button button-outline" href={liveMusicPageUrl} target="_blank" rel="noreferrer" data-analytics="live_music_source">Aviator Live <ArrowUpRight /></a><Link className="button button-outline" href="/events" data-analytics="live_music_all_events">All events <ArrowUpRight /></Link></div>
    </div></section>

    <section id="shows" className="section live-music-section"><div className="content-wrap">
      <div className="section-heading"><div><p className="eyebrow">Now boarding</p><h2>Live music <em>at Aviator.</em></h2></div><p>Schedule updates are pulled directly from Aviator Live, so this page stays in step with the bands and stages.</p></div>
      {shows.length ? <div className="aviator-live-list">{shows.map((show) => <ShowCard key={show.id} show={show} stage={venues.find((venue) => venue.id === show.venueId)?.stageDimensions} />)}</div> : <div className="aviator-live-empty"><p className="eyebrow">Radio check</p><h2>{error ? "The schedule is checking in." : "The next set is being cleared for takeoff."}</h2><p>{error ? "We could not reach Aviator Live just now. Please check back shortly for confirmed showtimes." : "No shows are currently published. When Aviator Live confirms the next artist, date, and stage, it will land here automatically."}</p><Link href="/events" className="button button-outline">Explore all events <ArrowUpRight /></Link></div>}
    </div></section>

    <section className="section section-dark live-stage-section"><div className="content-wrap">
      <div className="section-heading"><div><p className="eyebrow">Choose your landing zone</p><h2>Five stages. <em>One flight plan.</em></h2></div><p>Music is part of the Aviator campus. Pick a room below and watch the schedule for its next performance.</p></div>
      <div className="live-stage-grid">{venues.map((venue, index) => <article className="live-stage-card" key={venue.id} style={{ "--stage-color": venue.color || "#efb45f" } as CSSProperties}><span>{String(index + 1).padStart(2, "0")}</span><p>{venue.indoor ? "Indoor stage" : "Open-air stage"}</p><h3>{venue.name}</h3><div>{venue.blurb || "Aviator Live stage."}</div><footer>{venue.hours || "Hours vary"}{venue.stageDimensions ? <b>{venue.stageDimensions}</b> : null}</footer></article>)}</div>
    </div></section>
  </>;
}
