import { promises as fs } from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { beverageImageDirectory, beverageImageUrl } from "@/lib/beverage-images";
import { addManagedBeyondBeer, deleteManagedBeyondBeer, getPortalBeyondBeer, getPortalBeyondBeerItem, updatePortalBeyondBeer } from "@/lib/managed-beyond-beer";
import { isManager } from "@/lib/manager-auth";
import { requestBodyExceeds } from "@/lib/server-file-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const extensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".pdf"]);
const categories = new Set(["Soda", "THC Soda", "Seltzer"]);
const maxBytes = 25 * 1024 * 1024;
const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
const clean = (value: FormDataEntryValue | null, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const fileName = (value: string) => path.basename(value).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^[-.]+/, "").slice(0, 120);
const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

type BeverageCategory = "Soda" | "THC Soda" | "Seltzer";

async function graphicPath(graphic: FormDataEntryValue | null, name: string, existing?: string) {
  if (!(graphic instanceof File) || !graphic.size) {
    if (existing) return existing;
    throw new Error("Upload a beverage graphic.");
  }
  if (graphic.size > maxBytes) throw new Error("Beverage graphics must be 25 MB or smaller.");
  const safeName = fileName(graphic.name);
  const extension = path.extname(safeName).toLowerCase();
  if (!safeName || !extensions.has(extension)) throw new Error("Use a PNG, JPG, WEBP, or PDF beverage graphic.");
  const slug = slugify(name);
  if (!slug) throw new Error("Use a valid beverage name.");
  const imageDirectory = beverageImageDirectory();
  await fs.mkdir(imageDirectory, { recursive: true });
  const imageName = Date.now() + "-" + slug + extension;
  await fs.writeFile(path.join(imageDirectory, imageName), Buffer.from(await graphic.arrayBuffer()));
  return beverageImageUrl(imageName);
}

async function beverageFromForm(form: FormData, existing?: { slug: string; image: string }) {
  const name = clean(form.get("name"), 100);
  const category = clean(form.get("category"), 40);
  const description = clean(form.get("description"), 500);
  const note = clean(form.get("note"), 160);
  if (!name || !description || !note || !categories.has(category)) throw new Error("Complete the beverage name, category, description, and note.");
  const slug = existing?.slug || slugify(name);
  if (!slug) throw new Error("Use a valid beverage name.");
  return { slug, name, category: category as BeverageCategory, description, note, image: await graphicPath(form.get("graphic"), name, existing?.image) };
}

function refreshBeveragePages() {
  revalidatePath("/");
  revalidatePath("/beer");
}

export async function GET(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ beverages: await getPortalBeyondBeer() }, { headers: noStore });
}

export async function POST(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    if (requestBodyExceeds(request, maxBytes + 1024 * 1024)) return NextResponse.json({ error: "Beverage graphics must be 25 MB or smaller." }, { status: 413, headers: noStore });
    const beverage = await beverageFromForm(await request.formData());
    await addManagedBeyondBeer(beverage);
    refreshBeveragePages();
    return NextResponse.json({ ok: true, beverages: await getPortalBeyondBeer() }, { status: 201, headers: noStore });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not add beverage." }, { status: 400 }); }
}

export async function PATCH(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    if (requestBodyExceeds(request, maxBytes + 1024 * 1024)) return NextResponse.json({ error: "Beverage graphics must be 25 MB or smaller." }, { status: 413, headers: noStore });
    const form = await request.formData();
    const id = clean(form.get("id"), 150);
    if (!id) throw new Error("Choose a beverage to update.");
    const current = await getPortalBeyondBeerItem(id);
    if (!current) throw new Error("Beverage not found.");
    await updatePortalBeyondBeer(id, await beverageFromForm(form, current));
    refreshBeveragePages();
    return NextResponse.json({ ok: true, beverages: await getPortalBeyondBeer() }, { headers: noStore });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update beverage." }, { status: 400 }); }
}

export async function DELETE(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Beverage is required." }, { status: 400 });
  try { await deleteManagedBeyondBeer(id); refreshBeveragePages(); return NextResponse.json({ ok: true, beverages: await getPortalBeyondBeer() }, { headers: noStore }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete beverage." }, { status: 404 }); }
}
