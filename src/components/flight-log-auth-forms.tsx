"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

type Mode = "join" | "sign-in" | "forgot" | "reset" | "resend";

async function submitJson(url: string, payload: Record<string, unknown>) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body;
}
function value(form: FormData, key: string) { return String(form.get(key) || ""); }

export function FlightLogAuthForm({ mode, token = "" }: { mode: Mode; token?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      if (mode === "join") {
        await submitJson("/api/flight-log/auth/register", { firstName: value(form, "firstName"), lastName: value(form, "lastName"), email: value(form, "email"), callsign: value(form, "callsign"), password: value(form, "password"), passwordConfirmation: value(form, "passwordConfirmation"), agree: form.get("agree") === "on" });
        setMessage("Account created. Check your email to verify your address before posting or checking in.");
        formElement.reset();
      }
      if (mode === "sign-in") {
        await submitJson("/api/flight-log/auth/login", { emailOrCallsign: value(form, "emailOrCallsign"), password: value(form, "password"), remember: form.get("remember") === "on" });
        router.push("/flight-log"); router.refresh();
      }
      if (mode === "forgot") {
        const body = await submitJson("/api/flight-log/auth/forgot-password", { email: value(form, "email") });
        setMessage(body.message || "If that email has a Flight Log account, a reset link has been sent.");
      }
      if (mode === "reset") {
        const body = await submitJson("/api/flight-log/auth/reset-password", { token, password: value(form, "password"), confirmation: value(form, "confirmation") });
        setMessage(body.message || "Your password has been reset.");
      }
      if (mode === "resend") {
        const body = await submitJson("/api/flight-log/auth/resend-verification", { email: value(form, "email") });
        setMessage(body.message || "If that account needs verification, a new link has been sent.");
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong."); }
    finally { setBusy(false); }
  }

  return <form className="flight-log-auth-form" onSubmit={handleSubmit}>
    {mode === "join" ? <>
      <div className="flight-log-auth-two"><label>First name<input name="firstName" autoComplete="given-name" required maxLength={80} /></label><label>Last name<input name="lastName" autoComplete="family-name" required maxLength={80} /></label></div>
      <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={180} /></label>
      <label>Username or callsign<input name="callsign" autoComplete="username" required minLength={3} maxLength={31} /></label>
      <div className="flight-log-auth-two"><label>Password<input name="password" type="password" autoComplete="new-password" required minLength={10} /></label><label>Confirm password<input name="passwordConfirmation" type="password" autoComplete="new-password" required minLength={10} /></label></div>
      <label className="flight-log-check"><input name="agree" type="checkbox" required /> I agree to the Aviator community rules and privacy policy.</label>
    </> : null}
    {mode === "sign-in" ? <>
      <label>Email or callsign<input name="emailOrCallsign" autoComplete="username" required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      <label className="flight-log-check"><input name="remember" type="checkbox" /> Remember me</label>
      <div className="flight-log-auth-links"><Link href="/flight-log/forgot-password">Forgot password?</Link><Link href="/flight-log/join">Join Flight Crew</Link></div>
    </> : null}
    {mode === "forgot" || mode === "resend" ? <label>Email address<input name="email" type="email" autoComplete="email" required /></label> : null}
    {mode === "reset" ? <><label>New password<input name="password" type="password" autoComplete="new-password" required minLength={10} /></label><label>Confirm password<input name="confirmation" type="password" autoComplete="new-password" required minLength={10} /></label></> : null}
    <button className="button" disabled={busy}>{busy ? "Working..." : mode === "join" ? "Join Flight Crew" : mode === "sign-in" ? "Sign In" : mode === "forgot" ? "Send Reset Link" : mode === "resend" ? "Resend Verification" : "Reset Password"}</button>
    {message ? <p className="flight-log-auth-message" role="status">{message}</p> : null}
    {error ? <p className="flight-log-auth-message is-error" role="alert">{error}</p> : null}
  </form>;
}

export function FlightLogSignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function signOut() { setBusy(true); await fetch("/api/flight-log/auth/logout", { method: "POST" }); router.refresh(); setBusy(false); }
  return <button className="flight-log-mini-button" type="button" onClick={signOut} disabled={busy}>{busy ? "Signing out..." : "Sign out"}</button>;
}
