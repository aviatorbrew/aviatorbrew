import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import { requestBodyExceeds } from "@/lib/server-file-response";
import { deleteShopCategory, deleteShopProduct, dollarsToCents, getShopCatalog, saveShopCategory, saveShopProduct, saveShopSettings, type ShopSettings, type ShopVariantInput } from "@/lib/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maxImageBytes = 10 * 1024 * 1024;
const allowedImageTypes = new Map([["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"]]);
const imageDirectory = () => process.env.SHOP_PRODUCT_IMAGES_DIRECTORY || path.join(process.cwd(), "public", "media", "shop-products");
const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

function text(value: FormDataEntryValue | null) { return typeof value === "string" ? value.trim() : ""; }
function number(value: FormDataEntryValue | null) { const parsed = Number(text(value)); return Number.isFinite(parsed) ? parsed : 0; }
function bool(value: FormDataEntryValue | null, fallback = false) { const raw = text(value).toLowerCase(); return raw ? ["true", "on", "1", "yes"].includes(raw) : fallback; }

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
      weightOunces: Math.max(.1, Number(weightOunces) || 8),
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
      weightOunces: bool(form.get("variantRequiresShipping_" + index), false) ? Math.max(.1, number(form.get("variantWeightOunces_" + index)) || 8) : 0,
      requiresShipping: bool(form.get("variantRequiresShipping_" + index), false),
      trackInventory: bool(form.get("variantTrackInventory_" + index), false),
      availableForSale: bool(form.get("variantAvailable_" + index), false),
    });
  }
  return variants;
}

async function saveProductImage(file: File) {
  const extension = allowedImageTypes.get(file.type);
  if (!extension) throw new Error("Shop product images must be JPG, PNG, or WEBP.");
  if (file.size > maxImageBytes) throw new Error("Shop product images must be 10 MB or smaller.");
  const filename = "shop-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8) + extension;
  await fs.mkdir(imageDirectory(), { recursive: true });
  await fs.writeFile(path.join(imageDirectory(), filename), Buffer.from(await file.arrayBuffer()));
  return "/api/shop-product-images/" + filename;
}

async function productInput(form: FormData) {
  const image = form.get("image");
  const imageUrl = image instanceof File && image.size > 0 ? await saveProductImage(image) : text(form.get("imageUrl"));
  return {
    id: number(form.get("id")) || undefined,
    categoryId: number(form.get("categoryId")) || undefined,
    name: text(form.get("name")),
    description: text(form.get("description")),
    imageUrl,
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
  return saveShopProduct(await productInput(form));
}

export async function GET(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  return NextResponse.json(await getShopCatalog({ manager: true, orderStart: request.nextUrl.searchParams.get("orderStart") || undefined, orderEnd: request.nextUrl.searchParams.get("orderEnd") || undefined }), { headers: noStore });
}

export async function POST(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  try {
    if (requestBodyExceeds(request, maxImageBytes + 1024 * 1024)) return NextResponse.json({ error: "Shop product images must be 10 MB or smaller." }, { status: 413, headers: noStore });
    const catalog = await saveFromForm(await request.formData(), false);
    return NextResponse.json({ ok: true, ...catalog }, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save shop item." }, { status: 400, headers: noStore });
  }
}

export async function PATCH(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  try {
    if (requestBodyExceeds(request, maxImageBytes + 1024 * 1024)) return NextResponse.json({ error: "Shop product images must be 10 MB or smaller." }, { status: 413, headers: noStore });
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
