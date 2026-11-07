import { NextRequest, NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { isManager } from "@/lib/manager-auth";
import { getSiteTheme, setSiteTheme } from "@/lib/site-theme-store";
import { activeSiteSkin } from "@/lib/site-skins";
import { requestBodyExceeds } from "@/lib/server-file-response";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  const settings = await getSiteTheme();
  return NextResponse.json({ settings, activeSkin: activeSiteSkin(settings) }, { headers });
}
export async function PATCH(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (requestBodyExceeds(request, 12000)) return NextResponse.json({ error: "Promotion settings are too large." }, { status: 413, headers });
  try {
    const settings = await setSiteTheme(await request.json());
    revalidateTag("site-theme");
    revalidatePath("/", "layout");
    return NextResponse.json({ settings, activeSkin: activeSiteSkin(settings) }, { headers });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save website skin." }, { status: 400, headers }); }
}
