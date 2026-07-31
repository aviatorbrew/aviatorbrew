import path from "node:path";
import { NextResponse } from "next/server";
import { flightLogAvatarDirectory } from "@/lib/flight-log-upload-storage";
import { streamFirstExistingFile } from "@/lib/server-file-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const contentTypes: Record<string, string> = { ".jpeg": "image/jpeg", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

function avatarDirectories() {
  return [
    flightLogAvatarDirectory(),
    path.join(process.cwd(), "public", "media", "flight-log-avatars"),
    path.join(process.cwd(), ".next", "standalone", "public", "media", "flight-log-avatars"),
    path.join(process.cwd(), "..", "..", "public", "media", "flight-log-avatars"),
  ];
}

export async function GET(request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const requested = (await params).filename;
  const filename = path.basename(requested);
  const contentType = contentTypes[path.extname(filename).toLowerCase()];
  if (!filename || filename !== requested || !contentType) return NextResponse.json({ error: "Profile photo not found." }, { status: 404 });
  const response = await streamFirstExistingFile(
    request,
    [...new Set(avatarDirectories())].map((directory) => path.join(directory, filename)),
    { contentType },
  );
  return response || NextResponse.json({ error: "Profile photo not found." }, { status: 404 });
}
