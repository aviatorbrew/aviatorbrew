"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type Option = { slug: string; name: string; meta: string };

export function FlightLogBeverageCheckInSelect({ options, signedIn, canCheckIn }: { options: Option[]; signedIn: boolean; canCheckIn: boolean }) {
  const [selected, setSelected] = useState(options[0]?.slug || "");
  const [busy, setBusy] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const current = options.find((item) => item.slug === selected);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current) return;
    setBusy(true); setCheckedIn(false); setMessage(""); setError("");
    try {
      const response = await fetch("/api/flight-log/check-ins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "beer", targetSlug: current.slug }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; checkIn?: { label?: string } };
      if (!response.ok) throw new Error(body.error || "Could not save this check-in.");
      setCheckedIn(true);
      setMessage("Checked in to " + (body.checkIn?.label || current.name) + ".");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this check-in.");
    } finally {
      setBusy(false);
    }
  }

  if (!signedIn) return <div className="flight-log-beverage-checkin"><p>Sign in to check in to beer, THC soda, soda, or seltzer.</p><Link className="button" href="/flight-log/sign-in">Sign In</Link></div>;
  return <form className="flight-log-beverage-checkin" onSubmit={submit}>
    <label>Choose beer or beverage<select value={selected} onChange={(event) => { setSelected(event.currentTarget.value); setCheckedIn(false); setMessage(""); setError(""); }} disabled={!canCheckIn || busy}>{options.map((item) => <option value={item.slug} key={item.slug}>{item.name} - {item.meta}</option>)}</select></label>
    {current ? <p><strong>{current.name}</strong><span>{current.meta}</span></p> : null}
    <div><button className="button" disabled={!canCheckIn || busy || !current}>{busy ? "Checking in..." : "Check in"}</button>{checkedIn ? <Link className="button button-outline" href="/flight-log/profile">View profile</Link> : null}</div>
    {!canCheckIn ? <p>Verify your email before checking in.</p> : null}
    {message ? <p className="flight-log-auth-message" role="status">{message}</p> : null}
    {error ? <p className="flight-log-auth-message is-error" role="alert">{error}</p> : null}
  </form>;
}
