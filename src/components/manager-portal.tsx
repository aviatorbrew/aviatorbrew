"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { DEFAULT_TOUR_MINIMUM, DEFAULT_TOUR_PRICE_CENTS, TOUR_CAPACITY } from "@/lib/tour-config";
import { managerSections, type ManagerSection } from "@/lib/manager-sections";
import { CouponManager } from "@/components/coupons";
import { MenuLibraryClient } from "@/components/menu-library-client";
import { LocationManager } from "@/components/location-manager";
import { BrandingManager } from "@/components/branding-manager";
import { NewsletterManager } from "@/components/newsletter-manager";
import { PaymentTestManager } from "@/components/payment-test-manager";
import { WebsitePhotosLibrary } from "@/components/website-photos-library";
import { BeerImageViewer } from "@/components/beer-image-viewer";
import { FlightLogAdmin } from "@/components/flight-log-admin";

type Signup = { id: string; name: string; email: string; tickets: number; tourDate: string; tourTime: string; paymentStatus?: "pending" | "paid" };
type ScheduledTour = { date: string; displayDate: string; time: "4:00 PM" | "6:00 PM"; guests: number; tickets: number; confirmed: boolean };
type DatabaseTable = { schema: string; name: string; type: string };
type DatabaseHealth = { configured?: boolean; connected?: boolean; latencyMs?: number; summary?: { host?: string; port?: string | null; database?: string | null; ssl?: boolean } | null; server?: Record<string, unknown>; error?: string };
type DatabaseRows = { table?: DatabaseTable; columns?: string[]; rows?: Record<string, unknown>[]; limit?: number; offset?: number; error?: string };

function TourManager() {
  const [signups, setSignups] = useState<Signup[]>([]);
  const [scheduledTours, setScheduledTours] = useState<ScheduledTour[]>([]);
  const [message, setMessage] = useState("");
  const [cancelTarget, setCancelTarget] = useState<ScheduledTour | null>(null);
  const [busy, setBusy] = useState(false);
  const [minimum, setMinimum] = useState(DEFAULT_TOUR_MINIMUM);
  const [tourPrice, setTourPrice] = useState(DEFAULT_TOUR_PRICE_CENTS / 100);
  function applyData(data: { signups: Signup[]; scheduledTours?: ScheduledTour[]; minimum?: number; priceCents?: number }) { setSignups(data.signups); setScheduledTours(data.scheduledTours || []); setMinimum(data.minimum ?? DEFAULT_TOUR_MINIMUM); setTourPrice((data.priceCents ?? DEFAULT_TOUR_PRICE_CENTS) / 100); }
  async function load() { const r = await fetch("/api/manager/tours"); const b = await r.json(); if (!r.ok) throw new Error(b.error); applyData(b); }
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const response = await fetch("/api/manager/tours", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ minimum, priceCents: Math.round(tourPrice * 100) }) });
    const body = await response.json(); setBusy(false);
    if (!response.ok) { setMessage(body.error); return; } applyData(body); setMessage("Tour settings saved. Public checkout, tour copy, and future emails now use $" + Number(body.priceCents / 100).toFixed(2) + " per guest and a " + body.minimum + "-guest launch threshold.");
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const r = await fetch("/api/manager/tours", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...values, tickets: Number(values.tickets) }) });
    const b = await r.json(); setBusy(false);
    if (!r.ok) { setMessage(b.error); return; }
    applyData(b); event.currentTarget.reset(); setMessage("Guest added and notified.");
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this tour signup?")) return;
    const r = await fetch("/api/manager/tours?id=" + encodeURIComponent(id), { method: "DELETE" });
    const b = await r.json(); if (!r.ok) { setMessage(b.error); return; } applyData(b); setMessage("Guest removed.");
  }

  async function cancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!cancelTarget) return;
    if (!window.confirm("Cancel this flight, send the message to every guest, and move them to future available flights?")) return;
    setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const r = await fetch("/api/manager/tours", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: cancelTarget.date, time: cancelTarget.time, message: values.message }) });
    const b = await r.json(); setBusy(false);
    if (!r.ok) { setMessage(b.error); return; }
    applyData(b); setCancelTarget(null); setMessage(b.managerText || "Tour cancelled, guests rescheduled, and notifications sent.");
  }

  return <section id="tours" className="coupon-manager tour-manager"><p className="eyebrow">Tour operations</p><h2>Scheduled tours</h2><p>Every upcoming flight is listed below. Set the launch threshold and ticket price below. Each flight can hold up to {TOUR_CAPACITY} guests; public copy, Stripe Checkout, and future email updates use these settings. Cancelling a flight moves every guest to the next available Saturday and emails the message you provide.</p><p className="media-message" role="status">{message}</p>
    <form className="tour-threshold-form" onSubmit={saveSettings}><label>Guests required to launch a tour<input type="number" min="1" max={TOUR_CAPACITY} value={minimum} onChange={(event) => setMinimum(Number(event.target.value))} required /></label><label>Tour ticket price (USD)<input type="number" min="1" max="1000" step="0.01" value={tourPrice} onChange={(event) => setTourPrice(Number(event.target.value))} required /><small>Applied to each new Stripe Checkout session.</small></label><button className="button" disabled={busy}>{busy ? "Saving..." : "Save tour settings"}</button></form><div className="tour-schedule-grid">{scheduledTours.length ? scheduledTours.map((tour) => <article className="tour-schedule-card" key={tour.date + tour.time}><p className="eyebrow">{tour.confirmed ? "Tour is on" : "Tentatively set"}</p><h3>{tour.displayDate}</h3><strong>{tour.time}</strong><dl><div><dt>Guests</dt><dd>{tour.guests}</dd></div><div><dt>Tickets</dt><dd>{tour.tickets} / {TOUR_CAPACITY}</dd></div><div><dt>Status</dt><dd>{tour.confirmed ? minimum + "-guest minimum met" : Math.max(minimum - tour.tickets, 0) + " more needed"}</dd></div></dl><button className="tour-cancel-button" type="button" onClick={() => setCancelTarget(tour)} disabled={busy}>Cancel + notify guests</button></article>) : <p className="tour-schedule-empty">No scheduled tours yet.</p>}</div>
    {cancelTarget ? <form className="tour-cancel-form" onSubmit={cancel}><p className="eyebrow">Cancel scheduled flight</p><h3>{cancelTarget.displayDate} at {cancelTarget.time}</h3><p>This will move {cancelTarget.guests} guest registration(s) to the next available Saturday flight(s) and send the following message to every guest.</p><label>Message to guests<textarea name="message" required rows={4} defaultValue={"We are sorry, but this brewery tour needs to be rescheduled. Your registration has been moved to the next available tour date."} /></label><div><button className="button" disabled={busy}>{busy ? "Rescheduling..." : "Cancel, reschedule + send"}</button><button className="button button-outline" type="button" onClick={() => setCancelTarget(null)} disabled={busy}>Keep this tour</button></div></form> : null}
    <h3 className="tour-signups-heading">Individual signups</h3><form onSubmit={add} className="manager-add-form"><label>Name<input name="name" required /></label><label>Email<input name="email" type="email" required /></label><label>Tickets<input name="tickets" type="number" min="1" max="6" defaultValue="1" required /></label><button className="button" disabled={busy}>Add guest</button></form><ul className="coupon-manager-list">{signups.length ? signups.map((item) => <li key={item.id}><span><strong>{item.name}</strong> - {item.tickets} ticket(s), {item.tourDate} {item.tourTime}<br />{item.email} · <em>{item.paymentStatus === "paid" ? "Paid via Stripe" : "Payment pending"}</em></span><button type="button" onClick={() => remove(item.id)}>Remove</button></li>) : <li>No tour signups yet.</li>}</ul>
  </section>;
}

