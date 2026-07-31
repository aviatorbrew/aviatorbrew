import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { databaseConfigured, withDatabase } from "@/lib/database";

export const flightLogCategories = ["live_music", "events", "beer_releases", "food_specials", "brewery_news", "questions_answers", "schedule_updates"] as const;
export const flightLogStatuses = ["draft", "published", "archived"] as const;

export type FlightLogCategory = (typeof flightLogCategories)[number];
export type FlightLogStatus = (typeof flightLogStatuses)[number];

export type FlightLogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  category: FlightLogCategory;
  imageUrl: string;
  locationId: string;
  eventId: string;
  beerId: string;
  authorName: string;
  status: FlightLogStatus;
  isOfficial: boolean;
  isPinned: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  seedKey?: string;
  showOnHomepage: boolean;
};

export type FlightLogInput = Partial<Omit<FlightLogPost, "createdAt" | "updatedAt">>;

const dataFile = () => process.env.FLIGHT_LOG_DATA_FILE || path.join(process.cwd(), "data", "flight-log-posts.json");
const maxTitle = 160;
const maxSlug = 180;
const maxExcerpt = 300;
const maxText = 20000;
const seedPrefix = "seed:";

export const flightLogCategoryLabels: Record<FlightLogCategory | "all", string> = {
  all: "All",
  live_music: "Live Music",
  events: "Events",
  beer_releases: "Beer Releases",
  food_specials: "Food & Specials",
  brewery_news: "Brewery News",
  questions_answers: "Questions & Answers",
  schedule_updates: "Schedule Updates",
};

export const flightLogFilterLabels: Record<string, string> = {
  all: "All",
  live_music: "Live Music",
  events: "Events",
  beer_releases: "Beer",
  food_specials: "Food",
  brewery_news: "Brewery News",
  questions_answers: "Questions & Answers",
  schedule_updates: "Schedule Updates",
};

export const flightLogTableSql = [
  `CREATE TABLE IF NOT EXISTS flight_log_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(160) NOT NULL,
    slug VARCHAR(180) UNIQUE NOT NULL,
    excerpt VARCHAR(300),
    body TEXT NOT NULL,
    category VARCHAR(50) NOT NULL,
    image_url TEXT,
    location_id TEXT,
    event_id TEXT,
    beer_id TEXT,
    author_name VARCHAR(120) NOT NULL DEFAULT 'Aviator Crew',
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    is_official BOOLEAN NOT NULL DEFAULT TRUE,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    seed_key TEXT UNIQUE,
    show_on_homepage BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT flight_log_posts_status_check CHECK (status IN ('draft', 'published', 'archived')),
    CONSTRAINT flight_log_posts_category_check CHECK (category IN ('live_music', 'events', 'beer_releases', 'food_specials', 'brewery_news', 'questions_answers', 'schedule_updates'))
  )`,
  `CREATE INDEX IF NOT EXISTS flight_log_posts_status_idx ON flight_log_posts (status)`,
  `CREATE INDEX IF NOT EXISTS flight_log_posts_published_at_idx ON flight_log_posts (published_at DESC)`,
  `CREATE INDEX IF NOT EXISTS flight_log_posts_category_idx ON flight_log_posts (category)`,
  `CREATE INDEX IF NOT EXISTS flight_log_posts_pinned_idx ON flight_log_posts (is_pinned, published_at DESC)`,
  `CREATE INDEX IF NOT EXISTS flight_log_posts_location_idx ON flight_log_posts (location_id)`,
  `CREATE INDEX IF NOT EXISTS flight_log_posts_event_idx ON flight_log_posts (event_id)`,
  `CREATE INDEX IF NOT EXISTS flight_log_posts_beer_idx ON flight_log_posts (beer_id)`,
  `ALTER TABLE IF EXISTS flight_log_posts ADD COLUMN IF NOT EXISTS show_on_homepage BOOLEAN NOT NULL DEFAULT FALSE`,
  `CREATE INDEX IF NOT EXISTS flight_log_posts_homepage_idx ON flight_log_posts (show_on_homepage, status, published_at DESC)`,
];

let flightLogSchemaReady: Promise<void> | undefined;

function clean(value: unknown, max = maxText) {
  if (typeof value !== "string") return "";
  return value.replace(/\0/g, "").replace(/<\/?script\b[^>]*>/gi, "").trim().slice(0, max);
}

