export const siteSkins = [
  { id: "classic", name: "Standard Aviator", description: "Original aviation design. Seasonal promotion off." },
  { id: "dead-show", name: "Grateful Dead Night", description: "Vintage concert poster, red, blue and warm gold." },
  { id: "holiday", name: "Holiday Gathering", description: "Evergreen, cranberry and candlelit gold." },
  { id: "after-dark", name: "After Dark", description: "Midnight purple, electric blue and late-night amber." },
] as const;

export type SiteSkin = (typeof siteSkins)[number]["id"];
export type SiteTheme = {
  skin: SiteSkin;
  expiresAt: string;
  promotion: { eyebrow: string; title: string; description: string; date: string; startTime: string; endTime: string; openingNote: string; venue: string; href: string; linkLabel: string; imageUrl: string; imageAlt: string };
  updatedAt: string;
};

export const defaultSiteTheme: SiteTheme = {
  skin: "classic", expiresAt: "2026-11-08T05:00:00.000Z", updatedAt: "",
  promotion: {
    eyebrow: "A Grateful Dead celebration", title: "Bring Out Yer Dead",
    description: "An afternoon of Grateful Dead music, brewery-fresh beer, and good company. Come early. Settle in. Stay for the show.",
    date: "2026-11-07", startTime: "16:00", endTime: "19:00", openingNote: "Open at 11 a.m. for pre-gaming!",
    venue: "Aviator Amphitheater", href: "/events/live-music", linkLabel: "See the show details",
    imageUrl: "/images/promotions/bring-out-yer-dead-nov7.jpg", imageAlt: "Bring Out Yer Dead concert poster: Aviator, November 7, free show",
  },
};

export function activeSiteSkin(theme: SiteTheme, now = Date.now()): SiteSkin {
  return theme.expiresAt && Date.parse(theme.expiresAt) <= now ? "classic" : theme.skin;
}

export function skinAllowedOnPath(path: string) {
  return !/^\/(?:manager|api|checkout|payment-test|event-proposal|feast-order|private-events|feast|shop-new\/cart)(?:\/|$)/.test(path);
}

function safeUrl(value: string, image = false) {
  if (!value || /[\\\s\u0000-\u001f]/.test(value)) return false;
  try {
    const url = new URL(value, "https://aviatorbrew.com");
    return !url.username && !url.password && url.protocol === "https:" && (value.startsWith("https://") || (value.startsWith("/") && !value.startsWith("//") && url.origin === "https://aviatorbrew.com")) && (!image || !/\.svg(?:[?#]|$)/i.test(url.pathname));
  } catch { return false; }
}

export function parseSiteTheme(input: unknown, current = defaultSiteTheme): SiteTheme {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Provide website skin settings.");
  const body = input as Partial<SiteTheme>;
  if (body.skin !== undefined && !siteSkins.some(s => s.id === body.skin)) throw new Error("Choose an available website skin.");
  const next: SiteTheme = structuredClone(current);
  if (typeof body.updatedAt === "string" && (!body.updatedAt || Number.isFinite(Date.parse(body.updatedAt)))) next.updatedAt = body.updatedAt;
  if (body.skin !== undefined) next.skin = body.skin;
  if (body.expiresAt !== undefined) {
    if (typeof body.expiresAt !== "string" || (body.expiresAt && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(body.expiresAt) || !Number.isFinite(Date.parse(body.expiresAt))))) throw new Error("Use a valid automatic turn-off time, or leave it blank.");
    next.expiresAt = body.expiresAt;
  }
  if (body.promotion !== undefined) {
    if (!body.promotion || typeof body.promotion !== "object" || Array.isArray(body.promotion)) throw new Error("Check the promotion details.");
    const limits: Record<keyof SiteTheme["promotion"], number> = { eyebrow: 100, title: 120, description: 600, date: 10, startTime: 5, endTime: 5, openingNote: 160, venue: 120, href: 500, linkLabel: 60, imageUrl: 500, imageAlt: 200 };
    for (const [key, max] of Object.entries(limits)) {
      const value = body.promotion[key as keyof SiteTheme["promotion"]];
      if (value === undefined) continue;
      if (typeof value !== "string" || value.length > max || /[<>\u0000-\u001f]/.test(value)) throw new Error("Use plain text within the promotion field limits.");
      next.promotion[key as keyof SiteTheme["promotion"]] = value.trim();
    }
  }
  const p = next.promotion;
  if (!p.title || !p.description || !p.venue || !p.linkLabel || !p.imageAlt) throw new Error("Add a title, description, venue, button label and artwork description.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date) || !Number.isFinite(Date.parse(p.date)) || new Date(p.date + "T12:00:00Z").toISOString().slice(0, 10) !== p.date) throw new Error("Choose a valid show date.");
  if (![p.startTime, p.endTime].every(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || p.endTime <= p.startTime) throw new Error("Choose a show end time after its start time.");
  if (!safeUrl(p.href) || (p.imageUrl && !safeUrl(p.imageUrl, true))) throw new Error("Use a website path or HTTPS link for the button and artwork.");
  return next;
}

export function themeDateLabel(theme: SiteTheme) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" }).format(new Date(theme.promotion.date + "T12:00:00Z"));
}
export function themeTimeLabel(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""} ${h >= 12 ? "p.m." : "a.m."}`;
}
