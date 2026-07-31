import path from "node:path";
import { NextResponse } from "next/server";
import { streamFirstExistingFile } from "@/lib/server-file-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const contentTypes: Record<string, string> = { ".jpeg": "image/jpeg", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

function directories() {
  return [
    process.env.SHOP_PRODUCT_IMAGES_DIRECTORY,
    path.join(process.cwd(), "public", "media", "shop-products"),
    path.join(process.cwd(), ".next", "standalone", "public", "media", "shop-products"),
    path.join(process.cwd(), "..", "..", "public", "media", "shop-products"),
  ].filter((directory): directory is string => Boolean(directory));
}

export async function GET(request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const requested = (await params).filename;
  const filename = path.basename(requested);
  const contentType = contentTypes[path.extname(filename).toLowerCase()];
  if (!filename || filename !== requested || !contentType) return NextResponse.json({ error: "Shop image not found." }, { status: 404 });
  const response = await streamFirstExistingFile(
    request,
    [...new Set(directories())].map((directory) => path.join(directory, filename)),
    { contentType },
  );
  return response || NextResponse.json({ error: "Shop image not found." }, { status: 404 });
}
