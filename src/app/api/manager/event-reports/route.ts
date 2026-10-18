import {NextRequest,NextResponse} from "next/server";
import {isManager} from "@/lib/manager-auth";
import {EventPlanError,searchEventReports} from "@/lib/event-plans";
import {getPrivateEventSettings} from "@/lib/private-event-settings";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
export async function GET(request:NextRequest){
  if(!isManager(request))return NextResponse.json({error:"Unauthorized"},{status:401,headers});
  try{const p=request.nextUrl.searchParams;return NextResponse.json({...await searchEventReports({q:p.get("q")||"",start:p.get("start")||"",end:p.get("end")||"",status:p.get("status")||"",includeDeleted:p.get("includeDeleted")==="1",offset:Number(p.get("offset")||0)}),catering:(await getPrivateEventSettings()).catering},{headers});}
  catch(error){return NextResponse.json({error:error instanceof EventPlanError?error.message:"Could not load event reports."},{status:error instanceof EventPlanError?error.status:500,headers});}
}
