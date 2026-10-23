import { NextRequest,NextResponse } from "next/server";
import { acceptAndCheckout,customerProposal,declineProposal,requestProposalChange,ProposalError } from "@/lib/event-proposals";
import { proposalPdf } from "@/lib/event-documents";
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'};
export async function POST(request:NextRequest){
 try{
  if(Number(request.headers.get('content-length')||0)>16000)throw new ProposalError('Request is too large.',413);
  const raw=await request.text();if(raw.length>16000)throw new ProposalError("Request is too large.",413);
  let body;try{body=JSON.parse(raw);}catch{throw new ProposalError("Invalid proposal request.");}if(typeof body.token!=='string')throw new ProposalError('Open the secure link in your proposal email.',404);
  if(body.action==='accept')return NextResponse.json(await acceptAndCheckout(body.token,{name:body.name,agreed:body.agreed,proposalVersion:body.proposalVersion,policyVersion:body.policyVersion,userAgent:request.headers.get('user-agent')||'',ip:request.headers.get('x-forwarded-for')?.split(',')[0]}),{headers});
  if(body.action==='request-change')return NextResponse.json(await requestProposalChange(body.token,{requestId:body.requestId,proposalVersion:body.proposalVersion,name:body.name,message:body.message,userAgent:request.headers.get('user-agent')||'',ip:request.headers.get('x-forwarded-for')?.split(',')[0]}),{headers});
  if(body.action==='decline')return NextResponse.json(await declineProposal(body.token),{headers});
  const data=await customerProposal(body.token);
  if(body.action==='receipt'&&!data.payments.length)throw new ProposalError('No verified deposit receipt is available yet.',409);
  if(body.action==='pdf'||body.action==='receipt')return new Response(new Uint8Array(await proposalPdf(data.proposal,body.action==='receipt',data.recordedPaidCents,data.payments.map(row=>`${row.session_id} · ${row.payment_intent}`))),{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${data.proposal.number}${body.action==='receipt'?'-receipt':''}.pdf"`}});
  return NextResponse.json(data,{headers});
 }catch(error){return NextResponse.json({error:error instanceof ProposalError?error.message:'Could not load the proposal. Please retry or contact events@aviatorbrew.com.'},{status:error instanceof ProposalError?error.status:500,headers});}
}
