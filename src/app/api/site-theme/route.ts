import { NextResponse } from "next/server";
import { getSiteTheme } from "@/lib/site-theme-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json(await getSiteTheme(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Website skin is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
