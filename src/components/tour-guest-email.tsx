"use client";

import { type FormEvent, useId, useRef, useState } from "react";

export function TourGuestEmail({ signup }: { signup: { id: string; name: string; email: string; tourDate: string; tourTime: string } }) {
  const headingId = useId();
  const sending = useRef(false);
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(`Your Aviator brewery tour - ${signup.tourDate}`);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/manager/tours/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signupId: signup.id, subject, message }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The email could not be sent. Please try again.");
      setNotice(body.message); setMessage(""); setOpen(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The email could not be sent. Please try again.");
    } finally { sending.current = false; setBusy(false); }
  }

  return <div className="tour-guest-email">
    <button type="button" className="tour-email-open" aria-expanded={open} aria-controls={headingId + "-form"} onClick={() => { setOpen(!open); setNotice(""); }}>Email guest</button>
    {notice ? <p className="tour-email-notice" role="status">{notice}</p> : null}
    {open ? <form id={headingId + "-form"} className="tour-email-form" onSubmit={send} aria-labelledby={headingId}>
      <h4 id={headingId}>Message {signup.name}</h4>
      <p>To: <strong>{signup.email}</strong><br />Booking: {signup.tourDate} at {signup.tourTime}</p>
      <label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={160} required disabled={busy} autoFocus /></label>
      <label>Message<textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={5000} rows={5} required disabled={busy} /></label>
      <small>Replies go to tours@aviatorbrew.com.</small>
      {error ? <p className="tour-email-error" role="alert">{error}</p> : null}
      <div className="tour-email-actions"><button className="button" disabled={busy}>{busy ? "Sending..." : "Send email"}</button><button type="button" onClick={() => setOpen(false)} disabled={busy}>Close</button></div>
    </form> : null}
  </div>;
}
