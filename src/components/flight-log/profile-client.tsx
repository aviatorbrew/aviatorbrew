"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { FlightLogCustomer, FlightLogCheckIn } from "@/lib/flight-log-auth";
import type { FlightLogFriendSummary } from "@/lib/flight-log-social";

type Groups = Record<string, FlightLogCheckIn[]>;

function CheckInList({ title, items, empty }: { title: string; items: FlightLogCheckIn[]; empty: string }) {
  const formatDay = (value: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }).format(new Date(value));
  const formatTime = (value: string) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(new Date(value));
  const groups = useMemo(() => items.reduce<Array<{ day: string; items: FlightLogCheckIn[] }>>((list, item) => {
    const day = formatDay(item.checkedInAt);
    const current = list.find((group) => group.day === day);
    if (current) current.items.push(item);
    else list.push({ day, items: [item] });
    return list;
  }, []), [items]);
  return <article className="flight-log-profile-card"><h2>{title}</h2>{groups.length ? <div className="flight-log-checkin-days">{groups.map((group, index) => <details key={group.day} open={index === 0}><summary><strong>{group.day}</strong><span>{group.items.length} check-in{group.items.length === 1 ? "" : "s"}</span></summary><ul>{group.items.map((item) => <li key={item.id}><strong>{item.label}</strong><span>{formatTime(item.checkedInAt)}</span>{item.notes ? <p>{item.notes}</p> : null}</li>)}</ul></details>)}</div> : <p>{empty}</p>}</article>;
}

function FriendsPanel({ initial, canManage }: { initial: FlightLogFriendSummary; canManage: boolean }) {
  const [friends, setFriends] = useState(initial);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("Adding friend...");
    const form = event.currentTarget;
    const identifier = String(new FormData(form).get("identifier") || "");
    try {
      const response = await fetch("/api/flight-log/friends", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not add friend.");
      setFriends(body.friends); form.reset();
      setMessage(body.result?.type === "phone_pending" ? "Phone invite saved. Twilio SMS lookup is required before it can send." : body.result?.type === "email_invite" ? "Email invite sent." : "Friend request sent.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not add friend."); }
    finally { setBusy(false); }
  }

  async function respond(requesterId: number, action: "accept" | "decline") {
    setBusy(true); setMessage(action === "accept" ? "Accepting friend request..." : "Declining friend request...");
    try {
      const response = await fetch("/api/flight-log/friends", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ requesterId, action }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not update request.");
      setFriends(body.friends); setMessage(action === "accept" ? "Friend added." : "Friend request declined.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update request."); }
    finally { setBusy(false); }
  }

  return <article className="flight-log-profile-card flight-log-friends-card"><h2>Friends</h2>
    <form className="flight-log-friend-form" onSubmit={add}><input name="identifier" placeholder="Callsign, email, or phone" disabled={!canManage || busy} required /><button type="submit" disabled={!canManage || busy}>{busy ? "Working..." : "Add friend"}</button></form>
    {!canManage ? <p>Verify your email before adding friends.</p> : null}
    {message ? <p className="flight-log-auth-message" role="status">{message}</p> : null}
    <h3>My friends</h3>{friends.friends.length ? <ul>{friends.friends.map((friend) => <li key={friend.id}><strong>{friend.displayName}</strong><span>@{friend.callsign}</span></li>)}</ul> : <p>No friends yet.</p>}
    <h3>Requests to answer</h3>{friends.receivedRequests.length ? <ul>{friends.receivedRequests.map((item) => <li key={item.id}><strong>{item.displayName}</strong><span>@{item.callsign}</span><div><button type="button" onClick={() => respond(item.id, "accept")} disabled={busy}>Accept</button><button type="button" onClick={() => respond(item.id, "decline")} disabled={busy}>Decline</button></div></li>)}</ul> : <p>No pending requests.</p>}
    <h3>Sent requests + invites</h3>{friends.sentRequests.length || friends.invites.length ? <ul>{friends.sentRequests.map((item) => <li key={"sent-" + item.id}><strong>{item.displayName}</strong><span>Request pending</span></li>)}{friends.invites.map((item) => <li key={"invite-" + item.id}><strong>{item.inviteEmail || item.invitePhone}</strong><span>{item.status}</span></li>)}</ul> : <p>No sent requests or invites.</p>}
  </article>;
}

