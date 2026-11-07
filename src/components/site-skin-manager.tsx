"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { activeSiteSkin, siteSkins, themeDateLabel, themeTimeLabel, type SiteTheme } from "@/lib/site-skins";
import { easternLocalTimestamp } from "@/lib/eastern-time";
import { getManagerJson, readManagerResponse } from "@/lib/manager-fetch";

function easternInput(value: string) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const p = (type: string) => parts.find(p => p.type === type)?.value;
  return `${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}`;
}

export function SiteSkinManager() {
  const [saved, setSaved] = useState<SiteTheme | null>(null), [draft, setDraft] = useState<SiteTheme | null>(null);
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { const controller = new AbortController(); getManagerJson("/api/manager/site-theme", controller.signal).then(body => { setSaved(body.settings); setDraft(body.settings); }).catch(e => { if (!controller.signal.aborted) setMessage(e.message); }); return () => controller.abort(); }, []);
  async function save(input: Partial<SiteTheme>) {
    setBusy(true); setMessage("");
    try {
      const body = await readManagerResponse(await fetch("/api/manager/site-theme", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }));
      setSaved(body.settings); setDraft(body.settings);
      window.dispatchEvent(new CustomEvent("aviator-site-theme-updated", { detail: body.settings }));
      setMessage(body.activeSkin === "classic" ? "Standard Aviator design is active. The seasonal promotion is off." : "Website skin and promotion are live. New visits show the update immediately; open pages refresh within a minute.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save website skin."); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); if (draft) save(draft); }
  if (!draft || !saved) return <section className="coupon-manager"><p role="status">{message || "Loading website skins…"}</p></section>;
  const current = activeSiteSkin(saved), p = draft.promotion;
  function field(key: keyof SiteTheme["promotion"], value: string) { setDraft(d => d && ({ ...d, promotion: { ...d.promotion, [key]: value } })); }
  const expiry = easternInput(draft.expiresAt);
  return <section className="coupon-manager site-skin-manager">
    <h2>Website skin &amp; featured promotion</h2>
    <p>Switch the public website’s appearance for a show or season. Your normal Aviator design returns when the skin ends or you turn it off. The manager portal and payment pages keep their normal appearance.</p>
    <div className="site-skin-status" role="status"><strong>Live now: {siteSkins.find(s => s.id === current)?.name}</strong>{saved.expiresAt && current !== "classic" && <p>Automatically turns off {new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }).format(new Date(saved.expiresAt))} Eastern.</p>}{current === "classic" && saved.skin !== "classic" && <p>The previous skin has expired. Its promotion is saved for editing.</p>}</div>
    {message && <p className="media-message" role="status">{message}</p>}
    <form onSubmit={submit}>
      <fieldset disabled={busy}><legend>Choose a website skin</legend><div className="site-skin-options">{siteSkins.map(s => <label className="site-skin-option" key={s.id}><span className="site-skin-swatch" data-swatch={s.id} aria-hidden="true" /><span><input type="radio" name="website-skin" value={s.id} checked={draft.skin === s.id} onChange={() => setDraft({ ...draft, skin: s.id })} /> {draft.skin === s.id ? "Selected" : "Select"}</span><strong>{s.name}</strong><small>{s.description}</small></label>)}</div></fieldset>
      <fieldset disabled={busy}><legend>Promotion details</legend><p>These details appear in the homepage feature and public announcement bar while a seasonal skin is active. Update them before switching to a new season.</p>
        <div className="site-skin-fields">
          <label>Small heading<input value={p.eyebrow} maxLength={100} onChange={e => field("eyebrow", e.target.value)} /></label>
          <label>Show / promotion title<input value={p.title} required maxLength={120} onChange={e => field("title", e.target.value)} /></label>
          <label>Show date<input type="date" required value={p.date} onChange={e => field("date", e.target.value)} /></label>
          <label>Venue<input value={p.venue} required maxLength={120} onChange={e => field("venue", e.target.value)} /></label>
          <label>Show start time (Eastern)<input type="time" required value={p.startTime} onChange={e => field("startTime", e.target.value)} /></label>
          <label>Show end time (Eastern)<input type="time" required value={p.endTime} onChange={e => field("endTime", e.target.value)} /></label>
          <label className="skin-field-wide">Opening / pre-game message<input value={p.openingNote} maxLength={160} onChange={e => field("openingNote", e.target.value)} /></label>
          <label className="skin-field-wide">Description<textarea rows={3} value={p.description} required maxLength={600} onChange={e => field("description", e.target.value)} /></label>
          <label>Button label<input value={p.linkLabel} required maxLength={60} onChange={e => field("linkLabel", e.target.value)} /></label>
          <label>Button destination<input value={p.href} required maxLength={500} onChange={e => field("href", e.target.value)} /><small>Website path or HTTPS address.</small></label>
          <label>Artwork URL<input value={p.imageUrl} maxLength={500} onChange={e => field("imageUrl", e.target.value)} /><small>Current artwork was copied from Aviator Live. Use a website image path or HTTPS image URL.</small></label>
          <label>Artwork description<input value={p.imageAlt} required maxLength={200} onChange={e => field("imageAlt", e.target.value)} /></label>
          <label>Automatically turn off (Eastern)<input type="datetime-local" value={expiry} onChange={e => { const value = e.target.value; setDraft({ ...draft, expiresAt: value ? new Date(easternLocalTimestamp(value.slice(0, 10), value.slice(11, 16))!).toISOString() : "" }); }} /><small>Leave blank to keep the skin on until you turn it off.</small></label>
        </div>
      </fieldset>
      <div className="site-skin-preview">{p.imageUrl && <img src={p.imageUrl} alt={p.imageAlt} />}<div><small>Promotion preview — unsaved changes</small><h3>{p.title}</h3><p>{p.date && Number.isFinite(Date.parse(p.date)) ? themeDateLabel(draft) : "Choose a date"} · {themeTimeLabel(p.startTime)} – {themeTimeLabel(p.endTime)} · {p.venue}</p><p><strong>{p.openingNote}</strong></p></div></div>
      <div className="site-skin-controls"><button className="button" disabled={busy}>{busy ? "Saving…" : draft.skin === "classic" ? "Save standard Aviator design" : "Save & activate skin"}</button><button className="button button-outline" type="button" disabled={busy || saved.skin === "classic"} onClick={() => save({ skin: "classic" })}>Turn off skin now</button><Link className="button button-outline" href="/" target="_blank">View website ↗</Link></div>
    </form>
  </section>;
}
