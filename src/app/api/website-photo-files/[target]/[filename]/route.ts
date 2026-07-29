import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { legacyPhotoDirectory, photoDirectory, validPhotoTarget } from "@/lib/website-photo-storage";

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

export async function GET(_request: Request, { params }: { params: Promise<{ target: string; filename: string }> }) {
  const { target, filename: requested } = await params;
  const filename = path.basename(requested);
  const contentType = contentTypes[path.extname(filename).toLowerCase()];
  if (!validPhotoTarget(target) || !filename || filename !== requested || !contentType) {
    return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  }

  const directories = [...new Set([photoDirectory(target), legacyPhotoDirectory(target)])];
  for (const directory of directories) {
    try {
      const file = await fs.readFile(path.join(directory, filename));
      return new NextResponse(new Uint8Array(file), {
        headers: {
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=31536000, immutable",
          "Content-Type": contentType,
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  return NextResponse.json({ error: "Photo not found." }, { status: 404 });
}
