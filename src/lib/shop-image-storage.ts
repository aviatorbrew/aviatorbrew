import { randomUUID } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";

const apiPrefix = "/api/shop-product-images/";

function configuredDirectory() {
  const configured = String(process.env.SHOP_PRODUCT_IMAGES_DIRECTORY || "").trim();
  if (configured) return path.resolve(configured);
  return process.env.RENDER ? "/var/data/aviatorbrew/shop-products" : "";
}

export function shopProductImageWriteDirectory() {
  const configured = configuredDirectory();
  if (configured) return configured;
  return path.join(process.cwd(), "public", "media", "shop-products");
}

export function shopProductImageDirectories() {
  const roots = [
    configuredDirectory(),
    path.join(process.cwd(), "public", "media", "shop-products"),
    path.join(process.cwd(), ".next", "standalone", "public", "media", "shop-products"),
    path.join(process.cwd(), "..", "..", "public", "media", "shop-products"),
  ].filter(Boolean);
  return [...new Set(roots.flatMap((directory) => [directory, path.join(directory, "shopify")]))];
}

export function shopProductImageFilename(value: string) {
  try { return path.basename(decodeURIComponent(new URL(value, "https://aviatorbrew.com").pathname)); }
  catch { return path.basename(value); }
}

export function managedShopProductImageFilename(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const pathname = new URL(raw, "https://aviatorbrew.com").pathname;
    if (!pathname.startsWith(apiPrefix) && !pathname.includes("/media/shop-products/")) return "";
  } catch { return ""; }
  const filename = shopProductImageFilename(raw);
  return filename && filename === path.basename(filename) ? filename : "";
}

export function shopProductImageUrl(filename: string) {
  return apiPrefix + encodeURIComponent(path.basename(filename));
}

function tombstonePath(directory: string, filename: string) {
  return path.join(directory, ".deleted", filename + ".deleted");
}

export function shopProductImageIsDeleted(filename: string) {
  const safe = path.basename(filename);
  if (!safe || safe !== filename) return true;
  return shopProductImageDirectories().some((directory) => existsSync(tombstonePath(directory, safe)));
}

export function shopProductImageExists(value: string) {
  const filename = shopProductImageFilename(value);
  return Boolean(filename && !shopProductImageIsDeleted(filename) && shopProductImageDirectories().some((directory) => existsSync(path.join(directory, filename))));
}

export async function ensureShopProductImageStorage() {
  const directory = shopProductImageWriteDirectory();
  await fs.mkdir(directory, { recursive: true });
  await fs.access(directory);
  return directory;
}

export async function writeShopProductImage(filename: string, buffer: Buffer) {
  const directory = await ensureShopProductImageStorage();
  const safe = path.basename(filename);
  if (!safe || safe !== filename) throw new Error("Invalid shop image filename.");
  await fs.mkdir(directory, { recursive: true });
  const temporary = path.join(directory, "." + safe + "." + randomUUID() + ".uploading");
  const destination = path.join(directory, safe);
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    handle = await fs.open(temporary, "wx", 0o644);
    await handle.writeFile(buffer);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temporary, destination);
    await fs.rm(tombstonePath(directory, safe), { force: true });
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
  return shopProductImageUrl(safe);
}

export async function deleteShopProductImages(values: string[], referencedValues: string[] = []) {
  const referenced = new Set(referencedValues.map(managedShopProductImageFilename).filter(Boolean));
  const filenames = [...new Set(values.map(managedShopProductImageFilename).filter((filename) => filename && !referenced.has(filename)))];
  if (!filenames.length) return [];
  const writeDirectory = shopProductImageWriteDirectory();
  const deletionDirectory = path.join(writeDirectory, ".deleted");
  await fs.mkdir(deletionDirectory, { recursive: true });
  for (const filename of filenames) {
    await fs.writeFile(tombstonePath(writeDirectory, filename), new Date().toISOString() + "\n", { flag: "w" });
    for (const directory of shopProductImageDirectories()) await fs.rm(path.join(directory, filename), { force: true }).catch(() => undefined);
  }
  return filenames;
}

export async function rollbackShopProductImages(values: string[]) {
  const filenames = [...new Set(values.map(managedShopProductImageFilename).filter(Boolean))];
  const writeDirectory = shopProductImageWriteDirectory();
  for (const filename of filenames) await fs.rm(path.join(writeDirectory, filename), { force: true }).catch(() => undefined);
}
