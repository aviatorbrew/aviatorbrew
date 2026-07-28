"use client";

import { FormEvent, useEffect, useState } from "react";
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

type Signup = { id: string; name: string; email: string; tickets: number; tourDate: string; tourTime: string; paymentStatus?: "pending" | "paid" };
type ScheduledTour = { date: string; displayDate: string; time: "4:00 PM" | "6:00 PM"; guests: number; tickets: number; confirmed: boolean };

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

type ManagedEvent = { id: string; title: string; date: string; startTime: string; endTime: string; location: string; description: string; ticketUrl: string; imageUrl?: string; published: boolean; recurrence?: { frequency: string; interval: number; weekday?: number; ordinal?: number; endDate?: string } };

function EventManager() {
  const [events, setEvents] = useState<ManagedEvent[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() { const response = await fetch("/api/manager/events"); const body = await response.json(); if (!response.ok) throw new Error(body.error); setEvents(body.events || []); }
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const form = event.currentTarget; const values = new FormData(form); values.set("published", values.get("published") === "on" ? "true" : "false");
    const response = await fetch("/api/manager/events", { method: "POST", body: values });
    const body = await response.json(); setBusy(false);
    if (!response.ok) { setMessage(body.error); return; }
    setEvents(body.events || []); form.reset(); setMessage("Special event saved and published.");
  }
  async function toggle(item: ManagedEvent) {
    setBusy(true); const response = await fetch("/api/manager/events", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...item, published: !item.published }) }); const body = await response.json(); setBusy(false);
    if (!response.ok) { setMessage(body.error); return; } setEvents(body.events || []); setMessage(item.published ? "Event removed from the public page." : "Event published to the public Events page.");
  }
  async function remove(id: string) {
    if (!window.confirm("Delete this special event? This cannot be undone.")) return;
    setBusy(true); const response = await fetch("/api/manager/events?id=" + encodeURIComponent(id), { method: "DELETE" }); const body = await response.json(); setBusy(false);
    if (!response.ok) { setMessage(body.error); return; } setEvents(body.events || []); setMessage("Event deleted.");
  }
  return <section id="events" className="coupon-manager manager-events"><p className="eyebrow">Event operations</p><h2>Add a special event</h2><p>Publish non-music events to the Aviator Events page: beer releases, tastings, watch parties, campus gatherings, holiday events, and more. Live music continues to come from Aviator Live.</p><p className="media-message" role="status">{message}</p>
    <form className="manager-event-form" onSubmit={create}><label>Event title<input name="title" required maxLength={120} placeholder="Example: Summer Lager Release" /></label><label>Date<input name="date" type="date" required /></label><label>Starts<input name="startTime" type="time" required /></label><label>Ends <small>(optional)</small><input name="endTime" type="time" /></label><label>Repeat<select name="recurrenceFrequency"><option value="none">Does not repeat</option><option value="daily">Every day</option><option value="weekly">Every week</option><option value="biweekly">Every 2 weeks</option><option value="monthly-date">Every month on this date</option><option value="monthly-weekday">Every month by weekday</option><option value="yearly">Every year</option></select></label><label>Repeat every <small>(interval)</small><input name="recurrenceInterval" type="number" min="1" max="12" defaultValue="1" /></label><label>Weekday <small>(monthly option)</small><select name="recurrenceWeekday"><option value="0">Sunday</option><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option></select></label><label>Occurrence <small>(monthly weekday)</small><select name="recurrenceOrdinal"><option value="1">First</option><option value="2">Second</option><option value="3">Third</option><option value="4">Fourth</option><option value="5">Fifth</option><option value="-1">Last</option></select></label><label>Repeat until <small>(optional)</small><input name="recurrenceEndDate" type="date" /></label><label className="manager-event-wide">Location<input name="location" required maxLength={120} placeholder="Aviator Hangar Bar" /></label><label className="manager-event-wide">Description<textarea name="description" required rows={3} maxLength={1200} placeholder="Tell guests what is happening and why they should join." /></label><label className="manager-event-wide">Details or ticket URL <small>(optional)</small><input name="ticketUrl" type="url" placeholder="https://..." /></label><label className="manager-event-wide">Event picture <small>(optional, JPG/PNG/WEBP up to 10 MB)</small><input name="image" type="file" accept="image/jpeg,image/png,image/webp" /></label><label className="manager-event-publish"><input name="published" type="checkbox" defaultChecked /> Publish on the Events page now</label><button className="button" disabled={busy}>{busy ? "Saving..." : "Publish special event"}</button></form>
    <h3 className="tour-signups-heading">Managed special events</h3><div className="manager-events-list">{events.length ? events.map((item) => <article key={item.id}><div className="manager-event-content">{item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <div className="manager-event-image-placeholder">Event</div>}<div className="manager-event-meta"><p className="eyebrow">{item.published ? "Published" : "Draft"}</p><h3>{item.title}</h3><p>{item.date} · {item.startTime}{item.endTime ? `–${item.endTime}` : ""} · {item.location}</p>{item.recurrence && item.recurrence.frequency !== "none" ? <small>Repeats: {item.recurrence.frequency.replace("-", " ")} every {item.recurrence.interval}{item.recurrence.endDate ? ` until ${item.recurrence.endDate}` : ""}</small> : null}</div><p className="manager-event-description">{item.description}</p></div><footer><button type="button" onClick={() => toggle(item)} disabled={busy}>{item.published ? "Unpublish" : "Publish"}</button><button type="button" onClick={() => remove(item.id)} disabled={busy}>Delete</button></footer></article>) : <p className="tour-schedule-empty">No special events have been added yet.</p>}</div>
  </section>;
}

