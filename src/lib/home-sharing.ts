import type { Metadata } from "next";
import { activeSiteSkin, themeDateLabel, themeTimeLabel, type SiteTheme } from "@/lib/site-skins";

export function homeSharingMetadata(theme: SiteTheme, siteUrl: string, now = Date.now()): Metadata {
  const promotion = activeSiteSkin(theme, now) !== "classic" && Boolean(theme.promotion.imageUrl);
  const p = theme.promotion;
  const title = promotion ? `${p.title} | ${themeDateLabel(theme)} | Aviator Brewing Company` : "Aviator Brewing Company | Fuquay-Varina, NC";
  const description = promotion
    ? `${themeDateLabel(theme)} · ${themeTimeLabel(p.startTime)}–${themeTimeLabel(p.endTime)} · ${p.venue}. ${p.openingNote} ${p.description}`
    : "Craft beer, scratch-made food, live music, events, breakfast, cocktails, and aviation-inspired experiences in Fuquay-Varina, North Carolina.";
  const image = new URL(promotion ? p.imageUrl : "/api/branding/logo", siteUrl);
  if (promotion && theme.updatedAt) image.searchParams.set("v", theme.updatedAt);
  const originalPoster = promotion && image.pathname === "/images/promotions/bring-out-yer-dead-nov7.jpg";
  const alt = promotion ? p.imageAlt : "Aviator Brewing Company logo";
  return {
    openGraph: {
      type: "website", locale: "en_US", siteName: "Aviator Brewing Company", url: new URL("/", siteUrl).href,
      title, description,
      images: [{ url: image.href, alt, ...(originalPoster ? { width: 1080, height: 1080, type: "image/jpeg" } : {}) }],
    },
    twitter: { card: "summary_large_image", title, description, images: [{ url: image.href, alt }] },
  };
}
