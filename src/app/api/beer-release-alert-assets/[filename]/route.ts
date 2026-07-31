import path from "node:path";
import { NextResponse } from "next/server";
import { beerReleaseAlertAssetDirectory } from "@/lib/beer-release-alert";
import { streamFirstExistingFile } from "@/lib/server-file-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const types: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf" };

export async function GET(request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const requested = (await params).filename;
  const filename = path.basename(requested);
  const contentType = types[path.extname(filename).toLowerCase()];
  if (!filename || filename !== requested || !contentType) return NextResponse.json({ error: "Beer release asset not found." }, { status: 404 });
  const response = await streamFirstExistingFile(request, [path.join(beerReleaseAlertAssetDirectory(), filename)], { contentType });
  return response || NextResponse.json({ error: "Beer release asset not found." }, { status: 404 });
}
