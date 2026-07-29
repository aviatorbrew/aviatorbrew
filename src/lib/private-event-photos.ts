import { getFeaturedPhotos, listUploadedPhotos, type PhotoSource, type WebsiteMediaType } from "@/lib/website-photo-storage";

export type PrivateEventPhoto = { name: string; size: number; updatedAt: string; url: string; source: PhotoSource; mediaType: WebsiteMediaType; featured?: boolean };

export async function getPrivateEventPhotos(): Promise<PrivateEventPhoto[]> {
  const [uploads, featured] = await Promise.all([listUploadedPhotos("private-events"), getFeaturedPhotos()]);
  const selected = featured["private-events"];
  const photos = uploads.map((photo) => ({ ...photo, featured: Boolean(selected && photo.name === selected.name && photo.source === selected.source && photo.mediaType === "image") }));
  const featuredPhoto = photos.find((photo) => photo.featured);
  return featuredPhoto ? [featuredPhoto, ...photos.filter((photo) => photo !== featuredPhoto)] : photos;
}
