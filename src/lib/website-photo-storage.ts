import { promises as fs } from "node:fs";
import path from "node:path";
import { locations } from "@/data/site";

export type PhotoSource = "uploaded" | "bundled";
export type FeaturedPhoto = { source: PhotoSource; name: string };
export type StoredWebsitePhoto = {
  name: string;
  size: number;
  updatedAt: string;
  url: string;
  source: "uploaded";
};

const locationSlugs = new Set(locations.map((location) => location.slug));

export function validPhotoTarget(target: string) {
  return target === "general" || target === "brewery" || target === "private-events" || locationSlugs.has(target);
}

export function websitePhotoRoot() {
  if (process.env.WEBSITE_PHOTOS_DIRECTORY) return process.env.WEBSITE_PHOTOS_DIRECTORY;
  if (process.env.BEER_OVERRIDES_DATA_FILE) {
    return path.join(path.dirname(process.env.BEER_OVERRIDES_DATA_FILE), "website-photos");
  }
  return path.join(process.cwd(), "public", "media");
}

export function photoDirectory(target: string) {
  const root = websitePhotoRoot();
  if (target === "general") return path.join(root, "website-photos");
  if (target === "brewery") return path.join(root, "brewery-photos");
  if (target === "private-events") return path.join(root, "private-event-photos");
  return path.join(root, "location-photos", target);
}

export function legacyPhotoDirectory(target: string) {
  const root = path.join(process.cwd(), "public", "media");
  if (target === "general") return path.join(root, "website-photos");
  if (target === "brewery") return path.join(root, "brewery-photos");
  if (target === "private-events") return path.join(root, "private-event-photos");
  return path.join(root, "location-photos", target);
}

export function websitePhotoUrl(target: string, filename: string) {
  return "/api/website-photo-files/" + encodeURIComponent(target) + "/" + encodeURIComponent(filename);
}

export async function listUploadedPhotos(target: string): Promise<StoredWebsitePhoto[]> {
  const photos = new Map<string, StoredWebsitePhoto>();
  const directories = [...new Set([photoDirectory(target), legacyPhotoDirectory(target)])];
  for (const directory of directories) {
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
        if (photos.has(entry.name)) return;
        const stats = await fs.stat(path.join(directory, entry.name));
        photos.set(entry.name, {
          name: entry.name,
          size: stats.size,
          updatedAt: stats.mtime.toISOString(),
          url: websitePhotoUrl(target, entry.name),
          source: "uploaded",
        });
      }));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return [...photos.values()].sort((a, b) => b.name.localeCompare(a.name) || b.updatedAt.localeCompare(a.updatedAt));
}

const featuredFile = () => path.join(websitePhotoRoot(), "featured-photos.json");
const hiddenFile = () => path.join(websitePhotoRoot(), "hidden-photos.json");

export async function getHiddenPhotos(): Promise<Record<string, string[]>> {
  try {
    const stored = JSON.parse(await fs.readFile(hiddenFile(), "utf8")) as Record<string, string[]>;
    return stored && typeof stored === "object" ? stored : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export async function hidePhoto(target: string, name: string) {
  const stored = await getHiddenPhotos();
  const names = new Set(Array.isArray(stored[target]) ? stored[target] : []);
  names.add(name);
  stored[target] = [...names];
  await fs.mkdir(path.dirname(hiddenFile()), { recursive: true });
  const temporary = hiddenFile() + ".tmp";
  await fs.writeFile(temporary, JSON.stringify(stored, null, 2) + "\n", "utf8");
  await fs.rename(temporary, hiddenFile());
}

export async function getFeaturedPhotos(): Promise<Record<string, FeaturedPhoto>> {
  try {
    const stored = JSON.parse(await fs.readFile(featuredFile(), "utf8")) as Record<string, FeaturedPhoto>;
    return stored && typeof stored === "object" ? stored : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export async function setFeaturedPhoto(target: string, selection?: FeaturedPhoto) {
  const stored = await getFeaturedPhotos();
  if (selection) stored[target] = selection;
  else delete stored[target];
  const file = featuredFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = file + ".tmp";
  await fs.writeFile(temporary, JSON.stringify(stored, null, 2) + "\n", "utf8");
  await fs.rename(temporary, file);
}
