import {NextRequest,NextResponse} from 'next/server';
import {isManager} from '@/lib/manager-auth';
import {withDatabase} from '@/lib/database';
import {getPrivateEventSettings} from '@/lib/private-event-settings';
import {materialHash} from '@/lib/event-proposals';
import {eventReceiptHtml,type ReceiptProposal} from '@/lib/event-receipt';
import type {EventPlanDetails} from '@/lib/event-plan';

export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){
 if(!isManager(request))return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 const {id}=await context.params;
 // One statement reads the saved order, issued quote and payment ledger consistently.
 const row=await withDatabase(async client=>(await client.query(`SELECT e.id,e.version,e.data,
  (SELECT jsonb_build_object('number',p.number,'version',p.version,'snapshot',p.snapshot,'material_hash',p.material_hash,'state',p.state,'accepted_at',p.accepted_at) FROM website.private_event_proposals p WHERE p.plan_id=e.id ORDER BY p.version DESC LIMIT 1) AS proposal,
  (SELECT COALESCE(sum(d.amount_cents),0)::int FROM website.private_event_deposits d WHERE d.plan_id=e.id) AS verified_paid
  FROM website.private_event_plans e WHERE e.id=$1 AND e.deleted_at IS NULL`,[id])).rows[0]);
 if(!row)return NextResponse.json({error:'Event not found.'},{status:404,headers});
 const details=row.data as EventPlanDetails,proposal=row.proposal as ReceiptProposal|null;
 if(proposal&&proposal.material_hash!==materialHash(details))return NextResponse.json({error:'The event changed since the latest proposal. Create an updated proposal before printing the receipt.'},{status:409,headers});
 const catalog=proposal?.snapshot.catalog??(await getPrivateEventSettings()).catering;
 return new Response(eventReceiptHtml({plan:{id:row.id,version:row.version,details},proposal,catalog,verifiedPaidCents:Number(row.verified_paid),paper:request.nextUrl.searchParams.get('paper')==='ticket'?'ticket':'letter'}),{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
}
