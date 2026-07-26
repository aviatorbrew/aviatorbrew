import { promises as fs } from "fs";
import path from "path";
import { locations, type Location } from "@/data/site";

export type LocationOverride = Location & { updatedAt: string };
export type PortalLocation = Location & { id: string; updatedAt: string | null };

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

async function readOverrides(): Promise<LocationOverride[]> {
  const stored = await readJson<unknown>(overridesFile(), []);
  return Array.isArray(stored)
    ? stored.filter((location): location is LocationOverride => Boolean(location && typeof location === "object" && editableSlugs.has((location as LocationOverride).slug)))
    : [];
}

function mergeLocations(overrides: LocationOverride[]) {
  const bySlug = new Map(overrides.map((location) => [location.slug, location]));
  return locations.map((location) => ({ ...location, ...(bySlug.get(location.slug) || {}) }));
}

export async function getAllLocations(): Promise<Location[]> {
  return mergeLocations(await readOverrides());
}

export async function getLocation(slug: string): Promise<Location | null> {
  return (await getAllLocations()).find((location) => location.slug === slug) || null;
}

export async function getPortalLocations(): Promise<PortalLocation[]> {
  const overrides = await readOverrides();
  const updatedBySlug = new Map(overrides.map((location) => [location.slug, location.updatedAt]));
  return mergeLocations(overrides).map((location) => ({ ...location, id: "catalog_" + location.slug, updatedAt: updatedBySlug.get(location.slug) || null }));
}

export async function updateLocation(slug: string, input: Omit<Location, "slug" | "image"> & { menu?: string; events?: boolean }) {
  const original = locations.find((location) => location.slug === slug);
  if (!original) throw new Error("Location not found.");
  const overrides = await readOverrides();
  const nextLocation = { ...original, ...input, slug, image: original.image, updatedAt: new Date().toISOString() } satisfies LocationOverride;
  const next = [...overrides.filter((location) => location.slug !== slug), nextLocation];
  await writeJson(overridesFile(), next);
  return nextLocation;
}