type ManagedEvent = { id: string; eventType?: "special" | "live_music"; title: string; date: string; startTime: string; endTime: string; location: string; description: string; ticketUrl: string; imageUrl?: string; galleryImages?: string[]; published: boolean; recurrence?: { frequency: string; interval: number; weekday?: number; ordinal?: number; endDate?: string } };

function eventGalleryImages(event: ManagedEvent) {
  return [...new Set([...(event.imageUrl ? [event.imageUrl] : []), ...(event.galleryImages || [])])];
}

async function readEventManagerResponse(response: Response) {
  const text = await response.text();
  let body: { events?: ManagedEvent[]; error?: string } = {};
  try { body = text ? JSON.parse(text) : {}; }
  catch { body = { error: text || "Event request failed." }; }
  if (!response.ok) throw new Error(body.error || "Event request failed.");
  return body;
}

function eventErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Event request failed.";
}

function EventFormFields({ event }: { event?: ManagedEvent }) {
  const recurrence = event?.recurrence;
  return <>
    <label>Event type<select name="eventType" defaultValue={event?.eventType || "special"}><option value="special">Special event</option><option value="live_music">Live music</option></select></label>
    <label>Event title<input name="title" required maxLength={120} placeholder="Example: Summer Lager Release" defaultValue={event?.title || ""} /></label>
    <label>Date<input name="date" type="date" required defaultValue={event?.date || ""} /></label>
    <label>Starts<input name="startTime" type="time" required defaultValue={event?.startTime || ""} /></label>
    <label>Ends <small>(optional)</small><input name="endTime" type="time" defaultValue={event?.endTime || ""} /></label>
    <label>Repeat<select name="recurrenceFrequency" defaultValue={recurrence?.frequency || "none"}><option value="none">Does not repeat</option><option value="daily">Every day</option><option value="weekly">Every week</option><option value="biweekly">Every 2 weeks</option><option value="monthly-date">Every month on this date</option><option value="monthly-weekday">Every month by weekday</option><option value="yearly">Every year</option></select></label>
    <label>Repeat every <small>(interval)</small><input name="recurrenceInterval" type="number" min="1" max="12" defaultValue={recurrence?.interval || 1} /></label>
    <label>Weekday <small>(monthly option)</small><select name="recurrenceWeekday" defaultValue={recurrence?.weekday ?? 0}><option value="0">Sunday</option><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option></select></label>
    <label>Occurrence <small>(monthly weekday)</small><select name="recurrenceOrdinal" defaultValue={recurrence?.ordinal ?? 1}><option value="1">First</option><option value="2">Second</option><option value="3">Third</option><option value="4">Fourth</option><option value="5">Fifth</option><option value="-1">Last</option></select></label>
    <label>Repeat until <small>(optional)</small><input name="recurrenceEndDate" type="date" defaultValue={recurrence?.endDate || ""} /></label>
    <label className="manager-event-wide">Location<input name="location" required maxLength={120} placeholder="Aviator Hangar Bar" defaultValue={event?.location || ""} /></label>
    <label className="manager-event-wide">Description<textarea name="description" required rows={3} maxLength={1200} placeholder="Tell guests what is happening and why they should join." defaultValue={event?.description || ""} /></label>
    <label className="manager-event-wide">Details or ticket URL <small>(optional)</small><input name="ticketUrl" type="url" placeholder="https://..." defaultValue={event?.ticketUrl || ""} /></label>
    <label className="manager-event-wide">Event photos <small>{event?.imageUrl ? "Add more photos, JPG/PNG/WEBP up to 10 MB each" : "Optional, JPG/PNG/WEBP up to 10 MB each"}</small><input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple /></label>{event && eventGalleryImages(event).length ? <div className="manager-event-current-photos manager-event-wide"><p className="eyebrow">Current event photos</p>{eventGalleryImages(event).map((image, index) => <label key={image}><img src={image} alt="" loading="lazy" /><span>{index === 0 ? "Lead photo" : "Gallery photo"}</span><small><input name="removeGalleryImages" type="checkbox" value={image} /> Remove</small></label>)}</div> : null}
    <label className="manager-event-publish"><input name="published" type="checkbox" defaultChecked={event ? event.published : true} /> Publish on the Events page</label>
  </>;
}

function EventManager() {
  const [events, setEvents] = useState<ManagedEvent[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<ManagedEvent | null>(null);
  async function load() { const response = await fetch("/api/manager/events"); const body = await readEventManagerResponse(response); setEvents(body.events || []); }
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("Saving event...");
    const form = event.currentTarget; const values = new FormData(form); values.set("published", values.get("published") === "on" ? "true" : "false");
    try {
      const response = await fetch("/api/manager/events", { method: "POST", body: values });
      const body = await readEventManagerResponse(response);
      setEvents(body.events || []); form.reset(); setMessage("Special event saved.");
    } catch (error) { setMessage(eventErrorMessage(error)); }
    finally { setBusy(false); }
  }
  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return; setBusy(true); setMessage("Saving event changes...");
    const values = new FormData(event.currentTarget); values.set("id", editing.id); values.set("published", values.get("published") === "on" ? "true" : "false");
    try {
      const response = await fetch("/api/manager/events", { method: "PATCH", body: values });
      const body = await readEventManagerResponse(response);
      setEvents(body.events || []); setEditing(null); setMessage("Event details updated.");
    } catch (error) { setMessage(eventErrorMessage(error)); }
    finally { setBusy(false); }
  }
  async function toggle(item: ManagedEvent) {
    setBusy(true); setMessage(item.published ? "Unpublishing event..." : "Publishing event...");
    try {
      const response = await fetch("/api/manager/events", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...item, published: !item.published }) });
      const body = await readEventManagerResponse(response);
      setEvents(body.events || []); setMessage(item.published ? "Event removed from the public page." : "Event published to the public Events page.");
    } catch (error) { setMessage(eventErrorMessage(error)); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!window.confirm("Delete this special event? This cannot be undone.")) return;
    setBusy(true); setMessage("Deleting event...");
    try {
      const response = await fetch("/api/manager/events?id=" + encodeURIComponent(id), { method: "DELETE" });
      const body = await readEventManagerResponse(response);
      setEvents(body.events || []); if (editing?.id === id) setEditing(null); setMessage("Event deleted.");
    } catch (error) { setMessage(eventErrorMessage(error)); }
    finally { setBusy(false); }
  }
  return <section id="events" className="coupon-manager manager-events"><p className="eyebrow">Event operations</p><h2>Add an event</h2><p>Publish special events or live music to the database. Flight Log reads special events and live music from these manager-published rows.</p><p className="media-message" role="status">{message}</p>
    <form className="manager-event-form" onSubmit={create}><EventFormFields /><button className="button" disabled={busy}>{busy ? "Saving..." : "Publish special event"}</button></form>
    <div className="manager-events-saved-panel"><h3 className="tour-signups-heading">Managed special events</h3><div className="manager-events-list">{events.length ? events.map((item) => {
      const isEditing = editing?.id === item.id;
      return <article className={isEditing ? "is-editing" : ""} key={item.id}>{isEditing ? <form className="manager-event-form manager-event-edit-form" onSubmit={update}><EventFormFields event={item} /><div className="manager-event-edit-actions"><button className="button" disabled={busy}>{busy ? "Saving..." : "Save event changes"}</button><button className="button button-outline" type="button" onClick={() => setEditing(null)} disabled={busy}>Cancel</button></div></form> : <><div className="manager-event-content">{eventGalleryImages(item).length ? <div className="manager-event-thumb-strip">{eventGalleryImages(item).slice(0, 4).map((image, index) => <img src={image} alt="" loading="lazy" key={image} className={index === 0 ? "is-lead" : ""} />)}{eventGalleryImages(item).length > 4 ? <span>+{eventGalleryImages(item).length - 4}</span> : null}</div> : <div className="manager-event-image-placeholder">Event</div>}<div className="manager-event-meta"><p className="eyebrow">{item.published ? "Published" : "Draft"} · {item.eventType === "live_music" ? "Live music" : "Special event"}</p><h3>{item.title}</h3><p>{item.date} · {item.startTime}{item.endTime ? `–${item.endTime}` : ""} · {item.location}</p>{item.recurrence && item.recurrence.frequency !== "none" ? <small>Repeats: {item.recurrence.frequency.replace("-", " ")} every {item.recurrence.interval}{item.recurrence.endDate ? ` until ${item.recurrence.endDate}` : ""}</small> : null}{item.ticketUrl ? <small>Link: {item.ticketUrl}</small> : null}</div><p className="manager-event-description">{item.description}</p></div><footer><button type="button" onClick={() => { setEditing(item); setMessage("Editing " + item.title + "."); }} disabled={busy}>Edit</button><button type="button" onClick={() => toggle(item)} disabled={busy}>{item.published ? "Unpublish" : "Publish"}</button><button type="button" onClick={() => remove(item.id)} disabled={busy}>Delete</button></footer></>} </article>;
    }) : <p className="tour-schedule-empty">No special events have been added yet.</p>}</div></div>
    <div className="manager-events-media-panel"><WebsitePhotosLibrary accessKey="manager-session" location={{ slug: "events", name: "Events Page" }} /></div>
  </section>;
}

