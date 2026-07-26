"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Location } from "@/data/site";

type PortalLocation = Location & { id: string; updatedAt: string | null };

function valuesFromForm(form: HTMLFormElement) {
  const values = Object.fromEntries(new FormData(form).entries());
  return {
    slug: String(values.slug || ""),
    name: String(values.name || ""),
    shortName: String(values.shortName || ""),
    type: String(values.type || ""),
    description: String(values.description || ""),
    address: String(values.address || ""),
    phone: String(values.phone || ""),
    hours: String(values.hours || ""),
    menu: String(values.menu || ""),
    events: values.events === "on",
    parking: String(values.parking || ""),
    accessibility: String(values.accessibility || ""),
  };
}

export function LocationManager() {
  const [locations, setLocations] = useState<PortalLocation[]>([]);
  const [editing, setEditing] = useState<PortalLocation | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/manager/locations");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setLocations(body.locations || []);
  }

  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const response = await fetch("/api/manager/locations", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(valuesFromForm(event.currentTarget)) });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) { setMessage(body.error); return; }
    setLocations(body.locations || []);
    setEditing(null);
    setMessage("Location details saved to the public site.");
  }

  return <section id="locations" className="coupon-manager manager-locations">
    <p className="eyebrow">Location operations</p>
    <h2>Location details</h2>
    <p>Edit the public location names, descriptions, hours, contact details, menu links, parking, and accessibility notes without changing code.</p>
    <p className="media-message" role="status">{message}</p>
    <div className="manager-beer-list">{locations.map((location) => {
      const isEditing = editing?.slug === location.slug;
      return <article className={"manager-beer-row" + (isEditing ? " is-editing" : "")} key={location.slug}>
        <img src={location.image} alt="" />
        {isEditing ? <form className="manager-beer-inline-form" onSubmit={update}>
          <input type="hidden" name="slug" value={location.slug} />
          <label>Location name<input name="name" required maxLength={140} defaultValue={location.name} /></label>
          <label>Short name<input name="shortName" required maxLength={80} defaultValue={location.shortName} /></label>
          <label>Type<input name="type" required maxLength={120} defaultValue={location.type} /></label>
          <label>Phone<input name="phone" required maxLength={40} defaultValue={location.phone} /></label>
          <label className="manager-beer-inline-wide">Hours<input name="hours" required maxLength={220} defaultValue={location.hours} /></label>
          <label className="manager-beer-inline-wide">Address<input name="address" required maxLength={180} defaultValue={location.address} /></label>
          <label className="manager-beer-inline-wide">Menu link<input name="menu" maxLength={300} defaultValue={location.menu || ""} placeholder="/locations#menus" /></label>
          <label className="manager-event-publish"><input name="events" type="checkbox" defaultChecked={location.events === true} /> Show live event schedule on this location</label>
          <label className="manager-beer-inline-wide">Description<textarea name="description" required rows={3} maxLength={700} defaultValue={location.description} /></label>
          <label className="manager-beer-inline-wide">Parking<textarea name="parking" required rows={2} maxLength={400} defaultValue={location.parking} /></label>
          <label className="manager-beer-inline-wide">Accessibility<textarea name="accessibility" required rows={2} maxLength={400} defaultValue={location.accessibility} /></label>
          <div className="manager-beer-inline-actions"><button className="button" disabled={busy}>{busy ? "Saving..." : "Save location"}</button><button className="button button-outline" type="button" onClick={() => setEditing(null)} disabled={busy}>Cancel</button></div>
        </form> : <>
          <div><p className="eyebrow">{location.updatedAt ? "Edited" : "Default content"}</p><h3>{location.name}</h3><p>{location.hours}</p><small>{location.description}</small><small>{location.address} - {location.phone}</small></div>
          <footer><button type="button" onClick={() => { setEditing(location); setMessage("Editing " + location.shortName + "."); }} disabled={busy}>Edit</button></footer>
        </>}
      </article>;
    })}</div>
  </section>;
}
