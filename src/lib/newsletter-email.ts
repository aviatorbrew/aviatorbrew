import { createHmac, timingSafeEqual } from "node:crypto";
import type { PortalBeer } from "@/lib/managed-beers";
import type { ManagedEvent } from "@/lib/managed-events";
import type { LiveMusicShow } from "@/lib/live-music";
import type { Location } from "@/data/site";
import type { FlightCrewWelcome } from "@/lib/flight-crew-welcome";

export type NewsletterSections = {
  beers: boolean;
  events: boolean;
  music: boolean;
  locations: boolean;
};

export type NewsletterSourceContent = {
  beers: PortalBeer[];
  events: ManagedEvent[];
  music: LiveMusicShow[];
  locations: Location[];
};

export type NewsletterDraft = {
  template: string;
  subject: string;
  heading: string;
  message: string;
  sections: NewsletterSections;
};

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://aviatorbrew.com").replace(/\/$/, "");
const secret = () => process.env.NEWSLETTER_CONFIRMATION_SECRET || process.env.NEWSLETTER_UNSUBSCRIBE_SECRET || process.env.MANAGER_PORTAL_KEY || "";

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (character) => {
    if (character === "&") return "&amp;";
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    return "&quot;";
  });
}

function formatDate(value: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + "T12:00:00-05:00") : new Date(value);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" }).format(date);
}

function formatTime(value: string) {
  const match = value.match(/(\d{2}):(\d{2})/);
  if (!match) return value;
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(2020, 0, 1, Number(match[1]), Number(match[2])));
}

function tokenFor(purpose: string, email: string, qualifier = "") {
  return createHmac("sha256", secret()).update(`${purpose}:${email.trim().toLowerCase()}:${qualifier}`).digest("hex");
}