type KegInventoryItem = { beerName: string; category: string; packaging: string; sixthBblKegs: number; fiftyLKegs: number; totalBbl: number; sixthBblPriceCents?: number; fiftyLPriceCents?: number; caseSize?: string; casePriceCents?: number; case12PriceCents?: number; case16PriceCents?: number; case12Count?: number; case16Count?: number; caseCount?: number; hidden?: boolean };
type KegInventoryStatus = { items: KegInventoryItem[]; updatedAt: string; uploadedAt: string } | null;

type KegEditValues = {
  beerName: string;
  category: string;
  packaging: string;
  sixthBblKegs: number;
  fiftyLKegs: number;
  totalBbl: number;
  sixthBblPrice: string;
  fiftyLPrice: string;
  caseSize: string;
  casePrice: string;
  case12Price: string;
  case16Price: string;
  case12Count: number;
  case16Count: number;
  caseCount: number;
  hidden: boolean;
};

function kegMoney(cents?: number) { return typeof cents === "number" ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100) : "-"; }
function kegCaseCount(item: KegInventoryItem) { return (item.case12Count || 0) + (item.case16Count || 0) || (item.caseCount || 0); }
function kegHasInventory(item: KegInventoryItem) { return item.sixthBblKegs > 0 || item.fiftyLKegs > 0 || kegCaseCount(item) > 0; }
function kegHasMatchedPrice(item: KegInventoryItem) { return typeof item.sixthBblPriceCents === "number" || typeof item.fiftyLPriceCents === "number" || typeof item.casePriceCents === "number" || typeof item.case12PriceCents === "number" || typeof item.case16PriceCents === "number"; }
function kegDollars(cents?: number) { return typeof cents === "number" ? String(cents / 100) : ""; }
function kegCents(value: string) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : undefined; }
function editValues(item: KegInventoryItem): KegEditValues {
  return { beerName: item.beerName, category: item.category, packaging: item.packaging, sixthBblKegs: item.sixthBblKegs, fiftyLKegs: item.fiftyLKegs, totalBbl: item.totalBbl, sixthBblPrice: kegDollars(item.sixthBblPriceCents), fiftyLPrice: kegDollars(item.fiftyLPriceCents), caseSize: item.caseSize || "", casePrice: kegDollars(item.casePriceCents), case12Price: kegDollars(item.case12PriceCents), case16Price: kegDollars(item.case16PriceCents), case12Count: item.case12Count || 0, case16Count: item.case16Count || 0, caseCount: item.caseCount || 0, hidden: item.hidden === true };
}
function pdfText(value: string) { return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }
function pdfMoney(cents?: number) { return typeof cents === "number" ? "$" + (cents / 100).toFixed(0) : "-"; }
function downloadKegPdf(items: KegInventoryItem[], includeZeroInventory: boolean) {
  const rows = items.filter((item) => item.hidden !== true && (includeZeroInventory || kegHasInventory(item))).sort((a, b) => a.category.localeCompare(b.category) || a.beerName.localeCompare(b.beerName));
  const created = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const lines = ["Aviator Brewing Company Keg Sales", "Exported " + created + (includeZeroInventory ? " - includes zero inventory" : " - available inventory only"), "", ...rows.map((item) => {
    const packages = [
      "1/6 BBL: " + item.sixthBblKegs + " available, " + pdfMoney(item.sixthBblPriceCents),
      "50L: " + item.fiftyLKegs + " available, " + pdfMoney(item.fiftyLPriceCents),
      (item.case12Count || item.case12PriceCents) ? "12oz cases: " + (item.case12Count || 0) + " available, " + pdfMoney(item.case12PriceCents) : "",
      (item.case16Count || item.case16PriceCents) ? "16oz cases: " + (item.case16Count || 0) + " available, " + pdfMoney(item.case16PriceCents) : "",
    ].filter(Boolean).join(" | ");
    return item.beerName + " - " + item.category + " - " + packages;
  })];
  if (!rows.length) lines.push("No kegs match this export.");
  const pageHeight = 792;
  const pageWidth = 612;
  const margin = 42;
  const lineHeight = 17;
  const pages: string[][] = [];
  let page: string[] = [];
  for (const line of lines) {
    if (page.length >= 40) { pages.push(page); page = []; }
    page.push(line);
  }
  pages.push(page);
  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [" + pages.map((_, index) => (3 + index * 2) + " 0 R").join(" ") + "] /Count " + pages.length + " >>"];
  pages.forEach((pageLines, index) => {
    const pageObject = 3 + index * 2;
    const contentObject = pageObject + 1;
    objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + pageWidth + " " + pageHeight + "] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents " + contentObject + " 0 R >>");
    const content = ["BT", "/F1 11 Tf", "14 TL", margin + " " + (pageHeight - margin) + " Td", ...pageLines.map((line, lineIndex) => (lineIndex ? "T* " : "") + "(" + pdfText(line.slice(0, 112)) + ") Tj"), "ET"].join("\n");
    objects.push("<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream");
  });
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += (index + 1) + " 0 obj\n" + object + "\nendobj\n"; });
  const xref = pdf.length;
  pdf += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n" + offsets.slice(1).map((offset) => String(offset).padStart(10, "0") + " 00000 n ").join("\n") + "\n";
  pdf += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
  link.download = "aviator-keg-sales.pdf";
  link.click();
  URL.revokeObjectURL(link.href);
}

