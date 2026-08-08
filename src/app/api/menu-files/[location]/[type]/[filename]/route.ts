import path from "node:path";
import { NextResponse } from "next/server";
import { isMenuLocation } from "@/data/menu-library";
import { menuFileTypes, menuSearchPaths } from "@/lib/menu-files";
import { streamFirstExistingFile } from "@/lib/server-file-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const contentTypes: Record<string, string> = {
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(request: Request, { params }: { params: Promise<{ location: string; type: string; filename: string }> }) {
  const { location, type, filename: requested } = await params;
  const filename = path.basename(requested);
  const contentType = contentTypes[path.extname(filename).toLowerCase()];
  if (!isMenuLocation(location) || !menuFileTypes.has(type) || !filename || filename !== requested || !contentType) {
    return NextResponse.json({ error: "Menu file not found." }, { status: 404 });
  }

  const response = await streamFirstExistingFile(request, menuSearchPaths(location, type, filename), { contentType });
  return response || NextResponse.json({ error: "Menu file not found." }, { status: 404 });
}
