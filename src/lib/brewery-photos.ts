import { breweryPhotoManifest } from "@/data/brewery-photo-manifest";
import { getFeaturedPhotos, getHiddenPhotos, listUploadedPhotos, type PhotoSource } from "@/lib/website-photo-storage";

export type BreweryPhoto = { name: string; size: number; updatedAt: string; url: string; source: PhotoSource };

function bundledPhotos(): BreweryPhoto[] {
  return breweryPhotoManifest.map((name) => ({
    name,
    size: 0,
    updatedAt: "",
    url: "/images/website-photos/" + encodeURIComponent(name),
    source: "bundled",
  }));
}

export async function getBreweryPhotos(): Promise<BreweryPhoto[]> {
  const [uploads, hidden] = await Promise.all([listUploadedPhotos("brewery"), getHiddenPhotos()]);
  const uploadedNames = new Set(uploads.map((photo) => photo.name));
  const hiddenNames = new Set(hidden.brewery || []);
  return [...uploads, ...bundledPhotos().filter((photo) => !uploadedNames.has(photo.name) && !hiddenNames.has(photo.name))];
}

export async function getBreweryHero() {
  const [photos, featured] = await Promise.all([getBreweryPhotos(), getFeaturedPhotos()]);
  const selected = featured.brewery;
  const photo = selected ? photos.find((item) => item.name === selected.name && item.source === selected.source) : photos[0];
  return photo?.url || "/images/website-photos/90-brewery-campus.jpg";
}
