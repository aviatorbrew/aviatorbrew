import path from "node:path";
import { NextResponse } from "next/server";
import { flightLogPostMediaDirectory } from "@/lib/flight-log-upload-storage";
import { streamFirstExistingFile } from "@/lib/server-file-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const contentTypes: Record<string, string> = {
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".webm": "video/webm",
  ".webp": "image/webp",
};

export async function GET(request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const requested = (await params).filename;
  const filename = path.basename(requested);
  const contentType = contentTypes[path.extname(filename).toLowerCase()];
  if (!filename || filename !== requested || !contentType) return NextResponse.json({ error: "Flight Log media not found." }, { status: 404 });
  const response = await streamFirstExistingFile(request, [path.join(flightLogPostMediaDirectory(), filename)], { contentType });
  return response || NextResponse.json({ error: "Flight Log media not found." }, { status: 404 });
}
