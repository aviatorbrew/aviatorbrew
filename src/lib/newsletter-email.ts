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
  imageUrl?: string;
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

function imageUrl(value?: string | null) {
  const url = (value || "").trim();
  if (!url || url.toLowerCase().endsWith(".pdf")) return "";
  return absoluteUrl(url);
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
  const selectedBeers = draft.sections.beers ? content.beers.slice(0, 3) : [];
  const beerCards = selectedBeers.map((beer) => visualCard({
    title: beer.name,
    meta: [beer.style, beer.abv].filter(Boolean).join(" · "),
    copy: beer.description,
    url: `/beer/${beer.slug}`,
    action: "See beer",
    imageUrl: beer.image,
  }));
  if (selectedBeers.length) beerCards.push(moreCard("More Aviator beer", "See the full current beer lineup on the website.", "/beer", "More beer"));

  const events = draft.sections.events ? content.events.slice(0, 2).map((event) => visualCard({
    title: event.title,
    meta: `${formatDate(event.date)} · ${formatTime(event.startTime)} · ${event.location}`,
    copy: event.description,
    url: event.ticketUrl || "/events",
    action: event.ticketUrl ? "Details + tickets" : "More events",
    imageUrl: event.imageUrl,
  })) : [];
  if (events.length) events.push(moreCard("More events", "See everything currently on the Aviator calendar.", "/events", "Full calendar"));

  const twoWeekMusic = newsletterMusicForNextTwoWeeks(content.music);
  const music = draft.sections.music ? twoWeekMusic.map((show) => musicRow(show)) : [];
  if (music.length) music.push(`<tr><td colspan="2" style="padding:12px 0 0"><a href="${siteUrl()}/events/live-music" style="display:inline-block;padding:12px 16px;background:#efb45f;color:#071827;font-weight:800;text-decoration:none;border-radius:2px">Full music schedule</a></td></tr>`);

  const hangarMenu = draft.sections.hangarMenu && content.hangarMenu
    ? [promoBlock("Hangar Bar food menu", "Check the current Hangar Bar food menu before you head to 688 Brewing Drive.", content.hangarMenu.url, "View menu", `${siteUrl()}/images/locations/hangar-bar.png`)]
    : [];
  const releases = draft.sections.releases ? featureItems((content.releases || []).slice(0, 2)) : [];
  const packages = draft.sections.packages ? featureItems((content.packagedBeer || []).slice(0, 3)) : [];
  const food = draft.sections.food ? featureItems((content.food || []).slice(0, 1)) : [];
  const coupons = draft.sections.coupons ? featureItems((content.coupons || []).slice(0, 2)) : [];
  const tours = draft.sections.tours ? featureItems((content.tours || []).slice(0, 1)) : [];
  const visit = draft.sections.visit ? featureItems((content.visit || []).slice(0, 1)) : [];
  const community = draft.sections.community ? featureItems((content.community || []).slice(0, 1)) : [];
  const shop = draft.sections.shop ? featureItems((content.shop || []).slice(0, 2)) : [];
  const hospitality = draft.sections.hospitality ? featureItems((content.hospitality || []).slice(0, 2)) : [];
  const behindScenes = draft.sections.behindScenes ? featureItems((content.behindScenes || []).slice(0, 1)) : [];
  const extras = draft.sections.extras ? content.highlights.slice(0, 4).map((item) => quickLink(item.title, item.copy, item.url)) : [];
  const locations = draft.sections.locations ? content.locations.slice(0, 4).map((location) => `<div style="margin:0 0 10px"><strong style="color:#f4f7f8">${escapeHtml(location.name + (location.comingSoon ? " - Coming soon" : ""))}</strong><br><span style="color:#b8ceda">${escapeHtml(location.address)}</span></div>`) : [];

  const unsubscribeUrl = recipientEmail
    ? `${siteUrl()}/api/newsletter/unsubscribe?email=${encodeURIComponent(recipientEmail)}&token=${newsletterUnsubscribeToken(recipientEmail)}`
    : "";
  const html = emailFrame(`<tr><td style="padding:0;background:#071827"><img src="${siteUrl()}/images/hero-runway-wwii-restored.png" width="640" alt="Aviator Brewing runway" style="display:block;width:100%;max-width:640px;height:auto;border:0"></td></tr><tr><td style="padding:28px 24px 24px;background:#071827"><div style="color:#efb45f;font-size:12px;font-weight:900;letter-spacing:1.8px;text-transform:uppercase">Aviator Flight Crew</div><h1 style="margin:8px 0 12px;color:#f4f7f8;font-size:38px;line-height:.95;text-transform:uppercase">${escapeHtml(draft.heading)}</h1><p style="margin:0;color:#d8e7ee;font-size:17px;line-height:1.55">${escapeHtml(draft.message).replace(/\n/g, "<br>")}</p></td></tr><tr><td>${cardSection("This week's picks", [...releases, ...food, ...coupons].slice(0, 4))}${cardSection("Beer spotlight", beerCards)}${tableSection("Live music: next 2 weeks", music)}${cardSection("Upcoming events", events)}${imagePromoSection(hangarMenu)}${cardSection("4-packs & 6-packs to go", packages)}${cardSection("Brewery tours", tours)}${cardSection("Plan your visit", visit)}${cardSection("From the Flight Crew", community)}${cardSection("Behind the scenes", behindScenes)}${cardSection("Aviator shop", shop)}${cardSection("Private events & catering", hospitality)}${quickLinksSection("More from Aviator", extras)}${section("Aviator locations", locations)}</td></tr><tr><td style="padding:20px 24px;color:#9fb7c5;font-size:12px;line-height:1.5">${unsubscribeUrl ? `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#efb45f">Leave the Flight Crew</a>` : "Newsletter preview"}</td></tr>`, draft.subject);

  const lines = [draft.heading, "", draft.message];
  lines.push(...featureLines("This week's picks", draft.sections.releases ? (content.releases || []).slice(0, 2) : []));
  if (selectedBeers.length) lines.push("", "BEER SPOTLIGHT", ...selectedBeers.map((beer) => `${beer.name} - ${beer.style}${beer.abv ? ` - ${beer.abv}` : ""}`), `More beer: ${siteUrl()}/beer`);
  if (music.length) lines.push("", "LIVE MUSIC: NEXT 2 WEEKS", ...twoWeekMusic.map((show) => `${show.band?.name || show.title} - ${formatDate(show.performanceDate || show.startsAt)}, ${formatTime(show.startsAt)} at ${show.venueName}`), `${siteUrl()}/events/live-music`);
  if (events.length) lines.push("", "EVENTS", ...content.events.slice(0, 2).map((event) => `${event.title} - ${formatDate(event.date)}, ${formatTime(event.startTime)} at ${event.location}`), `${siteUrl()}/events`);
  lines.push(...featureLines("4-packs & 6-packs to go", draft.sections.packages ? (content.packagedBeer || []).slice(0, 3) : []));
  if (hangarMenu.length && content.hangarMenu) lines.push("", "HANGAR BAR FOOD MENU", absoluteUrl(content.hangarMenu.url));
  lines.push("", "Aviator Brewing Company", siteUrl());
  if (unsubscribeUrl) lines.push(`Leave the Flight Crew: ${unsubscribeUrl}`);
  return { html, text: lines.join("\n") };
}
function cardSection(title: string, items: string[]) {
  if (!items.length) return "";
  return `<section style="margin:0;padding:24px 18px;border-top:1px solid #315a78"><h2 style="margin:0 6px 14px;color:#efb45f;font:900 19px Arial,sans-serif;text-transform:uppercase;letter-spacing:.4px">${escapeHtml(title)}</h2>${items.join("")}</section>`;
}

function tableSection(title: string, rows: string[]) {
  if (!rows.length) return "";
  return `<section style="margin:0;padding:24px 24px;border-top:1px solid #315a78"><h2 style="margin:0 0 14px;color:#efb45f;font:900 19px Arial,sans-serif;text-transform:uppercase;letter-spacing:.4px">${escapeHtml(title)}</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">${rows.join("")}</table></section>`;
}

function imagePromoSection(items: string[]) {
  return items.length ? items.join("") : "";
}

function visualCard(item: NewsletterFeature) {
  const href = item.url ? absoluteUrl(item.url) : siteUrl();
  const img = imageUrl(item.imageUrl);
  const image = img ? `<a href="${escapeHtml(href)}" style="display:block"><img src="${escapeHtml(img)}" width="260" alt="" style="display:block;width:100%;max-width:260px;height:auto;border:0;background:#0b2941"></a>` : "";
  return `<article style="display:inline-block;width:276px;max-width:100%;vertical-align:top;margin:0 6px 12px;background:#0d3857;border:1px solid #315a78">${image}<div style="padding:14px"><h3 style="margin:0 0 7px;color:#f4f7f8;font-size:20px;line-height:1.05">${escapeHtml(item.title)}</h3>${item.meta ? `<div style="margin:0 0 8px;color:#efb45f;font-size:12px;font-weight:800;text-transform:uppercase">${escapeHtml(item.meta)}</div>` : ""}${item.copy ? `<p style="margin:0 0 12px;color:#c8dbe4;font-size:14px;line-height:1.45">${escapeHtml(item.copy).slice(0, 220)}</p>` : ""}<a href="${escapeHtml(href)}" style="display:inline-block;color:#efb45f;font-size:12px;font-weight:900;text-transform:uppercase;text-decoration:none">${escapeHtml(item.action || "More")}</a></div></article>`;
}

function moreCard(title: string, copy: string, url: string, action: string) {
  return `<article style="display:inline-block;width:276px;max-width:100%;vertical-align:top;margin:0 6px 12px;background:#071827;border:1px dashed #efb45f"><div style="padding:16px"><h3 style="margin:0 0 7px;color:#f4f7f8;font-size:20px;line-height:1.05">${escapeHtml(title)}</h3><p style="margin:0 0 12px;color:#c8dbe4;font-size:14px;line-height:1.45">${escapeHtml(copy)}</p><a href="${escapeHtml(absoluteUrl(url))}" style="display:inline-block;padding:11px 14px;background:#efb45f;color:#071827;font-size:12px;font-weight:900;text-transform:uppercase;text-decoration:none">${escapeHtml(action)}</a></div></article>`;
}

function musicRow(show: LiveMusicShow) {
  const href = show.ticketUrl ? absoluteUrl(show.ticketUrl) : `${siteUrl()}/events/live-music`;
  const img = imageUrl(show.band?.imageUrl);
  return `<tr><td style="width:74px;padding:0 12px 12px 0;vertical-align:top">${img ? `<img src="${escapeHtml(img)}" width="74" height="74" alt="" style="display:block;width:74px;height:74px;object-fit:cover;border:0;background:#0b2941">` : `<div style="width:74px;height:74px;background:#0d3857;color:#efb45f;text-align:center;font-size:11px;font-weight:900;line-height:74px">LIVE</div>`}</td><td style="padding:0 0 12px;vertical-align:top"><strong style="display:block;color:#f4f7f8;font-size:17px;line-height:1.2">${escapeHtml(show.band?.name || show.title)}</strong><span style="display:block;margin-top:4px;color:#efb45f;font-size:12px;font-weight:800;text-transform:uppercase">${escapeHtml(formatDate(show.performanceDate || show.startsAt))} · ${escapeHtml(formatTime(show.startsAt))}</span><span style="display:block;margin-top:3px;color:#b8ceda;font-size:13px">${escapeHtml(show.venueName)}</span><a href="${escapeHtml(href)}" style="display:inline-block;margin-top:8px;color:#efb45f;font-size:12px;font-weight:900;text-transform:uppercase;text-decoration:none">Show details</a></td></tr>`;
}

function promoBlock(title: string, copy: string, url: string, action: string, img: string) {
  return `<section style="margin:0;padding:24px;border-top:1px solid #315a78;background:#08243d"><img src="${escapeHtml(img)}" width="592" alt="" style="display:block;width:100%;max-width:592px;height:auto;border:0;margin:0 0 16px;background:#0b2941"><h2 style="margin:0 0 8px;color:#efb45f;font:900 19px Arial,sans-serif;text-transform:uppercase">${escapeHtml(title)}</h2><p style="margin:0 0 14px;color:#d8e7ee;font-size:15px;line-height:1.5">${escapeHtml(copy)}</p><a href="${escapeHtml(absoluteUrl(url))}" style="display:inline-block;padding:12px 16px;background:#efb45f;color:#071827;font-weight:900;text-decoration:none;text-transform:uppercase;font-size:12px">${escapeHtml(action)}</a></section>`;
}

function quickLink(title: string, copy: string, url: string) {
  return `<a href="${escapeHtml(absoluteUrl(url))}" style="display:block;margin:0 0 8px;padding:12px 14px;background:#0d3857;border:1px solid #315a78;color:#f4f7f8;text-decoration:none"><strong style="display:block;color:#efb45f;font-size:12px;text-transform:uppercase">${escapeHtml(title)}</strong><span style="display:block;margin-top:4px;color:#c8dbe4;font-size:13px;line-height:1.4">${escapeHtml(copy)}</span></a>`;
}

function quickLinksSection(title: string, items: string[]) {
  return items.length ? `<section style="margin:0;padding:22px 24px;border-top:1px solid #315a78"><h2 style="margin:0 0 12px;color:#efb45f;font:900 19px Arial,sans-serif;text-transform:uppercase">${escapeHtml(title)}</h2>${items.join("")}</section>` : "";
}

function featureItems(items: NewsletterFeature[]) {
  return items.map((item) => visualCard(item));
}

function featureLines(title: string, items: NewsletterFeature[]) {
  return items.length
    ? ["", title.toUpperCase(), ...items.flatMap((item) => [item.title, item.meta || "", item.copy || "", item.url ? absoluteUrl(item.url) : ""].filter(Boolean))]
    : [];
}
