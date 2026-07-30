import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const now = () => new Date().toISOString();
const seeds = [
  { seedKey: "seed:welcome", status: "published", isPinned: true, category: "brewery_news", title: "Welcome to Aviator Flight Log", excerpt: "Official dispatches from the Aviator crew now have a home.", body: "Welcome to Aviator Flight Log. This is the official feed for brewery news, live music updates, beer releases, event notes, campus reminders, and answers from the Aviator crew. Seeded content is included for local development and can be edited before production.", locationId: "hangar-bar", authorName: "Aviator Crew" },
  { seedKey: "seed:live-music", status: "published", category: "live_music", title: "Upcoming Live Music at the Hangar", excerpt: "Watch the schedule for confirmed artists, times, and stage updates.", body: "Live music is part of the Aviator campus rhythm. Check the live music schedule before heading over, and watch this feed for weather notes, time changes, and artist updates from the Aviator team.", locationId: "hangar-bar", authorName: "Aviator Live" },
  { seedKey: "seed:cars-coffee", status: "published", isPinned: true, category: "events", title: "Cars & Coffee at Aviator", excerpt: "Coffee starts early and breakfast follows at Morning Hangar.", body: "Cars & Coffee is built for a relaxed morning on campus. Bring your car, your crew, and an appetite. Watch Flight Log for parking notes, weather calls, and schedule updates before each gathering.", locationId: "hangar-bar", eventId: "cars-coffee-campus", authorName: "Aviator Events" },
  { seedKey: "seed:hangar-gold", status: "published", category: "beer_releases", title: "Hangar Gold Helles Lager Release", excerpt: "A crisp German-style helles with a clean finish is cleared for takeoff.", body: "Hangar Gold brings smooth malt character, subtle noble hops, and a crisp finish to the Aviator lineup. Availability can move quickly, so check with the crew when you arrive.", locationId: "hangar-bar", beerId: "hangar-gold", authorName: "Aviator Brewery" },
  { seedKey: "seed:visit-campus", status: "draft", category: "questions_answers", title: "Planning Your Visit to the Brewery Campus", excerpt: "A quick field guide for parking, food, drinks, and where to land first.", body: "Planning your first Aviator campus visit? Start with the Hangar Bar, check the location pages for hours, and watch Flight Log for parking notes, weather updates, private event notices, and answers to common guest questions.", locationId: "hangar-bar", authorName: "Aviator Crew" },
];
const slug = (value) => value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180);
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (connectionString) {
  const pool = new Pool({ connectionString, max: 1, ...(process.env.POSTGRES_SSL === "true" || /sslmode=require/i.test(connectionString) ? { ssl: { rejectUnauthorized: false } } : {}) });
  const client = await pool.connect();
  try {
    for (const seed of seeds) {
      await client.query(`INSERT INTO flight_log_posts (id,title,slug,excerpt,body,category,location_id,event_id,beer_id,author_name,status,is_official,is_pinned,published_at,created_at,updated_at,seed_key)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12,$13,now(),now(),$14)
        ON CONFLICT (seed_key) DO NOTHING`, [randomUUID(), seed.title, slug(seed.title), seed.excerpt, seed.body, seed.category, seed.locationId || null, seed.eventId || null, seed.beerId || null, seed.authorName, seed.status, seed.isPinned === true, seed.status === "published" ? now() : null, seed.seedKey]);
    }
    console.log("flight-log.seeded", { target: "database", count: seeds.length });
  } finally { client.release(); await pool.end(); }
} else {
  const file = process.env.FLIGHT_LOG_DATA_FILE || path.join(process.cwd(), "data", "flight-log-posts.json");
  let existing = [];
  try { existing = JSON.parse(await readFile(file, "utf8")); } catch {}
  const next = [...existing];
  for (const seed of seeds) if (!next.some((post) => post.seedKey === seed.seedKey)) next.push({ ...seed, id: randomUUID(), slug: slug(seed.title), imageUrl: "", isOfficial: true, isPinned: seed.isPinned === true, publishedAt: seed.status === "published" ? now() : null, createdAt: now(), updatedAt: now() });
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(next, null, 2) + "\n");
  console.log("flight-log.seeded", { target: "json", count: seeds.length, file });
}
