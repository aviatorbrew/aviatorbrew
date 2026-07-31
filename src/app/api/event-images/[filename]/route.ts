import path from "node:path";
import { NextResponse } from "next/server";
import { streamFirstExistingFile } from "@/lib/server-file-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const directory = () => process.env.MANAGED_EVENT_IMAGES_DIRECTORY || path.join(process.cwd(), "data", "event-images");
const types: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

export async function GET(request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const requested = (await params).filename;
  const filename = path.basename(requested);
  const contentType = types[path.extname(filename).toLowerCase()];
  if (!filename || filename !== requested || !contentType) return NextResponse.json({ error: "Event image not found." }, { status: 404 });
  const response = await streamFirstExistingFile(request, [path.join(directory(), filename)], { contentType });
  return response || NextResponse.json({ error: "Event image not found." }, { status: 404 });
}