export function flightLogSlug(value: string) {
  return clean(value, maxSlug).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, maxSlug) || "flight-log-post";
}

function excerptFromBody(body: string) {
  return clean(body.replace(/\s+/g, " "), maxExcerpt);
}

function validCategory(value: unknown): FlightLogCategory {
  return flightLogCategories.includes(value as FlightLogCategory) ? value as FlightLogCategory : "brewery_news";
}

function validStatus(value: unknown): FlightLogStatus {
  return flightLogStatuses.includes(value as FlightLogStatus) ? value as FlightLogStatus : "draft";
}

function normalize(input: FlightLogInput, existing?: FlightLogPost): FlightLogPost {
  const now = new Date().toISOString();
  const title = clean(input.title ?? existing?.title, maxTitle);
  const body = clean(input.body ?? existing?.body, maxText);
  if (!title || !body) throw new Error("Add a title and post body.");
  const status = validStatus(input.status ?? existing?.status);
  const publishedAtInput = clean(input.publishedAt ?? existing?.publishedAt ?? "", 40);
  const publishedAt = status === "published" ? (publishedAtInput ? new Date(publishedAtInput).toISOString() : existing?.publishedAt || now) : null;
  const excerpt = clean(input.excerpt ?? existing?.excerpt ?? "", maxExcerpt) || excerptFromBody(body);
  return {
    id: clean(input.id ?? existing?.id, 80) || randomUUID(),
    title,
    slug: flightLogSlug(clean(input.slug ?? existing?.slug ?? title, maxSlug)),
    excerpt,
    body,
    category: validCategory(input.category ?? existing?.category),
    imageUrl: clean(input.imageUrl ?? existing?.imageUrl, 500),
    locationId: clean(input.locationId ?? existing?.locationId, 120),
    eventId: clean(input.eventId ?? existing?.eventId, 120),
    beerId: clean(input.beerId ?? existing?.beerId, 120),
    authorName: clean(input.authorName ?? existing?.authorName ?? "Aviator Crew", 120) || "Aviator Crew",
    status,
    isOfficial: input.isOfficial === undefined ? existing?.isOfficial ?? true : input.isOfficial === true,
    isPinned: input.isPinned === undefined ? existing?.isPinned ?? false : input.isPinned === true,
    showOnHomepage: input.showOnHomepage === undefined ? existing?.showOnHomepage ?? false : input.showOnHomepage === true,
    publishedAt,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    seedKey: clean(input.seedKey ?? existing?.seedKey, 120) || undefined,
  };
}

function fromRow(row: Record<string, unknown>): FlightLogPost {
  const value = (key: string) => row[key] == null ? "" : String(row[key]);
  return {
    id: value("id"),
    title: value("title"),
    slug: value("slug"),
    excerpt: value("excerpt"),
    body: value("body"),
    category: validCategory(row.category),
    imageUrl: value("image_url"),
    locationId: value("location_id"),
    eventId: value("event_id"),
    beerId: value("beer_id"),
    authorName: value("author_name") || "Aviator Crew",
    status: validStatus(row.status),
    isOfficial: row.is_official === true,
    isPinned: row.is_pinned === true,
    showOnHomepage: row.show_on_homepage === true,
    publishedAt: row.published_at instanceof Date ? row.published_at.toISOString() : row.published_at ? String(row.published_at) : null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : value("created_at"),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : value("updated_at"),
    seedKey: value("seed_key") || undefined,
  };
}

async function ensureFlightLogSchema() {
  if (!databaseConfigured()) return;
  flightLogSchemaReady ??= withDatabase(async (client) => {
    for (const statement of flightLogTableSql) await client.query(statement);
  }, { skipSchema: true });
  await flightLogSchemaReady;
}