type KegInventoryStatus = { items: { beerName: string; sixthBblKegs: number; fiftyLKegs: number }[]; updatedAt: string; uploadedAt: string } | null;

function KegInventoryManager() {
  const [inventory, setInventory] = useState<KegInventoryStatus>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    const response = await fetch("/api/manager/kegs");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load keg inventory.");
    setInventory(body.inventory || null);
  }
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const form = event.currentTarget;
    const response = await fetch("/api/manager/kegs", { method: "POST", body: new FormData(form) });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) { setMessage(body.error || "Could not upload inventory."); return; }
    setInventory(body.inventory); form.reset();
    setMessage(body.inventory.items.length + " keg lines are now published on the public Kegs page.");
  }
  const lastUpdated = inventory?.updatedAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(inventory.updatedAt)) : "";
  return <section id="kegs" className="coupon-manager manager-kegs"><p className="eyebrow">Keg operations</p><h2>Publish keg inventory</h2><p>Export the BrewOps keg-for-sale feed as JSON, then drop it here. This replaces the public inventory immediately, so the deployed website never needs access to the internal BrewOps system.</p><p className="media-message" role="status">{message}</p>
    <form className="manager-keg-upload" onSubmit={upload}><label>Current BrewOps inventory JSON<input name="file" type="file" accept=".json,application/json" required /><small>Expected: items with beerName, sixthBblKegs, fiftyLKegs, and optional totalBbl, backfillPickupNote, and updatedAt. 1 MB max.</small></label><button className="button" disabled={busy}>{busy ? "Publishing..." : "Publish inventory"}</button></form>
    {inventory ? <div className="manager-keg-status"><div><p className="eyebrow">Public inventory live</p><h3>{inventory.items.length} keg lines published</h3><p>Inventory timestamp: {lastUpdated}. Upload time: {new Date(inventory.uploadedAt).toLocaleString()}.</p></div><ul>{inventory.items.slice(0, 8).map((item) => <li key={item.beerName}><strong>{item.beerName}</strong><span>{item.sixthBblKegs} sixtels · {item.fiftyLKegs} 50 L</span></li>)}{inventory.items.length > 8 ? <li>+ {inventory.items.length - 8} more lines</li> : null}</ul></div> : <div className="manager-keg-status is-empty"><p className="eyebrow">No inventory published</p><p>Upload the current BrewOps JSON to make keg availability and ordering live on the website.</p></div>}
  </section>;
}

