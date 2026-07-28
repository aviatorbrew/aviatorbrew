import path from "node:path";

const legacyPrefix = "/images/products/managed/";

export function beerImageDirectory() {
  if (process.env.BEER_IMAGES_DIRECTORY) return process.env.BEER_IMAGES_DIRECTORY;
  if (process.env.BEER_OVERRIDES_DATA_FILE) {
    return path.join(path.dirname(process.env.BEER_OVERRIDES_DATA_FILE), "beer-images");
  }
  return path.join(process.cwd(), "public", "images", "products", "managed");
}

export function legacyBeerImageDirectory() {
  return path.join(process.cwd(), "public", "images", "products", "managed");
}

export function beerImageUrl(filename: string) {
  return "/api/beer-images/" + encodeURIComponent(filename);
}

export function normalizeBeerImageUrl(image: string) {
  if (!image.startsWith(legacyPrefix)) return image;
  return beerImageUrl(path.basename(image));
}
