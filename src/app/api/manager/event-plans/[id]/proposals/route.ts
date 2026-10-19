import { NextRequest,NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import { createProposal,listProposals,saveProposalReview,ProposalError } from "@/lib/event-proposals";
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){if(!isManager(request))return NextResponse.json({error:'Unauthorized'},{status:401,headers});try{return NextResponse.json(await listProposals((await context.params).id),{headers});}catch(error){return NextResponse.json({error:error instanceof ProposalError?error.message:'Could not load proposals and staff approvals.'},{status:error instanceof ProposalError?error.status:500,headers});}}
export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){if(!isManager(request))return NextResponse.json({error:'Unauthorized'},{status:401,headers});try{return NextResponse.json({proposal:await createProposal((await context.params).id,await request.json())},{status:201,headers});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not create proposal.'},{status:error instanceof ProposalError?error.status:400,headers});}}

export async function PATCH(request:NextRequest,context:{params:Promise<{id:string}>}){if(!isManager(request))return NextResponse.json({error:'Unauthorized'},{status:401,headers});try{return NextResponse.json({review:await saveProposalReview((await context.params).id,await request.json())},{headers});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not save staff approvals.'},{status:error instanceof ProposalError?error.status:400,headers});}}
