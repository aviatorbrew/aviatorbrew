import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import { databaseConfigured, withDatabase } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
const allowedKinds = new Set(["catering", "event"]);

function isoDate(value: string | null) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""; }
function limit(value: string | null, fallback: number) { const parsed = Number(value || fallback); return Math.min(250, Math.max(1, Number.isFinite(parsed) ? Math.floor(parsed) : fallback)); }
function payloadText(value: unknown, key: string) {
  if (!value || typeof value !== "object") return "";
  const current = (value as Record<string, unknown>)[key];
  return typeof current === "string" ? current : current === null || current === undefined ? "" : String(current);
}

export async function GET(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  if (!databaseConfigured()) return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 503, headers: noStore });

  const kind = request.nextUrl.searchParams.get("kind") || "catering";
  if (!allowedKinds.has(kind)) return NextResponse.json({ error: "Unknown inquiry type." }, { status: 400, headers: noStore });
  const search = (request.nextUrl.searchParams.get("q") || "").trim();
  const start = isoDate(request.nextUrl.searchParams.get("start"));
  const end = isoDate(request.nextUrl.searchParams.get("end"));
  const filtered = Boolean(search || start || end);
  const rowLimit = limit(request.nextUrl.searchParams.get("limit"), filtered ? 200 : 5);
  const searchPattern = "%" + search + "%";

  const result = await withDatabase(async (client) => client.query(`
    SELECT id, kind, email, name, payload, source, created_at, count(*) OVER()::int AS total_count
    FROM website.form_inquiries
    WHERE kind = $1
      AND ($2::text = '' OR name ILIKE $5 OR email ILIKE $5 OR payload->>'phone' ILIKE $5 OR payload->>'orderSummary' ILIKE $5 OR payload->>'message' ILIKE $5 OR payload->>'eventType' ILIKE $5 OR payload->>'location' ILIKE $5)
      AND ($3::date IS NULL OR created_at >= $3::date)
      AND ($4::date IS NULL OR created_at < ($4::date + interval '1 day'))
    ORDER BY created_at DESC
    LIMIT $6
  `, [kind, search, start || null, end || null, searchPattern, rowLimit]));

  const inquiries = result.rows.map((row) => {
    const payload = row.payload || {};
    return {
      id: String(row.id), kind: row.kind, createdAt: row.created_at, source: row.source,
      name: row.name || payloadText(payload, "name"), email: row.email || payloadText(payload, "email"), phone: payloadText(payload, "phone"),
      pickupDate: payloadText(payload, "pickupDate"), pickupTime: payloadText(payload, "pickupTime"), guestCount: payloadText(payload, "guestCount"),
      eventDate: payloadText(payload, "eventDate") || payloadText(payload, "date"), eventTime: payloadText(payload, "eventTime") || payloadText(payload, "time"), eventType: payloadText(payload, "eventType"), location: payloadText(payload, "location"),
      estimatedSubtotal: payloadText(payload, "estimatedSubtotal"), estimatedTax: payloadText(payload, "estimatedTax"), estimatedTotal: payloadText(payload, "estimatedTotal"),
      cateringMenu: payloadText(payload, "cateringMenu"), menuScanSource: payloadText(payload, "menuScanSource"), orderSummary: payloadText(payload, "orderSummary"), message: payloadText(payload, "message"), payload,
    };
  });

  return NextResponse.json({ inquiries, total: result.rows[0]?.total_count || 0, limit: rowLimit, filtered }, { headers: noStore });
}