function tokensMatch(actual: string, expected: string) {
  if (!actual || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function newsletterUnsubscribeToken(email: string) {
  return tokenFor("unsubscribe", email);
}

export function verifyNewsletterUnsubscribeToken(email: string, token: string) {
  return tokensMatch(token, newsletterUnsubscribeToken(email));
}

export function newsletterConfirmationToken(email: string, expires: string) {
  return tokenFor("confirm", email, expires);
}

export function verifyNewsletterConfirmationToken(email: string, expires: string, token: string) {
  const expiration = Number(expires);
  if (!Number.isFinite(expiration) || expiration < Date.now()) return false;
  return tokensMatch(token, newsletterConfirmationToken(email, expires));
}

function emailFrame(content: string, preview: string) {
  return `<!doctype html><html><body style="margin:0;background:#e8eef1;color:#10243a;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preview)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#102c46;border:1px solid #315a78"><tr><td align="center" style="padding:24px 28px;background:#071827"><img src="${siteUrl()}/images/aviator-logo.png" width="190" alt="Aviator Brewing Company" style="display:block;width:190px;max-width:70%;height:auto"></td></tr>${content}<tr><td style="padding:25px 28px;background:#071827;color:#9fb7c5;font-size:12px;line-height:1.6">Aviator Brewing Company &bull; Fuquay-Varina, North Carolina<br><a href="${siteUrl()}" style="color:#efb45f">Visit aviatorbrew.com</a></td></tr></table></td></tr></table></body></html>`;
}

export function buildFlightCrewConfirmationMessage(email: string, expiresAt: string) {
  const expires = String(new Date(expiresAt).getTime());
  const confirmationUrl = `${siteUrl()}/api/newsletter/confirm?email=${encodeURIComponent(email)}&expires=${expires}&token=${newsletterConfirmationToken(email, expires)}`;
  const heading = "Confirm your seat in the Flight Crew";
  const html = emailFrame(`<tr><td style="padding:34px 28px;color:#d8e7ee;font-size:17px;line-height:1.6"><h1 style="margin:0 0 18px;color:#f4f7f8;font-size:32px;line-height:1.1">${heading}</h1><p style="margin:0 0 24px">One quick preflight check: confirm this email address to join the Aviator Flight Crew.</p><p style="margin:0 0 24px"><a href="${escapeHtml(confirmationUrl)}" style="display:inline-block;padding:14px 20px;background:#efb45f;color:#071827;font-weight:800;text-decoration:none">Confirm my email</a></p><p style="margin:0;color:#9fb7c5;font-size:13px">This link expires in 48 hours. If you did not request this, you can ignore this email.</p></td></tr>`, heading);
  const text = `${heading}\n\nConfirm your email to join the Aviator Flight Crew:\n${confirmationUrl}\n\nThis link expires in 48 hours. If you did not request this, you can ignore this email.`;
  return { subject: "Confirm your Aviator Flight Crew email", html, text };
}

function section(title: string, items: string[]) {
  if (!items.length) return "";
  return `<section style="margin:0;padding:26px 28px;border-top:1px solid #315a78"><h2 style="margin:0 0 15px;color:#efb45f;font:700 20px Arial,sans-serif;text-transform:uppercase">${title}</h2>${items.join("")}</section>`;
}

function copySection(title: string, copy: string) {
  return `<tr><td style="padding:24px 28px;border-top:1px solid #315a78;color:#d8e7ee;font-size:16px;line-height:1.6"><h2 style="margin:0 0 10px;color:#efb45f;font-size:19px;text-transform:uppercase">${escapeHtml(title)}</h2><p style="margin:0">${escapeHtml(copy).replace(/\n/g, "<br>")}</p></td></tr>`;
}

export function buildFlightCrewWelcomeMessage(welcome: FlightCrewWelcome, content: NewsletterSourceContent, recipientEmail?: string) {
  const activeLocations = content.locations.map((location) =>
    `<div style="margin:0 0 14px"><strong style="color:#f4f7f8">${escapeHtml(location.name + (location.comingSoon ? " - Coming soon" : ""))}</strong><br><span style="color:#b8ceda">${escapeHtml(location.address)}</span></div>`);
  const currentMusic = content.music.slice(0, 10).map((show) =>
    `<div style="margin:0 0 14px"><strong style="color:#f4f7f8">${escapeHtml(show.band?.name || show.title)}</strong><br><span style="color:#b8ceda">${escapeHtml(formatDate(show.performanceDate || show.startsAt))} &bull; ${escapeHtml(formatTime(show.startsAt))} &bull; ${escapeHtml(show.venueName)}</span></div>`);
  const musicFallback = `<div style="color:#b8ceda">The next shows are being cleared now. <a href="${siteUrl()}/events" style="color:#efb45f">See the current music schedule</a>.</div>`;
  const unsubscribeUrl = recipientEmail ? `${siteUrl()}/api/newsletter/unsubscribe?email=${encodeURIComponent(recipientEmail)}&token=${newsletterUnsubscribeToken(recipientEmail)}` : "";
  const contentRows = `<tr><td style="padding:34px 28px;color:#d8e7ee;font-size:17px;line-height:1.6"><h1 style="margin:0 0 18px;color:#f4f7f8;font-size:34px;line-height:1.05">${escapeHtml(welcome.heading)}</h1><p style="margin:0">${escapeHtml(welcome.intro).replace(/\n/g, "<br>")}</p></td></tr>${copySection("Where Aviator began", welcome.history)}${copySection("The Speakeasy Liquor Lounge", welcome.speakeasy)}${copySection("$10 Buffalo Trace Thursday", welcome.special)}<tr><td>${section("Aviator locations", activeLocations)}${section("Current music schedule", currentMusic.length ? currentMusic : [musicFallback])}</td></tr><tr><td style="padding:20px 28px;color:#9fb7c5;font-size:12px;line-height:1.5">${unsubscribeUrl ? `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#efb45f">Leave the Flight Crew</a>` : "This is a Flight Crew welcome email preview."}</td></tr>`;
  const html = emailFrame(contentRows, welcome.subject);
  const lines = [
    welcome.heading,
    "",
    welcome.intro,
    "",
    "WHERE AVIATOR BEGAN",
    welcome.history,
    "",
    "THE SPEAKEASY LIQUOR LOUNGE",
    welcome.speakeasy,
    "",
    "$10 BUFFALO TRACE THURSDAY",
    welcome.special,
    "",
    "AVIATOR LOCATIONS",
    ...content.locations.map((location) => `${location.name}${location.comingSoon ? " - Coming soon" : ""} - ${location.address}`),
    "",
    "CURRENT MUSIC SCHEDULE",
    ...(content.music.length ? content.music.slice(0, 10).map((show) => `${show.band?.name || show.title} - ${formatDate(show.performanceDate || show.startsAt)}, ${formatTime(show.startsAt)} at ${show.venueName}`) : [`See the schedule: ${siteUrl()}/events`]),
    "",
    siteUrl(),
  ];
  if (unsubscribeUrl) lines.push(`Leave the Flight Crew: ${unsubscribeUrl}`);
  return { subject: welcome.subject, html, text: lines.join("\n") };
}

export function buildNewsletterMessage(draft: NewsletterDraft, content: NewsletterSourceContent, recipientEmail?: string) {
  const beers = draft.sections.beers ? content.beers.map((beer) =>
    `<div style="margin:0 0 14px"><strong style="color:#f4f7f8">${escapeHtml(beer.name)}</strong><br><span style="color:#b8ceda">${escapeHtml(beer.style)}${beer.abv ? ` &bull; ${escapeHtml(beer.abv)}` : ""}</span></div>`) : [];
  const events = draft.sections.events ? content.events.map((event) =>
    `<div style="margin:0 0 14px"><strong style="color:#f4f7f8">${escapeHtml(event.title)}</strong><br><span style="color:#b8ceda">${escapeHtml(formatDate(event.date))} &bull; ${escapeHtml(formatTime(event.startTime))} &bull; ${escapeHtml(event.location)}</span></div>`) : [];
  const music = draft.sections.music ? content.music.map((show) =>
    `<div style="margin:0 0 14px"><strong style="color:#f4f7f8">${escapeHtml(show.band?.name || show.title)}</strong><br><span style="color:#b8ceda">${escapeHtml(formatDate(show.performanceDate || show.startsAt))} &bull; ${escapeHtml(formatTime(show.startsAt))} &bull; ${escapeHtml(show.venueName)}</span></div>`) : [];
  const locations = draft.sections.locations ? content.locations.map((location) =>
    `<div style="margin:0 0 14px"><strong style="color:#f4f7f8">${escapeHtml(location.name + (location.comingSoon ? " - Coming soon" : ""))}</strong><br><span style="color:#b8ceda">${escapeHtml(location.address)}</span></div>`) : [];

  const unsubscribeUrl = recipientEmail
    ? `${siteUrl()}/api/newsletter/unsubscribe?email=${encodeURIComponent(recipientEmail)}&token=${newsletterUnsubscribeToken(recipientEmail)}`
    : "";
  const html = emailFrame(`<tr><td style="padding:32px 28px;background:#071827"><h1 style="margin:0;color:#f4f7f8;font-size:34px;line-height:1">${escapeHtml(draft.heading)}</h1></td></tr><tr><td style="padding:26px 28px;color:#d8e7ee;font-size:17px;line-height:1.6">${escapeHtml(draft.message).replace(/\n/g, "<br>")}</td></tr><tr><td>${section("Current beers", beers)}${section("Events", events)}${section("Live music", music)}${section("Aviator locations", locations)}</td></tr><tr><td style="padding:20px 28px;color:#9fb7c5;font-size:12px">${unsubscribeUrl ? `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#efb45f">Leave the Flight Crew</a>` : ""}</td></tr>`, draft.subject);

  const lines = [draft.heading, "", draft.message];
  if (beers.length) lines.push("", "CURRENT BEERS", ...content.beers.map((beer) => `${beer.name} - ${beer.style}${beer.abv ? ` - ${beer.abv}` : ""}`));
  if (events.length) lines.push("", "EVENTS", ...content.events.map((event) => `${event.title} - ${formatDate(event.date)}, ${formatTime(event.startTime)} at ${event.location}`));
  if (music.length) lines.push("", "LIVE MUSIC", ...content.music.map((show) => `${show.band?.name || show.title} - ${formatDate(show.performanceDate || show.startsAt)}, ${formatTime(show.startsAt)} at ${show.venueName}`));
  if (locations.length) lines.push("", "LOCATIONS", ...content.locations.map((location) => `${location.name}${location.comingSoon ? " - Coming soon" : ""} - ${location.address}`));
  lines.push("", "Aviator Brewing Company", siteUrl());
  if (unsubscribeUrl) lines.push(`Leave the Flight Crew: ${unsubscribeUrl}`);
  return { html, text: lines.join("\n") };
}
