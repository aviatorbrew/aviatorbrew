import { breweryPhotoManifest } from "@/data/brewery-photo-manifest";
import { getFeaturedPhotos, getHiddenPhotos, listUploadedPhotos, type PhotoSource } from "@/lib/website-photo-storage";

export type BreweryPhoto = { name: string; size: number; updatedAt: string; url: string; source: PhotoSource; featured?: boolean };

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
  const [uploads, hidden, featured] = await Promise.all([listUploadedPhotos("brewery"), getHiddenPhotos(), getFeaturedPhotos()]);
  const uploadedNames = new Set(uploads.map((photo) => photo.name));
  const hiddenNames = new Set(hidden.brewery || []);
  const selected = featured.brewery;
  const photos = [...uploads, ...bundledPhotos().filter((photo) => !uploadedNames.has(photo.name) && !hiddenNames.has(photo.name))]
    .map((photo) => ({ ...photo, featured: Boolean(selected && photo.name === selected.name && photo.source === selected.source) }));
  const featuredPhoto = photos.find((photo) => photo.featured);
  return featuredPhoto ? [featuredPhoto, ...photos.filter((photo) => photo !== featuredPhoto)] : photos;
}

export async function getBreweryHero() {
  const photos = await getBreweryPhotos();
  const photo = photos[0];
  return photo?.url || "/images/hero-campus.jpg";
}
