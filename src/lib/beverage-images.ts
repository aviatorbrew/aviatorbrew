import path from "node:path";

const legacyPrefix = "/images/products/managed/";

export function beverageImageDirectory() {
  if (process.env.BEVERAGE_IMAGES_DIRECTORY) return process.env.BEVERAGE_IMAGES_DIRECTORY;
  if (process.env.BEVERAGE_OVERRIDES_DATA_FILE) return path.join(path.dirname(process.env.BEVERAGE_OVERRIDES_DATA_FILE), "beverage-images");
  if (process.env.MANAGED_BEVERAGES_DATA_FILE) return path.join(path.dirname(process.env.MANAGED_BEVERAGES_DATA_FILE), "beverage-images");
  return path.join(process.cwd(), "public", "images", "products", "managed");
}

export function legacyBeverageImageDirectories() {
  return [
    path.join(process.cwd(), "public", "images", "products", "managed"),
    path.join(process.cwd(), ".next", "standalone", "public", "images", "products", "managed"),
    path.join(process.cwd(), "..", "..", "public", "images", "products", "managed"),
  ];
}

export function beverageImageUrl(filename: string) {
  return "/api/beverage-images/" + encodeURIComponent(filename);
}

export function normalizeBeverageImageUrl(image: string) {
  if (!image.startsWith(legacyPrefix)) return image;
  return beverageImageUrl(path.basename(image));
}
