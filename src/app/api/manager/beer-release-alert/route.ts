import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import { beerReleaseAlertAssetDirectory, getBeerReleaseAlert, saveBeerReleaseAlert } from "@/lib/beer-release-alert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedTypes = new Map([["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"], ["application/pdf", ".pdf"]]);

async function inputFromRequest(request: NextRequest) {
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) return request.json();
  const form = await request.formData();
  const input: Record<string, unknown> = Object.fromEntries(form.entries());
  input.enabled = form.get("enabled") === "true" || form.get("enabled") === "on";
  const sellSheet = form.get("sellSheet");
  if (sellSheet instanceof File && sellSheet.size) {
    const extension = allowedTypes.get(sellSheet.type);
    if (!extension) throw new Error("Sell sheet must be JPG, PNG, WEBP, or PDF.");
    if (sellSheet.size > 25 * 1024 * 1024) throw new Error("Sell sheet must be 25 MB or smaller.");
    const filename = "beer-release-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8) + extension;
    await fs.mkdir(beerReleaseAlertAssetDirectory(), { recursive: true });
    await fs.writeFile(path.join(beerReleaseAlertAssetDirectory(), filename), Buffer.from(await sellSheet.arrayBuffer()));
    input.sellSheetUrl = "/api/beer-release-alert-assets/" + filename;
  }
  return input;
}

export async function GET(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ alert: await getBeerReleaseAlert() });
}

export async function PATCH(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json({ ok: true, alert: await saveBeerReleaseAlert(await inputFromRequest(request)) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save beer release alert." }, { status: 400 }); }
}
