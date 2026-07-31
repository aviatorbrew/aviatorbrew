import { promises as fs } from "node:fs";
import path from "node:path";
import { locations } from "@/data/site";
import { databaseConfigured, withDatabase } from "@/lib/database";

export type PhotoSource = "uploaded" | "bundled";
export type WebsiteMediaType = "image" | "video";
export type FeaturedPhoto = { source: PhotoSource; name: string };
export type StoredWebsitePhoto = {
  name: string;
  size: number;
  updatedAt: string;
  url: string;
  source: "uploaded";
  mediaType: WebsiteMediaType;
};

const locationSlugs = new Set(locations.map((location) => location.slug));

export function validPhotoTarget(target: string) {
  return target === "general" || target === "brewery" || target === "private-events" || target === "events" || locationSlugs.has(target);
}

function localMediaRoot() {
  const cwd = process.cwd();
  if (cwd.endsWith(path.join(".next", "standalone"))) return path.resolve(cwd, "..", "..", "public", "media");
  return path.join(cwd, "public", "media");
}

export function websitePhotoRoot() {
  if (process.env.WEBSITE_PHOTOS_DIRECTORY) return process.env.WEBSITE_PHOTOS_DIRECTORY;
  if (process.env.BEER_OVERRIDES_DATA_FILE) {
    return path.join(path.dirname(process.env.BEER_OVERRIDES_DATA_FILE), "website-photos");
  }
  return localMediaRoot();
}

export function photoDirectory(target: string) {
  const root = websitePhotoRoot();
  if (target === "general") return path.join(root, "website-photos");
  if (target === "brewery") return path.join(root, "brewery-photos");
  if (target === "private-events") return path.join(root, "private-event-photos");
  if (target === "events") return path.join(root, "event-page-media");
  return path.join(root, "location-photos", target);
}

export function legacyPhotoDirectory(target: string) {
  const root = localMediaRoot();
  if (target === "general") return path.join(root, "website-photos");
  if (target === "brewery") return path.join(root, "brewery-photos");
  if (target === "private-events") return path.join(root, "private-event-photos");
  if (target === "events") return path.join(root, "event-page-media");
  return path.join(root, "location-photos", target);
}

export function websitePhotoUrl(target: string, filename: string) {
  return "/api/website-photo-files/" + encodeURIComponent(target) + "/" + encodeURIComponent(filename);
}

export function websiteMediaType(filename: string): WebsiteMediaType | null {
  const extension = path.extname(filename).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(extension)) return "image";
  if ([".mp4", ".webm", ".mov", ".m4v"].includes(extension)) return "video";
  return null;
}

function hiddenFiles() {
  return [...new Set([
    path.join(websitePhotoRoot(), "hidden-photos.json"),
    path.join(process.cwd(), "public", "media", "hidden-photos.json"),
  ])];
}

function mergeHiddenPhotos(target: Record<string, string[]>, source: Record<string, string[]>) {
  for (const [key, names] of Object.entries(source)) {
    if (!Array.isArray(names)) continue;
    target[key] = [...new Set([...(target[key] || []), ...names])];
  }
  return target;
}

async function writeHiddenPhotos(stored: Record<string, string[]>) {
  await Promise.all(hiddenFiles().map(async (file) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = file + ".tmp";
    await fs.writeFile(temporary, JSON.stringify(stored, null, 2) + "\n", "utf8");
    await fs.rename(temporary, file);
  }));
}

async function getDatabaseHiddenPhotos(): Promise<Record<string, string[]>> {
  if (!databaseConfigured()) return {};
  return withDatabase(async (client) => {
    const result = await client.query("SELECT target, file_name FROM website.media_assets WHERE published = false AND metadata->>'hidden' = 'true'");
    const stored: Record<string, string[]> = {};
    for (const row of result.rows) stored[row.target] = [...(stored[row.target] || []), row.file_name];
    return stored;
  });
}

async function hideDatabasePhoto(target: string, name: string) {
  if (!databaseConfigured()) return false;
  await withDatabase(async (client) => {
    await client.query("INSERT INTO website.media_assets (target, target_slug, file_name, url, media_type, published, metadata, updated_at) VALUES ($1,'',$2,$3,$4,false,$5::jsonb,now()) ON CONFLICT (target, target_slug, file_name) DO UPDATE SET published=false, metadata=EXCLUDED.metadata, updated_at=now()", [target, name, websitePhotoUrl(target, name), websiteMediaType(name) || "image", JSON.stringify({ hidden: true })]);
  });
  return true;
}

