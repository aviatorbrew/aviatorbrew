import path from "node:path";
import { NextResponse } from "next/server";
import { streamFirstExistingFile } from "@/lib/server-file-response";
import { shopProductImageDirectories, shopProductImageIsDeleted } from "@/lib/shop-image-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const contentTypes: Record<string, string> = { ".jpeg": "image/jpeg", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

export async function GET(request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const requested = (await params).filename;
  const filename = path.basename(requested);
  const contentType = contentTypes[path.extname(filename).toLowerCase()];
  if (!filename || filename !== requested || !contentType) return NextResponse.json({ error: "Shop image not found." }, { status: 404 });
  if (shopProductImageIsDeleted(filename)) return NextResponse.json({ error: "Shop image not found." }, { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
  const response = await streamFirstExistingFile(
    request,
    shopProductImageDirectories().map((directory) => path.join(directory, filename)),
    { contentType },
  );
  return response || NextResponse.json({ error: "Shop image not found." }, { status: 404 });
}
