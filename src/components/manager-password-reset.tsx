"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export function ManagerPasswordReset({ token }: { token: string }) {
  const [message, setMessage] = useState("");
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const password = String(values.get("password") || "");
    const confirmation = String(values.get("confirmation") || "");
    if (password !== confirmation) {
      setMessage("The passwords do not match.");
      return;
    }
    setBusy(true);
    const response = await fetch("/api/manager/password-reset", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) {
      setMessage(body.error || "Could not reset the password.");
      return;
    }
    setComplete(true);
    setMessage("Your manager password has been updated.");
  }

  if (!token) return <p className="coupon-validation-message error">This reset link is missing its secure token.</p>;
  if (complete) return <div className="manager-reset-complete"><p className="coupon-validation-message">{message}</p><Link className="button" href="/manager">Return to manager login</Link></div>;
  return <form onSubmit={submit}>
    <label>New manager password<input name="password" type="password" minLength={12} maxLength={200} autoComplete="new-password" required /></label>
    <label>Confirm new password<input name="confirmation" type="password" minLength={12} maxLength={200} autoComplete="new-password" required /></label>
    <button className="button" disabled={busy}>{busy ? "Updating..." : "Update password"}</button>
    {message ? <p className="coupon-validation-message error">{message}</p> : null}
  </form>;
}
