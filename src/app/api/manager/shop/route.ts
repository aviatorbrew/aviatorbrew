import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import { deleteShopCategory, deleteShopProduct, dollarsToCents, getShopCatalog, saveShopCategory, saveShopProduct, type ShopVariantInput } from "@/lib/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maxImageBytes = 10 * 1024 * 1024;
const allowedImageTypes = new Map([["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"]]);
const imageDirectory = () => process.env.SHOP_PRODUCT_IMAGES_DIRECTORY || path.join(process.cwd(), "public", "media", "shop-products");
const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

function text(value: FormDataEntryValue | null) { return typeof value === "string" ? value.trim() : ""; }
function number(value: FormDataEntryValue | null) { const parsed = Number(text(value)); return Number.isFinite(parsed) ? parsed : 0; }
function bool(value: FormDataEntryValue | null, fallback = false) { const raw = text(value).toLowerCase(); return raw ? ["true", "on", "1", "yes"].includes(raw) : fallback; }

function parseVariants(raw: string): ShopVariantInput[] {
  return raw.split(/\r?\n/).map((line, index) => {
    const [label = "", price = "", inventory = "", sku = "", published = "true"] = line.split("|").map((part) => part.trim());
    return { label, priceCents: dollarsToCents(price), inventoryCount: Math.max(0, Math.floor(Number(inventory) || 0)), sku, published: published.toLowerCase() !== "false", sortOrder: index * 10 };
  }).filter((variant) => variant.label);
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
    variants: parseVariants(text(form.get("variants"))),
  };
}

export async function GET(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  return NextResponse.json(await getShopCatalog({ manager: true }), { headers: noStore });
}

export async function POST(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  try {
    const form = await request.formData();
    const action = text(form.get("action"));
    const catalog = action === "category"
      ? await saveShopCategory({ name: text(form.get("name")), description: text(form.get("description")), sortOrder: number(form.get("sortOrder")), published: bool(form.get("published"), true) })
      : await saveShopProduct(await productInput(form));
    return NextResponse.json({ ok: true, ...catalog }, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save shop item." }, { status: 400, headers: noStore });
  }
}

export async function PATCH(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  try {
    const form = await request.formData();
    const action = text(form.get("action"));
    const catalog = action === "category"
      ? await saveShopCategory({ id: number(form.get("id")), name: text(form.get("name")), description: text(form.get("description")), sortOrder: number(form.get("sortOrder")), published: bool(form.get("published"), true) })
      : await saveShopProduct(await productInput(form));
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