function KegInventoryManager() {
  const [inventory, setInventory] = useState<KegInventoryStatus>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<KegInventoryItem | null>(null);
  const [editForm, setEditForm] = useState<KegEditValues | null>(null);
  const [exportZeroInventory, setExportZeroInventory] = useState(false);
  const [selectedKegFile, setSelectedKegFile] = useState<File | null>(null);
  async function load() {
    const response = await fetch("/api/manager/kegs");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load keg inventory.");
    setInventory(body.inventory || null);
  }
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);
  function beginEdit(item: KegInventoryItem) { setEditing(item); setEditForm(editValues(item)); setMessage("Editing " + item.beerName + "."); }
  function updateEdit<K extends keyof KegEditValues>(key: K, value: KegEditValues[K]) { setEditForm((current) => current ? { ...current, [key]: value } : current); }
  async function uploadFile(file: File, reset: () => void) {
    setBusy(true); setMessage("Importing keg inventory...");
    const formData = new FormData();
    formData.set("file", file);
    const response = await fetch("/api/manager/kegs", { method: "POST", body: formData });
    const body = await response.json();
    setBusy(false);
    const copyMessage = body.savedCopy ? " Saved copy: " + body.savedCopy + "." : "";
    if (!response.ok) { setMessage((body.error || "Could not import keg inventory.") + copyMessage); return; }
    setInventory(body.inventory); reset();
    setMessage((body.inventory.items || []).length + " keg/package rows imported. " + (body.inventory.items || []).filter((item: KegInventoryItem) => kegHasMatchedPrice(item)).length + " include package pricing. " + (body.inventory.items || []).filter((item: KegInventoryItem) => !item.hidden && kegHasInventory(item)).length + " are visible on the public Kegs page." + copyMessage);
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedKegFile) { setMessage("Choose a keg inventory JSON or CSV file first."); return; }
    await uploadFile(selectedKegFile, () => setSelectedKegFile(null));
  }
  async function importSelectedFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] || null;
    setSelectedKegFile(file);
    if (!file) { setMessage(""); return; }
    const rawText = await file.text();
    if (file.name.toLowerCase().endsWith(".csv")) {
      const rows = rawText.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim()).length;
      setMessage("Selected " + file.name + ": about " + Math.max(rows - 1, 0) + " CSV keg rows ready to import.");
      return;
    }
    try {
      const source = JSON.parse(rawText.replace(/^\uFEFF/, "")) as { items?: unknown };
      if (!Array.isArray(source?.items)) {
        setMessage("Selected " + file.name + ", but it has no items array. Choose the kegs-for-sale JSON export or use a CSV with headers.");
        return;
      }
      setMessage("Selected " + file.name + ": " + source.items.length + " keg rows ready to import.");
    } catch {
      setMessage("Selected " + file.name + ", but it is not valid JSON. CSV files should end in .csv.");
    }
  }
  async function clearInventory() {
    if (!window.confirm("Clear all keg/package sales rows? This removes the currently imported availability and package pricing.")) return;
    setBusy(true); setMessage("");
    const response = await fetch("/api/manager/kegs", { method: "DELETE" });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) { setMessage(body.error || "Could not clear keg inventory."); return; }
    setInventory(body.inventory);
    setMessage("Keg/package sales inventory cleared.");
  }
  async function toggle(item: KegInventoryItem) {
    setBusy(true); setMessage("");
    const response = await fetch("/api/manager/kegs", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ beerName: item.beerName, hidden: !item.hidden }) });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) { setMessage(body.error || "Could not update keg visibility."); return; }
    setInventory(body.inventory); setMessage(item.beerName + (item.hidden ? " published for sale." : " hidden from keg sales."));
  }
  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !editForm) return;
    setBusy(true); setMessage("");
    const response = await fetch("/api/manager/kegs", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({
      action: "edit",
      beerName: editing.beerName,
      nextBeerName: editForm.beerName,
      category: editForm.category,
      packaging: editForm.packaging,
      sixthBblKegs: editForm.sixthBblKegs,
      fiftyLKegs: editForm.fiftyLKegs,
      totalBbl: editForm.totalBbl,
      sixthBblPriceCents: kegCents(editForm.sixthBblPrice),
      fiftyLPriceCents: kegCents(editForm.fiftyLPrice),
      caseSize: editForm.caseSize,
      casePriceCents: kegCents(editForm.casePrice),
      case12PriceCents: kegCents(editForm.case12Price),
      case16PriceCents: kegCents(editForm.case16Price),
      case12Count: editForm.case12Count,
      case16Count: editForm.case16Count,
      caseCount: editForm.case12Count + editForm.case16Count || editForm.caseCount,
      hidden: editForm.hidden,
    }) });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) { setMessage(body.error || "Could not save keg details."); return; }
    setInventory(body.inventory); setEditing(null); setEditForm(null); setMessage(editForm.beerName + " keg details saved.");
  }
  const lastUpdated = inventory?.updatedAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(inventory.updatedAt)) : "";
  const visibleCount = inventory?.items.filter((item) => !item.hidden && kegHasInventory(item)).length || 0;
  return <section id="kegs" className="coupon-manager manager-kegs"><p className="eyebrow">Keg/package sales</p><h2>Keg/package sales</h2><p>Upload BrewOps inventory counts and package pricing together. Imports replace current availability and pricing for the uploaded kegs; each keg can still be edited, hidden, published, or exported for sales.</p><p className="media-message" role="status">{message}</p>
    <form className="manager-keg-upload" onSubmit={upload}><label>Import keg inventory JSON or CSV<input name="file" type="file" accept=".json,.csv,application/json,text/csv" onChange={importSelectedFile} disabled={busy} /><small>Choose kegs-for-sale.json or a CSV export, then click Import selected keg list. CSV headers can include beerName, sixthBblKegs, sixthBblPrice, fiftyLKegs, fiftyLPrice, cases12oz, case12ozPrice, cases16oz, case16ozPrice, totalBbl, batches, loose12oz, and loose16oz.</small>{selectedKegFile ? <small>Selected: {selectedKegFile.name}</small> : null}</label><button className="button" disabled={busy || !selectedKegFile}>{busy ? "Importing..." : "Import selected keg list"}</button><button className="button button-outline" type="button" onClick={clearInventory} disabled={busy}>Clear inventory</button></form>
    {inventory ? <div className="manager-keg-status"><div><p className="eyebrow">Public inventory live</p><h3>{visibleCount} of {inventory.items.length} keg lines visible</h3><p>Inventory timestamp: {lastUpdated}. Upload time: {new Date(inventory.uploadedAt).toLocaleString()}.</p><div className="manager-keg-export"><label><input type="checkbox" checked={exportZeroInventory} onChange={(event) => setExportZeroInventory(event.currentTarget.checked)} /> Include kegs with 0 inventory</label><button type="button" onClick={() => downloadKegPdf(inventory.items, exportZeroInventory)}>Export PDF</button></div></div><ul>{inventory.items.slice(0, 8).map((item) => <li key={item.beerName}><strong>{item.beerName}</strong><span>{item.sixthBblKegs} sixtels · {item.fiftyLKegs} halves · {kegCaseCount(item)} cases</span></li>)}{inventory.items.length > 8 ? <li>+ {inventory.items.length - 8} more lines below</li> : null}</ul></div> : <div className="manager-keg-status is-empty"><p className="eyebrow">No inventory published</p><p>Upload BrewOps JSON or CSV to add current keg availability counts and package pricing.</p></div>}
    {inventory ? <div className="manager-keg-list"><h3 className="tour-signups-heading">Keg/package sales</h3>{inventory.items.map((item) => {
      const hasInventory = kegHasInventory(item); const publicHidden = item.hidden || !hasInventory; const isEditing = editing?.beerName === item.beerName;
      return <article className={"manager-keg-row" + (publicHidden ? " is-hidden" : "") + (isEditing ? " is-editing" : "")} key={item.beerName}>{isEditing && editForm ? <form className="manager-keg-edit-form" onSubmit={saveEdit}><label>Keg name<input required maxLength={120} value={editForm.beerName} onChange={(event) => updateEdit("beerName", event.currentTarget.value)} /></label><label>Category<input required maxLength={80} value={editForm.category} onChange={(event) => updateEdit("category", event.currentTarget.value)} /></label><label>Packaging<input required maxLength={80} value={editForm.packaging} onChange={(event) => updateEdit("packaging", event.currentTarget.value)} /></label><label>1/6 BBL inventory<input type="number" min="0" max="10000" value={editForm.sixthBblKegs} onChange={(event) => updateEdit("sixthBblKegs", Number(event.currentTarget.value))} /></label><label>50L inventory<input type="number" min="0" max="10000" value={editForm.fiftyLKegs} onChange={(event) => updateEdit("fiftyLKegs", Number(event.currentTarget.value))} /></label><label>Total BBL<input type="number" min="0" max="100000" step="0.01" value={editForm.totalBbl} onChange={(event) => updateEdit("totalBbl", Number(event.currentTarget.value))} /></label><label>1/6 BBL price<input type="number" min="0" step="0.01" value={editForm.sixthBblPrice} onChange={(event) => updateEdit("sixthBblPrice", event.currentTarget.value)} /></label><label>50L price<input type="number" min="0" step="0.01" value={editForm.fiftyLPrice} onChange={(event) => updateEdit("fiftyLPrice", event.currentTarget.value)} /></label><label>Case size<input maxLength={24} value={editForm.caseSize} onChange={(event) => updateEdit("caseSize", event.currentTarget.value)} /></label><label>12oz case price<input type="number" min="0" step="0.01" value={editForm.case12Price} onChange={(event) => updateEdit("case12Price", event.currentTarget.value)} /></label><label>12oz cases<input type="number" min="0" max="10000" value={editForm.case12Count} onChange={(event) => updateEdit("case12Count", Number(event.currentTarget.value))} /></label><label>16oz case price<input type="number" min="0" step="0.01" value={editForm.case16Price} onChange={(event) => updateEdit("case16Price", event.currentTarget.value)} /></label><label>16oz cases<input type="number" min="0" max="10000" value={editForm.case16Count} onChange={(event) => updateEdit("case16Count", Number(event.currentTarget.value))} /></label><label>Generic case price<input type="number" min="0" step="0.01" value={editForm.casePrice} onChange={(event) => updateEdit("casePrice", event.currentTarget.value)} /></label><label className="manager-keg-check"><input type="checkbox" checked={editForm.hidden} onChange={(event) => updateEdit("hidden", event.currentTarget.checked)} /> Hide from public keg sales</label><div className="manager-keg-edit-actions"><button className="button" disabled={busy}>{busy ? "Saving..." : "Save keg details"}</button><button className="button button-outline" type="button" onClick={() => { setEditing(null); setEditForm(null); }} disabled={busy}>Cancel</button></div></form> : <><div><p className="eyebrow">{item.category} · {item.packaging} · {item.hidden ? "Hidden" : hasInventory ? "Published" : "Auto hidden - no inventory"}</p><h3>{item.beerName}</h3><p>1/6 bbl {kegMoney(item.sixthBblPriceCents)} · 50L {kegMoney(item.fiftyLPriceCents)}{item.case12PriceCents || item.case12Count ? " · 12oz case " + kegMoney(item.case12PriceCents) : ""}{item.case16PriceCents || item.case16Count ? " · 16oz case " + kegMoney(item.case16PriceCents) : ""}{item.casePriceCents && !item.case12PriceCents && !item.case16PriceCents ? " · " + (item.caseSize || "Case") + " " + kegMoney(item.casePriceCents) : ""}</p><small>{item.sixthBblKegs} sixtels · {item.fiftyLKegs} 50L · {item.case12Count || 0} 12oz cases · {item.case16Count || 0} 16oz cases</small></div><footer><button type="button" onClick={() => beginEdit(item)} disabled={busy}>Edit</button><button type="button" onClick={() => toggle(item)} disabled={busy || !hasInventory}>{!hasInventory ? "Auto hidden" : item.hidden ? "Publish" : "Hide"}</button></footer></>}</article>;
    })}</div> : null}
  </section>;
}

