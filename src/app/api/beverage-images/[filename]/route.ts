import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { beverageImageDirectory, legacyBeverageImageDirectories } from "@/lib/beverage-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const contentTypes: Record<string, string> = {
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const requested = (await params).filename;
  const filename = path.basename(requested);
  const contentType = contentTypes[path.extname(filename).toLowerCase()];
  if (!filename || filename !== requested || !contentType) {
    return NextResponse.json({ error: "Beverage image not found." }, { status: 404 });
  }

  const directories = [...new Set([beverageImageDirectory(), ...legacyBeverageImageDirectories()])];
  for (const directory of directories) {
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

  return NextResponse.json({ error: "Beverage image not found." }, { status: 404 });
}
