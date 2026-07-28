import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import { createManagedEvent, deleteManagedEvent, getManagedEvents, updateManagedEvent, type ManagedEventInput } from "@/lib/managed-events";

export const runtime = "nodejs";

const eventImageDirectory = () => process.env.MANAGED_EVENT_IMAGES_DIRECTORY || path.join(process.cwd(), "data", "event-images");
const allowedImageTypes = new Map([["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"]]);

export async function GET(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ events: await getManagedEvents() });
}

export async function POST(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    let input: Record<string, unknown>;
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      input = Object.fromEntries(form.entries()) as Record<string, unknown>;
      const image = form.get("image");
      if (image instanceof File && image.size) {
        const extension = allowedImageTypes.get(image.type);
        if (!extension) return NextResponse.json({ error: "Event images must be JPG, PNG, or WEBP." }, { status: 415 });
        if (image.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Event images must be 10 MB or smaller." }, { status: 413 });
        const filename = "event-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8) + extension;
        await fs.mkdir(eventImageDirectory(), { recursive: true });
        await fs.writeFile(path.join(eventImageDirectory(), filename), Buffer.from(await image.arrayBuffer()));
        input.imageUrl = "/api/event-images/" + filename;
      }
    } else input = await request.json();
    await createManagedEvent(input); return NextResponse.json({ ok: true, events: await getManagedEvents() });
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create event." }, { status: 400 }); }
}

export async function PATCH(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as Partial<ManagedEventInput> & { id?: string };
    if (!body.id) return NextResponse.json({ error: "Event is required." }, { status: 400 });
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
