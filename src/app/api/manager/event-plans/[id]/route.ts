import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import { EventPlanError, getEventPlan, saveEventPlan, eventUpdateHistory } from "@/lib/event-plans";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{id:string}> };
export async function GET(request: NextRequest, context: Context) {
  if (!isManager(request)) return NextResponse.json({error:"Unauthorized"},{status:401,headers});
  const {id} = await context.params;
  const plan = await getEventPlan(id);
  return plan ? NextResponse.json({plan,updates:await eventUpdateHistory(id)},{headers}) : NextResponse.json({error:"Event not found."},{status:404,headers});
}
export async function PUT(request: NextRequest, context: Context) {
  if (!isManager(request)) return NextResponse.json({error:"Unauthorized"},{status:401,headers});
  try {
    const body = await request.json();
    return NextResponse.json({plan:await saveEventPlan(body.details,(await context.params).id,body.version)},{headers});
  } catch(error) { return NextResponse.json({error:error instanceof Error ? error.message : "Could not save event."},{status:error instanceof EventPlanError ? error.status : 400,headers}); }
}
