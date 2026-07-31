"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type FlightLogCheckInKind = "beer" | "location" | "event";

type Props = {
  kind: FlightLogCheckInKind;
  targetSlug: string;
  targetLabel: string;
  canCheckIn: boolean;
  signedIn: boolean;
};

export function FlightLogCheckInButton({ kind, targetSlug, targetLabel, canCheckIn, signedIn }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [error, setError] = useState("");

  async function checkIn() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/flight-log/check-ins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, targetSlug, targetLabel }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not save this check-in.");
      setCheckedIn(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this check-in.");
    } finally {
      setBusy(false);
    }
  }

  if (!signedIn) return <Link className="flight-log-mini-button" href="/flight-log/sign-in">Sign in to check in</Link>;

  return <div className="flight-log-check-in-action">
    <button className="flight-log-mini-button" type="button" onClick={checkIn} disabled={busy || checkedIn || !canCheckIn} title={!canCheckIn ? "Verify your email before checking in." : undefined}>
      {busy ? "Checking in..." : checkedIn ? "Checked in" : "Check in"}
    </button>
    {!canCheckIn ? <span>Verify email first</span> : null}
    {checkedIn ? <Link href="/flight-log/profile">View profile</Link> : null}
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
