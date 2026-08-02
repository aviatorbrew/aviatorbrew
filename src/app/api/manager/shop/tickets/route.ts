import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import { getShopTicketPurchasesCsv } from "@/lib/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const productId = Number(request.nextUrl.searchParams.get("productId"));
    if (!Number.isInteger(productId) || productId < 1) throw new Error("Choose a valid ticket product.");
    const result = await getShopTicketPurchasesCsv(productId);
    return new NextResponse(result.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not export ticket purchasers." }, { status: 400 });
  }
}
