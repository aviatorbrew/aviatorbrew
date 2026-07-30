import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isManager } from "@/lib/manager-auth";
import { events as staticEvents, locations } from "@/data/site";
import { getManagedEvents } from "@/lib/managed-events";
import { getAllBeers } from "@/lib/managed-beers";
import { archiveFlightLogPost, flightLogCategories, flightLogCategoryLabels, flightLogStatuses, getFlightLogPostById, getFlightLogPosts, saveFlightLogPost, type FlightLogInput } from "@/lib/flight-log";
import { flightLogImageDirectory, flightLogImageUrl } from "@/lib/flight-log-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
const allowedImages = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const maxImageBytes = 10 * 1024 * 1024;

function unauthorized() { return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore }); }
function bool(value: FormDataEntryValue | null) { return value === "true" || value === "on" || value === "1"; }
function text(value: FormDataEntryValue | null) { return typeof value === "string" ? value : ""; }
function safeFileName(value: string) { return path.basename(value).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^[-.]+/, "").slice(0, 120); }

async function saveImage(upload: FormDataEntryValue | null) {
  if (!(upload instanceof File) || !upload.size) return "";
  if (upload.size > maxImageBytes) throw new Error("Use a featured image smaller than 10 MB.");
  const extension = path.extname(upload.name).toLowerCase();
  if (!allowedImages.has(extension)) throw new Error("Use a PNG, JPG, or WEBP featured image.");
  const filename = Date.now().toString(36) + "-" + safeFileName(upload.name);
  await fs.mkdir(flightLogImageDirectory(), { recursive: true });
  await fs.writeFile(path.join(flightLogImageDirectory(), filename), Buffer.from(await upload.arrayBuffer()));
  return flightLogImageUrl(filename);
}

async function inputFromRequest(request: NextRequest): Promise<FlightLogInput> {
  const type = request.headers.get("content-type") || "";
  if (type.includes("multipart/form-data")) {
    const form = await request.formData();
    const uploadedImageUrl = await saveImage(form.get("image"));
    return {
      id: text(form.get("id")),
      title: text(form.get("title")),
      slug: text(form.get("slug")),
      excerpt: text(form.get("excerpt")),
      body: text(form.get("body")),
      category: text(form.get("category")) as FlightLogInput["category"],
      imageUrl: uploadedImageUrl || text(form.get("imageUrl")),
      locationId: text(form.get("locationId")),
      eventId: text(form.get("eventId")),
      beerId: text(form.get("beerId")),
      authorName: text(form.get("authorName")),
      status: text(form.get("status")) as FlightLogInput["status"],
      isPinned: bool(form.get("isPinned")),
      showOnHomepage: bool(form.get("showOnHomepage")),
      isOfficial: true,
      publishedAt: text(form.get("publishedAt")),
    };
  }
  return await request.json() as FlightLogInput;
}

async function options() {
  const [managedEvents, beers] = await Promise.all([getManagedEvents(), getAllBeers()]);
  return {
    categories: flightLogCategories.map((id) => ({ id, label: flightLogCategoryLabels[id] })),
    statuses: flightLogStatuses,
    locations: locations.map((location) => ({ id: location.slug, label: location.name })),
    events: [...staticEvents.map((event) => ({ id: event.slug, label: event.title })), ...managedEvents.map((event) => ({ id: event.id, label: event.title }))],
    beers: beers.map((beer) => ({ id: beer.slug, label: beer.name })),
  };
}

function refresh(post?: { slug?: string }) {
  revalidatePath("/");
  revalidatePath("/flight-log");
  if (post?.slug) revalidatePath("/flight-log/" + post.slug);
}

export async function GET(request: NextRequest) {
  if (!isManager(request)) return unauthorized();
  const id = request.nextUrl.searchParams.get("id");
  const posts = id ? [await getFlightLogPostById(id)].filter(Boolean) : await getFlightLogPosts({ status: "all", includeArchived: true });
  return NextResponse.json({ posts, options: await options() }, { headers: noStore });
}

export async function POST(request: NextRequest) {
  if (!isManager(request)) return unauthorized();
  try {
    const post = await saveFlightLogPost(await inputFromRequest(request));
    refresh(post);
    return NextResponse.json({ post, posts: await getFlightLogPosts({ status: "all", includeArchived: true }) }, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save Flight Log post." }, { status: 400, headers: noStore });
  }
}

export async function PATCH(request: NextRequest) {
  if (!isManager(request)) return unauthorized();
  try {
    const post = await saveFlightLogPost(await inputFromRequest(request));
    refresh(post);
    return NextResponse.json({ post, posts: await getFlightLogPosts({ status: "all", includeArchived: true }) }, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update Flight Log post." }, { status: 400, headers: noStore });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isManager(request)) return unauthorized();
  const id = request.nextUrl.searchParams.get("id") || "";
  try {
    const post = await archiveFlightLogPost(id);
    refresh(post);
    return NextResponse.json({ post, posts: await getFlightLogPosts({ status: "all", includeArchived: true }) }, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not archive Flight Log post." }, { status: 400, headers: noStore });
  }
}
