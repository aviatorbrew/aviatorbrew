import { NextRequest, NextResponse } from "next/server";
import { getFlightCrewWelcome, saveFlightCrewWelcome, type FlightCrewWelcome } from "@/lib/flight-crew-welcome";
import { isManager } from "@/lib/manager-auth";
import { isMailConfigured, sendMail } from "@/lib/mail";
import { getPortalBeers } from "@/lib/managed-beers";
import { getPublishedEvents } from "@/lib/managed-events";
import { getAllLocations } from "@/lib/managed-locations";
import { getLiveMusicSchedule } from "@/lib/live-music";
import { latestPublicMenu } from "@/lib/menu-files";
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
      events: source.events === true,
      music: source.music === true,
      hangarMenu: source.hangarMenu === true,
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

async function getContent() {
  const [beers, events, locations, liveMusic, hangarMenu] = await Promise.all([
    getPortalBeers().then((items) => items.filter((beer) => beer.published !== false)),
    getPublishedEvents({ monthsAhead: 3 }),
    getAllLocations(),
    getLiveMusicSchedule(),
    latestPublicMenu("hangar-bar", "food"),
  ]);
  return {
    beers,
    events,
    locations,
    music: newsletterMusicForNextTwoWeeks(liveMusic.schedule?.shows || []),
    hangarMenu,
    highlights: [
      { title: "Tour the brewery", copy: "See the brewhouse, hear the Aviator story, and reserve a Saturday tour.", url: "/about#brewery-tours" },
      { title: "Join the Hangar Bar waitlist", copy: "Add your party before you arrive at 688 Brewing Drive.", url: "https://www.waitlist.me/w/aviatorhangarbar" },
      { title: "Check the Flight Log", copy: "Catch official dispatches, customer posts, check-ins, and community updates.", url: "/flight-log" },
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
