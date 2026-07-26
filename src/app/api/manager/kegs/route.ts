import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import { getUploadedKegInventory, saveKegInventory } from "@/lib/keg-inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const maxBytes = 1024 * 1024;

export async function GET(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ inventory: await getUploadedKegInventory() });
}

export async function POST(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a JSON inventory file." }, { status: 400 });
    if (file.size > maxBytes) return NextResponse.json({ error: "Inventory JSON must be 1 MB or smaller." }, { status: 413 });
    if (!file.name.toLowerCase().endsWith(".json") && file.type !== "application/json") {
      return NextResponse.json({ error: "Upload a .json file exported from BrewOps." }, { status: 415 });
    }
    let source: unknown;
    try { source = JSON.parse(await file.text()); }
    catch { return NextResponse.json({ error: "That file is not valid JSON." }, { status: 400 }); }
    const inventory = await saveKegInventory(source);
    return NextResponse.json({ ok: true, inventory });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save keg inventory." }, { status: 400 });
  }
}
