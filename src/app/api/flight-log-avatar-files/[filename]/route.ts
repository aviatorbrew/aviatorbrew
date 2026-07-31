import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const contentTypes: Record<string, string> = {
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function avatarDirectories() {
  return [
    path.join(process.cwd(), "public", "media", "flight-log-avatars"),
    path.join(process.cwd(), ".next", "standalone", "public", "media", "flight-log-avatars"),
    path.join(process.cwd(), "..", "..", "public", "media", "flight-log-avatars"),
  ];
}

export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const requested = (await params).filename;
  const filename = path.basename(requested);
  const contentType = contentTypes[path.extname(filename).toLowerCase()];
  if (!filename || filename !== requested || !contentType) {
    return NextResponse.json({ error: "Profile photo not found." }, { status: 404 });
  }
  for (const directory of [...new Set(avatarDirectories())]) {
    try {
      const file = await fs.readFile(path.join(directory, filename));
      return new NextResponse(new Uint8Array(file), {
        headers: {
          "Cache-Control": "public, max-age=31536000, immutable",
          "Content-Type": contentType,
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return NextResponse.json({ error: "Profile photo not found." }, { status: 404 });
}
