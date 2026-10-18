import {NextRequest,NextResponse} from "next/server";
import {isManager} from "@/lib/manager-auth";
import {offerInquiryAlternative} from "@/lib/event-inquiry-alternatives";
import {EventPlanError} from "@/lib/event-plans";
export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store"};
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  if(!isManager(request))return NextResponse.json({error:"Unauthorized"},{status:401,headers});
  try{return NextResponse.json(await offerInquiryAlternative((await params).id,await request.json()),{headers});}
  catch(error){return NextResponse.json({error:error instanceof EventPlanError?error.message:"Could not offer the alternative date. Refresh the event before retrying."},{status:error instanceof EventPlanError?error.status:500,headers});}
}
