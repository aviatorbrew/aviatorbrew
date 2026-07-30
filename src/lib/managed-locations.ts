import { promises as fs } from "fs";
import path from "path";
import { locations, type Location } from "@/data/site";
import { databaseConfigured, withDatabase } from "@/lib/database";
import { getLocationHero } from "@/lib/location-photos";

export type LocationOverride = Location & { updatedAt: string };
export type PortalLocation = Location & { id: string; updatedAt: string | null; heroImage: string };

const overridesFile = () => process.env.LOCATION_OVERRIDES_DATA_FILE || path.join(process.cwd(), "data", "location-overrides.json");
const editableSlugs = new Set(locations.map((location) => location.slug));

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(file, "utf8")) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback; throw error; }
}
async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + ".tmp";
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(temp, file);
}
async function readFileOverrides(): Promise<LocationOverride[]> {
  const stored = await readJson<unknown>(overridesFile(), []);
  return Array.isArray(stored) ? stored.filter((location): location is LocationOverride => Boolean(location && typeof location === "object" && editableSlugs.has((location as LocationOverride).slug))) : [];
}
async function readDatabaseOverrides(): Promise<LocationOverride[] | null> {
  if (!databaseConfigured()) return null;
  return withDatabase(async (client) => {
    const result = await client.query("SELECT slug, name, data, updated_at FROM website.locations ORDER BY name");
    return result.rows.filter((row) => editableSlugs.has(row.slug)).map((row): LocationOverride => {
      const original = locations.find((location) => location.slug === row.slug)!;
      const data = row.data && typeof row.data === "object" ? row.data as Partial<Location> : {};
      return { ...original, ...data, slug: row.slug, name: row.name || data.name || original.name, image: original.image, updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || "") };
    });
  });
}
async function upsertDatabaseLocation(location: LocationOverride) {
  if (!databaseConfigured()) return false;
  await withDatabase(async (client) => {
    await client.query("INSERT INTO website.locations (slug, name, data, updated_at) VALUES ($1,$2,$3::jsonb,now()) ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, data=EXCLUDED.data, updated_at=now()", [location.slug, location.name, JSON.stringify(location)]);
  });
  return true;
}
async function readOverrides(): Promise<LocationOverride[]> {
  const fileOverrides = await readFileOverrides();
  try {
    const dbOverrides = await readDatabaseOverrides();
    if (!dbOverrides) return fileOverrides;
    const bySlug = new Map(fileOverrides.map((location) => [location.slug, location]));
    for (const location of dbOverrides) bySlug.set(location.slug, location);
    return [...bySlug.values()];
  } catch { return fileOverrides; }
}
function mergeLocations(overrides: LocationOverride[]) {
  const bySlug = new Map(overrides.map((location) => [location.slug, location]));
  return locations.map((location) => ({ ...location, ...(bySlug.get(location.slug) || {}) }));
}
export async function getAllLocations(): Promise<Location[]> { return mergeLocations(await readOverrides()); }
export async function getLocation(slug: string): Promise<Location | null> { return (await getAllLocations()).find((location) => location.slug === slug) || null; }
export async function getPortalLocations(): Promise<PortalLocation[]> {
  const overrides = await readOverrides();
  const updatedBySlug = new Map(overrides.map((location) => [location.slug, location.updatedAt]));
  return Promise.all(mergeLocations(overrides).map(async (location) => ({ ...location, id: "catalog_" + location.slug, updatedAt: updatedBySlug.get(location.slug) || null, heroImage: await getLocationHero(location.slug, location.image) })));
}
export async function updateLocation(slug: string, input: Omit<Location, "slug" | "image"> & { menu?: string; events?: boolean }) {
  const original = locations.find((location) => location.slug === slug);
  if (!original) throw new Error("Location not found.");
  const nextLocation = { ...original, ...input, slug, image: original.image, updatedAt: new Date().toISOString() } satisfies LocationOverride;
  if (!(await upsertDatabaseLocation(nextLocation))) {
    const overrides = await readFileOverrides();
    await writeJson(overridesFile(), [...overrides.filter((location) => location.slug !== slug), nextLocation]);
  }
  return nextLocation;
}
