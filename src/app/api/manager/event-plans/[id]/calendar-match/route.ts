import {NextRequest,NextResponse} from 'next/server';
import {isManager} from '@/lib/manager-auth';
import {getCalendarEventMatches,linkCalendarEvent} from '@/lib/event-calendar-matches';
import {EventPlanError} from '@/lib/event-plans';
import {ProposalError} from '@/lib/event-proposals';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
type Context={params:Promise<{id:string}>};
export async function GET(request:NextRequest,context:Context){
 if(!isManager(request))return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 try{return NextResponse.json(await getCalendarEventMatches((await context.params).id),{headers});}
 catch(error){return NextResponse.json({error:error instanceof EventPlanError?error.message:'Could not check Google Calendar matches.'},{status:error instanceof EventPlanError?error.status:500,headers});}
}
export async function POST(request:NextRequest,context:Context){
 if(!isManager(request))return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 try{return NextResponse.json(await linkCalendarEvent((await context.params).id,await request.json()),{headers});}
 catch(error){return NextResponse.json({error:error instanceof EventPlanError||error instanceof ProposalError?error.message:'Could not link the Google Calendar event.'},{status:error instanceof EventPlanError||error instanceof ProposalError?error.status:500,headers});}
}
