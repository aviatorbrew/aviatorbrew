import path from "node:path";
import { findCustomLogo } from "@/lib/site-branding";
import { streamFirstExistingFile } from "@/lib/server-file-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const custom = await findCustomLogo();
  const file = custom?.file || path.join(process.cwd(), "public", "images", "aviator-logo.png");
  const contentType = custom?.contentType || "image/png";
  const response = await streamFirstExistingFile(request, [file], {
    contentType,
    cacheControl: "no-cache, no-store, must-revalidate",
  });
  return response || new Response(null, { status: 404 });
}
