import type { MetadataRoute } from "next";
import { beers, events, locations } from "@/data/site";
import { publicSiteUrl } from "@/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicSiteUrl();
  const pages = ["", "/beer", "/locations", "/itinerary", "/events", "/events/live-music", "/private-events", "/catering-to-go", "/brewery", "/distillery", "/about", "/careers", "/contact", "/shop", "/shop-new", "/faq", "/more", "/order-food", "/kegs", "/gift-card-balance", "/book-a-band", "/donation-requests", "/apply-for-a-job"];
  return [...pages.map((path) => ({ url: `${base}${path}`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: path === "" ? 1 : .7 })), ...beers.map((beer) => ({ url: `${base}/beer/${beer.slug}`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: .6 })), ...locations.map((location) => ({ url: `${base}/locations/${location.slug}`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: .7 })), ...events.map((event) => ({ url: `${base}/events/${event.slug}`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: .6 }))];
}
