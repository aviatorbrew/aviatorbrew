import { createHmac, timingSafeEqual } from "node:crypto";
import type { PortalBeer } from "@/lib/managed-beers";
import type { ManagedEvent } from "@/lib/managed-events";
import type { LiveMusicShow } from "@/lib/live-music";
import type { Location } from "@/data/site";
import type { FlightCrewWelcome } from "@/lib/flight-crew-welcome";
import { publicSiteUrl } from "@/lib/site-url";

export type NewsletterSections = {
  beers: boolean;
  releases: boolean;
  packages: boolean;
  events: boolean;
  music: boolean;
  hangarMenu: boolean;
  food: boolean;
  coupons: boolean;
  tours: boolean;
  visit: boolean;
  community: boolean;
  shop: boolean;
  hospitality: boolean;
  behindScenes: boolean;
  extras: boolean;
  locations: boolean;
};

export type NewsletterHighlight = {
  title: string;
  copy: string;
  url: string;
};

export type NewsletterFeature = {
  title: string;
  meta?: string;
  copy?: string;
  url?: string;
  action?: string;
};

export type NewsletterSourceContent = {
  beers: PortalBeer[];
  events: ManagedEvent[];
  music: LiveMusicShow[];
  hangarMenu: { name: string; url: string } | null;
  highlights: NewsletterHighlight[];
  locations: Location[];
  releases?: NewsletterFeature[];
  packagedBeer?: NewsletterFeature[];
  food?: NewsletterFeature[];
  coupons?: NewsletterFeature[];
  tours?: NewsletterFeature[];
  visit?: NewsletterFeature[];
  community?: NewsletterFeature[];
  shop?: NewsletterFeature[];
  hospitality?: NewsletterFeature[];
  behindScenes?: NewsletterFeature[];
};

export type NewsletterDraft = {
  template: string;
  subject: string;
  heading: string;
  message: string;
  sections: NewsletterSections;
};

const siteUrl = () => publicSiteUrl();
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

function easternDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addUtcDays(date: string, days: number) {
  return new Date(Date.parse(date + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10);
}

export function newsletterMusicForNextTwoWeeks(shows: LiveMusicShow[], now = new Date()) {
  const firstDate = easternDate(now);
  const endDate = addUtcDays(firstDate, 14);
  return shows
    .filter((show) => show.performanceDate >= firstDate && show.performanceDate < endDate)
    .sort((a, b) => (a.performanceDate + a.startsAt).localeCompare(b.performanceDate + b.startsAt));
}

function absoluteUrl(value: string) {
  try { return new URL(value, siteUrl()).toString(); }
  catch { return siteUrl(); }
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
  return `<!doctype html><html><body style="margin:0;background:#e8eef1;color:#10243a;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preview)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#102c46;border:1px solid #315a78"><tr><td align="center" style="padding:24px 28px;background:#071827"><img src="cid:aviator-logo" width="190" alt="Aviator Brewing Company" style="display:block;width:190px;max-width:70%;height:auto"></td></tr>${content}<tr><td style="padding:25px 28px;background:#071827;color:#9fb7c5;font-size:12px;line-height:1.6">Aviator Brewing Company &bull; Fuquay-Varina, North Carolina<br><a href="${siteUrl()}" style="color:#efb45f">Visit aviatorbrew.com</a></td></tr></table></td></tr></table></body></html>`;
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
  const contentRows = `<tr><td style="padding:34px 28px;color:#d8e7ee;font-size:17px;line-height:1.6"><h1 style="margin:0 0 18px;color:#f4f7f8;font-size:34px;line-height:1.05">${escapeHtml(welcome.heading)}</h1><p style="margin:0">${escapeHtml(welcome.intro).replace(/\n/g, "<br>")}</p></td></tr>${copySection("Where Aviator began", welcome.history)}${copySection("The Speakeasy Liquor Lounge", welcome.speakeasy)}${copySection("$10 Buffalo Trace Thursday", welcome.special)}<tr><td>${section("Aviator locations", activeLocations)}${section("Live music: next 2 weeks", currentMusic.length ? currentMusic : [musicFallback])}</td></tr><tr><td style="padding:20px 28px;color:#9fb7c5;font-size:12px;line-height:1.5">${unsubscribeUrl ? `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#efb45f">Leave the Flight Crew</a>` : "This is a Flight Crew welcome email preview."}</td></tr>`;
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
    "LIVE MUSIC: NEXT 2 WEEKS",
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
  const twoWeekMusic = newsletterMusicForNextTwoWeeks(content.music);
  const music = draft.sections.music ? twoWeekMusic.map((show) =>
    `<div style="margin:0 0 14px"><strong style="color:#f4f7f8">${escapeHtml(show.band?.name || show.title)}</strong><br><span style="color:#b8ceda">${escapeHtml(formatDate(show.performanceDate || show.startsAt))} &bull; ${escapeHtml(formatTime(show.startsAt))} &bull; ${escapeHtml(show.venueName)}</span></div>`) : [];
  const hangarMenu = draft.sections.hangarMenu && content.hangarMenu
    ? [`<div style="margin:0"><strong style="color:#f4f7f8">See what is cooking at 688 Brewing Drive.</strong><br><span style="color:#b8ceda">Browse the current Hangar Bar food menu before your visit.</span><br><a href="${escapeHtml(absoluteUrl(content.hangarMenu.url))}" style="display:inline-block;margin-top:14px;padding:12px 16px;background:#efb45f;color:#071827;font-weight:800;text-decoration:none">View the food menu</a></div>`]
    : [];
  const extras = draft.sections.extras ? content.highlights.map((item) =>
    `<div style="margin:0 0 16px"><strong style="color:#f4f7f8">${escapeHtml(item.title)}</strong><br><span style="color:#b8ceda">${escapeHtml(item.copy)}</span><br><a href="${escapeHtml(absoluteUrl(item.url))}" style="color:#efb45f;font-weight:700">Learn more</a></div>`) : [];
  const locations = draft.sections.locations ? content.locations.map((location) =>
    `<div style="margin:0 0 14px"><strong style="color:#f4f7f8">${escapeHtml(location.name + (location.comingSoon ? " - Coming soon" : ""))}</strong><br><span style="color:#b8ceda">${escapeHtml(location.address)}</span></div>`) : [];

  const releases = draft.sections.releases ? featureItems(content.releases || []) : [];
  const packages = draft.sections.packages ? featureItems(content.packagedBeer || []) : [];
  const food = draft.sections.food ? featureItems(content.food || []) : [];
  const coupons = draft.sections.coupons ? featureItems(content.coupons || []) : [];
  const tours = draft.sections.tours ? featureItems(content.tours || []) : [];
  const visit = draft.sections.visit ? featureItems(content.visit || []) : [];
  const community = draft.sections.community ? featureItems(content.community || []) : [];
  const shop = draft.sections.shop ? featureItems(content.shop || []) : [];
  const hospitality = draft.sections.hospitality ? featureItems(content.hospitality || []) : [];
  const behindScenes = draft.sections.behindScenes ? featureItems(content.behindScenes || []) : [];

  const unsubscribeUrl = recipientEmail
    ? `${siteUrl()}/api/newsletter/unsubscribe?email=${encodeURIComponent(recipientEmail)}&token=${newsletterUnsubscribeToken(recipientEmail)}`
    : "";
  const html = emailFrame(`<tr><td style="padding:32px 28px;background:#071827"><h1 style="margin:0;color:#f4f7f8;font-size:34px;line-height:1">${escapeHtml(draft.heading)}</h1></td></tr><tr><td style="padding:26px 28px;color:#d8e7ee;font-size:17px;line-height:1.6">${escapeHtml(draft.message).replace(/\n/g, "<br>")}</td></tr><tr><td>${section("New releases", releases)}${section("Live music: next 2 weeks", music)}${section("Upcoming events", events)}${section("Hangar Bar food menu", hangarMenu)}${section("Food spotlight", food)}${section("4-packs & 6-packs to go", packages)}${section("Current beers", beers)}${section("Current offers", coupons)}${section("Brewery tours", tours)}${section("Plan your visit", visit)}${section("From the Flight Crew", community)}${section("Behind the scenes", behindScenes)}${section("Aviator shop", shop)}${section("Private events & catering", hospitality)}${section("Quick links", extras)}${section("Aviator locations", locations)}</td></tr><tr><td style="padding:20px 28px;color:#9fb7c5;font-size:12px">${unsubscribeUrl ? `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#efb45f">Leave the Flight Crew</a>` : ""}</td></tr>`, draft.subject);

  const lines = [draft.heading, "", draft.message];
  lines.push(...featureLines("New releases", draft.sections.releases ? content.releases || [] : []));
  lines.push(...featureLines("4-packs & 6-packs to go", draft.sections.packages ? content.packagedBeer || [] : []));
  lines.push(...featureLines("Food spotlight", draft.sections.food ? content.food || [] : []));
  lines.push(...featureLines("Current offers", draft.sections.coupons ? content.coupons || [] : []));
  lines.push(...featureLines("Brewery tours", draft.sections.tours ? content.tours || [] : []));
  lines.push(...featureLines("Plan your visit", draft.sections.visit ? content.visit || [] : []));
  lines.push(...featureLines("From the Flight Crew", draft.sections.community ? content.community || [] : []));
  lines.push(...featureLines("Behind the scenes", draft.sections.behindScenes ? content.behindScenes || [] : []));
  lines.push(...featureLines("Aviator shop", draft.sections.shop ? content.shop || [] : []));
  lines.push(...featureLines("Private events & catering", draft.sections.hospitality ? content.hospitality || [] : []));
  if (beers.length) lines.push("", "CURRENT BEERS", ...content.beers.map((beer) => `${beer.name} - ${beer.style}${beer.abv ? ` - ${beer.abv}` : ""}`));
  if (events.length) lines.push("", "EVENTS", ...content.events.map((event) => `${event.title} - ${formatDate(event.date)}, ${formatTime(event.startTime)} at ${event.location}`));
  if (music.length) lines.push("", "LIVE MUSIC: NEXT 2 WEEKS", ...twoWeekMusic.map((show) => `${show.band?.name || show.title} - ${formatDate(show.performanceDate || show.startsAt)}, ${formatTime(show.startsAt)} at ${show.venueName}`));
  if (hangarMenu.length && content.hangarMenu) lines.push("", "HANGAR BAR FOOD MENU", "See what is cooking at 688 Brewing Drive.", absoluteUrl(content.hangarMenu.url));
  if (extras.length) lines.push("", "QUICK LINKS", ...content.highlights.flatMap((item) => [item.title, item.copy, absoluteUrl(item.url)]));
  if (locations.length) lines.push("", "LOCATIONS", ...content.locations.map((location) => `${location.name}${location.comingSoon ? " - Coming soon" : ""} - ${location.address}`));
  lines.push("", "Aviator Brewing Company", siteUrl());
  if (unsubscribeUrl) lines.push(`Leave the Flight Crew: ${unsubscribeUrl}`);
  return { html, text: lines.join("\n") };
}

function featureItems(items: NewsletterFeature[]) {
  return items.map((item) => `<div style="margin:0 0 16px"><strong style="color:#f4f7f8">${escapeHtml(item.title)}</strong>${item.meta ? `<br><span style="color:#efb45f">${escapeHtml(item.meta)}</span>` : ""}${item.copy ? `<br><span style="color:#b8ceda">${escapeHtml(item.copy)}</span>` : ""}${item.url ? `<br><a href="${escapeHtml(absoluteUrl(item.url))}" style="color:#efb45f;font-weight:700">${escapeHtml(item.action || "Learn more")}</a>` : ""}</div>`);
}

function featureLines(title: string, items: NewsletterFeature[]) {
  return items.length
    ? ["", title.toUpperCase(), ...items.flatMap((item) => [item.title, item.meta || "", item.copy || "", item.url ? absoluteUrl(item.url) : ""].filter(Boolean))]
    : [];
}
