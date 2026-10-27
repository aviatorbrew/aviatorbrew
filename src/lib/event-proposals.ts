import {depositReminderEmail} from "@/lib/event-deposit-email";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { proposalPdf } from "@/lib/event-documents";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { withDatabase } from "@/lib/database";
import { getPrivateEventSettings } from "@/lib/private-event-settings";
import { activeEventBookingSql, eventRecordConflicts, proposalSnapshot, type ProposalSnapshot, easternToday, eventIsFuture } from "@/lib/event-booking";
import { eventDateLabel, money, parseEventPlan, timeLabel, type EventPlanDetails } from "@/lib/event-plan";
import { createDynamicCheckoutSession } from "@/lib/stripe";
import { publicSiteUrl } from "@/lib/site-url";
import { isMailConfigured } from "@/lib/mail";
import {sendEventMail as sendMail} from "@/lib/event-mail";
import { availableCatalog } from "@/lib/catering-catalog";

export class ProposalError extends Error { constructor(message: string, public status=400){super(message);} }
export type EventProposal = { id:string; plan_id:string; version:number; number:string; plan_version:number; material_hash:string; termsCurrent?:boolean; snapshot:ProposalSnapshot; state:string; expires_at:string; approved_at:string|null; sent_at:string|null; accepted_at:string|null; accepted_name:string|null; acceptanceMethod?:'manual'|'customer'|null; manualAcceptanceNote?:string; created_at:string };
export type ProposalChangeRequest = {id:string;proposal_id:string;customer_name:string;message:string;requested_at:string;notification_status:string};
const iso=(v: unknown)=>v instanceof Date?v.toISOString():v as string;
function proposalRow(row: Record<string,unknown>,staff=false): EventProposal { const {token_hash,acceptance,approved_by,...safe}=row; void token_hash;void approved_by;const metadata=acceptance as Record<string,unknown>|null,manual=metadata?.method==='manual';return {...safe,acceptanceMethod:row.accepted_at?(manual?'manual':'customer'):null,...(staff&&manual?{manualAcceptanceNote:String(metadata?.note||'')}:{}),expires_at:iso(row.expires_at),approved_at:iso(row.approved_at),sent_at:iso(row.sent_at),accepted_at:iso(row.accepted_at),created_at:iso(row.created_at)} as EventProposal; }
function stable(value: unknown): unknown { if(Array.isArray(value))return value.map(stable); if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)])); return value; }
export function materialHash(details: EventPlanDetails) { const {paidCents,status,internalNotes,...terms}=details; void paidCents; void status; void internalNotes; return createHash("sha256").update(JSON.stringify(stable(terms))).digest("hex"); }
function tokenHash(token:string){if(!/^[a-f0-9]{64}$/.test(token))throw new ProposalError("This proposal link is invalid or expired.",404);return createHash("sha256").update(token).digest("hex");}
async function lockBookings(client:PoolClient){await client.query("SELECT pg_advisory_xact_lock(hashtext('aviator-private-event-booking'))");}
async function availability(client:PoolClient,planId:string,details:EventPlanDetails){
  if(!eventIsFuture(details))throw new ProposalError("This event date has passed. Ask the events team for a revised proposal.",409);
  const others=await client.query("SELECT id,data,calendar_sync FROM website.private_event_plans WHERE id<>$1 AND (event_date BETWEEN $2::date-1 AND $2::date+1 OR calendar_sync->'source'->>'date' BETWEEN ($2::date-1)::text AND ($2::date+1)::text) AND "+activeEventBookingSql,[planId,details.date]);
  if(others.rows.some(row=>eventRecordConflicts(details,row)))throw new ProposalError("The requested event time is no longer available. Please contact the events team.",409);
}
async function transaction<T>(work:(client:PoolClient)=>Promise<T>){return withDatabase(async client=>{await client.query("BEGIN");try{await lockBookings(client);const result=await work(client);await client.query("COMMIT");return result;}catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}});}
export async function closeUnpaidEventCheckouts(client:PoolClient,planId:string,exceptProposalId=""){
    const olderAttempts=(await client.query("SELECT a.* FROM website.private_event_checkout_attempts a JOIN website.private_event_proposals p ON p.id=a.proposal_id WHERE p.plan_id=$1 AND p.id<>$2 AND a.status IN ('creating','open') FOR UPDATE OF a",[planId,exceptProposalId])).rows;
    for(const attempt of olderAttempts){
      if(!attempt.session_id)throw new ProposalError("A previous checkout is still being verified. Resolve that attempt before issuing a different payable proposal.",409);
      const endpoint='https://api.stripe.com/v1/checkout/sessions/'+encodeURIComponent(attempt.session_id);
      let response=await fetch(endpoint,{headers:{authorization:'Bearer '+process.env.STRIPE_SECRET_KEY},cache:'no-store'});
      if(!response.ok)throw new ProposalError("Could not verify the previous checkout. A new deposit link has not been activated.",503);
      let session=await response.json();
      if(session.payment_status==='paid')throw new ProposalError("A previous deposit is awaiting its verified payment record. Retry after payment confirmation.",409);
      if(session.status==='open'){
        response=await fetch(endpoint+'/expire',{method:'POST',headers:{authorization:'Bearer '+process.env.STRIPE_SECRET_KEY}});
        if(!response.ok)throw new ProposalError("The previous checkout could not be closed safely. Verify its payment status before retrying.",409);
        session=await response.json();
      }
      if(session.status!=='expired')throw new ProposalError("The previous deposit attempt must be resolved before another payable proposal is sent.",409);
      await client.query("UPDATE website.private_event_checkout_attempts SET status='expired' WHERE id=$1",[attempt.id]);
    }

}
export type ProposalReview = {context:string;proposalId:string|null;availabilityApproved:boolean;capacityApproved:boolean;emailApproved:boolean};
function proposalReview(plan: {data:EventPlanDetails;proposal_review?:Record<string,unknown>}, latest?: {id:string;version:number;expires_at:unknown}):ProposalReview {
  const context=createHash('sha256').update(JSON.stringify(stable({terms:materialHash(plan.data),paidCents:plan.data.paidCents,closed:['Cancelled','Completed'].includes(plan.data.status)?plan.data.status:null,proposal:latest?{id:latest.id,version:latest.version,expiresAt:iso(latest.expires_at)}:null}))).digest('hex');
  const saved=plan.proposal_review?.context===context?plan.proposal_review:{};
  return {context,proposalId:latest?.id||null,availabilityApproved:saved.availabilityApproved===true,capacityApproved:saved.capacityApproved===true,emailApproved:saved.emailApproved===true};
}
async function currentProposalReview(client:PoolClient,planId:string,plan?:{data:EventPlanDetails;proposal_review?:Record<string,unknown>}) {
  plan ||= (await client.query('SELECT data,proposal_review FROM website.private_event_plans WHERE id=$1',[planId])).rows[0];
  if(!plan)throw new ProposalError('Event not found.',404);
  const latest=(await client.query('SELECT id,version,expires_at FROM website.private_event_proposals WHERE plan_id=$1 ORDER BY version DESC LIMIT 1',[planId])).rows[0];
  return proposalReview(plan,latest);
}
export async function saveProposalReview(planId:string,input:ProposalReview) {
  if(!input||typeof input.context!=='string'||['availabilityApproved','capacityApproved','emailApproved'].some(key=>typeof input[key as keyof ProposalReview]!=='boolean'))throw new ProposalError('Check the staff approval selections.');
  return transaction(async client=>{
    const plan=(await client.query('SELECT data,proposal_review FROM website.private_event_plans WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[planId])).rows[0];
    if(!plan)throw new ProposalError('Event not found.',404);
    const current=await currentProposalReview(client,planId,plan);
    if(current.context!==input.context)throw new ProposalError('The event or proposal changed. Refresh it and review the approvals again.',409);
    const review={...current,availabilityApproved:input.availabilityApproved,capacityApproved:input.capacityApproved,emailApproved:input.emailApproved};
    await client.query('UPDATE website.private_event_plans SET proposal_review=$1::jsonb WHERE id=$2',[JSON.stringify({...review,updatedAt:new Date().toISOString()}),planId]);
    return review;
  });
}
export async function requireSavedProposalReview(planId:string,proposalId:string,context:string,client?:PoolClient,plan?:{data:EventPlanDetails;proposal_review?:Record<string,unknown>}) {
  const check=async(connection:PoolClient)=>{
    const review=await currentProposalReview(connection,planId,plan);
    if(review.context!==context||review.proposalId!==proposalId||!review.emailApproved)throw new ProposalError('The event, proposal or staff approvals changed. Refresh and review the approvals before sending.',409);
  };
  return client?check(client):withDatabase(check);
}
export async function listProposals(planId:string){return withDatabase(async client=>{
  const plan=(await client.query('SELECT data FROM website.private_event_plans WHERE id=$1',[planId])).rows[0];
  if(!plan)throw new ProposalError('Event not found.',404);
  const currentHash=materialHash(plan.data);
  const proposals=(await client.query("SELECT * FROM website.private_event_proposals WHERE plan_id=$1 ORDER BY version DESC",[planId])).rows.map(row=>({...proposalRow(row,true),termsCurrent:row.material_hash===currentHash}));
  const deposits=(await client.query("SELECT session_id,payment_intent,proposal_id,amount_cents,paid_at FROM website.private_event_deposits WHERE plan_id=$1 ORDER BY paid_at",[planId])).rows;
  const deliveries=(await client.query("SELECT proposal_id,recipient,subject,status,updated_at FROM website.private_event_deliveries WHERE proposal_id IN (SELECT id FROM website.private_event_proposals WHERE plan_id=$1)",[planId])).rows;
  const attempts=(await client.query("SELECT proposal_id,status,expires_at,created_at FROM website.private_event_checkout_attempts WHERE proposal_id IN (SELECT id FROM website.private_event_proposals WHERE plan_id=$1) ORDER BY created_at DESC",[planId])).rows;
  const review=await currentProposalReview(client,planId);
  const changeRequests=(await client.query("SELECT r.id,r.proposal_id,r.customer_name,r.message,r.requested_at,d.status AS notification_status FROM website.private_event_proposal_changes r LEFT JOIN website.private_event_deliveries d ON d.key='proposal-change:'||r.id WHERE r.proposal_id IN (SELECT id FROM website.private_event_proposals WHERE plan_id=$1) ORDER BY r.requested_at DESC",[planId])).rows.map(r=>({...r,requested_at:iso(r.requested_at)}));
  const depositLinks=(await client.query("SELECT proposal_id,recipient,status,sent_at,created_at FROM website.private_event_deposit_links WHERE proposal_id IN (SELECT id FROM website.private_event_proposals WHERE plan_id=$1) ORDER BY created_at DESC",[planId])).rows.map(r=>({...r,sent_at:iso(r.sent_at),created_at:iso(r.created_at)}));
  return {proposals,deposits,deliveries,review,attempts,changeRequests,depositLinks};
});}
export async function getManagerProposal(planId:string,id:string){return withDatabase(async client=>{const row=(await client.query("SELECT * FROM website.private_event_proposals WHERE id=$1 AND plan_id=$2",[id,planId])).rows[0];return row?proposalRow(row,true):null;});}
export async function manuallyAcceptProposal(planId:string,id:string,input:{version:unknown;planVersion:unknown;name:unknown;note?:unknown;confirmed?:unknown}){
  const name=typeof input.name==='string'?input.name.trim():'',note=typeof input.note==='string'?input.note.trim():'';
  if(input.confirmed!==true||name.length<2||name.length>200||note.length>2000||(input.note!==undefined&&typeof input.note!=='string'))throw new ProposalError('Confirm the manual acceptance and enter the customer name (staff note up to 2,000 characters).');
  return transaction(async client=>{
    const plan=(await client.query('SELECT * FROM website.private_event_plans WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[planId])).rows[0];
    const p=(await client.query('SELECT * FROM website.private_event_proposals WHERE id=$1 AND plan_id=$2 FOR UPDATE',[id,planId])).rows[0];
    if(!plan||!p)throw new ProposalError('Proposal not found.',404);
    if(p.version!==input.version||plan.version!==input.planVersion||materialHash(plan.data)!==p.material_hash)throw new ProposalError('Save and reload the latest event and proposal before recording manual acceptance.',409);
    const latest=(await client.query('SELECT id FROM website.private_event_proposals WHERE plan_id=$1 ORDER BY version DESC LIMIT 1',[planId])).rows[0];
    if(latest.id!==id||['Cancelled','Completed'].includes(plan.status)||['superseded','cancelled','declined','changes_requested'].includes(p.state)||new Date(p.expires_at).getTime()<=Date.now())throw new ProposalError('Use a current proposal draft. Closed, expired or changed proposals cannot be manually accepted.',409);
    if(!p.snapshot.policyText?.trim()||!p.snapshot.policyVersion?.trim())throw new ProposalError('Create a revised proposal with the approved event policies before recording acceptance.',409);
    if(p.accepted_at){
      if(p.acceptance?.method==='manual'&&p.accepted_name===name&&p.acceptance.note===note)return proposalRow(p,true);
      throw new ProposalError('Acceptance is already recorded for this version and cannot be overwritten.',409);
    }
    const metadata={method:'manual',name,note,recordedBy:'manager-session',proposalVersion:p.version,policyVersion:p.snapshot.policyVersion};
    return proposalRow((await client.query("UPDATE website.private_event_proposals SET accepted_at=now(),accepted_name=$1,acceptance=$2::jsonb,state='accepted' WHERE id=$3 RETURNING *",[name,JSON.stringify(metadata),id])).rows[0],true);
  });
}
export async function deleteProposalDraft(planId:string,id:string,version:number){return transaction(async client=>{
  const p=(await client.query("SELECT * FROM website.private_event_proposals WHERE id=$1 AND plan_id=$2 FOR UPDATE",[id,planId])).rows[0];
  if(!p)throw new ProposalError("Proposal not found.",404);
  if(p.version!==version)throw new ProposalError("Refresh the proposal before deleting it.",409);
  if(p.sent_at||p.approved_at||p.accepted_at||p.token_hash||p.state!=='draft')throw new ProposalError("Sent, approved or retired proposals must be kept. Only unsent drafts can be deleted.",409);
  const used=(await client.query("SELECT EXISTS(SELECT 1 FROM website.private_event_checkout_attempts WHERE proposal_id=$1) OR EXISTS(SELECT 1 FROM website.private_event_deposits WHERE proposal_id=$1) OR EXISTS(SELECT 1 FROM website.private_event_deliveries WHERE proposal_id=$1) AS used",[id])).rows[0].used;
  if(used)throw new ProposalError("Proposals with payment or delivery history must be kept.",409);
  await client.query("DELETE FROM website.private_event_proposals WHERE id=$1",[id]);await client.query("UPDATE website.private_event_plans SET proposal_review='{}'::jsonb WHERE id=$1",[planId]);return {deleted:true};
});}
export async function createProposal(planId:string,input:{version:number;expiresAt:string}){
  const settings=await getPrivateEventSettings();
  const expires=new Date(input.expiresAt);
  if(!Number.isFinite(expires.getTime())||expires.getTime()<Date.now()+3600000||expires.getTime()>Date.now()+90*86400000)throw new ProposalError("Choose a proposal expiration between one hour and 90 days from now.");
  return transaction(async client=>{
    const plan=(await client.query("SELECT * FROM website.private_event_plans WHERE id=$1 FOR UPDATE",[planId])).rows[0];
    if(!plan)throw new ProposalError("Event not found.",404);
    if(plan.version!==input.version)throw new ProposalError("Save and reload the latest event revision before creating a proposal.",409);
    const details=parseEventPlan(plan.data,settings.catering);
    if(!details.contactName||!details.contactEmail||!details.startTime||!details.endTime)throw new ProposalError("Save the customer name, email, event date, and start/end times first.");
    if(details.status==="Cancelled"||details.status==="Completed")throw new ProposalError("This event cannot receive a new proposal.",409);
    const version=Number((await client.query("SELECT COALESCE(max(version),0)+1 AS version FROM website.private_event_proposals WHERE plan_id=$1",[planId])).rows[0].version);
    const id=randomUUID(),number=`AVI-${details.date.slice(0,4)}-${planId.slice(0,8).toUpperCase()}-${version}`;
    const snapshot=proposalSnapshot(details,settings.catering,settings.bookingFeeCents,settings.policyText,settings.policyVersion);
    await client.query("UPDATE website.private_event_plans SET proposal_review='{}'::jsonb WHERE id=$1",[planId]);
    const row=(await client.query("INSERT INTO website.private_event_proposals(id,plan_id,version,number,plan_version,material_hash,snapshot,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING *",[id,planId,version,number,plan.version,materialHash(details),JSON.stringify(snapshot),expires.toISOString()])).rows[0];
    return proposalRow(row);
  });
}
export async function sendProposal(planId:string,id:string,input:{availabilityApproved?:boolean;capacityApproved?:boolean;emailApproved?:boolean;reviewContext?:string}){
  if(input.emailApproved!==true)throw new ProposalError("Review and approve this customer email before sending.",403);
  if(!isMailConfigured()&&process.env.MAIL_MODE!=="record")throw new ProposalError("Email delivery is not configured.",503);
  if(!process.env.STRIPE_SECRET_KEY||!process.env.STRIPE_WEBHOOK_SECRET)throw new ProposalError("Stripe Checkout and verified webhooks must both be configured before sending payment proposals.",503);
  const token=randomBytes(32).toString("hex");
  const proposal=await transaction(async client=>{
    const p=(await client.query("SELECT * FROM website.private_event_proposals WHERE id=$1 AND plan_id=$2 FOR UPDATE",[id,planId])).rows[0];
    const plan=(await client.query("SELECT * FROM website.private_event_plans WHERE id=$1 FOR UPDATE",[planId])).rows[0];
    if(!p||!plan)throw new ProposalError("Proposal not found.",404);
    if(input.reviewContext!==undefined)await requireSavedProposalReview(planId,id,input.reviewContext,client,plan);
    if(['superseded','declined','cancelled','changes_requested'].includes(p.state)||new Date(p.expires_at).getTime()<=Date.now())throw new ProposalError("Create a revised proposal before sending a new link.",409);
    if(materialHash(plan.data)!==p.material_hash)throw new ProposalError("The event terms changed. Create a revised proposal.",409);
    const s=p.snapshot as ProposalSnapshot;
    if(!s.policyText.trim()||!s.policyVersion.trim())throw new ProposalError("Save approved cancellation, deposit/refund and event policies in Private Events settings, then create a new proposal. Acceptance and payment remain inactive.",409);
    if((s.details.flightPlan?.packageId&&s.details.guestCount<s.catalog.minimumGuests)||s.details.guestCount>s.catalog.maximumGuests)throw new ProposalError("The guest count is outside the configured venue capacity.");
    if(!["Draft","Tentative","Confirmed"].includes(plan.status))throw new ProposalError("This event is not available for booking.",409);
    await availability(client,planId,s.details);
    await closeUnpaidEventCheckouts(client,planId,id);

    await client.query("UPDATE website.private_event_proposals SET state='superseded',token_hash=NULL WHERE plan_id=$1 AND id<>$2 AND state NOT IN ('paid','paid_review','declined','cancelled','superseded')",[planId,id]);
    await client.query("UPDATE website.private_event_plans SET status=CASE WHEN status='Draft' THEN 'Tentative' ELSE status END,data=jsonb_set(data,'{status}',to_jsonb(CASE WHEN status='Draft' THEN 'Tentative' ELSE status END)),updated_at=now() WHERE id=$1",[planId]);
    return {...proposalRow((await client.query("UPDATE website.private_event_proposals SET token_hash=$1,approved_at=COALESCE(approved_at,now()),approved_by='manager-session',state=CASE WHEN accepted_at IS NULL THEN 'sent' ELSE state END WHERE id=$2 RETURNING *",[tokenHash(token),id])).rows[0]),recordedPaidCents:Number(plan.data.paidCents||0)};
  });
  const link=publicSiteUrl()+"/event-proposal#token="+token;
  const changeLink=publicSiteUrl()+"/event-proposal?view=changes#token="+token;
  const depositCovered=proposal.recordedPaidCents>=proposal.snapshot.depositCents;
  const expirationLabel=new Date(proposal.expires_at).toLocaleString("en-US",{timeZone:"America/New_York",dateStyle:"long",timeStyle:"short"})+" Eastern";
  const details=proposal.snapshot.details;
  const eventSchedule=`${eventDateLabel(details.date)} · ${timeLabel(details.startTime)}–${timeLabel(details.endTime)} Eastern`;
  const attachment=path.join(os.tmpdir(),'aviator-proposal-'+randomUUID()+'.pdf');
  let sent=false;
  try {
    await fs.writeFile(attachment,await proposalPdf(proposal));
    sent=await sendMail({to:proposal.snapshot.details.contactEmail,cc:"events@aviatorbrew.com",fromName:"Aviator Events",replyTo:"events@aviatorbrew.com",subject:`Review your Aviator event proposal ${proposal.number}`,attachments:[{filename:proposal.number+".pdf",path:attachment,contentType:"application/pdf"}],html:`<div style="font:16px/1.6 Arial,sans-serif;color:#172b3b"><h1 style="margin:0 0 8px">Your Aviator event proposal</h1><p style="margin:0 0 20px;font-size:18px;font-weight:700">${eventSchedule}</p><p>Review the quoted menu, prices and policies in proposal ${proposal.number}.</p><p><a href="${link}" style="display:inline-block;padding:12px 18px;background:#efb45f;color:#102b3e">${depositCovered?"Review & Approve Proposal":"Review Your Aviator Event Proposal"}</a> <a href="${changeLink}" style="display:inline-block;padding:12px 18px;border:1px solid #465d70;color:#102b3e">Request a Change</a></p><p>${depositCovered?`Your deposit is already paid. ${money(proposal.recordedPaidCents)} is credited toward your event. No additional deposit payment is required to approve this proposal.`:"Review the complete proposal, then accept it and pay the required deposit through secure checkout."}</p><p><strong>Proposal expires:</strong> ${expirationLabel}. Please approve the quoted details${depositCovered?"":" and complete the required deposit"} before this deadline.</p><p>The attached PDF is an optional printable copy. Use the secure links to approve the proposal or send the events team a change request. Requested changes require a revised proposal. Booking remains subject to staff approval, availability and the required deposit.</p><p>Questions? Reply to events@aviatorbrew.com.</p></div>`,text:["Review Your Aviator Event Proposal",eventSchedule,proposal.number,link,depositCovered?`APPROVE PROPOSAL: Your deposit is already paid (${money(proposal.recordedPaidCents)} credit). No additional deposit payment is required. Review the exact menu, prices and policies, then approve this proposal.`:"Review the exact menu, prices and event policies, then accept and pay the required deposit through Stripe.","Request a Change",changeLink,`Proposal expires: ${expirationLabel}`,"Your event is confirmed only after approved availability and verified deposit payment.","Questions? events@aviatorbrew.com"].join("\n")});
  }finally{await fs.unlink(attachment).catch(()=>undefined);}
  if(!sent)throw new ProposalError("The proposal was approved, but email was not delivered. Use Resend proposal link to retry.",503);
  await withDatabase(client=>client.query("UPDATE website.private_event_proposals SET sent_at=now() WHERE id=$1",[id]));
  return {sent:true,proposalId:id};
}
export async function sendDepositLink(planId:string,id:string,input:{emailApproved?:boolean;reviewContext?:string;requestId?:string}){
  if(input.emailApproved!==true)throw new ProposalError("Review and approve this customer email before sending.",403);
  if(typeof input.reviewContext!=='string'||typeof input.requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.requestId))throw new ProposalError("Refresh the event and confirm the deposit email before sending.",409);
  if(!isMailConfigured()&&process.env.MAIL_MODE!=="record")throw new ProposalError("Email delivery is not configured.",503);
  if(!process.env.STRIPE_SECRET_KEY||!process.env.STRIPE_WEBHOOK_SECRET)throw new ProposalError("Stripe Checkout and verified webhooks must both be configured before sending payment links.",503);
  const token=randomBytes(32).toString('hex');
  const result=await transaction(async client=>{
    const p=(await client.query('SELECT * FROM website.private_event_proposals WHERE id=$1 AND plan_id=$2 FOR UPDATE',[id,planId])).rows[0];
    const plan=(await client.query('SELECT * FROM website.private_event_plans WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[planId])).rows[0];
    if(!p||!plan)throw new ProposalError('Proposal not found.',404);
    await requireSavedProposalReview(planId,id,input.reviewContext!,client,plan);
    if(!p.sent_at||!p.approved_at)throw new ProposalError('Approve and send the proposal before resending a deposit link.',409);
    if(['superseded','declined','cancelled','changes_requested'].includes(p.state)||new Date(p.expires_at).getTime()<=Date.now())throw new ProposalError('Use a current, unexpired proposal before sending a deposit link.',409);
    if(materialHash(plan.data)!==p.material_hash)throw new ProposalError('The event terms changed. Create and send a revised proposal first.',409);
    const snapshot=p.snapshot as ProposalSnapshot;
    if(!snapshot.policyText.trim()||!snapshot.policyVersion.trim())throw new ProposalError('Create a proposal with the approved event policies.',409);
    if((snapshot.details.flightPlan?.packageId&&snapshot.details.guestCount<snapshot.catalog.minimumGuests)||snapshot.details.guestCount>snapshot.catalog.maximumGuests)throw new ProposalError('The guest count is outside the configured venue capacity.');
    if(!['Tentative','Confirmed'].includes(plan.status))throw new ProposalError('This event cannot receive a deposit link.',409);
    const ledger=Number((await client.query('SELECT COALESCE(sum(amount_cents),0)::int AS paid FROM website.private_event_deposits WHERE plan_id=$1',[planId])).rows[0].paid);
    const due=Math.max(0,snapshot.depositCents-Math.max(Number(plan.data.paidCents||0),ledger));
    if(!due)throw new ProposalError('The required deposit is already paid. No deposit reminder was sent.',409);
    await availability(client,planId,snapshot.details);
    const existing=(await client.query('SELECT * FROM website.private_event_deposit_links WHERE id=$1',[input.requestId])).rows[0];
    if(existing){if(existing.proposal_id!==id)throw new ProposalError('This send reference belongs to a different proposal.',409);if(existing.status==='sent')return {alreadySent:true,proposal:proposalRow(p),due};throw new ProposalError('This email attempt is already pending or needs delivery verification. Refresh before sending again.',409);}
    await closeUnpaidEventCheckouts(client,planId,id);
    await client.query("INSERT INTO website.private_event_deposit_links(id,proposal_id,token_hash,expires_at,recipient) VALUES($1,$2,$3,$4,$5)",[input.requestId,id,tokenHash(token),p.expires_at,snapshot.details.contactEmail]);
    return {alreadySent:false,proposal:proposalRow(p),due};
  });
  if(result.alreadySent)return {sent:true,alreadySent:true,proposalId:id};
  const link=publicSiteUrl()+'/event-proposal?view=deposit#token='+token;
  let sent=false;
  try{sent=await sendMail({to:result.proposal.snapshot.details.contactEmail,fromName:'Aviator Events',replyTo:'events@aviatorbrew.com',...depositReminderEmail(result.proposal,link,result.due)});}
  catch{await withDatabase(c=>c.query("UPDATE website.private_event_deposit_links SET status='unknown' WHERE id=$1",[input.requestId]));throw new ProposalError('Deposit email delivery could not be verified. Refresh its status before sending again.',503);}
  await withDatabase(c=>c.query("UPDATE website.private_event_deposit_links SET status=$2,sent_at=CASE WHEN $2='sent' THEN now() ELSE NULL END WHERE id=$1",[input.requestId,sent?'sent':'failed']));
  if(!sent)throw new ProposalError('The deposit email was not delivered. Review its status before sending again.',503);
  return {sent:true,proposalId:id};
}
async function accessRow(client:PoolClient,token:string,lock=false){
  const p=(await client.query("SELECT p.* FROM website.private_event_proposals p WHERE p.token_hash=$1 OR (p.state NOT IN ('superseded','declined','cancelled') AND EXISTS(SELECT 1 FROM website.private_event_deposit_links l WHERE l.proposal_id=p.id AND l.token_hash=$1 AND l.expires_at>now()))"+(lock?" FOR UPDATE":""),[tokenHash(token)])).rows[0];
  if(!p||new Date(p.expires_at).getTime()<=Date.now())throw new ProposalError("This proposal link is invalid or expired. Please contact events@aviatorbrew.com for a new proposal.",410);
  return proposalRow(p);
}
export async function requestProposalChange(token:string,input:{requestId:unknown;proposalVersion:unknown;name:unknown;message:unknown;userAgent?:string;ip?:string}){
  const name=typeof input.name==='string'?input.name.trim():'',message=typeof input.message==='string'?input.message.trim():'';
  if(typeof input.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestId)||name.length<2||name.length>200||!message||message.length>3000)throw new ProposalError('Enter your name and the changes you would like (up to 3,000 characters).');
  const result=await transaction(async client=>{
    const p=await accessRow(client,token,true),plan=(await client.query('SELECT data,status FROM website.private_event_plans WHERE id=$1 FOR UPDATE',[p.plan_id])).rows[0];
    if(input.proposalVersion!==p.version||!p.approved_at||!plan||materialHash(plan.data)!==p.material_hash||!['Tentative','Confirmed'].includes(plan.status)||['superseded','declined','cancelled'].includes(p.state))throw new ProposalError('Open the latest approved proposal before requesting changes.',409);
    const previous=(await client.query('SELECT id,customer_name,message FROM website.private_event_proposal_changes WHERE proposal_id=$1 AND request_id=$2',[p.id,input.requestId])).rows[0];
    if(previous){if(previous.customer_name!==name||previous.message!==message)throw new ProposalError('This request was already used. Start a new change request.',409);return {proposalId:p.id,requestId:previous.id};}
    const count=Number((await client.query('SELECT count(*)::int AS count FROM website.private_event_proposal_changes WHERE proposal_id=$1',[p.id])).rows[0].count);
    if(count>=20)throw new ProposalError('Please contact events@aviatorbrew.com for further changes to this proposal.',429);
    const id=randomUUID();
    await client.query('INSERT INTO website.private_event_proposal_changes(id,proposal_id,request_id,customer_name,message,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[id,p.id,input.requestId,name,message,JSON.stringify({proposalVersion:p.version,userAgent:(input.userAgent||'').slice(0,500),ipHash:input.ip?createHash('sha256').update(input.ip).digest('hex'):null})]);
    await client.query("UPDATE website.private_event_proposals SET state='changes_requested' WHERE id=$1",[p.id]);
    await client.query("UPDATE website.private_event_plans SET proposal_review='{}'::jsonb WHERE id=$1",[p.plan_id]);
    const d=p.snapshot.details,text=[`Customer requested changes to ${p.number} (proposal v.${p.version}).`,d.title,eventDateLabel(d.date)+' '+timeLabel(d.startTime)+'–'+timeLabel(d.endTime),`From: ${name} <${d.contactEmail}>`,'Requested changes:',message,'Review in Manager Portal:',publicSiteUrl()+'/manager/private-events?event='+encodeURIComponent(p.plan_id),'Existing payment credits, event details and prior acceptance records were preserved. Review the request and send a revised proposal for customer approval.'].join('\n\n');
    await client.query('INSERT INTO website.private_event_deliveries(key,proposal_id,recipient,subject,message) VALUES($1,$2,$3,$4,$5)',['proposal-change:'+id,p.id,'events@aviatorbrew.com','Changes requested: '+p.number,text]);
    return {proposalId:p.id,requestId:id};
  });
  const notified=await deliverProposalMessages(result.proposalId,'proposal-change:'+result.requestId).catch(()=>false);
  return {requested:true,requestId:result.requestId,notified};
}
export async function customerProposal(token:string){return withDatabase(async client=>{
  const p=await accessRow(client,token),plan=(await client.query("SELECT data,status FROM website.private_event_plans WHERE id=$1",[p.plan_id])).rows[0];
  const payments=(await client.query("SELECT amount_cents,session_id,payment_intent,paid_at FROM website.private_event_deposits WHERE plan_id=$1 ORDER BY paid_at",[p.plan_id])).rows;
  const current=plan&&materialHash(plan.data)===p.material_hash&&!['Cancelled','Completed'].includes(plan.status)&&!['superseded','cancelled','declined'].includes(p.state);
  const lastAttempt=(await client.query("SELECT status FROM website.private_event_checkout_attempts WHERE proposal_id=$1 ORDER BY created_at DESC LIMIT 1",[p.id])).rows[0];
  const status=plan?.status==='Cancelled'?'Canceled':plan?.status==='Completed'?'Completed':!current?'Revised proposal required':p.state==='changes_requested'?'Changes requested — awaiting revised proposal':p.state==='paid_review'?'Deposit paid — staff review required':!p.approved_at?'Under Review':p.accepted_at&&plan?.status==='Confirmed'?'Confirmed':p.accepted_at?(lastAttempt?.status==='failed'?'Payment Failed / Pending':'Awaiting Deposit'):p.sent_at?'Proposal Sent':'Under Review';
  return {proposal:{...p,snapshot:{...p.snapshot,catalog:availableCatalog(p.snapshot.catalog)}},status,canAccept:Boolean(current&&p.approved_at&&p.snapshot.policyText&&p.snapshot.policyVersion&&p.state!=='changes_requested'),canRequestChanges:Boolean(current&&p.approved_at&&['Tentative','Confirmed'].includes(plan.status)),changeRequests:(await client.query('SELECT id,customer_name,message,requested_at FROM website.private_event_proposal_changes WHERE proposal_id=$1 ORDER BY requested_at DESC',[p.id])).rows.map(r=>({...r,requested_at:iso(r.requested_at)})),payments,recordedPaidCents:Number(plan?.data.paidCents||0),remainingCents:p.snapshot.totals.total-Number(plan?.data.paidCents||0)};
});}
export async function acceptAndCheckout(token:string,input:{name:unknown;agreed:unknown;proposalVersion:unknown;policyVersion:unknown;userAgent?:string;ip?:string}){
  const name=typeof input.name==='string'?input.name.trim():'';
  if(name.length<2||name.length>200||input.agreed!==true)throw new ProposalError("Enter your name and agree to the event, deposit and cancellation policies.");
  if(!process.env.STRIPE_SECRET_KEY||!process.env.STRIPE_WEBHOOK_SECRET)throw new ProposalError("Deposit payment is not configured. Please contact the events team.",503);
  const data=await transaction(async client=>{
    const p=await accessRow(client,token,true),plan=(await client.query("SELECT * FROM website.private_event_plans WHERE id=$1 FOR UPDATE",[p.plan_id])).rows[0];
    if(!p.approved_at||!p.snapshot.policyText||!p.snapshot.policyVersion||input.proposalVersion!==p.version||input.policyVersion!==p.snapshot.policyVersion)throw new ProposalError("Review the latest approved proposal and its policies before accepting.",409);
    if(!plan||materialHash(plan.data)!==p.material_hash||!['Tentative','Confirmed'].includes(plan.status)||['superseded','cancelled','declined','changes_requested'].includes(p.state))throw new ProposalError("The event has changed. Please request a revised proposal.",409);
    await availability(client,p.plan_id,p.snapshot.details);
    if(p.accepted_at&&p.accepted_name!==name)throw new ProposalError('This proposal was already accepted under the recorded customer name.',409);
    if(!p.accepted_at)await client.query("UPDATE website.private_event_proposals SET accepted_at=now(),accepted_name=$1,acceptance=$2::jsonb,state='accepted' WHERE id=$3",[name,JSON.stringify({proposalVersion:p.version,policyVersion:p.snapshot.policyVersion,name,userAgent:(input.userAgent||'').slice(0,500),ipHash:input.ip?createHash('sha256').update(input.ip).digest('hex'):null}),p.id]);
    const ledgerPaid=Number((await client.query("SELECT COALESCE(sum(amount_cents),0)::int AS paid FROM website.private_event_deposits WHERE plan_id=$1",[p.plan_id])).rows[0].paid);
    const amount=Math.max(0,p.snapshot.depositCents-Math.max(Number(plan.data.paidCents||0),ledgerPaid));
    if(!amount){
      await client.query("UPDATE website.private_event_plans SET status='Confirmed',data=jsonb_set(data,'{status}','\"Confirmed\"'::jsonb),version=version+1,updated_at=now() WHERE id=$1",[p.plan_id]);
      await client.query("UPDATE website.private_event_proposals SET state='paid' WHERE id=$1",[p.id]);
      return {proposal:p,attempt:null};
    }
    let attempt=(await client.query("SELECT * FROM website.private_event_checkout_attempts WHERE proposal_id=$1 AND status IN ('creating','open') ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[p.id])).rows[0];
    if(attempt?.status==='open'&&new Date(attempt.expires_at).getTime()<=Date.now()){
      const response=await fetch('https://api.stripe.com/v1/checkout/sessions/'+encodeURIComponent(attempt.session_id),{headers:{authorization:'Bearer '+process.env.STRIPE_SECRET_KEY},cache:'no-store'});
      if(!response.ok)throw new ProposalError("We could not verify the previous payment attempt. Retry shortly; no additional checkout was created.",503);
      const session=await response.json();
      if(session.payment_status==='paid')throw new ProposalError("Your payment is awaiting verified confirmation. Please refresh shortly.",409);
      if(session.status!=='expired')return {proposal:p,attempt};
      await client.query("UPDATE website.private_event_checkout_attempts SET status='expired' WHERE id=$1",[attempt.id]);attempt=null;
    }
    if(!attempt){
      if(new Date(p.expires_at).getTime()<Date.now()+32*60000)throw new ProposalError("This proposal is close to expiration. Ask the events team for a renewed proposal.",409);
      attempt=(await client.query("INSERT INTO website.private_event_checkout_attempts(id,proposal_id,amount_cents,expires_at) VALUES($1,$2,$3,$4) RETURNING *",[randomUUID(),p.id,amount,new Date(Date.now()+31*60000)])).rows[0];
    }
    return {proposal:p,attempt};
  });
  if(!data.attempt)return {confirmed:true,url:null};
  if(data.attempt.checkout_url)return {url:data.attempt.checkout_url};
  const p=data.proposal,a=data.attempt;
  const session=await createDynamicCheckoutSession({name:`Aviator event deposit · ${p.number}`,description:"Deposit credited toward the event total. Booking requires Aviator approval and verified payment.",unitAmount:a.amount_cents,quantity:1,customerEmail:p.snapshot.details.contactEmail,referenceId:p.id,metadata:{item:'private-event-proposal',proposalId:p.id,attemptId:a.id},successPath:'/event-proposal?payment=success',cancelPath:'/event-proposal?payment=cancel',origin:publicSiteUrl(),idempotencyKey:'event-deposit-'+a.id,expiresAt:Math.floor(new Date(a.expires_at).getTime()/1000),cardOnly:true});
  if(!session)throw new ProposalError("Stripe Checkout is not configured.",503);
  await withDatabase(client=>client.query("UPDATE website.private_event_checkout_attempts SET session_id=$1,checkout_url=$2,status=CASE WHEN status='creating' THEN 'open' ELSE status END WHERE id=$3",[session.id,session.url,a.id]));
  return {url:session.url};
}
export type DepositSession={id:string;amount_total?:number|null;currency?:string|null;payment_status?:string;payment_intent?:string|{id?:string}|null;metadata?:Record<string,string>};
export async function processProposalPayment(session:DepositSession,eventId:string){
  const result=await transaction(async client=>{
    const a=(await client.query("SELECT * FROM website.private_event_checkout_attempts WHERE id=$1 FOR UPDATE",[session.metadata?.attemptId])).rows[0];
    const p=(await client.query("SELECT * FROM website.private_event_proposals WHERE id=$1 FOR UPDATE",[session.metadata?.proposalId])).rows[0];
    const intent=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id;
    if(!a||!p||a.proposal_id!==p.id||a.session_id&&a.session_id!==session.id||!p.accepted_at||session.amount_total!==a.amount_cents||session.currency!=='usd'||session.payment_status!=='paid'||!intent)throw new ProposalError("Deposit payment did not match an accepted proposal.",400);
    const plan=(await client.query("SELECT * FROM website.private_event_plans WHERE id=$1 FOR UPDATE",[p.plan_id])).rows[0];
    const inserted=await client.query("INSERT INTO website.private_event_deposits(session_id,payment_intent,proposal_id,plan_id,amount_cents,currency,stripe_event_id) VALUES($1,$2,$3,$4,$5,'usd',$6) ON CONFLICT DO NOTHING RETURNING session_id",[session.id,intent,p.id,p.plan_id,a.amount_cents,eventId]);
    await client.query("UPDATE website.private_event_checkout_attempts SET status='paid',session_id=$1 WHERE id=$2",[session.id,a.id]);
    if(!inserted.rowCount){
      const previous=(await client.query("SELECT * FROM website.private_event_deposits WHERE session_id=$1 OR payment_intent=$2",[session.id,intent])).rows[0];
      if(!previous||previous.session_id!==session.id||previous.proposal_id!==p.id||previous.amount_cents!==a.amount_cents)throw new ProposalError("This payment reference is already associated with another deposit.",400);
      return {proposalId:p.id};
    }
    const details=plan.data as EventPlanDetails;details.paidCents+=a.amount_cents;
    let confirmed=Boolean(p.approved_at&&new Date(p.expires_at).getTime()>Date.now()&&materialHash(details)===p.material_hash&&!['superseded','cancelled','declined','changes_requested'].includes(p.state)&&['Tentative','Confirmed'].includes(plan.status));
    if(confirmed){try{await availability(client,p.plan_id,details);}catch{confirmed=false;}}
    if(confirmed&&details.paidCents>=p.snapshot.depositCents)details.status='Confirmed';else confirmed=false;
    await client.query("UPDATE website.private_event_plans SET status=$1,data=$2::jsonb,version=version+1,updated_at=now() WHERE id=$3",[details.status,JSON.stringify(details),p.plan_id]);
    await client.query("UPDATE website.private_event_proposals SET state=CASE WHEN state='changes_requested' THEN state ELSE $1 END WHERE id=$2",[confirmed?'paid':'paid_review',p.id]);
    const s=p.snapshot as ProposalSnapshot;
    const text=[confirmed?'Your Aviator event is confirmed.':'Your deposit was received. The events team must review the current event details and availability before confirming the booking.',p.number,s.details.title,eventDateLabel(s.details.date)+' '+timeLabel(s.details.startTime)+'–'+timeLabel(s.details.endTime),s.details.location,`${s.details.guestCount} guests`,`Deposit received: ${money(a.amount_cents)}`,`Total payments recorded: ${money(details.paidCents)}`,`Estimated event total: ${money(s.totals.total)}`,`Estimated remaining balance: ${money(s.totals.total-details.paidCents)}`,s.exclusions,`Stripe receipt reference: ${session.id}`,`Payment reference: ${intent}`,'Questions? events@aviatorbrew.com'].join('\n');
    for(const recipient of [...new Set([s.details.contactEmail,...(process.env.PRIVATE_EVENT_PAYMENT_RECIPIENT_EMAIL&&process.env.PRIVATE_EVENT_PAYMENT_RECIPIENT_EMAIL.toLowerCase()!=='events@aviatorbrew.com'?[process.env.PRIVATE_EVENT_PAYMENT_RECIPIENT_EMAIL]:[])])])await client.query("INSERT INTO website.private_event_deliveries(key,proposal_id,recipient,subject,message) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",[session.id+':'+recipient,p.id,recipient,(confirmed?'Confirmed: ':'Deposit received — review required: ')+p.number,text]);
    return {proposalId:p.id};
  });
  return deliverProposalMessages(result.proposalId);
}
export async function markProposalAttempt(session:DepositSession,status:'expired'|'failed'){
  await withDatabase(client=>client.query("UPDATE website.private_event_checkout_attempts SET status=$1 WHERE session_id=$2 AND status<>'paid'",[status,session.id]));
}
export async function deliverProposalMessages(proposalId:string,onlyKey:string|null=null){
  const rows=await withDatabase(client=>client.query("SELECT * FROM website.private_event_deliveries WHERE proposal_id=$1 AND ($2::text IS NULL OR key=$2) AND (status IN ('pending','failed') OR (status='sending' AND updated_at<now()-interval '5 minutes'))",[proposalId,onlyKey]));
  let all=true;
  for(const row of rows.rows){
    const claimed=await withDatabase(client=>client.query("UPDATE website.private_event_deliveries SET status='sending',updated_at=now() WHERE key=$1 AND (status IN ('pending','failed') OR (status='sending' AND updated_at<now()-interval '5 minutes')) RETURNING key",[row.key]));
    if(!claimed.rowCount)continue;
    let sent=false;try{sent=await sendMail({to:row.recipient,subject:row.subject,text:row.message,replyTo:'events@aviatorbrew.com',fromName:'Aviator Events'});}catch{}
    await withDatabase(client=>client.query("UPDATE website.private_event_deliveries SET status=$1,updated_at=now() WHERE key=$2",[sent?'sent':'failed',row.key]));all&&=sent;
  }
  const pending=await withDatabase(client=>client.query("SELECT count(*)::int AS count FROM website.private_event_deliveries WHERE proposal_id=$1 AND ($2::text IS NULL OR key=$2) AND status<>'sent'",[proposalId,onlyKey]));
  return all&&pending.rows[0].count===0;
}
export async function declineProposal(token:string){return transaction(async client=>{const p=await accessRow(client,token,true);if(p.accepted_at)throw new ProposalError("Contact the events team to cancel or change an accepted proposal.",409);await client.query("UPDATE website.private_event_proposals SET state='declined',token_hash=NULL WHERE id=$1",[p.id]);return {declined:true};});}
