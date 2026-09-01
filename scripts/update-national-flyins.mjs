import { writeFileSync } from "node:fs";

const majorFlyinChoices = [
  {
    name: "SUN 'n FUN Aerospace Expo",
    choices: [
      { dates: "April 14-19, 2026", startDate: "2026-04-14", endDate: "2026-04-19" },
      { dates: "April 6-11, 2027", startDate: "2027-04-06", endDate: "2027-04-11" },
      { dates: "April 4-9, 2028", startDate: "2028-04-04", endDate: "2028-04-09" },
    ],
    location: "Lakeland Linder International Airport (KLAL), Lakeland, Florida",
    note: "Major spring aviation expo, airshow, fly-in, forums, aircraft camping, and exhibitor event.",
    href: "https://flysnf.org/",
    sourceLabel: "SUN 'n FUN official dates",
  },
  {
    name: "EAA AirVenture Oshkosh",
    choices: [
      { dates: "July 20-26, 2026", startDate: "2026-07-20", endDate: "2026-07-26" },
      { dates: "July 26-August 1, 2027", startDate: "2027-07-26", endDate: "2027-08-01" },
    ],
    location: "Wittman Regional Airport (KOSH), Oshkosh, Wisconsin",
    note: "EAA's annual fly-in convention and one of the largest aviation gatherings in the world.",
    href: "https://www.eaa.org/airventure/landing-pages",
    sourceLabel: "EAA official AirVenture dates",
  },
  {
    name: "Triple Tree Fly-In",
    choices: [
      { dates: "September 21-27, 2026", startDate: "2026-09-21", endDate: "2026-09-27" },
      { dates: "September 20-26, 2027", startDate: "2027-09-20", endDate: "2027-09-26" },
      { dates: "September 18-24, 2028", startDate: "2028-09-18", endDate: "2028-09-24" },
    ],
    location: "Triple Tree Aerodrome (SC00), Woodruff, South Carolina",
    note: "General aviation fly-in on Triple Tree's 7,000-foot grass runway.",
    href: "https://tta.aero/ttfi/",
    sourceLabel: "Triple Tree official dates",
  },
];

const localNorthCarolinaEvents = [
  {
    name: "EAA Chapter 1114 Social Hour / Builder Chat + Movie",
    dates: "September 4, 2026",
    startDate: "2026-09-04",
    endDate: "2026-09-04",
    location: "Cox Field, Apex, North Carolina",
    note: "Central NC EAA aviation social and builder chat; check chapter page before going.",
    href: "https://chapters.eaa.org/eaa1114",
    sourceLabel: "EAA Chapter 1114",
  },
  {
    name: "EAA Chapter 1114 Monthly Breakfast Gathering",
    dates: "September 19, 2026",
    startDate: "2026-09-19",
    endDate: "2026-09-19",
    location: "Cox Field, Apex, North Carolina",
    note: "Monthly breakfast gathering with RDU controllers scheduled to join.",
    href: "https://chapters.eaa.org/eaa1114",
    sourceLabel: "EAA Chapter 1114",
  },
  {
    name: "30th Annual NC Aviation Museum Hall of Fame Annual Fly-In",
    dates: "September 26, 2026",
    startDate: "2026-09-26",
    endDate: "2026-09-26",
    location: "NC Aviation Museum and Hall of Fame, Asheboro, North Carolina",
    note: "Antique airplanes, warbirds, homebuilts, food vendors, and museum admission.",
    href: "https://www.revolutionaryrandolph.org/events-calendar/",
    sourceLabel: "Revolutionary Randolph event calendar",
  },
  {
    name: "Sky High Aerospace Expo and Fly-In",
    dates: "October 16-18, 2026",
    startDate: "2026-10-16",
    endDate: "2026-10-18",
    location: "Laurinburg-Maxton Airport, Maxton, North Carolina",
    note: "Fly-in weekend with airshow, aircraft displays, STEM activities, under-wing camping, and pilot arrival resources.",
    href: "https://www.skyhighexpo.com/event-info/fly-in",
    sourceLabel: "Sky High official fly-in page",
  },
  {
    name: "Fly-In and Cruise-In",
    dates: "October 24, 2026",
    startDate: "2026-10-24",
    endDate: "2026-10-24",
    location: "Lumberton Regional Airport, Lumberton, North Carolina",
    note: "Free aviation and car event with aircraft displays, classic cars, vendors, live music, helicopter rides, and parachute team.",
    href: "https://www.visitnc.com/events/fly-and-cruise",
    sourceLabel: "Visit North Carolina",
  },
  {
    name: "New Bern Titan Air Show",
    dates: "November 28, 2026",
    startDate: "2026-11-28",
    endDate: "2026-11-28",
    location: "Union Point Park, New Bern, North Carolina",
    note: "Free aerobatic air show over the Neuse River followed by a drone show, according to Visit NC.",
    href: "https://www.visitnc.com/events/titan-aerobatic-team-air-show",
    sourceLabel: "Visit North Carolina",
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

const today = new Date().toISOString().slice(0, 10);

function firstUpcomingEvent(event) {
  const selected = event.choices.find((choice) => choice.endDate >= today) ?? event.choices.at(-1);
  const next = event.choices.find((choice) => choice.startDate > selected.startDate);
  return {
    name: event.name,
    ...selected,
    location: event.location,
    note: next ? `${event.note} Next published date: ${next.dates}.` : event.note,
    href: event.href,
    sourceLabel: event.sourceLabel,
  };
}

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

const featuredFlyins = majorFlyinChoices.map(firstUpcomingEvent);
const localNorthCarolinaFlyins = localNorthCarolinaEvents.filter((event) => event.endDate >= today);

for (const source of [...featuredFlyins, ...localNorthCarolinaFlyins, ...sources]) {
  await verifySource(source);
}

const body = `export const nationalFlyinsLastChecked = ${JSON.stringify(today)};

export const nationalFeaturedFlyins = ${serialize(featuredFlyins)};

export const localNorthCarolinaFlyins = ${serialize(localNorthCarolinaFlyins)};

export const nationalFlyinSources = ${serialize(sources)};
`;

writeFileSync("src/data/national-flyins.ts", body);
console.log(`Updated national fly-in source check date to ${today}.`);