export function FlightLogProfileClient({ customer, checkIns, friends }: { customer: FlightLogCustomer; checkIns: Groups; friends: FlightLogFriendSummary }) {
  const [profile, setProfile] = useState(customer);
  const [avatarUrl, setAvatarUrl] = useState(customer.avatarUrl || "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage("Saving profile...");
    try {
      const response = await fetch("/api/flight-log/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: String(data.get("firstName") || ""),
          lastName: String(data.get("lastName") || ""),
          callsign: String(data.get("callsign") || ""),
          displayName: String(data.get("displayName") || ""),
          bio: String(data.get("bio") || ""),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not update profile.");
      setProfile(body.profile || profile);
      setMessage("Profile updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update profile.");
    } finally {
      setBusy(false);
    }
  }

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
      <form className="flight-log-avatar-form" onSubmit={uploadAvatar}>
        <div className="flight-log-profile-photo">{avatarUrl ? <img src={avatarUrl} alt="" key={avatarUrl} /> : <span>{profile.callsign.slice(0, 2).toUpperCase()}</span>}</div>
        <input ref={avatarInput} name="avatar" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => event.currentTarget.files?.length ? event.currentTarget.form?.requestSubmit() : undefined} />
        <button className="flight-log-avatar-change" type="button" onClick={() => avatarInput.current?.click()} disabled={busy} aria-label="Change profile photo" title="Change profile photo">{busy ? "..." : "📷"}</button>
      </form>
      <div><p className="eyebrow">Flight Log profile</p><h1>{profile.callsign}</h1><p>{profile.firstName} {profile.lastName} · {profile.email}</p><p>{profile.emailVerified ? "Verified Flight Crew member." : "Email verification is required before posting, commenting, or checking in."}</p><Link className="button button-outline flight-log-profile-back" href="/flight-log">Back to Flight Log</Link></div>
    </section>
    <form className="flight-log-profile-edit-form" onSubmit={saveProfile}>
      <div className="flight-log-auth-two"><label>First name<input name="firstName" required maxLength={80} defaultValue={profile.firstName} autoComplete="given-name" /></label><label>Last name<input name="lastName" required maxLength={80} defaultValue={profile.lastName} autoComplete="family-name" /></label></div>
      <div className="flight-log-auth-two"><label>Callsign<input name="callsign" required minLength={3} maxLength={31} defaultValue={profile.callsign} autoComplete="nickname" /></label><label>Display name<input name="displayName" maxLength={160} defaultValue={profile.displayName || profile.callsign} /></label></div>
      <label>Bio<textarea name="bio" rows={3} maxLength={500} defaultValue={profile.bio || ""} placeholder="Tell the Flight Crew a little about you." /></label>
      <button className="button" disabled={busy}>{busy ? "Saving..." : "Save profile"}</button>
    </form>
    {message ? <p className="flight-log-auth-message" role="status">{message}</p> : null}
    <div className="flight-log-profile-grid">
      <CheckInList title="Checked-in beers" items={checkIns.beer || []} empty="Beer check-ins will appear here." />
      <CheckInList title="Checked-in locations" items={checkIns.locations || []} empty="Location check-ins will appear here." />
      <CheckInList title="Food favorites" items={checkIns.food || []} empty="Food check-ins and favorites will appear here." />
      <CheckInList title="Events" items={checkIns.events || []} empty="Event check-ins will appear here." />
      <FriendsPanel initial={friends} canManage={profile.emailVerified} />
    </div>
  </div>;
}