async function getDatabaseFeaturedPhotos(): Promise<Record<string, FeaturedPhoto>> {
  if (!databaseConfigured()) return {};
  return withDatabase(async (client) => {
    const result = await client.query("SELECT target, file_name, metadata FROM website.media_assets WHERE is_featured = true AND published = true");
    const stored: Record<string, FeaturedPhoto> = {};
    for (const row of result.rows) stored[row.target] = { source: (row.metadata?.source === "bundled" ? "bundled" : "uploaded"), name: row.file_name };
    return stored;
  });
}

async function setDatabaseFeaturedPhoto(target: string, selection?: FeaturedPhoto) {
  if (!databaseConfigured()) return false;
  await withDatabase(async (client) => {
    await client.query("UPDATE website.media_assets SET is_featured = false, updated_at = now() WHERE target = $1", [target]);
    if (selection) await client.query("INSERT INTO website.media_assets (target, target_slug, file_name, url, media_type, is_featured, published, metadata, updated_at) VALUES ($1,'',$2,$3,$4,true,true,$5::jsonb,now()) ON CONFLICT (target, target_slug, file_name) DO UPDATE SET is_featured=true, published=true, metadata=EXCLUDED.metadata, updated_at=now()", [target, selection.name, selection.source === "uploaded" ? websitePhotoUrl(target, selection.name) : selection.name, websiteMediaType(selection.name) || "image", JSON.stringify({ source: selection.source })]);
  });
  return true;
}

export async function listUploadedPhotos(target: string): Promise<StoredWebsitePhoto[]> {
  const hidden = new Set((await getHiddenPhotos())[target] || []);
  const photos = new Map<string, StoredWebsitePhoto>();
  const directories = [...new Set([photoDirectory(target), legacyPhotoDirectory(target)])];
  for (const directory of directories) {
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
        const mediaType = websiteMediaType(entry.name);
        if (!mediaType || photos.has(entry.name) || hidden.has(entry.name)) return;
        const stats = await fs.stat(path.join(directory, entry.name));
        photos.set(entry.name, {
          name: entry.name,
          size: stats.size,
          updatedAt: stats.mtime.toISOString(),
          url: websitePhotoUrl(target, entry.name),
          source: "uploaded",
          mediaType,
        });
      }));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return [...photos.values()].sort((a, b) => b.name.localeCompare(a.name) || b.updatedAt.localeCompare(a.updatedAt));
}

const featuredFile = () => path.join(websitePhotoRoot(), "featured-photos.json");

export async function getHiddenPhotos(): Promise<Record<string, string[]>> {
  const merged: Record<string, string[]> = {};
  try { mergeHiddenPhotos(merged, await getDatabaseHiddenPhotos()); } catch {}
  for (const file of hiddenFiles()) {
    try {
      const stored = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, string[]>;
      if (stored && typeof stored === "object") mergeHiddenPhotos(merged, stored);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return merged;
}

export async function hidePhoto(target: string, name: string) {
  await hideDatabasePhoto(target, name);
  const stored = await getHiddenPhotos();
  const names = new Set(Array.isArray(stored[target]) ? stored[target] : []);
  names.add(name);
  stored[target] = [...names];
  await writeHiddenPhotos(stored);
}

export async function getFeaturedPhotos(): Promise<Record<string, FeaturedPhoto>> {
  const merged: Record<string, FeaturedPhoto> = {};
  try { Object.assign(merged, await getDatabaseFeaturedPhotos()); } catch {}
  try {
    const stored = JSON.parse(await fs.readFile(featuredFile(), "utf8")) as Record<string, FeaturedPhoto>;
    if (stored && typeof stored === "object") Object.assign(stored, merged);
    return stored && typeof stored === "object" ? stored : merged;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return merged;
    throw error;
  }
}

export async function setFeaturedPhoto(target: string, selection?: FeaturedPhoto) {
  await setDatabaseFeaturedPhoto(target, selection);
  const stored = await getFeaturedPhotos();
  if (selection) stored[target] = selection;
  else delete stored[target];
  const file = featuredFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = file + ".tmp";
  await fs.writeFile(temporary, JSON.stringify(stored, null, 2) + "\n", "utf8");
  await fs.rename(temporary, file);
}
