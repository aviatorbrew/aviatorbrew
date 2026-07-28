import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const directory = () => process.env.MANAGED_EVENT_IMAGES_DIRECTORY || path.join(process.cwd(), "data", "event-images");
const types: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const requested = (await params).filename;
  const filename = path.basename(requested);
  const type = types[path.extname(filename).toLowerCase()];
  if (!filename || filename !== requested || !type) return NextResponse.json({ error: "Event image not found." }, { status: 404 });
  try {
    const file = await fs.readFile(path.join(directory(), filename));
    return new NextResponse(new Uint8Array(file), { headers: { "Cache-Control": "public, max-age=31536000, immutable", "Content-Type": type, "X-Content-Type-Options": "nosniff" } });
  } catch { return NextResponse.json({ error: "Event image not found." }, { status: 404 }); }
}