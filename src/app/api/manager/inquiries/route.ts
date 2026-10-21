import { inquiryBookingStages } from "@/lib/event-plans";
import { inquiryAvailability } from "@/lib/event-inquiry-availability";
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
function inquiryKind(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind") || "catering";
  return allowedKinds.has(kind) ? kind : "";
}
async function unreviewedEventInquiries() {
  return withDatabase(async client=>Number((await client.query("SELECT count(*)::int AS count FROM website.form_inquiries i WHERE i.kind='event' AND i.reviewed_at IS NULL AND NOT EXISTS (SELECT 1 FROM website.private_event_plans e WHERE e.source_inquiry_id=i.id)")).rows[0].count));
}

export async function GET(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  if (!databaseConfigured()) return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 503, headers: noStore });

  const kind = inquiryKind(request);
  if (!kind) return NextResponse.json({ error: "Unknown inquiry type." }, { status: 400, headers: noStore });
  const inquiryId = request.nextUrl.searchParams.get("id") || "";
  if (inquiryId && !/^[1-9]\d{0,18}$/.test(inquiryId)) return NextResponse.json({ error: "Choose a valid inquiry." }, { status: 400, headers: noStore });
  const search = (request.nextUrl.searchParams.get("q") || "").trim();
  const start = isoDate(request.nextUrl.searchParams.get("start"));
  const end = isoDate(request.nextUrl.searchParams.get("end"));
  const filtered = Boolean(inquiryId || search || start || end);
  const rowLimit = limit(request.nextUrl.searchParams.get("limit"), filtered ? 200 : 5);
  const searchPattern = "%" + search + "%";
  const rawOffset = Number(request.nextUrl.searchParams.get("offset") || 0);
  const offset = Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? Math.min(rawOffset, 1_000_000_000) : 0;

  const result = await withDatabase(async (client) => client.query(`
    SELECT id, kind, email, name, payload, source, created_at, reviewed_at, count(*) OVER()::int AS total_count
    FROM website.form_inquiries
    WHERE kind = $1
      AND ($1 <> 'event' OR $7::text <> '' OR NOT EXISTS (SELECT 1 FROM website.private_event_plans e WHERE e.source_inquiry_id=website.form_inquiries.id AND e.deleted_at IS NULL AND e.status IN ('Confirmed','Completed','Cancelled')))
      AND ($7::text = '' OR id::text = $7)
      AND ($2::text = '' OR name ILIKE $5 OR email ILIKE $5 OR payload->>'phone' ILIKE $5 OR payload->>'orderSummary' ILIKE $5 OR payload->>'message' ILIKE $5 OR payload->>'eventType' ILIKE $5 OR payload->>'location' ILIKE $5)
      AND ($3::date IS NULL OR created_at >= $3::date OR NULLIF(payload->>'eventDate', '') >= $3::text OR NULLIF(payload->>'pickupDate', '') >= $3::text)
      AND ($4::date IS NULL OR created_at < ($4::date + interval '1 day') OR NULLIF(payload->>'eventDate', '') <= $4::text OR NULLIF(payload->>'pickupDate', '') <= $4::text)
    ORDER BY created_at DESC, id DESC
    LIMIT $6 OFFSET $8
  `, [kind, search, start || null, end || null, searchPattern, rowLimit, inquiryId, offset]));

  const stages = kind === "event" ? await inquiryBookingStages(result.rows.map(row=>String(row.id))) : [];
  const availability = kind === "event" ? await inquiryAvailability(result.rows.map(row=>{const schedule=stages.find(item=>item.inquiryId===String(row.id))?.schedule;return {id:String(row.id),payload:{...row.payload,...(schedule?{cateringPlan:{...row.payload?.cateringPlan,...schedule}}:{})}};})) : new Map();
  const inquiries = result.rows.map((row) => {
    const payload = row.payload || {};
    return {
      bookingStage: stages.find(item=>item.inquiryId===String(row.id))?.stage || (kind==="event"?"Inquiry Received":undefined),
      planId: stages.find(item=>item.inquiryId===String(row.id))?.planId,
      ...(kind==="event"?{reviewed:Boolean(row.reviewed_at||stages.some(item=>item.inquiryId===String(row.id))),reviewedAt:row.reviewed_at?new Date(row.reviewed_at).toISOString():null}:{}),
      eventContactEmail:stages.find(item=>item.inquiryId===String(row.id))?.contactEmail,
      eventContactName:stages.find(item=>item.inquiryId===String(row.id))?.contactName,
      eventTitle:stages.find(item=>item.inquiryId===String(row.id))?.title,
      ...(kind==="event"?{availability:availability.get(String(row.id))}:{}),
      id: String(row.id), kind: row.kind, createdAt: row.created_at, source: row.source,
      name: row.name || payloadText(payload, "name"), email: row.email || payloadText(payload, "email"), phone: payloadText(payload, "phone"),
      pickupDate: payloadText(payload, "pickupDate"), pickupTime: payloadText(payload, "pickupTime"), guestCount: payloadText(payload, "guestCount"),
      eventDate: payloadText(payload, "eventDate") || payloadText(payload, "date"), eventTime: payloadText(payload, "eventTime") || payloadText(payload, "time"), eventType: payloadText(payload, "eventType"), location: payloadText(payload, "location"),
      estimatedSubtotal: payloadText(payload, "estimatedSubtotal"), estimatedTax: payloadText(payload, "estimatedTax"), estimatedTotal: payloadText(payload, "estimatedTotal"),
      cateringMenu: payloadText(payload, "cateringMenu"), menuScanSource: payloadText(payload, "menuScanSource"), orderSummary: payloadText(payload, "orderSummary"), message: payloadText(payload, "message"), payload,
    };
  });

  return NextResponse.json({ inquiries, total: result.rows[0]?.total_count || 0, limit: rowLimit, offset, filtered, ...(kind==="event"?{unreviewedCount:await unreviewedEventInquiries()}:{}) }, { headers: noStore });
}

