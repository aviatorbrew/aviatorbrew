import { promises as fs } from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { beerImageDirectory, beerImageUrl } from "@/lib/beer-images";
import { addManagedBeer, deleteManagedBeer, getPortalBeer, getPortalBeers, updatePortalBeer } from "@/lib/managed-beers";
import { isManager } from "@/lib/manager-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const extensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".pdf"]);
const statuses = new Set(["Year-round", "Seasonal", "Limited"]);
const categories = new Set(["IPA", "Lager", "Ale", "Dark Beer", "High Gravity", "Limited Release"]);
const maxBytes = 25 * 1024 * 1024;
const clean = (value: FormDataEntryValue | null, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const fileName = (value: string) => path.basename(value).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^[-.]+/, "").slice(0, 120);
const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

function refreshBeerPages(slug: string) {
  revalidatePath("/");
  revalidatePath("/beer");
  revalidatePath("/beer/" + slug);
}

async function graphicPath(graphic: FormDataEntryValue | null, name: string, existing?: string) {
  if (!(graphic instanceof File) || !graphic.size) {
    if (existing) return existing;
    throw new Error("Upload a beer graphic.");
  }
  if (graphic.size > maxBytes) throw new Error("Beer graphics must be 25 MB or smaller.");
  const safeName = fileName(graphic.name);
  const extension = path.extname(safeName).toLowerCase();
  if (!safeName || !extensions.has(extension)) throw new Error("Use a PNG, JPG, WEBP, or PDF beer graphic.");
  const slug = slugify(name);
  if (!slug) throw new Error("Use a valid beer name.");
  const imageDirectory = beerImageDirectory();
  await fs.mkdir(imageDirectory, { recursive: true });
  const imageName = Date.now() + "-" + slug + extension;
  await fs.writeFile(path.join(imageDirectory, imageName), Buffer.from(await graphic.arrayBuffer()));
  return beerImageUrl(imageName);
}

async function beerFromForm(form: FormData, existing?: { slug: string; image: string; published?: boolean }) {
  const name = clean(form.get("name"), 100);
  const style = clean(form.get("style"), 100);
  const abv = clean(form.get("abv"), 24);
  const category = clean(form.get("category"), 40);
  const status = clean(form.get("status"), 40);
  const description = clean(form.get("description"), 500);
  if (!name || !style || !abv || !description || !categories.has(category) || !statuses.has(status)) throw new Error("Complete the beer name, style, ABV, category, availability, and tasting notes.");
  const slug = existing?.slug || slugify(name);
  if (!slug) throw new Error("Use a valid beer name.");
  const publishedEntry = form.get("published");
  const published = publishedEntry === null ? existing?.published !== false : publishedEntry === "true" || publishedEntry === "on";
  return { slug, name, style, abv, category, description, status: status as "Year-round" | "Seasonal" | "Limited", image: await graphicPath(form.get("graphic"), name, existing?.image), published };
}

export async function GET(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ beers: await getPortalBeers() }, { headers: noStore });
}

export async function POST(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const beer = await beerFromForm(await request.formData());
    await addManagedBeer(beer);
    refreshBeerPages(beer.slug);
    return NextResponse.json({ ok: true, beers: await getPortalBeers() }, { status: 201, headers: noStore });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not add beer." }, { status: 400 }); }
}

export async function PATCH(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const form = await request.formData();
    const id = clean(form.get("id"), 150);
    if (!id) throw new Error("Choose a beer to update.");
    const current = await getPortalBeer(id);
    if (!current) throw new Error("Beer not found.");
    await updatePortalBeer(id, await beerFromForm(form, current));
    refreshBeerPages(current.slug);
    return NextResponse.json({ ok: true, beers: await getPortalBeers() }, { headers: noStore });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update beer." }, { status: 400 }); }
}

export async function DELETE(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Beer is required." }, { status: 400 });
  try {
    const current = await getPortalBeer(id);
    await deleteManagedBeer(id);
    if (current) refreshBeerPages(current.slug);
    return NextResponse.json({ ok: true, beers: await getPortalBeers() }, { headers: noStore });
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete beer." }, { status: 404 }); }
}
