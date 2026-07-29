import { locationPhotoManifest } from "@/data/location-photo-manifest";
import { getFeaturedPhotos, getHiddenPhotos, listUploadedPhotos, type PhotoSource } from "@/lib/website-photo-storage";

export type LocationPhoto = { name: string; url: string; updatedAt: string; source: PhotoSource };

function manifestPhotos(slug: string): LocationPhoto[] {
  return (locationPhotoManifest[slug] || []).map((name) => ({
    name,
    updatedAt: "",
    url: "/images/location-photos/" + slug + "/" + encodeURIComponent(name),
    source: "bundled",
  }));
}

export async function getLocationPhotos(slug: string): Promise<LocationPhoto[]> {
  const known = manifestPhotos(slug);
  const [uploads, hidden] = await Promise.all([listUploadedPhotos(slug), getHiddenPhotos()]);
  const uploadedNames = new Set(uploads.map((photo) => photo.name));
  const hiddenNames = new Set(hidden[slug] || []);
  return [...known.filter((photo) => !uploadedNames.has(photo.name) && !hiddenNames.has(photo.name)), ...uploads]
    .sort((a, b) => b.name.localeCompare(a.name) || b.updatedAt.localeCompare(a.updatedAt));
}

export async function getLocationHero(slug: string, fallback: string) {
  const [photos, featured, hidden] = await Promise.all([getLocationPhotos(slug), getFeaturedPhotos(), getHiddenPhotos()]);
  const selected = featured[slug];
  const photo = selected ? photos.find((item) => item.name === selected.name && item.source === selected.source) : photos[0];
  const fallbackName = decodeURIComponent(fallback.split("/").pop() || "");
  const fallbackHidden = fallbackName ? (hidden[slug] || []).includes(fallbackName) : false;
  return photo?.url || photos[0]?.url || (fallbackHidden ? "/images/hero-campus.jpg" : fallback);
}
