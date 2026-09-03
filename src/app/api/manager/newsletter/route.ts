import { NextRequest, NextResponse } from "next/server";
import { getFlightCrewWelcome, saveFlightCrewWelcome, type FlightCrewWelcome } from "@/lib/flight-crew-welcome";
import { isManager } from "@/lib/manager-auth";
import { isMailConfigured, sendMail } from "@/lib/mail";
import { getPortalBeers } from "@/lib/managed-beers";
import { getPublishedEvents } from "@/lib/managed-events";
import { getAllLocations } from "@/lib/managed-locations";
import { getLiveMusicSchedule } from "@/lib/live-music";
import { latestPublicMenu } from "@/lib/menu-files";
import { getPublishedBeerReleaseAlerts } from "@/lib/beer-release-alert";
import { getCouponOffers } from "@/lib/coupons";
import { getUploadedKegInventory, type KegInventoryItem } from "@/lib/keg-inventory";
import { getPublishedFlightLogPosts } from "@/lib/flight-log";
import { getPublishedCustomerFlightLogPosts } from "@/lib/flight-log-social";
import { getShopCatalog } from "@/lib/shop";
import { getTourSummary } from "@/lib/tours";
import { getConfirmedNewsletterSubscribers, getNewsletterSubscribers, subscribeNewsletter, unsubscribeNewsletter } from "@/lib/newsletter";
import { getNewsletterCampaigns, recordNewsletterCampaign } from "@/lib/newsletter-campaigns";
import { buildFlightCrewWelcomeMessage, buildNewsletterMessage, newsletterMusicForNextTwoWeeks, type NewsletterDraft, type NewsletterSections } from "@/lib/newsletter-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function validateDraft(value: unknown): NewsletterDraft {
  const input = value && typeof value === "object" ? value as Partial<NewsletterDraft> : {};
  const source = input.sections && typeof input.sections === "object" ? input.sections : {} as Partial<NewsletterSections>;
  const draft: NewsletterDraft = {
    template: clean(input.template, 50) || "weekly",
    subject: clean(input.subject, 150),
    heading: clean(input.heading, 120),
    message: clean(input.message, 5000),
    sections: {
      beers: source.beers === true,
      releases: source.releases === true,
      packages: source.packages === true,
      events: source.events === true,
      music: source.music === true,
      hangarMenu: source.hangarMenu === true,
      food: source.food === true,
      coupons: source.coupons === true,
      tours: source.tours === true,
      visit: source.visit === true,
      community: source.community === true,
      shop: source.shop === true,
      hospitality: source.hospitality === true,
      behindScenes: source.behindScenes === true,
      extras: source.extras === true,
      locations: source.locations === true,
    },
  };
  if (!draft.subject || !draft.heading || !draft.message) throw new Error("Add a subject, headline, and message.");
  return draft;
}

function validateWelcome(value: unknown): FlightCrewWelcome {
  const input = value && typeof value === "object" ? value as Partial<FlightCrewWelcome> : {};
  const welcome = {
    subject: clean(input.subject, 150),
    heading: clean(input.heading, 120),
    intro: clean(input.intro, 3000),
    history: clean(input.history, 5000),
    speakeasy: clean(input.speakeasy, 3000),
    special: clean(input.special, 2000),
  };
  if (Object.values(welcome).some((field) => !field)) throw new Error("Complete every welcome email field.");
  return welcome;
}

function money(cents?: number) {
  return typeof cents === "number" && cents > 0
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100)
    : "";
}


function packagedAvailability(item: KegInventoryItem) {
  const details: string[] = [];
  const case12Price = item.case12PriceCents || (/^12\s*oz$/i.test(item.caseSize || "") ? item.casePriceCents : undefined);
  const case16Price = item.case16PriceCents || (/^16\s*oz$/i.test(item.caseSize || "") ? item.casePriceCents : undefined);
  if ((item.case12Count || 0) > 0) details.push(`12 oz cases${money(case12Price) ? ` at ${money(case12Price)}` : ""}`);
  if (item.has12ozFourPack === true && item.case12FourPackPriceCents) details.push(`12 oz 4-packs at ${money(item.case12FourPackPriceCents)}`);
  if (item.has12ozSixPack === true && item.case12SixPackPriceCents) details.push(`12 oz 6-packs at ${money(item.case12SixPackPriceCents)}`);
  if ((item.case16Count || 0) > 0) details.push(`16 oz cases${money(case16Price) ? ` at ${money(case16Price)}` : ""}`);
  if (item.has16ozFourPack === true && item.case16FourPackPriceCents) details.push(`16 oz 4-packs at ${money(item.case16FourPackPriceCents)}`);
  if ((item.caseCount || 0) > 0 && !(item.case12Count || item.case16Count)) details.push(`${item.caseSize || "cases"}${money(item.casePriceCents) ? ` at ${money(item.casePriceCents)}` : ""}`);
  return details.filter((item) => !item.endsWith(" at ")).join(" · ");
}

