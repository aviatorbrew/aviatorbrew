"use client";

import { useState } from "react";
import { DEFAULT_TOUR_MINIMUM, DEFAULT_TOUR_PRICE_CENTS, TOUR_CAPACITY } from "@/lib/tour-config";

type FormKind = "newsletter" | "contact" | "event" | "career" | "tour" | "band" | "donation" | "job";
const labels: Record<FormKind, string> = { newsletter: "Join the Flight Crew", contact: "Send your message", event: "Plan your event", career: "Tell us about yourself", tour: "Continue to secure payment", band: "Submit your band", donation: "Send donation request", job: "Apply now" };

export function InquiryForm({ kind, tourMinimum = DEFAULT_TOUR_MINIMUM, tourPriceCents = DEFAULT_TOUR_PRICE_CENTS }: { kind: FormKind; tourMinimum?: number; tourPriceCents?: number }) {
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const needsCaptcha = kind === "event" || kind === "newsletter";
  async function submit(formData: FormData) {
    setState("submitting"); setMessage(""); setPaymentUrl(null);
    const payload = Object.fromEntries(formData.entries());
    try {
      const response = await fetch(kind === "tour" ? "/api/tours" : "/api/inquiries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(kind === "tour" ? payload : { kind, ...payload }) });
      const body = await response.json() as { error?: string; confirmationRequired?: boolean; tourDate?: string; tourTime?: string; currentTotal?: number; capacity?: number; minimum?: number; qualified?: boolean; paymentUrl?: string | null };
      if (!response.ok) throw new Error(body.error);
      setState("success");
      if (kind === "tour") { const minimum = body.minimum ?? tourMinimum; const status = body.qualified ? "Your tour is on - this flight has reached the " + minimum + "-guest launch minimum." : "Your tour is tentatively set for this date and time. We need " + Math.max(minimum - (body.currentTotal || 0), 0) + " more signup(s) before it is on."; const tourMessage = "You are on the " + body.tourDate + " " + body.tourTime + " tour list. Current flight total: " + body.currentTotal + " of " + body.capacity + ". " + status; setMessage(tourMessage); if (body.paymentUrl) { window.location.assign(body.paymentUrl); return; } setPaymentUrl(null); }
      else if (kind === "newsletter") setMessage(body.confirmationRequired ? "Check your inbox and confirm your email to join the Flight Crew." : "You are already confirmed for the Flight Crew.");
      else setMessage("Thanks - your message is in the flight plan.");
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again."); }
  }
  if (state === "success") return <div className="form-message success" role="status"><p>{message}</p>{paymentUrl && <><p>Complete secure payment to hold your ticket. Checkout is handled securely by Stripe.</p><a className="button button-light" href={paymentUrl}>Pay for your tour</a></>}</div>;
  return <form className="inquiry-form" action={submit}>
    <input name="website" className="honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" />
    {kind !== "newsletter" && <label>Name<input name="name" required autoComplete="name" /></label>}
    <label>Email<input type="email" name="email" required autoComplete="email" /></label>
    {kind === "event" && <><label>Event type<select name="eventType" defaultValue=""><option value="" disabled>Select an event type</option><option>Wedding or rehearsal dinner</option><option>Corporate event</option><option>Birthday or celebration</option><option>Concert or fundraiser</option><option>Other</option></select></label><label>Estimated guest count<input name="guestCount" inputMode="numeric" /></label></>}
    {kind === "career" && <label>Role or area of interest<input name="interest" required /></label>}
    {kind === "job" && <><label>Role or area of interest<input name="interest" required /></label><label>Resume or portfolio link (optional)<input name="resumeUrl" type="url" inputMode="url" /></label></>}
    {kind === "band" && <><label>Band or artist name<input name="bandName" required /></label><label>Website or music link<input name="musicUrl" type="url" inputMode="url" required /></label></>}
    {kind === "donation" && <><label>Organization name<input name="organization" required /></label><label>Event or needed-by date<input name="eventDate" type="date" /></label></>}
    {kind === "tour" && <><label>How many tickets?<input name="tickets" type="number" min="1" max="6" defaultValue="1" required /><small>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(tourPriceCents / 100)} per guest. Each ticket includes a pint glass, one beer pour, and one flight of four pours.</small></label><p className="tour-signup-note">Tours are approximately 30 minutes and launch on Saturdays at 4:00 PM once {tourMinimum} guests are signed up. Each flight can hold up to {TOUR_CAPACITY} guests; if that flight fills, the next guests are assigned to a 6:00 PM tour. Signups inside 24 hours roll to the following Saturday.</p></>}
    {kind !== "newsletter" && kind !== "tour" && <label>{kind === "band" ? "Tell us about your sound, dates, and draw" : kind === "donation" ? "Tell us about your request and community impact" : kind === "job" ? "Tell us about your experience and availability" : "How can we help?"}<textarea name="message" required rows={4} /></label>}
    {kind === "tour" && <label>Questions or notes?<textarea name="message" rows={3} /></label>}
    {needsCaptcha && <label className="captcha-check"><input type="checkbox" name="humanCheck" value="yes" required /><span>I am a real person submitting this form.</span></label>}
    <button className="button" disabled={state === "submitting"}>{state === "submitting" ? "Saving..." : labels[kind]}</button>
    {state === "error" && <p className="form-message error" role="alert">{message}</p>}
  </form>;
}
