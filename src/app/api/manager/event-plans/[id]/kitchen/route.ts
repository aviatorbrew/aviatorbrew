import { NextRequest,NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import { getEventPlan } from "@/lib/event-plans";
import { listProposals,materialHash } from "@/lib/event-proposals";
import { getPrivateEventSettings } from "@/lib/private-event-settings";
import { kitchenSheetHtml } from "@/lib/event-documents";
export const runtime='nodejs';
export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){
 const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
 if(!isManager(request))return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 const plan=await getEventPlan((await context.params).id);if(!plan)return NextResponse.json({error:'Event not found.'},{status:404,headers});
 const {proposals}=await listProposals(plan.id),approved=proposals.some(p=>p.approved_at&&p.material_hash===materialHash(plan.details)&&!['superseded','cancelled','declined'].includes(p.state));
 return new Response(kitchenSheetHtml(plan,(await getPrivateEventSettings()).catering,approved),{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"}});
}
