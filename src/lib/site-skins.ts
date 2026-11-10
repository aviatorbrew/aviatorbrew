export const siteSkins = [
  { id: "veterans-day", name: "Veterans Day", description: "Bald eagle, American flag, amber beer and patriotic navy, red and gold." },
  { id: "christmas", name: "Christmas", description: "Evergreen, cranberry, warm lights and brewery cheer." },
  { id: "thanksgiving", name: "Thanksgiving", description: "Copper, autumn harvest and a welcoming brewery table." },
  { id: "new-years", name: "New Year’s", description: "Midnight navy, fireworks and aviation-inspired gold." },
  { id: "valentines-day", name: "Valentine’s Day", description: "Ruby, roses, candlelight and a romantic brewery evening." },
  { id: "st-patricks-day", name: "St. Patrick’s Day", description: "Emerald, shamrocks, stout and antique gold." },
  { id: "classic", name: "Standard Aviator", description: "Original aviation design. Seasonal promotion off." },
  { id: "dead-show", name: "Grateful Dead Night", description: "Vintage concert poster, red, blue and warm gold." },
  { id: "holiday", name: "Holiday Gathering", description: "Evergreen, cranberry and candlelit gold." },
  { id: "after-dark", name: "After Dark", description: "Midnight purple, electric blue and late-night amber." },
] as const;

export type SiteSkin = (typeof siteSkins)[number]["id"];
export type SiteTheme = {
  skin: SiteSkin;
  expiresAt: string;
  communityEnabled?: boolean;
  automaticSeasonal?: boolean;
  manualOverrideUntil?: string;
  promotion: { kind?: 'event'|'seasonal'; eyebrow: string; title: string; description: string; date: string; startTime: string; endTime: string; openingNote: string; venue: string; href: string; linkLabel: string; imageUrl: string; imageAlt: string };
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
  if(body.communityEnabled!==undefined){if(typeof body.communityEnabled!=='boolean')throw new Error('Choose whether artwork likes and comments are enabled.');next.communityEnabled=body.communityEnabled;}
  if(body.automaticSeasonal!==undefined){if(typeof body.automaticSeasonal!=='boolean')throw new Error('Choose whether automatic seasonal rotation is enabled.');next.automaticSeasonal=body.automaticSeasonal;}
  if(body.manualOverrideUntil!==undefined){if(typeof body.manualOverrideUntil!=='string'||body.manualOverrideUntil&&!Number.isFinite(Date.parse(body.manualOverrideUntil)))throw new Error('Check the manual override end time.');next.manualOverrideUntil=body.manualOverrideUntil;}
  if (body.expiresAt !== undefined) {
    if (typeof body.expiresAt !== "string" || (body.expiresAt && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(body.expiresAt) || !Number.isFinite(Date.parse(body.expiresAt))))) throw new Error("Use a valid automatic turn-off time, or leave it blank.");
    next.expiresAt = body.expiresAt;
  }
  if (body.promotion !== undefined) {
    if (!body.promotion || typeof body.promotion !== "object" || Array.isArray(body.promotion)) throw new Error("Check the promotion details.");
    if(body.promotion.kind!==undefined){if(!['event','seasonal'].includes(body.promotion.kind))throw new Error('Choose event or seasonal presentation.');next.promotion.kind=body.promotion.kind;}
    const limits: Record<Exclude<keyof SiteTheme["promotion"],'kind'>, number> = { eyebrow: 100, title: 120, description: 600, date: 10, startTime: 5, endTime: 5, openingNote: 160, venue: 120, href: 500, linkLabel: 60, imageUrl: 500, imageAlt: 200 };
    for (const [key, max] of Object.entries(limits)) {
      const value = body.promotion[key as Exclude<keyof SiteTheme["promotion"],"kind">];
      if (value === undefined) continue;
      if (typeof value !== "string" || value.length > max || /[<>\u0000-\u001f]/.test(value)) throw new Error("Use plain text within the promotion field limits.");
      next.promotion[key as Exclude<keyof SiteTheme["promotion"],"kind">] = value.trim();
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
