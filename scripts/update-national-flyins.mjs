import { writeFileSync } from "node:fs";

const featuredFlyins = [
  {
    name: "SUN 'n FUN Aerospace Expo",
    dates: "April 6-11, 2027",
    location: "Lakeland Linder International Airport (KLAL), Lakeland, Florida",
    note: "Major spring aviation expo, airshow, fly-in, forums, aircraft camping, and exhibitor event.",
    href: "https://flysnf.org/",
    sourceLabel: "SUN 'n FUN official dates",
  },
  {
    name: "EAA AirVenture Oshkosh",
    dates: "July 26-August 1, 2027",
    location: "Wittman Regional Airport (KOSH), Oshkosh, Wisconsin",
    note: "EAA's annual fly-in convention and one of the largest aviation gatherings in the world.",
    href: "https://www.eaa.org/airventure/landing-pages",
    sourceLabel: "EAA official AirVenture dates",
  },
  {
    name: "Triple Tree Fly-In",
    dates: "September 20-26, 2027",
    location: "Triple Tree Aerodrome (SC00), Woodruff, South Carolina",
    note: "General aviation fly-in on Triple Tree's 7,000-foot grass runway. The 2026 event is September 21-27, 2026.",
    href: "https://tta.aero/ttfi/",
    sourceLabel: "Triple Tree official future dates",
  },
];

const sources = [
  {
    label: "EAA Calendar of Events",
    href: "https://www.eaa.org/eaa/events",
    focus: "Chapter gatherings, fly-ins, workshops, Young Eagles events, and EAA community events.",
  },
  {
    label: "SocialFlight Fly-In Calendar",
    href: "https://www.socialflight.com/events/type/fly-in.html",
    focus: "Large national fly-in/event directory with hundreds of current listings.",
  },
  {
    label: "AOPA Events",
    href: "https://www.aopa.org/community",
    focus: "AOPA gatherings, major aviation events, fly-ins, air fairs, and pilot community events.",
  },
  {
    label: "Fly In Finder",
    href: "https://flyinfinder.com/",
    focus: "Searchable aviation events, air shows, fly-ins, conferences, and pilot events across the United States.",
  },
  {
    label: "TallyAero Atlas Calendar",
    href: "https://tallyaero.com/atlas/calendar/",
    focus: "Curated aviation calendar with filters for fly-ins, airshows, conventions, contests, and seminars.",
  },
];

async function verifySource(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    let response = await fetch(source.href, { method: "HEAD", redirect: "follow", signal: controller.signal });
    if (!response.ok || response.status === 405) {
      response = await fetch(source.href, { method: "GET", redirect: "follow", signal: controller.signal });
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } finally {
    clearTimeout(timeout);
  }
}

function serialize(value) {
  return JSON.stringify(value, null, 2).replace(/"([^"]+)":/g, "$1:");
}

for (const source of [...featuredFlyins, ...sources]) {
  await verifySource(source);
}

const lastChecked = new Date().toISOString().slice(0, 10);
const body = `export const nationalFlyinsLastChecked = ${JSON.stringify(lastChecked)};

export const nationalFeaturedFlyins = ${serialize(featuredFlyins)};

export const nationalFlyinSources = ${serialize(sources)};
`;

writeFileSync("src/data/national-flyins.ts", body);
console.log(`Updated national fly-in source check date to ${lastChecked}.`);
