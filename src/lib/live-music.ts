export type LiveMusicVenue = {
  id: string;
  name: string;
  shortName: string;
  capacity?: number;
  indoor?: boolean;
  stageDimensions?: string;
  equipment?: string;
  hours?: string;
  color?: string;
  blurb?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
};

export type LiveMusicShow = {
  id: string;
  title: string;
  performanceDate: string;
  startsAt: string;
  endsAt: string;
  doorsAt?: string | null;
  venueId: string;
  venueName: string;
  publicDescription?: string | null;
  ticketUrl?: string | null;
  band: {
    name: string;
    bio?: string | null;
    color?: string | null;
    genres?: string[];
    imageUrl?: string | null;
  };
};

export type LiveMusicSchedule = {
  generatedAt?: string;
  venues: LiveMusicVenue[];
  shows: LiveMusicShow[];
};

type AviatorLiveBooking = Record<string, unknown>;

export const liveMusicPageUrl = "https://aviatorlive.beer/live-music";

const defaultScheduleUrl = process.env.NODE_ENV === "production"
  ? "https://aviatorlive.beer/api/public/live-music"
  : "http://192.168.7.171:5123/api/public/live-music";
const scheduleUrl = process.env.AVIATOR_LIVE_SCHEDULE_URL || defaultScheduleUrl;
const defaultBookingsUrl = process.env.NODE_ENV === "production"
  ? "https://aviatorlive.beer/api/bookings"
  : "http://127.0.0.1:4100/api/bookings";
const bookingsUrl = process.env.AVIATOR_LIVE_BOOKINGS_URL || defaultBookingsUrl;
const bookingsAuth = process.env.AVIATOR_LIVE_BOOKINGS_AUTH || process.env.AVIATOR_LIVE_API_TOKEN || "";
const bookingsAuthHeader = process.env.AVIATOR_LIVE_BOOKINGS_AUTH_HEADER || "authorization";

