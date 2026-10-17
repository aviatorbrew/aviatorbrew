import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import { eventSummaryHtml, getEventPlan } from "@/lib/event-plans";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: {params:Promise<{id:string}>}) {
  const headers = {"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
  if (!isManager(request)) return NextResponse.json({error:"Unauthorized"},{status:401,headers});
  const plan = await getEventPlan((await context.params).id);
  if (!plan) return NextResponse.json({error:"Event not found."},{status:404,headers});
  return new Response(eventSummaryHtml(plan,true,"",request.nextUrl.searchParams.get("view")==="flight-plan"),{headers:{...headers,"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'","Referrer-Policy":"no-referrer"}});
}
