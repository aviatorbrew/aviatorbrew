import { promises as fs } from "node:fs";
import path from "node:path";

export type LocationPhoto = { name: string; url: string; updatedAt: string };

export async function getLocationPhotos(slug: string): Promise<LocationPhoto[]> {
  const directory = path.join(process.cwd(), "public", "media", "location-photos", slug);
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const photos = await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
      const stats = await fs.stat(path.join(directory, entry.name));
      return { name: entry.name, updatedAt: stats.mtime.toISOString(), url: "/media/location-photos/" + slug + "/" + encodeURIComponent(entry.name) };
    }));
    return photos.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export async function getLocationHero(slug: string, fallback: string) {
  const [photo] = await getLocationPhotos(slug);
  return photo?.url || fallback;
}
