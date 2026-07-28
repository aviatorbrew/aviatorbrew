"use client";

import { FormEvent, useEffect, useState } from "react";

type BrandingState = { custom: boolean; logoUrl: string; updatedAt: string | null };

export function BrandingManager() {
  const [branding, setBranding] = useState<BrandingState | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/manager/branding", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load the Aviator logo.");
    setBranding(body);
  }

  useEffect(() => { load().catch((error) => setMessage(error instanceof Error ? error.message : "Could not load the Aviator logo.")); }, []);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = event.currentTarget;
    try {
      const response = await fetch("/api/manager/branding", { method: "POST", body: new FormData(form) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Aviator logo upload failed.");
      setBranding(body);
      form.reset();
      setMessage("Aviator logo updated in the main header, homepage, and footer.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Aviator logo upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!window.confirm("Restore the bundled Aviator logo across the website?")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/manager/branding", { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not restore the default logo.");
      setBranding(body);
      setMessage("Default Aviator logo restored.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not restore the default logo.");
    } finally {
      setBusy(false);
    }
  }

  return <section id="aviator-logo" className="coupon-manager branding-manager">
    <p className="eyebrow">Header branding</p>
    <h2>Aviator logo</h2>
    <p>Upload the current Aviator brewery logo. It updates the main header bar, homepage, and footer. Transparent PNG or WEBP artwork works best.</p>
    {message && <p className="media-message" role="status">{message}</p>}
    <div className="branding-manager-layout">
      <div className="branding-preview"><span>Current Aviator logo</span>{branding ? <img key={branding.logoUrl} src={branding.logoUrl} alt="Current Aviator logo" /> : <p>Loading logo...</p>}<small>{branding?.custom ? "Manager-uploaded logo" : "Bundled default logo"}{branding?.updatedAt ? " - Updated " + new Date(branding.updatedAt).toLocaleString() : ""}</small></div>
      <form onSubmit={upload}><label>Aviator logo file<input name="logo" type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" required /><small>PNG, JPG, or WEBP - 10 MB max</small></label><div><button className="button" disabled={busy}>{busy ? "Uploading..." : "Upload Aviator logo"}</button>{branding?.custom ? <button className="button button-outline" type="button" onClick={reset} disabled={busy}>Restore default</button> : null}</div></form>
    </div>
  </section>;
}
