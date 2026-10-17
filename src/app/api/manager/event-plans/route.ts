import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import { getPrivateEventSettings } from "@/lib/private-event-settings";
import { EventPlanError, listEventPlans, saveEventPlan } from "@/lib/event-plans";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({error:"Unauthorized"},{status:401,headers});
  try {
    const plans = await listEventPlans(request.nextUrl.searchParams.get("month") || new Date().toISOString().slice(0,7));
    return NextResponse.json({plans,defaultRoomFeeCents:(await getPrivateEventSettings()).bookingFeeCents},{headers});
  } catch(error) { return NextResponse.json({error:error instanceof EventPlanError ? error.message : "Could not load event plans."},{status:error instanceof EventPlanError ? error.status : 500,headers}); }
}
export async function POST(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({error:"Unauthorized"},{status:401,headers});
  try {
    const body = await request.json();
    const plan = await saveEventPlan(body.details, undefined, undefined, body.sourceInquiryId);
    return NextResponse.json({plan},{status:201,headers});
  } catch(error) { return NextResponse.json({error:error instanceof Error ? error.message : "Could not save event."},{status:error instanceof EventPlanError ? error.status : 400,headers}); }
}
