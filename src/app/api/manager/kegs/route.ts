import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import { clearKegInventory, getUploadedKegInventory, parseKegImportSource, saveKegImportCopy, saveKegInventory, setKegHidden, updateKegItem } from "@/lib/keg-inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const maxBytes = 1024 * 1024;

export async function GET(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ inventory: await getUploadedKegInventory({ includeHidden: true }) });
}

export async function POST(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose your local keg inventory JSON or CSV file." }, { status: 400 });
    if (file.size > maxBytes) return NextResponse.json({ error: "Inventory file must be 1 MB or smaller." }, { status: 413 });
    const lowerName = file.name.toLowerCase();
    const allowedType = file.type === "application/json" || file.type === "text/csv" || file.type === "application/vnd.ms-excel" || file.type === "";
    if ((!lowerName.endsWith(".json") && !lowerName.endsWith(".csv")) || !allowedType) {
      return NextResponse.json({ error: "Upload a .json or .csv file exported from BrewOps." }, { status: 415 });
    }
    const rawText = await file.text();
    const savedCopy = await saveKegImportCopy(rawText, file.name);
    let source: unknown;
    try { source = parseKegImportSource(rawText, file.name); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "That file is not a valid JSON or CSV keg import.", savedCopy: savedCopy.fileName }, { status: 400 }); }
    const inventory = await saveKegInventory(source);
    return NextResponse.json({ ok: true, inventory, savedCopy: savedCopy.fileName });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save keg inventory." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const inventory = await clearKegInventory();
    return NextResponse.json({ ok: true, inventory });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not clear keg inventory." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const beerName = typeof body.beerName === "string" ? body.beerName.trim() : "";
    if (!beerName) return NextResponse.json({ error: "Keg is required." }, { status: 400 });
    const inventory = body.action === "edit"
      ? await updateKegItem({
          beerName,
          nextBeerName: typeof body.nextBeerName === "string" ? body.nextBeerName : undefined,
          category: typeof body.category === "string" ? body.category : undefined,
          packaging: typeof body.packaging === "string" ? body.packaging : undefined,
          sixthBblKegs: body.sixthBblKegs,
          fiftyLKegs: body.fiftyLKegs,
          totalBbl: body.totalBbl,
          sixthBblPriceCents: body.sixthBblPriceCents,
          fiftyLPriceCents: body.fiftyLPriceCents,
          caseSize: typeof body.caseSize === "string" ? body.caseSize : undefined,
          casePriceCents: body.casePriceCents,
          caseCount: body.caseCount,
          hidden: body.hidden === true,
        })
      : await setKegHidden(beerName, body.hidden === true);
    return NextResponse.json({ ok: true, inventory });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update keg visibility." }, { status: 400 });
  }
}
