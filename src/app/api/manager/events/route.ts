import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import { createManagedEvent, deleteManagedEvent, getManagedEvents, updateManagedEvent, type ManagedEventInput } from "@/lib/managed-events";

export const runtime = "nodejs";

const eventImageDirectory = () => process.env.MANAGED_EVENT_IMAGES_DIRECTORY || path.join(process.cwd(), "data", "event-images");
const allowedImageTypes = new Map([["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"]]);

async function saveEventImage(image: File) {
  const extension = allowedImageTypes.get(image.type);
  if (!extension) throw new Error("Event photos must be JPG, PNG, or WEBP.");
  if (image.size > 10 * 1024 * 1024) throw new Error("Each event photo must be 10 MB or smaller.");
  const filename = "event-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8) + extension;
  await fs.mkdir(eventImageDirectory(), { recursive: true });
  await fs.writeFile(path.join(eventImageDirectory(), filename), Buffer.from(await image.arrayBuffer()));
  return "/api/event-images/" + filename;
}

async function eventInputFromRequest(request: NextRequest) {
  let input: Record<string, unknown>;
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await request.formData();
    input = Object.fromEntries(form.entries()) as Record<string, unknown>;
    input.published = form.get("published") === "true" || form.get("published") === "on";
    const removeGalleryImages = form.getAll("removeGalleryImages").map(String).filter(Boolean);
    if (removeGalleryImages.length) input.removeGalleryImages = removeGalleryImages;
    const uploads = [...form.getAll("image"), ...form.getAll("images")].filter((item): item is File => item instanceof File && item.size > 0);
    if (uploads.length > 12) throw new Error("Upload 12 event photos or fewer at a time.");
    if (uploads.length) {
      const saved = [];
      for (const image of uploads) saved.push(await saveEventImage(image));
      input.galleryImages = saved;
      input.imageUrl = saved[0];
    }
  } else input = await request.json();
  return input;
}

export async function GET(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ events: await getManagedEvents() });
}

export async function POST(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const input = await eventInputFromRequest(request);
    await createManagedEvent(input); return NextResponse.json({ ok: true, events: await getManagedEvents() });
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create event." }, { status: 400 }); }
}

export async function PATCH(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await eventInputFromRequest(request) as Partial<ManagedEventInput> & { id?: string };
    if (!body.id || typeof body.id !== "string") return NextResponse.json({ error: "Event is required." }, { status: 400 });
    await updateManagedEvent(body.id, body);
    return NextResponse.json({ ok: true, events: await getManagedEvents() });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update event." }, { status: 400 }); }
}

export async function DELETE(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Event is required." }, { status: 400 });
  try { await deleteManagedEvent(id); return NextResponse.json({ ok: true, events: await getManagedEvents() }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete event." }, { status: 404 }); }
}