async function getContent() {
  const [beers, events, locations, liveMusic, hangarMenu, releases, kegInventory, coupons, tour, officialPosts, customerPosts, shopProducts] = await Promise.all([
    getPortalBeers().then((items) => items.filter((beer) => beer.published !== false)),
    getPublishedEvents({ monthsAhead: 3 }),
    getAllLocations(),
    getLiveMusicSchedule(),
    latestPublicMenu("hangar-bar", "food"),
    getPublishedBeerReleaseAlerts().catch(() => []),
    getUploadedKegInventory().catch(() => null),
    getCouponOffers().catch(() => []),
    getTourSummary().catch(() => null),
    getPublishedFlightLogPosts("all").catch(() => []),
    getPublishedCustomerFlightLogPosts(1).catch(() => []),
    getShopCatalog().then((catalog) => catalog.products).catch(() => []),
  ]);

  const foodPost = officialPosts.find((post) => post.category === "food_specials");
  const breweryPost = officialPosts.find((post) => post.category === "brewery_news");
  const communityPost = customerPosts[0];
  const hangar = locations.find((location) => location.slug === "hangar-bar");
  const packagedBeer = (kegInventory?.items || [])
    .filter((item) => (item.case12Count || 0) > 0 || (item.case16Count || 0) > 0 || (item.caseCount || 0) > 0 || (/(can|case|4[ -]?pack|6[ -]?pack)/i.test(item.packaging) && Boolean(item.casePriceCents || item.case12PriceCents || item.case16PriceCents)))
    .map((item) => ({
      title: item.beerName,
      meta: item.packaging || item.caseSize || item.category,
      copy: packagedAvailability(item) || "Available in cans. See the Kegs & Beer to Go page for current package pricing.",
      url: "/kegs",
      action: "Order beer to go",
    }));
  const merchandise = shopProducts
    .filter((product) => product.productType === "merchandise" && product.variants.some((variant) => variant.availableForSale))
    .sort((a, b) => Number(b.featured) - Number(a.featured) || a.sortOrder - b.sortOrder)
    .slice(0, 3);

  return {
    beers: beers.slice(0, 3),
    events: events.slice(0, 3),
    locations,
    music: newsletterMusicForNextTwoWeeks(liveMusic.schedule?.shows || []),
    hangarMenu,
    releases: releases.slice(0, 2).map((release) => ({ title: release.beerName, meta: [release.releaseDate, release.releaseTime, release.locations].filter(Boolean).join(" · "), copy: release.specials, url: release.sellSheetUrl || "/beer", action: "See the release", imageUrl: beers.find((beer) => beer.name.toLowerCase() === release.beerName.toLowerCase())?.image })),
    packagedBeer: [{ title: "Cold 4-packs and 6-packs to go", copy: "Stock the fridge with Aviator beer at great prices. The packaged beer list below comes directly from the current Kegs & Beer to Go inventory.", url: "/kegs", action: "See all beer to go" }, ...packagedBeer],
    food: foodPost ? [{ title: foodPost.title, copy: foodPost.excerpt || foodPost.body.slice(0, 260), url: `/flight-log/${foodPost.slug}`, action: "See the food feature", imageUrl: foodPost.imageUrl }] : [],
    coupons: coupons.slice(0, 3).map((offer) => ({ title: offer.title, meta: `Code ${offer.code} · Expires ${offer.expiresAt}`, copy: [offer.description, offer.terms].filter(Boolean).join(" "), url: "/coupons", action: "Get the offer" })),
    tours: tour ? [{ title: `Saturday brewery tours · ${tour.date}`, meta: `4 PM: ${tour.fourPm.remaining} seats · 6 PM: ${tour.sixPm.remaining} seats`, copy: `${money(tour.priceCents)} per guest. Tour the brewhouse and hear the Aviator story.`, url: "/about#brewery-tours", action: "Reserve a tour" }] : [],
    visit: hangar ? [{ title: hangar.name, meta: hangar.address, copy: "Check the menu, hours, directions, and join the waitlist before you arrive.", url: `/locations/${hangar.slug}`, action: "Plan your visit" }] : [],
    community: communityPost ? [{ title: communityPost.title || `From ${communityPost.authorName}`, meta: communityPost.authorHandle ? `@${communityPost.authorHandle}` : communityPost.authorName, copy: communityPost.body.slice(0, 260), url: "/flight-log", action: "Open the Flight Log" }] : [],
    shop: merchandise.map((product) => ({ title: product.name, meta: product.categoryName, copy: product.description.slice(0, 220), url: `/shop-new#product-${product.slug}`, action: "Shop now", imageUrl: product.imageUrl })),
    hospitality: [
      { title: "Host a private event", copy: "Bring your group to Aviator for celebrations, company gatherings, and custom events.", url: "/private-events", action: "Plan an event" },
      { title: "Catering to go", copy: "Make the next gathering easy with Aviator food ready to pick up.", url: "/catering-to-go", action: "See catering" },
    ],
    behindScenes: breweryPost ? [{ title: breweryPost.title, copy: breweryPost.excerpt || breweryPost.body.slice(0, 260), url: `/flight-log/${breweryPost.slug}`, action: "Read the brewery update", imageUrl: breweryPost.imageUrl }] : [],
    highlights: [
      { title: "Menus", copy: "See current food and drink menus.", url: "/menus" },
      { title: "Events", copy: "Find upcoming events and the full calendar.", url: "/events" },
      { title: "Flight Log", copy: "Catch official dispatches and community updates.", url: "/flight-log" },
      { title: "All locations", copy: "Check hours, addresses, and visit details.", url: "/locations" },
    ],
  };
}

