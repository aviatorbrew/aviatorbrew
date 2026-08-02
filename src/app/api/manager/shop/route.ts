import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import { requestBodyExceeds } from "@/lib/server-file-response";
import { deleteShopCategory, deleteShopProduct, dollarsToCents, getShopCatalog, saveShopCategory, saveShopCategoryOrder, saveShopProduct, saveShopSettings, type ShopSettings, type ShopVariantInput } from "@/lib/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maxImageBytes = 10 * 1024 * 1024;
const maxProductImages = 8;
const allowedImageTypes = new Map([["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"]]);
const imageDirectory = () => process.env.SHOP_PRODUCT_IMAGES_DIRECTORY || path.join(process.cwd(), "public", "media", "shop-products");
const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

function text(value: FormDataEntryValue | null) { return typeof value === "string" ? value.trim() : ""; }
function number(value: FormDataEntryValue | null) { const parsed = Number(text(value)); return Number.isFinite(parsed) ? parsed : 0; }
function bool(value: FormDataEntryValue | null, fallback = false) { const raw = text(value).toLowerCase(); return raw ? ["true", "on", "1", "yes"].includes(raw) : fallback; }
function unique(values: string[]) { return values.filter((value, index, all) => value && all.indexOf(value) === index); }
function wholeOunces(value: unknown, fallback = 8) { const parsed = Number(value); return Math.max(1, Math.round(Number.isFinite(parsed) && parsed > 0 ? parsed : fallback)); }

function parseVariantLines(raw: string): ShopVariantInput[] {
  return raw.split(/\r?\n/).map((line, index) => {
    const [label = "", price = "", inventory = "", sku = "", published = "true", weightOunces = "8", requiresShipping = "true", trackInventory = "true", availableForSale = "true", compareAtPrice = ""] = line.split("|").map((part) => part.trim());
    return {
      label,
      priceCents: dollarsToCents(price),
      compareAtPriceCents: compareAtPrice ? dollarsToCents(compareAtPrice) : null,
      inventoryCount: Math.max(0, Math.floor(Number(inventory) || 0)),
      sku,
      published: published.toLowerCase() !== "false",
      sortOrder: index * 10,
      weightOunces: wholeOunces(weightOunces),
      requiresShipping: requiresShipping.toLowerCase() !== "false",
      trackInventory: trackInventory.toLowerCase() !== "false",
      availableForSale: availableForSale.toLowerCase() !== "false",
    };
  }).filter((variant) => variant.label);
}

function parseVariants(form: FormData): ShopVariantInput[] {
  const count = Math.max(0, Math.floor(number(form.get("variantCount"))));
  if (!count) return parseVariantLines(text(form.get("variants")));
  const variants: ShopVariantInput[] = [];
  for (let index = 0; index < count; index += 1) {
    const label = text(form.get("variantLabel_" + index));
    if (!label) continue;
    variants.push({
      label,
      priceCents: dollarsToCents(form.get("variantPrice_" + index)),
      compareAtPriceCents: text(form.get("variantCompareAtPrice_" + index)) ? dollarsToCents(form.get("variantCompareAtPrice_" + index)) : null,
      inventoryCount: Math.max(0, Math.floor(number(form.get("variantInventory_" + index)))),
      sku: text(form.get("variantSku_" + index)),
      published: bool(form.get("variantPublished_" + index), false),
      sortOrder: index * 10,
      weightOunces: bool(form.get("variantRequiresShipping_" + index), false) ? wholeOunces(form.get("variantWeightOunces_" + index)) : 0,
      requiresShipping: bool(form.get("variantRequiresShipping_" + index), false),
      trackInventory: bool(form.get("variantTrackInventory_" + index), false),
      availableForSale: bool(form.get("variantAvailable_" + index), false),
    });
  }
  return variants;
}