export async function DELETE(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  if (!databaseConfigured()) return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 503, headers: noStore });
  const kind = inquiryKind(request);
  if (!kind) return NextResponse.json({ error: "Unknown inquiry type." }, { status: 400, headers: noStore });
  const id = Number(request.nextUrl.searchParams.get("id") || 0);
  if (!Number.isFinite(id) || id < 1) return NextResponse.json({ error: "Choose a valid inquiry." }, { status: 400, headers: noStore });

  const result = await withDatabase(async (client) => client.query("DELETE FROM website.form_inquiries WHERE id = $1 AND kind = $2 RETURNING id", [id, kind]));
  if (!result.rowCount) return NextResponse.json({ error: "Inquiry not found." }, { status: 404, headers: noStore });
  return NextResponse.json({ ok: true, id: String(id), ...(kind==="event"?{unreviewedCount:await unreviewedEventInquiries()}:{}) }, { headers: noStore });
}

export async function PATCH(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({error:"Unauthorized"},{status:401,headers:noStore});
  if (!databaseConfigured()) return NextResponse.json({error:"DATABASE_URL is not configured."},{status:503,headers:noStore});
  const id=request.nextUrl.searchParams.get("id")||"";
  if(inquiryKind(request)!=="event"||! /^[1-9]\d{0,18}$/.test(id))return NextResponse.json({error:"Choose a valid website event inquiry."},{status:400,headers:noStore});
  try{
    const body=await request.json();
    if(body.action!=="review")return NextResponse.json({error:"Choose a valid inquiry action."},{status:400,headers:noStore});
    const result=await withDatabase(client=>client.query("UPDATE website.form_inquiries SET reviewed_at=COALESCE(reviewed_at,now()) WHERE id=$1 AND kind='event' RETURNING reviewed_at",[id]));
    if(!result.rowCount)return NextResponse.json({error:"Website inquiry not found."},{status:404,headers:noStore});
    return NextResponse.json({id,reviewed:true,reviewedAt:new Date(result.rows[0].reviewed_at).toISOString(),unreviewedCount:await unreviewedEventInquiries()},{headers:noStore});
  }catch{return NextResponse.json({error:"Could not mark the website inquiry reviewed."},{status:400,headers:noStore});}
}
