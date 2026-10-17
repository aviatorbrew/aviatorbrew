import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import { emailEventUpdate, EventPlanError, getEventPlan } from "@/lib/event-plans";
export const runtime = "nodejs";
const headers = {"Cache-Control":"private, no-store"};
export async function POST(request: NextRequest, context: {params:Promise<{id:string}>}) {
  if (!isManager(request)) return NextResponse.json({error:"Unauthorized"},{status:401,headers});
  try {
    const plan = await getEventPlan((await context.params).id);
    if (!plan) return NextResponse.json({error:"Event not found."},{status:404,headers});
    const body = await request.json();
    if (typeof body.subject !== "string" || typeof body.message !== "string" || typeof body.requestId !== "string") throw new EventPlanError("Enter a subject and message.");
    const result = await emailEventUpdate(plan,body);
    return NextResponse.json(result,{headers});
  } catch(error) { return NextResponse.json({error:error instanceof EventPlanError ? error.message : "Could not send this update. Your draft is still available."},{status:error instanceof EventPlanError ? error.status : 500,headers}); }
}