type BeerReleaseAlert = { id: string; enabled: boolean; beerName: string; releaseDate: string; releaseTime: string; locations: string; specials: string; sellSheetUrl: string; updatedAt: string };

function BeerReleaseAlertManager() {
  const [alerts, setAlerts] = useState<BeerReleaseAlert[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  async function load() { const response = await fetch("/api/manager/beer-release-alert", { cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setAlerts(body.alerts || []); }
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = event.currentTarget; const values = new FormData(form); values.set("enabled", values.get("enabled") === "on" ? "true" : "false");
    const response = await fetch("/api/manager/beer-release-alert", { method: "POST", body: values });
    const body = await response.json(); setBusy(false);
    if (!response.ok) { setMessage(body.error || "Could not create new release alert."); return; }
    setAlerts(body.alerts || []); setAdding(false); form.reset(); setMessage("New Release Alert created.");
  }
  async function save(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault(); setBusy(true); setMessage("");
    const values = new FormData(event.currentTarget); values.set("id", id); values.set("enabled", values.get("enabled") === "on" ? "true" : "false");
    const response = await fetch("/api/manager/beer-release-alert", { method: "PATCH", body: values });
    const body = await response.json(); setBusy(false);
    if (!response.ok) { setMessage(body.error || "Could not save New Release Alert."); return; }
    setAlerts(body.alerts || []); setEditingId(null); setMessage("New Release Alert saved.");
  }
  async function setPublished(alert: BeerReleaseAlert, enabled: boolean) {
    setBusy(true); setMessage("");
    const response = await fetch("/api/manager/beer-release-alert", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: alert.id, enabled }) });
    const body = await response.json(); setBusy(false);
    if (!response.ok) { setMessage(body.error || "Could not update release status."); return; }
    setAlerts(body.alerts || []); setMessage(enabled ? "New Release Alert published on the homepage." : "New Release Alert unpublished from the homepage.");
  }
  async function remove(alert: BeerReleaseAlert) {
    if (!window.confirm("Are you sure you want to delete " + (alert.beerName || "this New Release Alert") + "?")) return;
    setBusy(true); setMessage("");
    const response = await fetch("/api/manager/beer-release-alert?id=" + encodeURIComponent(alert.id), { method: "DELETE" });
    const body = await response.json(); setBusy(false);
    if (!response.ok) { setMessage(body.error || "Could not delete New Release Alert."); return; }
    setAlerts(body.alerts || []); if (editingId === alert.id) setEditingId(null); setMessage("New Release Alert deleted.");
  }
  function releaseWhen(alert: BeerReleaseAlert) { return [alert.releaseDate, alert.releaseTime].filter(Boolean).join(" at ") || "Release time not set"; }
  function releaseStatus(alert: BeerReleaseAlert) { return alert.enabled && alert.beerName ? "Published" : alert.enabled ? "Needs release name" : "Unpublished"; }
  function fields(alert?: BeerReleaseAlert) {
    return <><label className="manager-event-publish"><input name="enabled" type="checkbox" defaultChecked={alert?.enabled || false} /> Publish New Release Alert</label><label>Release name<input name="beerName" required maxLength={120} defaultValue={alert?.beerName || ""} placeholder="Example: Jetstream IPA, Barrel Pick, THC soda" /></label><label>Release date<input name="releaseDate" type="date" defaultValue={alert?.releaseDate || ""} /></label><label>Release time<input name="releaseTime" type="time" defaultValue={alert?.releaseTime || ""} /></label><label className="manager-event-wide">Locations<input name="locations" maxLength={300} defaultValue={alert?.locations || ""} placeholder="Example: Brewery, Hangar Bar, TapHouse" /></label><label className="manager-event-wide">Specials<input name="specials" maxLength={300} defaultValue={alert?.specials || ""} placeholder="Example: Free pint glass while supplies last" /></label><label className="manager-event-wide">Sell sheet <small>{alert?.sellSheetUrl ? "Optional replacement, JPG/PNG/WEBP/PDF up to 25 MB" : "JPG/PNG/WEBP/PDF up to 25 MB"}</small><input name="sellSheet" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" /></label></>;
  }
  return <section id="beer-release-alert" className="coupon-manager manager-beer-release-alert"><p className="eyebrow">Homepage alert</p><h2>New Release Alerts</h2><p>Show bold release notices directly under the scrolling banner. Use these for beer, liquor, THC soda, seltzer, or any other Aviator release.</p><p className="media-message" role="status">{message}</p>
    <div className="manager-beer-release-list"><h3 className="tour-signups-heading">Saved New Release Alerts</h3>{alerts.length ? alerts.map((alert) => { const visible = Boolean(alert.enabled && alert.beerName); const editing = editingId === alert.id; return <article className={"manager-beer-release-item" + (!visible ? " is-hidden" : "")} key={alert.id}>{editing ? <form key={alert.updatedAt || alert.id} className="manager-beer-release-form" onSubmit={(event) => save(event, alert.id)}>{fields(alert)}<div className="manager-beer-release-edit-actions"><button className="button" disabled={busy}>{busy ? "Saving..." : "Save New Release Alert"}</button><button className="button button-outline" type="button" onClick={() => setEditingId(null)} disabled={busy}>Cancel</button></div></form> : <div className="manager-beer-release-row"><div className="manager-beer-release-summary"><p className="eyebrow">{releaseStatus(alert)}</p><h3>{alert.beerName || "Untitled New Release"}</h3><p>{releaseWhen(alert)}</p><small>{alert.locations || "Locations not set"}{alert.specials ? " · " + alert.specials : ""}</small>{alert.sellSheetUrl ? <a href={alert.sellSheetUrl} target="_blank" rel="noreferrer">Open sell sheet</a> : <span>No sell sheet uploaded</span>}</div>{alert.sellSheetUrl ? <div className="manager-beer-release-thumb">{alert.sellSheetUrl.toLowerCase().endsWith(".pdf") ? <span>PDF</span> : <img src={alert.sellSheetUrl} alt="" />}</div> : null}<footer><button type="button" onClick={() => setEditingId(alert.id)} disabled={busy}>Edit</button><button type="button" onClick={() => setPublished(alert, !alert.enabled)} disabled={busy}>{alert.enabled ? "Unpublish" : "Publish"}</button><button type="button" onClick={() => remove(alert)} disabled={busy}>Delete</button></footer></div>}</article>; }) : <p>No New Release Alerts saved yet.</p>}<button className="button manager-beer-release-add" type="button" onClick={() => setAdding(true)} disabled={busy}>Add New Release</button></div>
    {adding ? <div className="manager-release-modal" role="dialog" aria-modal="true" aria-labelledby="new-release-title"><form className="manager-release-modal-card manager-beer-release-form" onSubmit={create}><header><div><p className="eyebrow">New release</p><h3 id="new-release-title">Add New Release Alert</h3></div><button type="button" onClick={() => setAdding(false)} disabled={busy} aria-label="Close new release window">Close</button></header>{fields()}<div className="manager-beer-release-edit-actions"><button className="button" disabled={busy}>{busy ? "Saving..." : "Create New Release Alert"}</button><button className="button button-outline" type="button" onClick={() => setAdding(false)} disabled={busy}>Cancel</button></div></form></div> : null}
  </section>;
}

