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

export const liveMusicPageUrl = "https://aviatorlive.beer/live-music";

const defaultScheduleUrl = process.env.NODE_ENV === "production"
  ? "https://aviatorlive.beer/api/public/live-music"
  : "http://192.168.7.171:5123/api/public/live-music";
const scheduleUrl = process.env.AVIATOR_LIVE_SCHEDULE_URL || defaultScheduleUrl;

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
  const { schedule } = await getLiveMusicSchedule();
  const shows = (schedule?.shows || [])
    .filter((show) => show.performanceDate >= fromDate && show.performanceDate <= today)
    .sort((a, b) => (b.performanceDate + b.startsAt).localeCompare(a.performanceDate + a.startsAt));
  return shows.map(liveMusicCheckInTarget);
}
