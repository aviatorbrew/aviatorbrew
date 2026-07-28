import { NextRequest, NextResponse } from "next/server";
import { findItineraryStop, type ItineraryPhase, type ItineraryStop } from "@/data/itinerary";
import { isMailConfigured, sendMail, verifySmtpOnStart } from "@/lib/mail";

export const runtime = "nodejs";
verifySmtpOnStart();

const attempts = new Map<string, number[]>();
const validEmail = /^\S+@\S+\.\S+$/;
const phaseLabels: Record<ItineraryPhase, string> = { drinks: "Drinks", appetizer: "Appetizers", dinner: "Dinner" };
const phaseDurations: Record<ItineraryPhase, number> = { drinks: 60, appetizer: 45, dinner: 120 };

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] || character);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" }).format(new Date(`${value}T12:00:00-05:00`));
}

function formatTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(2020, 0, 1, hour, minute));
}

function minutesFromTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function timeFromMinutes(value: number) {
  const normalized = value % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function scheduleStops(stops: ItineraryStop[], startTime: string) {
  let cursor = minutesFromTime(startTime);
  return stops.map((stop) => {
    const time = timeFromMinutes(cursor);
    cursor += phaseDurations[stop.phase];
    return { stop, time };
  });
}

function allow(request: NextRequest) {
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const cutoff = Date.now() - 60 * 60 * 1000;
  const recent = (attempts.get(key) || []).filter((timestamp) => timestamp > cutoff);
  if (recent.length >= 5) return false;
  recent.push(Date.now());
  attempts.set(key, recent);
  return true;
}

function stopIdsFromBody(body: Record<string, unknown>) {
  if (Array.isArray(body.stopIds)) return body.stopIds.filter((id): id is string => typeof id === "string");
  const legacy = [body.drinksId, body.dinnerId].filter((id): id is string => typeof id === "string");
  return legacy;
}

export async function POST(request: NextRequest) {
  try {
    if (!allow(request)) return NextResponse.json({ error: "Too many itinerary emails were requested. Please try again later." }, { status: 429 });
    const body = await request.json() as Record<string, unknown>;
    if (body.website) return NextResponse.json({ ok: true });
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
    const date = typeof body.date === "string" ? body.date : "";
    const startTime = typeof body.startTime === "string" ? body.startTime : "";
    const partySize = Number(body.partySize);
    const stopIds = stopIdsFromBody(body).slice(0, 8);
    const uniqueStopIds = [...new Set(stopIds)];
    const stops = uniqueStopIds.map((id) => findItineraryStop(id)).filter(Boolean) as ItineraryStop[];
    if (!validEmail.test(email) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime) || !Number.isInteger(partySize) || partySize < 1 || partySize > 20 || stops.length < 1 || stops.length !== uniqueStopIds.length) {
      return NextResponse.json({ error: "Complete the itinerary and enter a valid email address." }, { status: 400 });
    }
    if (stops.some((stop) => stop.comingSoon)) return NextResponse.json({ error: "Choose locations that are currently open." }, { status: 400 });
    if (!isMailConfigured() && process.env.MAIL_MODE !== "record") return NextResponse.json({ error: "Email delivery is not configured." }, { status: 503 });

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://aviatorbrew.com").replace(/\/$/, "");
    const scheduled = scheduleStops(stops, startTime);
    const stopHtml = scheduled.map(({ stop, time }, index) => `<tr><td style="padding:24px 26px;border-top:1px solid #36566a"><div style="color:#e8ad55;font-size:12px;font-weight:800;text-transform:uppercase">${escapeHtml(formatTime(time))} &bull; ${escapeHtml(phaseLabels[stop.phase])} stop ${index + 1}</div><h2 style="margin:8px 0;color:#f4f7f8;font-size:24px">${escapeHtml(stop.label)}</h2><p style="margin:0 0 12px;color:#c7d7de;line-height:1.5">${escapeHtml(stop.description)}</p><p style="margin:0 0 14px;color:#eef5f7">${escapeHtml(stop.address)}</p><div style="margin:0 0 14px;color:#b8cbd3;font-size:14px;line-height:1.6">${stop.highlights.map((item) => `<strong style="color:#f4f7f8">${escapeHtml(item.name)}</strong> - ${escapeHtml(item.detail)}`).join("<br>")}</div><a href="https://maps.google.com/?q=${encodeURIComponent(stop.address)}" style="color:#e8ad55">Directions</a>${stop.menuUrl ? ` &bull; <a href="${siteUrl}${stop.menuUrl}" style="color:#e8ad55">Current menu</a>` : ""}</td></tr>`).join("");
    const html = `<!doctype html><html><body style="margin:0;background:#e4eaec;font-family:Arial,sans-serif;color:#10243a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#102b3a;border:1px solid #36566a"><tr><td style="padding:28px 26px;background:#17201c"><div style="color:#e8ad55;font-size:12px;font-weight:800;text-transform:uppercase">Aviator Night-Out Flight Plan</div><h1 style="margin:10px 0 8px;color:#f4f7f8;font-size:32px">${escapeHtml(formatDate(date))}</h1><p style="margin:0;color:#c7d7de">${partySize} guest${partySize === 1 ? "" : "s"} &bull; ${stops.length} stop${stops.length === 1 ? "" : "s"}</p></td></tr>${stopHtml}<tr><td style="padding:22px 26px;border-top:1px solid #36566a;background:#17201c;color:#9fb2ba;font-size:12px;line-height:1.5">Menu highlights and prices reflect current uploaded menus and may change. Confirm hours and availability before your visit.<br><a href="${siteUrl}/itinerary" style="color:#e8ad55">Build another Aviator itinerary</a></td></tr></table></td></tr></table></body></html>`;
    const text = [
      "AVIATOR NIGHT-OUT FLIGHT PLAN",
      formatDate(date),
      `${partySize} guest${partySize === 1 ? "" : "s"} - ${stops.length} stop${stops.length === 1 ? "" : "s"}`,
      "",
      ...scheduled.flatMap(({ stop, time }, index) => [
        `${formatTime(time)} - ${phaseLabels[stop.phase].toUpperCase()} STOP ${index + 1}`,
        stop.label,
        stop.address,
        ...stop.highlights.map((item) => `${item.name} - ${item.detail}`),
        `Directions: https://maps.google.com/?q=${encodeURIComponent(stop.address)}`,
        ...(stop.menuUrl ? [`Menu: ${siteUrl}${stop.menuUrl}`] : []),
        "",
      ]),
      "Menu highlights and prices may change. Confirm hours and availability before your visit.",
      `${siteUrl}/itinerary`,
    ].join("\n");
    const sent = await sendMail({ to: email, subject: `Your Aviator night out - ${formatDate(date)}`, text, html });
    if (!sent) throw new Error("Email delivery is unavailable");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "We could not send that itinerary right now. Please try again." }, { status: 500 });
  }
}
