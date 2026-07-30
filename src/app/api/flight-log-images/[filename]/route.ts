import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { flightLogImageDirectory } from "@/lib/flight-log-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const contentTypes: Record<string, string> = { ".jpeg": "image/jpeg", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const requested = (await params).filename;
  const filename = path.basename(requested);
  const type = contentTypes[path.extname(filename).toLowerCase()];
  if (!filename || filename !== requested || !type) return NextResponse.json({ error: "Flight Log image not found." }, { status: 404 });
  try {
    const file = await fs.readFile(path.join(flightLogImageDirectory(), filename));
    return new NextResponse(new Uint8Array(file), { headers: { "Cache-Control": "public, max-age=31536000, immutable", "Content-Type": type, "X-Content-Type-Options": "nosniff" } });
  } catch {
    return NextResponse.json({ error: "Flight Log image not found." }, { status: 404 });
  }
}