type PortalBeer = { id: string; source: "catalog" | "managed"; slug: string; name: string; style: string; abv: string; category: string; description: string; status: string; image: string };
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
    if (!response.ok) { setMessage(body.error); return; } setBeers(body.beers || []); form.reset(); setMessage("Beer and label graphic added to the public flight line.");
  }
  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const response = await fetch("/api/manager/beers", { method: "PATCH", body: new FormData(event.currentTarget) }); const body = await response.json(); setBusy(false);
    if (!response.ok) { setMessage(body.error); return; } setBeers(body.beers || []); setEditing(null); setMessage("Beer details updated on the public flight line.");
  }
  async function remove(beer: PortalBeer) {
    if (!window.confirm("Remove " + beer.name + " from the public beer list?")) return;
    setBusy(true); const response = await fetch("/api/manager/beers?id=" + encodeURIComponent(beer.id), { method: "DELETE" }); const body = await response.json(); setBusy(false);
    if (!response.ok) { setMessage(body.error); return; } setBeers(body.beers || []); setMessage(beer.name + " removed.");
  }
  return <section id="beers" className="coupon-manager manager-beers"><p className="eyebrow">Beer operations</p><h2>Beer flight line</h2><p>All public beers are listed below. Select Edit to update that beer directly in its row—including the core catalog.</p><p className="media-message" role="status">{message}</p>
    <form className="manager-beer-form" onSubmit={create}><label>Beer name<input name="name" required maxLength={100} placeholder="Example: Runway Red" /></label><label>Style<input name="style" required maxLength={100} placeholder="Amber ale" /></label><label>ABV<input name="abv" required maxLength={24} placeholder="5.5% ABV" /></label><label>Category<select name="category" defaultValue="Ale"><option>IPA</option><option>Lager</option><option>Ale</option><option>Dark Beer</option><option>High Gravity</option><option>Limited Release</option></select></label><label>Availability<select name="status" defaultValue="Seasonal"><option>Year-round</option><option>Seasonal</option><option>Limited</option></select></label><label className="manager-beer-graphic">Beer graphic<input name="graphic" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf" required /><small>PNG, JPG, WEBP, or PDF · 25 MB max</small></label><label className="manager-beer-wide">Tasting notes<textarea name="description" required rows={3} maxLength={500} placeholder="Describe the flavor, aroma, and finish." /></label><button className="button" disabled={busy}>{busy ? "Adding beer..." : "Add beer to flight line"}</button></form>
    <h3 className="tour-signups-heading">All beers</h3><div className="manager-beer-list">{beers.map((beer) => {
      const isEditing = editing?.id === beer.id;
      return <article className={"manager-beer-row" + (isEditing ? " is-editing" : "")} key={beer.id}>{beer.image.toLowerCase().endsWith(".pdf") ? <a className="manager-beer-pdf" href={beer.image} target="_blank" rel="noreferrer">PDF<br />artwork</a> : <img src={beer.image} alt="" />}{isEditing ? <form className="manager-beer-inline-form" onSubmit={update}><input type="hidden" name="id" value={beer.id} /><label>Beer name<input name="name" required maxLength={100} defaultValue={beer.name} /></label><label>Style<input name="style" required maxLength={100} defaultValue={beer.style} /></label><label>ABV<input name="abv" required maxLength={24} defaultValue={beer.abv} /></label><label>Category<select name="category" defaultValue={beer.category}><option>IPA</option><option>Lager</option><option>Ale</option><option>Dark Beer</option><option>High Gravity</option><option>Limited Release</option></select></label><label>Availability<select name="status" defaultValue={beer.status}><option>Year-round</option><option>Seasonal</option><option>Limited</option></select></label><label>Replace graphic <input name="graphic" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf" /><small>PNG, JPG, WEBP, or PDF · optional</small></label><label className="manager-beer-inline-wide">Tasting notes<textarea name="description" required rows={3} maxLength={500} defaultValue={beer.description} /></label><div className="manager-beer-inline-actions"><button className="button" disabled={busy}>{busy ? "Saving..." : "Save changes"}</button><button className="button button-outline" type="button" onClick={() => setEditing(null)} disabled={busy}>Cancel</button></div></form> : <><div><p className="eyebrow">{beer.source === "catalog" ? "Core catalog" : "Manager added"} · {beer.status}</p><h3>{beer.name}</h3><p>{beer.style} · {beer.abv} · {beer.category}</p><small>{beer.description}</small></div><footer><button type="button" onClick={() => beginEdit(beer)} disabled={busy}>Edit</button>{beer.source === "managed" ? <button type="button" onClick={() => remove(beer)} disabled={busy}>Remove</button> : null}</footer></>}</article>;
    })}</div>
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

function AmphitheaterPhotosManager() {
  return <section className="manager-brewery-photos manager-amphitheater-photos"><WebsitePhotosLibrary accessKey="manager-session" location={{ slug: "aviator-amphitheater", name: "Aviator Amphitheater" }} /></section>;
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
    case "brewery-photos": return <BreweryPhotosManager />;
    case "amphitheater-photos": return <AmphitheaterPhotosManager />;
    case "beverages": return <BeverageManager />;
    case "kegs": return <KegInventoryManager />;
    case "events": return <EventManager />;
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
  if (!authenticated) return <main className="coupon-validator"><section><p className="eyebrow">Aviator operations</p><h1>Manager login</h1><p>Manage tours, Flight Crew communications, special events, beers, beverages, coupons, and website media.</p><form onSubmit={login}><label>Manager password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label><button className="button">Open manager portal</button><button className="manager-reset-button" type="button" onClick={requestPasswordReset} disabled={resetBusy}>{resetBusy ? "Sending reset email..." : "Reset password"}</button></form>{message ? <p className="coupon-validation-message" role="status">{message}</p> : null}</section></main>;

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
