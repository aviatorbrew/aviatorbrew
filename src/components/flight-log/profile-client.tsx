"use client";

import { FormEvent, useState } from "react";
import type { FlightLogCustomer, FlightLogCheckIn } from "@/lib/flight-log-auth";

type Groups = Record<string, FlightLogCheckIn[]>;

function CheckInList({ title, items, empty }: { title: string; items: FlightLogCheckIn[]; empty: string }) {
  return <article className="flight-log-profile-card"><h2>{title}</h2>{items.length ? <ul>{items.map((item) => <li key={item.id}><strong>{item.label}</strong><span>{new Date(item.checkedInAt).toLocaleDateString()}</span>{item.notes ? <p>{item.notes}</p> : null}</li>)}</ul> : <p>{empty}</p>}</article>;
}

export function FlightLogProfileClient({ customer, checkIns }: { customer: FlightLogCustomer; checkIns: Groups }) {
  const [avatarUrl, setAvatarUrl] = useState(customer.avatarUrl || "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function uploadAvatar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage("Uploading profile photo...");
    try {
      const response = await fetch("/api/flight-log/profile/avatar", { method: "POST", body: data });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not upload profile photo.");
      setAvatarUrl(body.avatarUrl || "");
      form.reset();
      setMessage("Profile photo updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not upload profile photo.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="flight-log-profile-panel">
    <section className="flight-log-profile-head">
      <div className="flight-log-profile-photo">{avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{customer.callsign.slice(0, 2).toUpperCase()}</span>}</div>
      <div><p className="eyebrow">Flight Log profile</p><h1>{customer.callsign}</h1><p>{customer.firstName} {customer.lastName} · {customer.email}</p><p>{customer.emailVerified ? "Verified Flight Crew member." : "Email verification is required before posting, commenting, or checking in."}</p></div>
    </section>
    <form className="flight-log-avatar-form" onSubmit={uploadAvatar}><label>Profile photo<input name="avatar" type="file" accept="image/png,image/jpeg,image/webp" /></label><button className="button" disabled={busy}>{busy ? "Uploading..." : "Upload photo"}</button></form>
    {message ? <p className="flight-log-auth-message" role="status">{message}</p> : null}
    <div className="flight-log-profile-grid">
      <CheckInList title="Checked-in beers" items={checkIns.beer || []} empty="Beer check-ins will appear here." />
      <CheckInList title="Checked-in locations" items={checkIns.locations || []} empty="Location check-ins will appear here." />
      <CheckInList title="Food favorites" items={checkIns.food || []} empty="Food check-ins and favorites will appear here." />
      <CheckInList title="Events" items={checkIns.events || []} empty="Event check-ins will appear here." />
      <article className="flight-log-profile-card"><h2>Friends</h2><p>Friend requests, accepted friends, and friend recommendations will appear here in the next phase.</p></article>
      <article className="flight-log-profile-card"><h2>Invite a friend</h2><p>Invites will support email first. Phone invites will use a carrier lookup/SMS provider rather than guessing a text gateway.</p></article>
    </div>
  </div>;
}
