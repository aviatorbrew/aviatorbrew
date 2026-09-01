import { writeFileSync } from "node:fs";

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

for (const source of sources) {
  await verifySource(source);
}

const lastChecked = new Date().toISOString().slice(0, 10);
const body = `export const nationalFlyinsLastChecked = ${JSON.stringify(lastChecked)};\n\nexport const nationalFlyinSources = ${serialize(sources)};\n`;

writeFileSync("src/data/national-flyins.ts", body);
console.log(`Updated national fly-in source check date to ${lastChecked}.`);
