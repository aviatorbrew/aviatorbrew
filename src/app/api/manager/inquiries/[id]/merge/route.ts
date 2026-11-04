import {NextRequest,NextResponse} from 'next/server';
import {isManager} from '@/lib/manager-auth';
import {EventPlanError} from '@/lib/event-plans';
import {inquiryMergeCandidates,mergeInquiryIntoEvent} from '@/lib/event-inquiry-merge';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
type Context={params:Promise<{id:string}>};
export async function GET(request:NextRequest,{params}:Context){
 if(!isManager(request))return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 try{return NextResponse.json(await inquiryMergeCandidates((await params).id,request.nextUrl.searchParams.get('q')||''),{headers});}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not find confirmed events.'},{status:e instanceof EventPlanError?e.status:500,headers});}
}
export async function POST(request:NextRequest,{params}:Context){
 if(!isManager(request))return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 try{return NextResponse.json(await mergeInquiryIntoEvent((await params).id,await request.json()),{headers});}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not merge this menu.'},{status:e instanceof EventPlanError?e.status:400,headers});}
}