async function readFilePosts(): Promise<FlightLogPost[]> {
  try {
    const stored = JSON.parse(await fs.readFile(dataFile(), "utf8")) as unknown;
    return Array.isArray(stored) ? stored.map((item) => normalize(item as FlightLogInput)).sort(sortPosts) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeFilePosts(posts: FlightLogPost[]) {
  await fs.mkdir(path.dirname(dataFile()), { recursive: true });
  const temp = dataFile() + ".tmp";
  await fs.writeFile(temp, JSON.stringify(posts.sort(sortPosts), null, 2) + "\n", "utf8");
  await fs.rename(temp, dataFile());
}

function sortPosts(a: FlightLogPost, b: FlightLogPost) {
  return Number(b.isPinned) - Number(a.isPinned) || (b.publishedAt || b.updatedAt).localeCompare(a.publishedAt || a.updatedAt) || b.updatedAt.localeCompare(a.updatedAt);
}

async function uniqueSlug(base: string, id?: string) {
  const root = flightLogSlug(base);
  if (databaseConfigured()) {
    await ensureFlightLogSchema();
    return withDatabase(async (client) => {
      for (let index = 0; index < 100; index += 1) {
        const slug = index ? `${root}-${index + 1}`.slice(0, maxSlug) : root;
        const result = await client.query("SELECT id FROM flight_log_posts WHERE slug = $1 AND id::text <> $2 LIMIT 1", [slug, id || ""]);
        if (!result.rowCount) return slug;
      }
      throw new Error("Could not generate a unique slug.");
    }, { skipSchema: true });
  }
  const posts = await readFilePosts();
  for (let index = 0; index < 100; index += 1) {
    const slug = index ? `${root}-${index + 1}`.slice(0, maxSlug) : root;
    if (!posts.some((post) => post.slug === slug && post.id !== id)) return slug;
  }
  throw new Error("Could not generate a unique slug.");
}

export async function getFlightLogPosts(options: { status?: FlightLogStatus | "all"; category?: FlightLogCategory | "all"; includeArchived?: boolean } = {}) {
  if (databaseConfigured()) {
    await ensureFlightLogSchema();
    const params: unknown[] = [];
    const where: string[] = [];
    if (options.status && options.status !== "all") { params.push(options.status); where.push(`status = $${params.length}`); }
    else if (!options.includeArchived) where.push("status <> 'archived'");
    if (options.category && options.category !== "all") { params.push(options.category); where.push(`category = $${params.length}`); }
    const sql = `SELECT * FROM flight_log_posts ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY is_pinned DESC, COALESCE(published_at, updated_at) DESC, updated_at DESC`;
    const result = await withDatabase(async (client) => client.query(sql, params), { skipSchema: true });
    return result.rows.map(fromRow);
  }
  return (await readFilePosts()).filter((post) => (options.status && options.status !== "all" ? post.status === options.status : options.includeArchived || post.status !== "archived") && (!options.category || options.category === "all" || post.category === options.category)).sort(sortPosts);
}

export async function getPublishedFlightLogPosts(category?: FlightLogCategory | "all") {
  return getFlightLogPosts({ status: "published", category });
}

export async function getHomepageFlightLogPosts(limit = 3) {
  const posts = await getPublishedFlightLogPosts();
  const chosen = posts.filter((post) => post.showOnHomepage);
  return (chosen.length ? chosen : posts).slice(0, limit);
}

export async function getFlightLogPostBySlug(slug: string, options: { includeDrafts?: boolean } = {}) {
  const cleanSlug = flightLogSlug(slug);
  const posts = await getFlightLogPosts({ status: options.includeDrafts ? "all" : "published", includeArchived: options.includeDrafts });
  return posts.find((post) => post.slug === cleanSlug && (options.includeDrafts || post.status === "published")) || null;
}

export async function getFlightLogPostById(id: string) {
  const posts = await getFlightLogPosts({ status: "all", includeArchived: true });
  return posts.find((post) => post.id === id) || null;
}

export async function saveFlightLogPost(input: FlightLogInput) {
  const existing = input.id ? await getFlightLogPostById(input.id) : null;
  const post = normalize(input, existing || undefined);
  post.slug = await uniqueSlug(post.slug || post.title, existing?.id);
  if (databaseConfigured()) {
    await ensureFlightLogSchema();
    await withDatabase(async (client) => client.query(
      `INSERT INTO flight_log_posts (id, title, slug, excerpt, body, category, image_url, location_id, event_id, beer_id, author_name, status, is_official, is_pinned, published_at, created_at, updated_at, seed_key, show_on_homepage)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (id) DO UPDATE SET title=$2, slug=$3, excerpt=$4, body=$5, category=$6, image_url=$7, location_id=$8, event_id=$9, beer_id=$10, author_name=$11, status=$12, is_official=$13, is_pinned=$14, published_at=$15, updated_at=$17, seed_key=$18, show_on_homepage=$19`,
      [post.id, post.title, post.slug, post.excerpt, post.body, post.category, post.imageUrl || null, post.locationId || null, post.eventId || null, post.beerId || null, post.authorName, post.status, post.isOfficial, post.isPinned, post.publishedAt, post.createdAt, post.updatedAt, post.seedKey || null, post.showOnHomepage],
    ), { skipSchema: true });
    return post;
  }
  const posts = await readFilePosts();
  const index = posts.findIndex((item) => item.id === post.id);
  if (index >= 0) posts[index] = post;
  else posts.push(post);
  await writeFilePosts(posts);
  return post;
}

export async function archiveFlightLogPost(id: string) {
  const post = await getFlightLogPostById(id);
  if (!post) throw new Error("Flight Log post not found.");
  return saveFlightLogPost({ ...post, status: "archived", isPinned: false });
}

export async function deleteFlightLogPost(id: string) {
  const post = await getFlightLogPostById(id);
  if (!post) throw new Error("Flight Log post not found.");
  if (databaseConfigured()) {
    await ensureFlightLogSchema();
    await withDatabase(async (client) => {
      await client.query("DELETE FROM flight_log_posts WHERE id::text = $1", [id]);
    }, { skipSchema: true });
    return post;
  }
  const posts = (await readFilePosts()).filter((item) => item.id !== id);
  await writeFilePosts(posts);
  return post;
}

export const seedFlightLogPosts: FlightLogInput[] = [
  { seedKey: seedPrefix + "welcome", status: "published", isPinned: true, category: "brewery_news", title: "Welcome to Aviator Flight Log", excerpt: "Official dispatches from the Aviator crew now have a home.", body: "Welcome to Aviator Flight Log. This is the official feed for brewery news, live music updates, beer releases, event notes, campus reminders, and answers from the Aviator crew. Seeded content is included for local development and can be edited before production.", locationId: "hangar-bar", authorName: "Aviator Crew" },
  { seedKey: seedPrefix + "live-music", status: "published", category: "live_music", title: "Upcoming Live Music at the Hangar", excerpt: "Watch the schedule for confirmed artists, times, and stage updates.", body: "Live music is part of the Aviator campus rhythm. Check the live music schedule before heading over, and watch this feed for weather notes, time changes, and artist updates from the Aviator team.", locationId: "hangar-bar", authorName: "Aviator Live" },
  { seedKey: seedPrefix + "cars-coffee", status: "published", isPinned: true, category: "events", title: "Cars & Coffee at Aviator", excerpt: "Coffee starts early and breakfast follows at Morning Hangar.", body: "Cars & Coffee is built for a relaxed morning on campus. Bring your car, your crew, and an appetite. Watch Flight Log for parking notes, weather calls, and schedule updates before each gathering.", locationId: "hangar-bar", eventId: "cars-coffee-campus", authorName: "Aviator Events" },
  { seedKey: seedPrefix + "hangar-gold", status: "published", category: "beer_releases", title: "Hangar Gold Helles Lager Release", excerpt: "A crisp German-style helles with a clean finish is cleared for takeoff.", body: "Hangar Gold brings smooth malt character, subtle noble hops, and a crisp finish to the Aviator lineup. Availability can move quickly, so check with the crew when you arrive.", locationId: "hangar-bar", beerId: "hangar-gold", authorName: "Aviator Brewery" },
  { seedKey: seedPrefix + "visit-campus", status: "draft", category: "questions_answers", title: "Planning Your Visit to the Brewery Campus", excerpt: "A quick field guide for parking, food, drinks, and where to land first.", body: "Planning your first Aviator campus visit? Start with the Hangar Bar, check the location pages for hours, and watch Flight Log for parking notes, weather updates, private event notices, and answers to common guest questions.", locationId: "hangar-bar", authorName: "Aviator Crew" },
];

export async function seedOfficialFlightLogPosts() {
  const created: FlightLogPost[] = [];
  const existing = await getFlightLogPosts({ status: "all", includeArchived: true });
  for (const seed of seedFlightLogPosts) {
    const current = existing.find((post) => post.seedKey === seed.seedKey);
    if (current) continue;
    created.push(await saveFlightLogPost(seed));
  }
  return created;
}
