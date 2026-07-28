"use client";

import Image from "next/image";
import { FormEvent, useMemo, useState } from "react";
import { ArrowUpRight, Calendar, MapPin } from "@/components/icons";
import { appetizerStops, dinnerStops, drinksStops, type ItineraryPhase, type ItineraryStop } from "@/data/itinerary";

const phaseLabels: Record<ItineraryPhase, string> = { drinks: "Drinks", appetizer: "Appetizers", dinner: "Dinner" };
const phaseDurations: Record<ItineraryPhase, number> = { drinks: 60, appetizer: 45, dinner: 120 };

function nextFriday() {
  const date = new Date();
  const days = (5 - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function minutesFromTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function timeFromMinutes(value: number) {
  const normalized = value % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function displayTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(2020, 0, 1, hour, minute));
}

function displayDate(value: string) {
  if (!value) return "Choose a date";
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" }).format(new Date(`${value}T12:00:00-05:00`));
}

function calendarDate(date: string, time: string) {
  return `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
}

function calendarEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function clampCount(value: number, max: number) {
  return Math.min(max, Math.max(0, Number.isFinite(value) ? value : 0));
}

function routeTimes(stops: ItineraryStop[], startTime: string) {
  let cursor = minutesFromTime(startTime);
  return stops.map((stop) => {
    const time = timeFromMinutes(cursor);
    cursor += phaseDurations[stop.phase];
    return { stop, time };
  });
}

function StopCard({ stop, selectedOrder, unavailable, onSelect }: { stop: ItineraryStop; selectedOrder?: number; unavailable?: boolean; onSelect: () => void }) {
  const selected = Boolean(selectedOrder);
  const disabled = stop.comingSoon || unavailable;
  return <article className={`itinerary-stop-card${selected ? " is-selected" : ""}${stop.comingSoon ? " is-coming-soon" : ""}${unavailable ? " is-unavailable" : ""}`}>
    <button type="button" aria-pressed={selected} disabled={disabled} onClick={onSelect}>
      <span className="itinerary-stop-image"><Image src={stop.image} alt="" fill unoptimized sizes="(max-width: 700px) 100vw, 25vw" /></span>
      <span className="itinerary-stop-copy">
        <span className="itinerary-stop-top"><b>{stop.label}</b>{stop.comingSoon ? <i>Coming soon</i> : selectedOrder ? <i>Stop {selectedOrder}</i> : null}</span>
        <span>{stop.description}</span>
      </span>
    </button>
    <div className="itinerary-menu-highlights">
      <strong>{stop.comingSoon ? "Future flight plan" : "Menu highlights"}</strong>
      <ul>{stop.highlights.map((highlight) => <li key={highlight.name}><b>{highlight.name}</b><span>{highlight.detail}</span></li>)}</ul>
      {stop.menuUrl ? <a href={stop.menuUrl} target="_blank" rel="noreferrer">Open current menu <ArrowUpRight /></a> : null}
    </div>
  </article>;
}

function CountInput({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (value: number) => void }) {
  return <label>{label}<input type="number" min="0" max={max} value={value} onChange={(event) => onChange(clampCount(Number(event.target.value), max))} /></label>;
}

export function NightOutPlanner() {
  const [drinkCount, setDrinkCountValue] = useState(1);
  const [appetizerCount, setAppetizerCountValue] = useState(1);
  const [dinnerCount, setDinnerCountValue] = useState(1);
  const [drinkIds, setDrinkIds] = useState<string[]>([]);
  const [appetizerIds, setAppetizerIds] = useState<string[]>([]);
  const [dinnerIds, setDinnerIds] = useState<string[]>([]);
  const [date, setDate] = useState(nextFriday);
  const [startTime, setStartTime] = useState("17:30");
  const [partySize, setPartySize] = useState(2);
  const [email, setEmail] = useState("");
  const [mailState, setMailState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  const selectedDrinks = drinkIds.map((id) => drinksStops.find((stop) => stop.id === id)).filter(Boolean) as ItineraryStop[];
  const selectedAppetizers = appetizerIds.map((id) => appetizerStops.find((stop) => stop.id === id)).filter(Boolean) as ItineraryStop[];
  const selectedDinners = dinnerIds.map((id) => dinnerStops.find((stop) => stop.id === id)).filter(Boolean) as ItineraryStop[];
  const selectedStops = useMemo(() => [...selectedDrinks, ...selectedAppetizers, ...selectedDinners], [selectedDrinks, selectedAppetizers, selectedDinners]);
  const scheduledStops = useMemo(() => routeTimes(selectedStops, startTime), [selectedStops, startTime]);
  const requiredStops = drinkCount + appetizerCount + dinnerCount;
  const complete = requiredStops > 0 && selectedStops.length === requiredStops && Boolean(date && startTime);

  function setDrinkCount(value: number) { setDrinkCountValue(value); setDrinkIds((ids) => ids.slice(0, value)); }
  function setAppetizerCount(value: number) { setAppetizerCountValue(value); setAppetizerIds((ids) => ids.slice(0, value)); }
  function setDinnerCount(value: number) { setDinnerCountValue(value); setDinnerIds((ids) => ids.slice(0, value)); }

  function toggleStop(stop: ItineraryStop, selectedIds: string[], setSelectedIds: (ids: string[]) => void, count: number) {
    if (count < 1 || stop.comingSoon) return;
    setMessage("");
    if (selectedIds.includes(stop.id)) {
      setSelectedIds(selectedIds.filter((id) => id !== stop.id));
      return;
    }
    setSelectedIds(selectedIds.length < count ? [...selectedIds, stop.id] : [...selectedIds.slice(0, count - 1), stop.id]);
  }

  function details(stop: ItineraryStop) {
    return calendarEscape(`${stop.description}
Menu highlights: ${stop.highlights.map((item) => `${item.name} - ${item.detail}`).join("; ")}${stop.menuUrl ? `
Menu: https://aviatorbrew.com${stop.menuUrl}` : ""}`);
  }

  function downloadItinerary() {
    if (!complete) return;
    const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const calendar = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Aviator Brewing Company//Night Out Itinerary//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      ...scheduledStops.flatMap(({ stop, time }, index) => [
        "BEGIN:VEVENT",
        `UID:${stop.id}-${date}-${index}@aviatorbrew.com`,
        `DTSTAMP:${now}Z`,
        `DTSTART;TZID=America/New_York:${calendarDate(date, time)}`,
        `DTEND;TZID=America/New_York:${calendarDate(date, timeFromMinutes(minutesFromTime(time) + phaseDurations[stop.phase]))}`,
        `SUMMARY:${calendarEscape(`${phaseLabels[stop.phase]} - ${stop.label}`)}`,
        `LOCATION:${calendarEscape(stop.address)}`,
        `DESCRIPTION:${details(stop)}`,
        "END:VEVENT",
      ]),
      "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([calendar], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `aviator-night-out-${date}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function emailItinerary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!complete) return;
    setMailState("sending");
    setMessage("");
    const form = event.currentTarget;
    const website = new FormData(form).get("website");
    const response = await fetch("/api/itinerary/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, date, startTime, partySize, stopIds: selectedStops.map((stop) => stop.id), website }),
    });
    const body = await response.json() as { error?: string };
    if (!response.ok) {
      setMailState("error");
      setMessage(body.error || "We could not send the itinerary.");
      return;
    }
    setMailState("sent");
    setMessage(`Itinerary sent to ${email}.`);
  }

  return <div className="itinerary-builder">
    <section className="itinerary-controls" aria-label="Night out details">
      <div><p className="eyebrow">Flight details</p><h2>Set the night.</h2></div>
      <label>Date<input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setDate(event.target.value)} /></label>
      <label>First stop<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
      <label>Party size<input type="number" min="1" max="20" value={partySize} onChange={(event) => setPartySize(Math.min(20, Math.max(1, Number(event.target.value) || 1)))} /></label>
      <CountInput label="Drink stops" value={drinkCount} max={3} onChange={setDrinkCount} />
      <CountInput label="Appetizer stops" value={appetizerCount} max={2} onChange={setAppetizerCount} />
      <CountInput label="Dinner stops" value={dinnerCount} max={2} onChange={setDinnerCount} />
    </section>

    <section className="itinerary-choice-section">
      <div className="itinerary-step-heading"><span>01</span><div><p className="eyebrow">Drinks</p><h2>Choose the first rounds.</h2><p>Select {drinkCount} drink stop{drinkCount === 1 ? "" : "s"}. If you select more than the count, the newest choice replaces the last one.</p></div></div>
      <div className="itinerary-stop-grid drinks-grid">{drinksStops.map((stop) => <StopCard key={stop.id} stop={stop} selectedOrder={drinkIds.indexOf(stop.id) + 1 || undefined} unavailable={drinkCount === 0} onSelect={() => toggleStop(stop, drinkIds, setDrinkIds, drinkCount)} />)}</div>
    </section>

    <section className="itinerary-choice-section">
      <div className="itinerary-step-heading"><span>02</span><div><p className="eyebrow">Appetizers</p><h2>Add shareable stops.</h2><p>Select {appetizerCount} appetizer stop{appetizerCount === 1 ? "" : "s"}. Set the count to zero to skip this part of the route.</p></div></div>
      <div className="itinerary-stop-grid appetizer-grid">{appetizerStops.map((stop) => <StopCard key={stop.id} stop={stop} selectedOrder={appetizerIds.indexOf(stop.id) + 1 || undefined} unavailable={appetizerCount === 0} onSelect={() => toggleStop(stop, appetizerIds, setAppetizerIds, appetizerCount)} />)}</div>
    </section>

    <section className="itinerary-choice-section">
      <div className="itinerary-step-heading"><span>03</span><div><p className="eyebrow">Dinner</p><h2>Choose where the night lands.</h2><p>Select {dinnerCount} dinner stop{dinnerCount === 1 ? "" : "s"}. HardDeck Steakhouse and the C-54 Airplane Bar remain marked coming soon.</p></div></div>
      <div className="itinerary-stop-grid dinner-grid">{dinnerStops.map((stop) => <StopCard key={stop.id} stop={stop} selectedOrder={dinnerIds.indexOf(stop.id) + 1 || undefined} unavailable={dinnerCount === 0} onSelect={() => toggleStop(stop, dinnerIds, setDinnerIds, dinnerCount)} />)}</div>
    </section>

    <section className="itinerary-summary" aria-live="polite">
      <div className="itinerary-summary-head"><div><p className="eyebrow">Your route</p><h2>{complete ? displayDate(date) : `Choose ${Math.max(requiredStops - selectedStops.length, 0)} more stop${Math.max(requiredStops - selectedStops.length, 0) === 1 ? "" : "s"} to clear the route.`}</h2></div><span>{partySize} guest{partySize === 1 ? "" : "s"} / {requiredStops} stop{requiredStops === 1 ? "" : "s"}</span></div>
      <ol className="itinerary-route">
        {scheduledStops.length ? scheduledStops.map(({ stop, time }, index) => <li className="is-ready" key={stop.id}><time>{displayTime(time)}</time><div><span>{phaseLabels[stop.phase]} stop {index + 1}</span><h3>{stop.label}</h3><p>{stop.address}</p><a href={`https://maps.google.com/?q=${encodeURIComponent(stop.address)}`} target="_blank" rel="noreferrer"><MapPin /> Directions</a></div></li>) : <li><time>{displayTime(startTime)}</time><div><span>Route pending</span><h3>Choose your stops</h3><p>Set the counts above and select the places you want in the route.</p></div></li>}
      </ol>
      <div className="itinerary-share">
        <button className="button button-light" type="button" onClick={downloadItinerary} disabled={!complete}><Calendar /> Save to phone</button>
        <form onSubmit={emailItinerary}>
          <input name="website" className="honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" />
          <label>Email this itinerary<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label>
          <button className="button" disabled={!complete || mailState === "sending"}>{mailState === "sending" ? "Sending..." : "Email itinerary"}</button>
        </form>
      </div>
      {message ? <p className={`itinerary-message ${mailState}`} role={mailState === "error" ? "alert" : "status"}>{message}</p> : null}
      <p className="itinerary-disclaimer">Menu highlights and prices reflect the current uploaded menus and may change. Confirm hours and availability before your visit.</p>
    </section>
  </div>;
}
