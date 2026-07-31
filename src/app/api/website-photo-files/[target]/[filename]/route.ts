import path from "node:path";
import { NextResponse } from "next/server";
import { legacyPhotoDirectory, photoDirectory, validPhotoTarget } from "@/lib/website-photo-storage";
import { streamFirstExistingFile } from "@/lib/server-file-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const contentTypes: Record<string, string> = {
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/mp4",
};

export async function GET(request: Request, { params }: { params: Promise<{ target: string; filename: string }> }) {
  const { target, filename: requested } = await params;
  const filename = path.basename(requested);
  const contentType = contentTypes[path.extname(filename).toLowerCase()];
  if (!validPhotoTarget(target) || !filename || filename !== requested || !contentType) {
    return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  }

  const response = await streamFirstExistingFile(
    request,
    [...new Set([photoDirectory(target), legacyPhotoDirectory(target)])].map((directory) => path.join(directory, filename)),
    { contentType },
  );
  return response || NextResponse.json({ error: "Photo not found." }, { status: 404 });
}