type PortalBeer = { id: string; source: "catalog" | "managed"; slug: string; name: string; style: string; abv: string; category: string; description: string; status: "Year-round" | "Seasonal" | "Limited"; image: string; published: boolean };
type PortalBeverage = { id: string; source: "catalog" | "managed"; slug: string; name: string; category: string; description: string; note: string; image: string };

function BeerManager() {
  const [beers, setBeers] = useState<PortalBeer[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<PortalBeer | null>(null);
  async function load() { const response = await fetch("/api/manager/beers", { cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setBeers(body.beers || []); }
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);
  function beginEdit(beer: PortalBeer) { setEditing(beer); setMessage("Editing " + beer.name + " in place."); }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const form = event.currentTarget; const response = await fetch("/api/manager/beers", { method: "POST", body: new FormData(form) }); const body = await response.json(); setBusy(false);
    if (!response.ok) { setMessage(body.error); return; } setBeers(body.beers || []); form.reset(); setMessage("Beer added to the master list.");
  }
  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const response = await fetch("/api/manager/beers", { method: "PATCH", body: new FormData(event.currentTarget) }); const body = await response.json(); setBusy(false);
    if (!response.ok) { setMessage(body.error); return; } setBeers(body.beers || []); setEditing(null); setMessage("Beer details updated.");
  }
  async function togglePublished(beer: PortalBeer) {
    const form = new FormData();
    form.set("id", beer.id); form.set("name", beer.name); form.set("style", beer.style); form.set("abv", beer.abv); form.set("category", beer.category); form.set("status", beer.status); form.set("description", beer.description); form.set("published", beer.published ? "false" : "true");
    setBusy(true); const response = await fetch("/api/manager/beers", { method: "PATCH", body: form }); const body = await response.json(); setBusy(false);
    if (!response.ok) { setMessage(body.error); return; } setBeers(body.beers || []); setMessage(beer.name + (beer.published ? " hidden from the website." : " published to the website."));
  }
  async function remove(beer: PortalBeer) {
    if (!window.confirm("Remove " + beer.name + " from the master beer list?")) return;
    setBusy(true); const response = await fetch("/api/manager/beers?id=" + encodeURIComponent(beer.id), { method: "DELETE" }); const body = await response.json(); setBusy(false);
    if (!response.ok) { setMessage(body.error); return; } setBeers(body.beers || []); setMessage(beer.name + " removed from the master list.");
  }
  return <section id="beers" className="coupon-manager manager-beers"><p className="eyebrow">Beer operations</p><h2>Beer master list</h2><p>Keep every beer in the master list, then choose which beers are published and visible on the website.</p><p className="media-message" role="status">{message}</p>
    <h3 className="tour-signups-heading">Master list of beers</h3><div className="manager-beer-list">{beers.map((beer) => {
      const isEditing = editing?.id === beer.id;
      return <article className={"manager-beer-row" + (isEditing ? " is-editing" : "") + (!beer.published ? " is-unpublished" : "")} key={beer.id}><BeerImageViewer beer={beer} className="manager-beer-thumb" />{isEditing ? <form className="manager-beer-inline-form" onSubmit={update}><input type="hidden" name="id" value={beer.id} /><label>Beer name<input name="name" required maxLength={100} defaultValue={beer.name} /></label><label>Style<input name="style" required maxLength={100} defaultValue={beer.style} /></label><label>ABV<input name="abv" required maxLength={24} defaultValue={beer.abv} /></label><label>Category<select name="category" defaultValue={beer.category}><option>IPA</option><option>Lager</option><option>Ale</option><option>Dark Beer</option><option>High Gravity</option><option>Limited Release</option></select></label><label>Availability<select name="status" defaultValue={beer.status}><option>Year-round</option><option>Seasonal</option><option>Limited</option></select></label><label>Replace graphic <input name="graphic" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf" /><small>PNG, JPG, WEBP, or PDF · optional</small></label><label className="manager-event-publish"><input name="published" type="checkbox" value="true" defaultChecked={beer.published !== false} /> Publish this beer on the website</label><label className="manager-beer-inline-wide">Tasting notes<textarea name="description" required rows={3} maxLength={500} defaultValue={beer.description} /></label><div className="manager-beer-inline-actions"><button className="button" disabled={busy}>{busy ? "Saving..." : "Save changes"}</button><button className="button button-outline" type="button" onClick={() => setEditing(null)} disabled={busy}>Cancel</button></div></form> : <><div><p className="eyebrow">{beer.source === "catalog" ? "Core catalog" : "Manager added"} · {beer.status} · {beer.published ? "Published" : "Hidden"}</p><h3>{beer.name}</h3><p>{beer.style} · {beer.abv} · {beer.category}</p><small>{beer.description}</small></div><footer><button type="button" onClick={() => beginEdit(beer)} disabled={busy}>Edit</button><button type="button" onClick={() => togglePublished(beer)} disabled={busy}>{beer.published ? "Hide" : "Publish"}</button>{beer.source === "managed" ? <button type="button" onClick={() => remove(beer)} disabled={busy}>Remove</button> : null}</footer></>}</article>;
    })}</div>
    <h3 className="tour-signups-heading">Add a beer</h3><form className="manager-beer-form" onSubmit={create}><label>Beer name<input name="name" required maxLength={100} placeholder="Example: Runway Red" /></label><label>Style<input name="style" required maxLength={100} placeholder="Amber ale" /></label><label>ABV<input name="abv" required maxLength={24} placeholder="5.5% ABV" /></label><label>Category<select name="category" defaultValue="Ale"><option>IPA</option><option>Lager</option><option>Ale</option><option>Dark Beer</option><option>High Gravity</option><option>Limited Release</option></select></label><label>Availability<select name="status" defaultValue="Seasonal"><option>Year-round</option><option>Seasonal</option><option>Limited</option></select></label><label className="manager-beer-graphic">Beer graphic<input name="graphic" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf" required /><small>PNG, JPG, WEBP, or PDF · 25 MB max</small></label><label className="manager-event-publish"><input name="published" type="checkbox" value="true" defaultChecked /> Publish this beer on the website</label><label className="manager-beer-wide">Tasting notes<textarea name="description" required rows={3} maxLength={500} placeholder="Describe the flavor, aroma, and finish." /></label><button className="button" disabled={busy}>{busy ? "Adding beer..." : "Add beer to master list"}</button></form>
  </section>;
}
function BeverageManager() {
  const [beverages, setBeverages] = useState<PortalBeverage[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<PortalBeverage | null>(null);
  async function load() { const response = await fetch("/api/manager/beyond-beer"); const body = await response.json(); if (!response.ok) throw new Error(body.error); setBeverages(body.beverages || []); }
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);
  function beginEdit(beverage: PortalBeverage) { setEditing(beverage); setMessage("Editing " + beverage.name + " in place."); }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const form = event.currentTarget; const response = await fetch("/api/manager/beyond-beer", { method: "POST", body: new FormData(form) }); const body = await response.json(); setBusy(false);
    if (!response.ok) { setMessage(body.error); return; } setBeverages(body.beverages || []); form.reset(); setMessage("Beverage added to the public beverage menu.");
  }
  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const response = await fetch("/api/manager/beyond-beer", { method: "PATCH", body: new FormData(event.currentTarget) }); const body = await response.json(); setBusy(false);
    if (!response.ok) { setMessage(body.error); return; } setBeverages(body.beverages || []); setEditing(null); setMessage("Beverage details updated on the public beverage menu.");
  }
  async function remove(beverage: PortalBeverage) {
    if (!window.confirm("Remove " + beverage.name + " from the public beverage menu?")) return;
    setBusy(true); const response = await fetch("/api/manager/beyond-beer?id=" + encodeURIComponent(beverage.id), { method: "DELETE" }); const body = await response.json(); setBusy(false);
    if (!response.ok) { setMessage(body.error); return; } setBeverages(body.beverages || []); setMessage(beverage.name + " removed.");
  }
  return <section id="beverages" className="coupon-manager manager-beers"><p className="eyebrow">Beverage operations</p><h2>Soda, THC soda, and seltzer</h2><p>Edit the public beverage menu directly. Categories are kept separate as Soda, THC Soda, and Seltzer.</p><p className="media-message" role="status">{message}</p>
    <form className="manager-beer-form" onSubmit={create}><label>Beverage name<input name="name" required maxLength={100} placeholder="Example: Aviator Cola" /></label><label>Category<select name="category" defaultValue="Soda"><option>Soda</option><option>THC Soda</option><option>Seltzer</option></select></label><label className="manager-beer-graphic">Beverage graphic<input name="graphic" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf" required /><small>PNG, JPG, WEBP, or PDF - 25 MB max</small></label><label className="manager-beer-wide">Description<textarea name="description" required rows={3} maxLength={500} placeholder="Describe the product and flavor." /></label><label className="manager-beer-wide">Menu note<input name="note" required maxLength={160} placeholder="Example: Non-alcoholic - Family friendly" /></label><button className="button" disabled={busy}>{busy ? "Adding beverage..." : "Add beverage"}</button></form>
    <h3 className="tour-signups-heading">All beverage products</h3><div className="manager-beer-list">{beverages.map((beverage) => {
      const isEditing = editing?.id === beverage.id;
      return <article className={"manager-beer-row" + (isEditing ? " is-editing" : "")} key={beverage.id}>{beverage.image.toLowerCase().endsWith(".pdf") ? <a className="manager-beer-pdf" href={beverage.image} target="_blank" rel="noreferrer">PDF<br />artwork</a> : <img src={beverage.image} alt="" />}{isEditing ? <form className="manager-beer-inline-form" onSubmit={update}><input type="hidden" name="id" value={beverage.id} /><label>Beverage name<input name="name" required maxLength={100} defaultValue={beverage.name} /></label><label>Category<select name="category" defaultValue={beverage.category}><option>Soda</option><option>THC Soda</option><option>Seltzer</option></select></label><label>Replace graphic <input name="graphic" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf" /><small>PNG, JPG, WEBP, or PDF - optional</small></label><label className="manager-beer-inline-wide">Description<textarea name="description" required rows={3} maxLength={500} defaultValue={beverage.description} /></label><label className="manager-beer-inline-wide">Menu note<input name="note" required maxLength={160} defaultValue={beverage.note} /></label><div className="manager-beer-inline-actions"><button className="button" disabled={busy}>{busy ? "Saving..." : "Save changes"}</button><button className="button button-outline" type="button" onClick={() => setEditing(null)} disabled={busy}>Cancel</button></div></form> : <><div><p className="eyebrow">{beverage.source === "catalog" ? "Core beverage" : "Manager added"} - {beverage.category}</p><h3>{beverage.name}</h3><p>{beverage.note}</p><small>{beverage.description}</small></div><footer><button type="button" onClick={() => beginEdit(beverage)} disabled={busy}>Edit</button>{beverage.source === "managed" ? <button type="button" onClick={() => remove(beverage)} disabled={busy}>Remove</button> : null}</footer></>}</article>;
    })}</div>
  </section>;
}

