import path from "node:path";
import sharp from "sharp";
import { findCustomLogo } from "@/lib/site-branding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const size = Number(new URL(request.url).searchParams.get("size") || 64);
  if (![32, 64, 180].includes(size)) return new Response("Unsupported icon size.", { status: 400 });
  const custom = await findCustomLogo();
  const file = custom?.file || path.join(process.cwd(), "public", "images", "aviator-logo.png");
  const icon = await sharp(file)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return new Response(new Uint8Array(icon), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