async function responseData() {
  const [subscribers, campaigns, content, welcome] = await Promise.all([
    getNewsletterSubscribers(),
    getNewsletterCampaigns(),
    getContent(),
    getFlightCrewWelcome(),
  ]);
  const confirmedCount = subscribers.filter((subscriber) => subscriber.status === "confirmed").length;
  return {
    subscribers,
    confirmedCount,
    pendingCount: subscribers.length - confirmedCount,
    campaigns,
    content,
    welcome,
    managerEmail: process.env.MANAGER_PORTAL_EMAIL || process.env.MAIL_REPLY_TO || "",
    mailConfigured: isMailConfigured() || process.env.MAIL_MODE === "record",
  };
}

export async function GET(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json(await responseData());
}

export async function POST(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const body = await request.json() as { action?: string; email?: string; name?: string; draft?: unknown; welcome?: unknown; testEmail?: string; subscribers?: { email?: string; name?: string }[] };
    if (body.action === "add") {
      await subscribeNewsletter({ email: body.email || "", name: body.name, source: "manager" });
      return NextResponse.json(await responseData());
    }
    if (body.action === "import") {
      const rows = Array.isArray(body.subscribers) ? body.subscribers.slice(0, 5000) : [];
      if (!rows.length) return NextResponse.json({ error: "Upload a CSV with at least one email address." }, { status: 400 });
      let added = 0;
      let updated = 0;
      let skipped = 0;
      const seen = new Set<string>();
      for (const row of rows) {
        const email = clean(row.email, 254).toLowerCase();
        const name = clean(row.name, 120);
        if (!/^\S+@\S+\.\S+$/.test(email) || seen.has(email)) { skipped += 1; continue; }
        seen.add(email);
        try {
          const result = await subscribeNewsletter({ email, name, source: "manager-csv" });
          if (result.added) added += 1;
          else updated += 1;
        } catch {
          skipped += 1;
        }
      }
      return NextResponse.json({ ok: true, importResult: { added, updated, skipped }, ...(await responseData()) });
    }
    if (body.action === "save-welcome") {
      await saveFlightCrewWelcome(validateWelcome(body.welcome));
      return NextResponse.json({ ok: true, ...(await responseData()) });
    }
    if (body.action === "test-welcome") {
      if (!isMailConfigured() && process.env.MAIL_MODE !== "record") return NextResponse.json({ error: "Email delivery is not configured." }, { status: 503 });
      const recipient = clean(body.testEmail, 254).toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(recipient)) return NextResponse.json({ error: "Enter a valid test email address." }, { status: 400 });
      const welcome = validateWelcome(body.welcome);
      const message = buildFlightCrewWelcomeMessage(welcome, await getContent());
      const sent = await sendMail({ to: recipient, subject: `[TEST] ${message.subject}`, text: message.text, html: message.html });
      if (!sent) throw new Error("Email delivery is not configured.");
      return NextResponse.json({ ok: true, sent: 1, ...(await responseData()) });
    }

    if (body.action !== "send-test" && body.action !== "send-all") return NextResponse.json({ error: "Unknown Flight Crew action." }, { status: 400 });
    if (!isMailConfigured() && process.env.MAIL_MODE !== "record") return NextResponse.json({ error: "Email delivery is not configured." }, { status: 503 });
    const draft = validateDraft(body.draft);
    const content = await getContent();
    const subscribers = await getConfirmedNewsletterSubscribers();
    const managerEmail = process.env.MANAGER_PORTAL_EMAIL || process.env.MAIL_REPLY_TO || "";
    const recipients = body.action === "send-test" ? (managerEmail ? [managerEmail] : []) : subscribers.map((subscriber) => subscriber.email);
    if (!recipients.length) return NextResponse.json({ error: body.action === "send-test" ? "Manager email is not configured." : "There are no confirmed Flight Crew members yet." }, { status: 400 });

    let sent = 0;
    for (let index = 0; index < recipients.length; index += 8) {
      const batch = recipients.slice(index, index + 8);
      await Promise.all(batch.map(async (recipient) => {
        const message = buildNewsletterMessage(draft, content, recipient);
        const delivered = await sendMail({ to: recipient, subject: draft.subject, text: message.text, html: message.html, replyTo: managerEmail || undefined });
        if (delivered) sent += 1;
      }));
    }
    if (body.action === "send-all") {
      await recordNewsletterCampaign({
        subject: draft.subject,
        template: draft.template,
        recipients: sent,
        sections: Object.entries(draft.sections).filter(([, selected]) => selected).map(([name]) => name),
      });
    }
    return NextResponse.json({ ok: true, sent, ...(await responseData()) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not process the Flight Crew email." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const email = request.nextUrl.searchParams.get("email") || "";
  await unsubscribeNewsletter(email);
  return NextResponse.json(await responseData());
}
