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

const defaultScheduleUrl = process.env.NODE_ENV === "production"
  ? "http://aviatorlive.is-with-theband.com/api/public/live-music"
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