function colorDistance(data: Buffer, offset: number, color: { r: number; g: number; b: number }) {
  const dr = Number(data[offset]) - color.r;
  const dg = Number(data[offset + 1]) - color.g;
  const db = Number(data[offset + 2]) - color.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function hasTransparentPixels(data: Buffer, totalPixels: number) {
  for (let index = 0; index < totalPixels; index += 1) if (data[index * 4 + 3] < 250) return true;
  return false;
}

function backgroundColorFromCorners(data: Buffer, width: number, height: number) {
  const sample = Math.max(4, Math.min(24, Math.floor(Math.min(width, height) * .08)));
  const corners = [[0, 0], [Math.max(0, width - sample), 0], [0, Math.max(0, height - sample)], [Math.max(0, width - sample), Math.max(0, height - sample)]];
  let r = 0, g = 0, b = 0, count = 0;
  for (const [startX, startY] of corners) {
    for (let y = startY; y < Math.min(height, startY + sample); y += 1) {
      for (let x = startX; x < Math.min(width, startX + sample); x += 1) {
        const offset = (y * width + x) * 4;
        r += Number(data[offset]); g += Number(data[offset + 1]); b += Number(data[offset + 2]); count += 1;
      }
    }
  }
  return count ? { r: r / count, g: g / count, b: b / count } : { r: 255, g: 255, b: 255 };
}

function removeConnectedBackground(data: Buffer, width: number, height: number) {
  const totalPixels = width * height;
  const background = backgroundColorFromCorners(data, width, height);
  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  let head = 0, tail = 0;
  const enqueue = (index: number) => { if (!visited[index]) { visited[index] = 1; queue[tail] = index; tail += 1; } };
  const isBackground = (index: number) => colorDistance(data, index * 4, background) <= 76;
  for (let x = 0; x < width; x += 1) {
    if (isBackground(x)) enqueue(x);
    const bottom = (height - 1) * width + x;
    if (isBackground(bottom)) enqueue(bottom);
  }
  for (let y = 0; y < height; y += 1) {
    const left = y * width;
    const right = left + width - 1;
    if (isBackground(left)) enqueue(left);
    if (isBackground(right)) enqueue(right);
  }
  while (head < tail) {
    const index = queue[head]; head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    const neighbors = [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, y > 0 ? index - width : -1, y < height - 1 ? index + width : -1];
    for (const next of neighbors) if (next >= 0 && !visited[next] && isBackground(next)) enqueue(next);
  }
  let transparentPixels = 0;
  for (let index = 0; index < totalPixels; index += 1) {
    if (!visited[index]) continue;
    const offset = index * 4;
    const distance = colorDistance(data, offset, background);
    const alpha = distance <= 28 ? 0 : distance >= 76 ? 255 : Math.round(((distance - 28) / 48) * 255);
    if (alpha < data[offset + 3]) data[offset + 3] = alpha;
    if (data[offset + 3] < 250) transparentPixels += 1;
  }
  return transparentPixels > 0;
}

async function transparentShopImage(buffer: Buffer, extension: string) {
  try {
    const decoded = await sharp(buffer, { failOn: "none" }).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const width = decoded.info.width;
    const height = decoded.info.height;
    if (!width || !height || decoded.info.channels !== 4) return { buffer, extension };
    if (hasTransparentPixels(decoded.data, width * height)) return { buffer, extension };
    const changed = removeConnectedBackground(decoded.data, width, height);
    if (!changed) return { buffer, extension };
    return { buffer: await sharp(decoded.data, { raw: { width, height, channels: 4 } }).png().toBuffer(), extension: ".png" };
  } catch (error) {
    console.warn("shop_product_background_transparency_failed", error instanceof Error ? error.message : error);
    return { buffer, extension };
  }
}

async function saveProductImage(file: File) {
  const extension = allowedImageTypes.get(file.type);
  if (!extension) throw new Error("Shop product images must be JPG, PNG, or WEBP.");
  if (file.size > maxImageBytes) throw new Error("Shop product images must be 10 MB or smaller.");
  const processed = await transparentShopImage(Buffer.from(await file.arrayBuffer()), extension);
  const filename = "shop-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8) + processed.extension;
  await fs.mkdir(imageDirectory(), { recursive: true });
  await fs.writeFile(path.join(imageDirectory(), filename), processed.buffer);
  return "/api/shop-product-images/" + filename;
}

async function saveProductImages(files: File[]) {
  if (files.length > maxProductImages) throw new Error("Upload no more than " + maxProductImages + " product photos at a time.");
  const urls: string[] = [];
  for (const file of files) urls.push(await saveProductImage(file));
  return urls;
}

async function productInput(form: FormData) {
  const uploads = [...form.getAll("images"), ...form.getAll("image")].filter((value): value is File => value instanceof File && value.size > 0);
  const removed = new Set(form.getAll("removeImages").map((value) => text(value)).filter(Boolean));
  const existing = form.getAll("existingImages").map((value) => text(value)).filter((value) => value && !removed.has(value));
  const fallbackImage = text(form.get("imageUrl"));
  const hasManagedImages = form.has("existingImages") || form.has("removeImages");
  const uploadedImages = await saveProductImages(uploads);
  const imageUrls = unique([...existing, ...uploadedImages, ...(hasManagedImages ? [] : [fallbackImage])]);
  const imageUrl = imageUrls[0] || (hasManagedImages ? "" : fallbackImage);
  return {
    id: number(form.get("id")) || undefined,
    categoryId: number(form.get("categoryId")) || undefined,
    name: text(form.get("name")),
    description: text(form.get("description")),
    imageUrl,
    imageUrls,
    published: bool(form.get("published"), false),
    featured: bool(form.get("featured"), false),
    sortOrder: number(form.get("sortOrder")),
    variants: parseVariants(form),
  };
}

function settingsInput(form: FormData): Partial<ShopSettings> {
  return {
    bonusEnabled: bool(form.get("bonusEnabled"), false),
    bonusThresholdCents: dollarsToCents(form.get("bonusThreshold")),
    bonusVariantId: number(form.get("bonusVariantId")) || null,
    bonusLabel: text(form.get("bonusLabel")),
    orderNotificationEmail: text(form.get("orderNotificationEmail")),
    originName: text(form.get("originName")),
    originStreet1: text(form.get("originStreet1")),
    originStreet2: text(form.get("originStreet2")),
    originCity: text(form.get("originCity")),
    originState: text(form.get("originState")),
    originZip: text(form.get("originZip")),
    originCountry: text(form.get("originCountry")) || "US",
    originPhone: text(form.get("originPhone")),
    parcelLength: number(form.get("parcelLength")),
    parcelWidth: number(form.get("parcelWidth")),
    parcelHeight: number(form.get("parcelHeight")),
  };
}

async function saveFromForm(form: FormData, update: boolean) {
  const action = text(form.get("action"));
  if (action === "settings") return saveShopSettings(settingsInput(form));
  if (action === "category") return saveShopCategory({ id: update ? number(form.get("id")) : undefined, name: text(form.get("name")), description: text(form.get("description")), sortOrder: number(form.get("sortOrder")), published: bool(form.get("published"), true) });
  if (action === "category-order") return saveShopCategoryOrder(text(form.get("categoryIds")).split(",").map((id) => Number(id)));
  return saveShopProduct(await productInput(form));
}

export async function GET(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  return NextResponse.json(await getShopCatalog({ manager: true, orderStart: request.nextUrl.searchParams.get("orderStart") || undefined, orderEnd: request.nextUrl.searchParams.get("orderEnd") || undefined }), { headers: noStore });
}

export async function POST(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  try {
    if (requestBodyExceeds(request, maxImageBytes * maxProductImages + 1024 * 1024)) return NextResponse.json({ error: "Shop product images must be 10 MB or smaller each." }, { status: 413, headers: noStore });
    const catalog = await saveFromForm(await request.formData(), false);
    return NextResponse.json({ ok: true, ...catalog }, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save shop item." }, { status: 400, headers: noStore });
  }
}

export async function PATCH(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  try {
    if (requestBodyExceeds(request, maxImageBytes * maxProductImages + 1024 * 1024)) return NextResponse.json({ error: "Shop product images must be 10 MB or smaller each." }, { status: 413, headers: noStore });
    const catalog = await saveFromForm(await request.formData(), true);
    return NextResponse.json({ ok: true, ...catalog }, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update shop item." }, { status: 400, headers: noStore });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  try {
    const id = Number(request.nextUrl.searchParams.get("id"));
    const type = request.nextUrl.searchParams.get("type") || "product";
    if (!Number.isFinite(id) || id < 1) throw new Error("Choose a valid shop record.");
    const catalog = type === "category" ? await deleteShopCategory(id) : await deleteShopProduct(id);
    return NextResponse.json({ ok: true, ...catalog }, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete shop record." }, { status: 400, headers: noStore });
  }
}