export async function getLiveMusicSchedule(): Promise<{ schedule: LiveMusicSchedule | null; error: boolean }> {
  try {
    const response = await fetch(scheduleUrl, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Live Music returned ${response.status}`);
    const payload = await response.json() as { schedule?: LiveMusicSchedule };
    if (!payload.schedule || !Array.isArray(payload.schedule.venues) || !Array.isArray(payload.schedule.shows)) throw new Error("Invalid Live Music schedule");
    return { schedule: payload.schedule, error: false };
  } catch {
    return { schedule: null, error: true };
  }
}

function stringField(source: unknown, keys: string[]): string {
  if (!source || typeof source !== "object") return "";
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function nestedField(source: unknown, key: string, keys: string[]): string {
  if (!source || typeof source !== "object") return "";
  return stringField((source as Record<string, unknown>)[key], keys);
}

function bookingDate(value: AviatorLiveBooking) {
  const direct = stringField(value, ["performanceDate", "date", "bookingDate", "eventDate", "startDate"]);
  if (/^\d{4}-\d{2}-\d{2}/.test(direct)) return direct.slice(0, 10);
  const fromStart = stringField(value, ["startsAt", "startTime", "start", "dateTime", "scheduledAt"]);
  return /^\d{4}-\d{2}-\d{2}/.test(fromStart) ? fromStart.slice(0, 10) : "";
}

function bookingTimestamp(value: AviatorLiveBooking, date: string) {
  const direct = stringField(value, ["startsAt", "start", "dateTime", "scheduledAt"]);
  if (direct && !Number.isNaN(Date.parse(direct))) return direct;
  const time = stringField(value, ["startTime", "time"]);
  if (!date || !time) return date ? date + "T23:59:00.000Z" : "";
  if (/^\d{1,2}:\d{2}/.test(time)) return date + "T" + time.slice(0, 5) + ":00";
  const parsed = Date.parse(date + " " + time);
  return Number.isNaN(parsed) ? date + "T23:59:00.000Z" : new Date(parsed).toISOString();
}

function bookingStatus(value: AviatorLiveBooking) {
  return stringField(value, ["status", "bookingStatus", "state"]).toLowerCase();
}

function bookingPayloadItems(payload: unknown): AviatorLiveBooking[] {
  if (Array.isArray(payload)) return payload.filter((item): item is AviatorLiveBooking => Boolean(item && typeof item === "object"));
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of ["bookings", "items", "events", "shows", "data", "results"]) {
    const value = record[key];
    if (Array.isArray(value)) return value.filter((item): item is AviatorLiveBooking => Boolean(item && typeof item === "object"));
  }
  return [];
}

function normalizeBooking(value: AviatorLiveBooking): LiveMusicShow | null {
  const status = bookingStatus(value);
  if (["cancelled", "canceled", "declined", "rejected"].includes(status)) return null;
  const performanceDate = bookingDate(value);
  if (!performanceDate) return null;
  const startsAt = bookingTimestamp(value, performanceDate);
  const venueName = stringField(value, ["venueName", "stageName", "locationName", "location"]) || nestedField(value, "venue", ["name", "title"]) || "Aviator Live";
  const bandName = nestedField(value, "band", ["name", "title"]) || nestedField(value, "artist", ["name", "title"]) || nestedField(value, "performer", ["name", "title"]) || stringField(value, ["bandName", "artistName", "performerName", "actName", "name", "title"]) || "Aviator Live show";
  const id = stringField(value, ["id", "bookingId", "eventId", "showId", "uuid"]) || [bandName, performanceDate, venueName].join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    id,
    title: stringField(value, ["title", "eventTitle"]) || bandName + " - Live",
    performanceDate,
    startsAt,
    endsAt: stringField(value, ["endsAt", "endTime", "end"]) || startsAt,
    doorsAt: stringField(value, ["doorsAt", "doorsTime"]) || null,
    venueId: stringField(value, ["venueId", "stageId", "locationId"]),
    venueName,
    publicDescription: stringField(value, ["publicDescription", "description", "notes"]) || null,
    ticketUrl: stringField(value, ["ticketUrl", "url"]) || null,
    band: {
      name: bandName,
      bio: nestedField(value, "band", ["bio"]) || null,
      color: nestedField(value, "band", ["color"]) || null,
      genres: [],
      imageUrl: nestedField(value, "band", ["imageUrl", "image"]) || stringField(value, ["imageUrl"]) || null,
    },
  };
}

async function getLiveMusicBookingShows(fromDate: string, toDate: string): Promise<LiveMusicShow[]> {
  try {
    const url = new URL(bookingsUrl);
    url.searchParams.set("dateFrom", fromDate);
    url.searchParams.set("dateTo", toDate);
    const headers: Record<string, string> = {};
    if (bookingsAuth) headers[bookingsAuthHeader] = bookingsAuthHeader.toLowerCase() === "authorization" && !bookingsAuth.toLowerCase().startsWith("bearer ") ? "Bearer " + bookingsAuth : bookingsAuth;
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000), headers });
    if (!response.ok) throw new Error(`Aviator Live bookings returned ${response.status}`);
    const payload = await response.json();
    return bookingPayloadItems(payload).map(normalizeBooking).filter((show): show is LiveMusicShow => Boolean(show));
  } catch {
    return [];
  }
}

const locationStageNames: Record<string, string[]> = {
  "aviator-amphitheater": ["Aviator Amphitheater"],
  "hangar-bar": ["Hangar Bar Stage"],
  taphouse: ["Aviator TapHouse", "TapHouse Patio"],
  "pizza-pub": ["Aviator Pizza Pub", "Aviator Pizza Pub Backyard"],
  "ready-room": ["Ready Room Stage"],
};

export function getLocationLiveShows(locationSlug: string, schedule: LiveMusicSchedule | null) {
  if (!schedule) return [];
  const stageNames = locationStageNames[locationSlug] || [];
  const stageIds = new Set(schedule.venues.filter((venue) => stageNames.includes(venue.name)).map((venue) => venue.id));
  return schedule.shows.filter((show) => stageIds.has(show.venueId) || stageNames.includes(show.venueName));
}

function easternDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return year + "-" + month + "-" + day;
}

function addDays(date: string, days: number) {
  const value = new Date(Date.parse(date + "T00:00:00Z") + days * 86400000);
  return value.toISOString().slice(0, 10);
}

function displayShowDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" }).format(new Date(value + "T12:00:00Z"));
}

function displayShowTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time TBA" : new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(date);
}

export type LiveMusicCheckInTarget = { id: string; title: string; meta: string; label: string };

export function liveMusicCheckInId(show: LiveMusicShow) {
  return "aviator-live-" + show.id;
}

export function liveMusicCheckInTarget(show: LiveMusicShow): LiveMusicCheckInTarget {
  const title = show.band.name || show.title || "Aviator Live show";
  return {
    id: liveMusicCheckInId(show),
    title,
    meta: [displayShowDate(show.performanceDate), displayShowTime(show.startsAt), show.venueName].filter(Boolean).join(" · "),
    label: [title, show.venueName].filter(Boolean).join(" - "),
  };
}

export async function getAviatorLiveCheckInTargets(options: { daysBack?: number } = {}) {
  const today = easternDate();
  const fromDate = addDays(today, -(options.daysBack ?? 20));
  const bookingShows = await getLiveMusicBookingShows(fromDate, today);
  const scheduleResult = bookingShows.length ? { schedule: null } : await getLiveMusicSchedule();
  const shows = (bookingShows.length ? bookingShows : scheduleResult.schedule?.shows || [])
    .filter((show) => show.performanceDate >= fromDate && show.performanceDate <= today)
    .sort((a, b) => (b.performanceDate + b.startsAt).localeCompare(a.performanceDate + a.startsAt));
  return shows.map(liveMusicCheckInTarget);
}
