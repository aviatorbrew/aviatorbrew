import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { beerReleaseAlertAssetDirectory } from "@/lib/beer-release-alert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const types: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf" };

export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const requested = (await params).filename;
  const filename = path.basename(requested);
  const type = types[path.extname(filename).toLowerCase()];
  if (!filename || filename !== requested || !type) return NextResponse.json({ error: "Beer release asset not found." }, { status: 404 });
  try {
    const file = await fs.readFile(path.join(beerReleaseAlertAssetDirectory(), filename));
    return new NextResponse(new Uint8Array(file), { headers: { "Cache-Control": "public, max-age=31536000, immutable", "Content-Type": type, "X-Content-Type-Options": "nosniff" } });
  } catch { return NextResponse.json({ error: "Beer release asset not found." }, { status: 404 }); }
}
