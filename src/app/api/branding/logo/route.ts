import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { findCustomLogo } from "@/lib/site-branding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const custom = await findCustomLogo();
  const file = custom?.file || path.join(process.cwd(), "public", "images", "aviator-logo.png");
  const contentType = custom?.contentType || "image/png";

  try {
    const bytes = await fs.readFile(file);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