function BreweryPhotosManager() {
  return <section className="manager-brewery-photos"><WebsitePhotosLibrary accessKey="manager-session" location={{ slug: "brewery", name: "Brewery" }} /></section>;
}

function PrivateEventPhotosManager() {
  return <section className="manager-brewery-photos manager-private-event-photos"><WebsitePhotosLibrary accessKey="manager-session" location={{ slug: "private-events", name: "Private Event Room" }} /></section>;
}

function AmphitheaterPhotosManager() {
  return <section className="manager-brewery-photos manager-amphitheater-photos"><WebsitePhotosLibrary accessKey="manager-session" location={{ slug: "aviator-amphitheater", name: "Aviator Amphitheater" }} /></section>;
}


function DatabaseManager() {
  const [health, setHealth] = useState<DatabaseHealth | null>(null);
  const [tables, setTables] = useState<DatabaseTable[]>([]);
  const [selected, setSelected] = useState("");
  const [rows, setRows] = useState<DatabaseRows | null>(null);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function request<T>(url: string) {
    const response = await fetch(url, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Database request failed.");
    return body as T;
  }

  async function checkHealth() {
    setBusy(true); setMessage("Checking database...");
    try {
      const body = await request<DatabaseHealth>("/api/manager/database?mode=health");
      setHealth(body); setMessage(body.connected ? "Database connection is healthy." : "Database is not connected.");
    } catch (error) { setHealth({ error: error instanceof Error ? error.message : "Database request failed." }); setMessage(error instanceof Error ? error.message : "Database request failed."); }
    finally { setBusy(false); }
  }

  async function loadTables() {
    setBusy(true); setMessage("Loading tables...");
    try {
      const body = await request<{ tables: DatabaseTable[] }>("/api/manager/database?mode=tables");
      setTables(body.tables || []); setMessage((body.tables || []).length ? "Tables loaded." : "No user tables found.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load tables."); }
    finally { setBusy(false); }
  }

  async function loadRows(tableValue = selected, nextOffset = offset) {
    if (!tableValue) { setMessage("Choose a table first."); return; }
    const [schema, table] = tableValue.split(".");
    setBusy(true); setMessage("Loading table rows...");
    try {
      const body = await request<DatabaseRows>("/api/manager/database?mode=rows&schema=" + encodeURIComponent(schema) + "&table=" + encodeURIComponent(table) + "&limit=" + limit + "&offset=" + nextOffset);
      setRows(body); setOffset(nextOffset); setMessage("Loaded " + (body.rows?.length || 0) + " row(s).");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load table rows."); }
    finally { setBusy(false); }
  }

  useEffect(() => { checkHealth().then(loadTables).catch((error) => setMessage(error.message)); }, []);

  return <section id="database" className="coupon-manager manager-database"><p className="eyebrow">Database tools</p><h2>Postgres health + table browser</h2><p>Read-only tools for checking the configured Postgres connection, listing database tables, and viewing table data. The app uses the Render <code>DATABASE_URL</code> environment variable.</p><p className="media-message" role="status">{message}</p>
    <div className="manager-database-actions"><button className="button" type="button" onClick={checkHealth} disabled={busy}>{busy ? "Checking..." : "Check health"}</button><button className="button button-outline" type="button" onClick={loadTables} disabled={busy}>Refresh tables</button></div>
    <div className="manager-database-status"><article><p className="eyebrow">Connection</p><h3>{health?.connected ? "Connected" : health?.error ? "Not connected" : "Checking"}</h3><p>{health?.error || (health?.latencyMs !== undefined ? "Latency " + health.latencyMs + " ms" : "Waiting for database check.")}</p></article><article><p className="eyebrow">Configured target</p><h3>{health?.summary?.database || "Database"}</h3><p>{health?.summary?.host ? health.summary.host + ":" + (health.summary.port || "5432") + (health.summary.ssl ? " - SSL" : "") : "DATABASE_URL is checked server-side."}</p></article></div>
    <div className="manager-database-browser"><aside><h3>Tables</h3>{tables.length ? <ul>{tables.map((table) => { const value = table.schema + "." + table.name; return <li key={value}><button className={selected === value ? "is-active" : ""} type="button" onClick={() => { setSelected(value); loadRows(value, 0); }} disabled={busy}><span>{table.schema}</span><strong>{table.name}</strong><small>{table.type}</small></button></li>; })}</ul> : <p>No tables loaded yet.</p>}</aside><section><div className="manager-database-query-bar"><label>Rows per page<input type="number" min="1" max="200" value={limit} onChange={(event) => setLimit(Number(event.target.value) || 50)} /></label><button type="button" onClick={() => loadRows(selected, 0)} disabled={busy || !selected}>Reload rows</button><button type="button" onClick={() => loadRows(selected, Math.max(0, offset - limit))} disabled={busy || !selected || offset <= 0}>Previous</button><button type="button" onClick={() => loadRows(selected, offset + limit)} disabled={busy || !selected || (rows?.rows?.length || 0) < limit}>Next</button></div>{rows?.columns?.length ? <div className="manager-database-table-wrap"><table><thead><tr>{rows.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{(rows.rows || []).map((row, index) => <tr key={index}>{rows.columns!.map((column) => <td key={column}>{row[column] === null || row[column] === undefined ? <span className="manager-database-null">NULL</span> : String(row[column])}</td>)}</tr>)}</tbody></table></div> : <p className="tour-schedule-empty">Choose a table to preview rows.</p>}</section></div>
  </section>;
}


function EmailTestManager() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function sendTestEmail() {
    setBusy(true);
    setMessage("Sending test email to mark@aviatorbrew.com...");
    try {
      const response = await fetch("/api/manager/test-email", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not send test email.");
      setMessage(body.message || "Test email sent to mark@aviatorbrew.com.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send test email.");
    } finally {
      setBusy(false);
    }
  }

  return <section id="email-test" className="coupon-manager manager-email-test"><p className="eyebrow">Email diagnostics</p><h2>Send test email</h2><p>Send a live diagnostics email to <strong>mark@aviatorbrew.com</strong> using the website mail configuration.</p><p className="media-message" role="status">{message}</p><button className="button" type="button" onClick={sendTestEmail} disabled={busy}>{busy ? "Sending..." : "Send test email"}</button></section>;
}

function ManagerOverview() {
  return <section className="manager-overview">
    <p className="eyebrow">Manager dashboard</p>
    <h2>Choose a section</h2>
    <div className="manager-overview-grid">
      {managerSections.filter((item) => item.id !== "overview").map((item) => item.id === "beers" ? <a href={item.href} key={item.id}><strong>{item.label}</strong><span>{item.description}</span></a> : <Link href={item.href} key={item.id}><strong>{item.label}</strong><span>{item.description}</span></Link>)}
    </div>
  </section>;
}

function ManagerSectionContent({ section }: { section: ManagerSection }) {
  switch (section) {
    case "newsletter": return <NewsletterManager />;
    case "tours": return <TourManager />;
    case "payments": return <PaymentTestManager />;
    case "locations": return <LocationManager />;
    case "coupons": return <div id="coupons"><CouponManager accessKey="manager-session" /></div>;
    case "beers": return <BeerManager />;
    case "beer-release-alert": return <BeerReleaseAlertManager />;
    case "flight-log": return <FlightLogAdmin />;
    case "brewery-photos": return <BreweryPhotosManager />;
    case "private-event-photos": return <PrivateEventPhotosManager />;
    case "amphitheater-photos": return <AmphitheaterPhotosManager />;
    case "beverages": return <BeverageManager />;
    case "kegs": return <KegInventoryManager />;
    case "events": return <EventManager />;
    case "database": return <DatabaseManager />;
    case "email-test": return <EmailTestManager />;
    case "media": return <div className="manager-media-route"><BrandingManager /><MenuLibraryClient managerMode /></div>;
    default: return <ManagerOverview />;
  }
}

export function ManagerPortal({ section = "overview" }: { section?: ManagerSection }) {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    fetch("/api/manager/session").then((response) => response.json()).then((body) => setAuthenticated(body.authenticated)).finally(() => setReady(true));
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/manager/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error);
      return;
    }
    setAuthenticated(true);
    setPassword("");
  }

  async function requestPasswordReset() {
    setResetBusy(true);
    setMessage("");
    const response = await fetch("/api/manager/password-reset", { method: "POST" });
    const body = await response.json();
    setResetBusy(false);
    setMessage(response.ok ? body.message : body.error);
  }

  async function logout() {
    await fetch("/api/manager/session", { method: "DELETE" });
    setAuthenticated(false);
  }

  if (!ready) return <main className="coupon-validator"><section><p>Checking manager access...</p></section></main>;
  if (!authenticated) return <main className="coupon-validator"><section><p className="eyebrow">Aviator operations</p><h1>Manager login</h1><p>Manage tours, Flight Crew communications, special events, beers, beverages, coupons, and website media.</p><form className="manager-login-form" onSubmit={login}><label>Manager password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label><div className="manager-login-actions"><button className="button">Open manager portal</button><button className="manager-reset-button" type="button" onClick={requestPasswordReset} disabled={resetBusy}>{resetBusy ? "Sending reset email..." : "Reset password"}</button></div></form>{message ? <p className="coupon-validation-message" role="status">{message}</p> : null}</section></main>;

  const activeSection = managerSections.find((item) => item.id === section) || managerSections[0];

  return <main className="manager-portal">
    <nav className="manager-top-menu" aria-label="Manager sections">
      <Link className="manager-top-brand" href="/manager">Aviator <span>Manager</span></Link>
      <div className="manager-top-links">
        {managerSections.map((item) => item.id === "beers" ? <a className={item.id === section ? "is-active" : ""} href={item.href} aria-current={item.id === section ? "page" : undefined} key={item.id}>{item.label}</a> : <Link className={item.id === section ? "is-active" : ""} href={item.href} aria-current={item.id === section ? "page" : undefined} key={item.id}>{item.label}</Link>)}
      </div>
      <button className="manager-top-signout" type="button" onClick={logout}>Sign out</button>
    </nav>
    <div className="content-wrap manager-page-shell">
      <header className="manager-page-heading"><p className="eyebrow">Aviator operations</p><h1>{activeSection.label}</h1><p>{activeSection.description}</p></header>
      <div className="manager-route-content"><ManagerSectionContent section={section} /></div>
    </div>
  </main>;
}
