import { NextRequest, NextResponse } from "next/server";
import { getFlightCrewWelcome } from "@/lib/flight-crew-welcome";
import { getLiveMusicSchedule } from "@/lib/live-music";
import { isMailConfigured, sendMail } from "@/lib/mail";
import { getPortalBeers } from "@/lib/managed-beers";
import { getPublishedEvents } from "@/lib/managed-events";
import { getAllLocations } from "@/lib/managed-locations";
import { latestPublicMenu } from "@/lib/menu-files";
import { confirmNewsletterSubscription, markNewsletterWelcomeSent } from "@/lib/newsletter";
import { buildFlightCrewWelcomeMessage, newsletterMusicForNextTwoWeeks, verifyNewsletterConfirmationToken } from "@/lib/newsletter-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function page(title: string, message: string, status = 200) {
  return new NextResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title} | Aviator Brewing Company</title></head><body style="margin:0;background:#071827;color:#f4f7f8;font-family:Arial,sans-serif"><main style="max-width:600px;margin:12vh auto;padding:40px;border:1px solid #315a78;background:#102c46"><p style="color:#efb45f;font-weight:800;text-transform:uppercase">Aviator Brewing Company</p><h1>${title}</h1><p style="line-height:1.6">${message}</p><a href="/" style="color:#efb45f">Return to aviatorbrew.com</a></main></body></html>`, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email") || "";
  const expires = request.nextUrl.searchParams.get("expires") || "";
  const token = request.nextUrl.searchParams.get("token") || "";
  if (!email || !verifyNewsletterConfirmationToken(email, expires, token)) return page("That confirmation link is invalid", "Please request a new Flight Crew confirmation email from aviatorbrew.com.", 400);

  try {
    const result = await confirmNewsletterSubscription(email);
    if (!result) return page("That confirmation link is invalid", "Please request a new Flight Crew confirmation email from aviatorbrew.com.", 400);
    if (result.shouldSendWelcome) {
      if (!isMailConfigured() && process.env.MAIL_MODE !== "record") throw new Error("Email delivery is not configured");
      const [welcome, beers, events, locations, music, hangarMenu] = await Promise.all([
        getFlightCrewWelcome(),
        getPortalBeers().then((items) => items.filter((beer) => beer.published !== false)),
        getPublishedEvents({ monthsAhead: 3 }),
        getAllLocations(),
        getLiveMusicSchedule(),
        latestPublicMenu("hangar-bar", "food"),
      ]);
      const message = buildFlightCrewWelcomeMessage(welcome, {
        beers,
        events,
        locations,
        music: newsletterMusicForNextTwoWeeks(music.schedule?.shows || []),
        hangarMenu,
        highlights: [],
      }, result.subscriber.email);
      const sent = await sendMail({ to: result.subscriber.email, subject: message.subject, text: message.text, html: message.html });
      if (!sent) throw new Error("Email delivery is not configured");
      await markNewsletterWelcomeSent(result.subscriber.email);
    }
    return page("Welcome to the Flight Crew", "Your email is confirmed. Your welcome message and current Aviator flight plan are on the way.");
  } catch {
    return page("Your email is confirmed", "We could not send your welcome message yet. Please use this confirmation link again in a few minutes.", 503);
  }
}
