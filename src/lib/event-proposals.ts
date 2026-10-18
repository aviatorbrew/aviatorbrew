import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { proposalPdf } from "@/lib/event-documents";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { withDatabase } from "@/lib/database";
import { getPrivateEventSettings } from "@/lib/private-event-settings";
import { eventRecordConflicts, proposalSnapshot, type ProposalSnapshot, easternToday, eventIsFuture } from "@/lib/event-booking";
import { eventDateLabel, money, parseEventPlan, timeLabel, type EventPlanDetails } from "@/lib/event-plan";
import { createDynamicCheckoutSession } from "@/lib/stripe";
import { publicSiteUrl } from "@/lib/site-url";
import { sendMail, isMailConfigured } from "@/lib/mail";

export class ProposalError extends Error { constructor(message: string, public status=400){super(message);} }
export type EventProposal = { id:string; plan_id:string; version:number; number:string; plan_version:number; material_hash:string; snapshot:ProposalSnapshot; state:string; expires_at:string; approved_at:string|null; sent_at:string|null; accepted_at:string|null; accepted_name:string|null; created_at:string };
const iso=(v: unknown)=>v instanceof Date?v.toISOString():v as string;
function proposalRow(row: Record<string,unknown>): EventProposal { const {token_hash,acceptance,approved_by,...safe}=row; void token_hash;void acceptance;void approved_by;return {...safe,expires_at:iso(row.expires_at),approved_at:iso(row.approved_at),sent_at:iso(row.sent_at),accepted_at:iso(row.accepted_at),created_at:iso(row.created_at)} as EventProposal; }
function stable(value: unknown): unknown { if(Array.isArray(value))return value.map(stable); if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)])); return value; }
export function materialHash(details: EventPlanDetails) { const {paidCents,status,internalNotes,...terms}=details; void paidCents; void status; void internalNotes; return createHash("sha256").update(JSON.stringify(stable(terms))).digest("hex"); }
function tokenHash(token:string){if(!/^[a-f0-9]{64}$/.test(token))throw new ProposalError("This proposal link is invalid or expired.",404);return createHash("sha256").update(token).digest("hex");}
async function lockBookings(client:PoolClient){await client.query("SELECT pg_advisory_xact_lock(hashtext('aviator-private-event-booking'))");}
async function availability(client:PoolClient,planId:string,details:EventPlanDetails){
  if(!eventIsFuture(details))throw new ProposalError("This event date has passed. Ask the events team for a revised proposal.",409);
  const others=await client.query("SELECT id,data,calendar_sync FROM website.private_event_plans WHERE id<>$1 AND (event_date BETWEEN $2::date-1 AND $2::date+1 OR calendar_sync->'source'->>'date' BETWEEN ($2::date-1)::text AND ($2::date+1)::text) AND status IN ('Tentative','Confirmed')",[planId,details.date]);
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
export async function listProposals(planId:string){return withDatabase(async client=>{
  const proposals=(await client.query("SELECT * FROM website.private_event_proposals WHERE plan_id=$1 ORDER BY version DESC",[planId])).rows.map(proposalRow);
  const deposits=(await client.query("SELECT session_id,payment_intent,proposal_id,amount_cents,paid_at FROM website.private_event_deposits WHERE plan_id=$1 ORDER BY paid_at",[planId])).rows;
  const deliveries=(await client.query("SELECT recipient,subject,status,updated_at FROM website.private_event_deliveries WHERE proposal_id IN (SELECT id FROM website.private_event_proposals WHERE plan_id=$1)",[planId])).rows;
  return {proposals,deposits,deliveries};
});}
export async function getManagerProposal(planId:string,id:string){return withDatabase(async client=>{const row=(await client.query("SELECT * FROM website.private_event_proposals WHERE id=$1 AND plan_id=$2",[id,planId])).rows[0];return row?proposalRow(row):null;});}
export async function deleteProposalDraft(planId:string,id:string,version:number){return transaction(async client=>{
  const p=(await client.query("SELECT * FROM website.private_event_proposals WHERE id=$1 AND plan_id=$2 FOR UPDATE",[id,planId])).rows[0];
  if(!p)throw new ProposalError("Proposal not found.",404);
  if(p.version!==version)throw new ProposalError("Refresh the proposal before deleting it.",409);
  if(p.sent_at||p.approved_at||p.accepted_at||p.token_hash||p.state!=='draft')throw new ProposalError("Sent, approved or retired proposals must be kept. Only unsent drafts can be deleted.",409);
  const used=(await client.query("SELECT EXISTS(SELECT 1 FROM website.private_event_checkout_attempts WHERE proposal_id=$1) OR EXISTS(SELECT 1 FROM website.private_event_deposits WHERE proposal_id=$1) OR EXISTS(SELECT 1 FROM website.private_event_deliveries WHERE proposal_id=$1) AS used",[id])).rows[0].used;
  if(used)throw new ProposalError("Proposals with payment or delivery history must be kept.",409);
  await client.query("DELETE FROM website.private_event_proposals WHERE id=$1",[id]);return {deleted:true};
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
    const row=(await client.query("INSERT INTO website.private_event_proposals(id,plan_id,version,number,plan_version,material_hash,snapshot,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING *",[id,planId,version,number,plan.version,materialHash(details),JSON.stringify(snapshot),expires.toISOString()])).rows[0];
    return proposalRow(row);
  });
}
export async function sendProposal(planId:string,id:string,input:{availabilityApproved:boolean;capacityApproved:boolean;emailApproved?:boolean}){
  if(input.emailApproved!==true)throw new ProposalError("Review and approve this customer email before sending.",403);
  if(input.availabilityApproved!==true||input.capacityApproved!==true)throw new ProposalError("Confirm availability and capacity before approving and sending the proposal.");
  if(!isMailConfigured()&&process.env.MAIL_MODE!=="record")throw new ProposalError("Email delivery is not configured.",503);
  if(!process.env.STRIPE_SECRET_KEY||!process.env.STRIPE_WEBHOOK_SECRET)throw new ProposalError("Stripe Checkout and verified webhooks must both be configured before sending payment proposals.",503);
  const token=randomBytes(32).toString("hex");
  const proposal=await transaction(async client=>{
    const p=(await client.query("SELECT * FROM website.private_event_proposals WHERE id=$1 AND plan_id=$2 FOR UPDATE",[id,planId])).rows[0];
    const plan=(await client.query("SELECT * FROM website.private_event_plans WHERE id=$1 FOR UPDATE",[planId])).rows[0];
    if(!p||!plan)throw new ProposalError("Proposal not found.",404);
    if(p.state==="superseded"||p.state==="declined"||p.state==="cancelled"||new Date(p.expires_at).getTime()<=Date.now())throw new ProposalError("Create a revised proposal before sending a new link.",409);
    if(materialHash(plan.data)!==p.material_hash)throw new ProposalError("The event terms changed. Create a revised proposal.",409);
    const s=p.snapshot as ProposalSnapshot;
    if(!s.policyText.trim()||!s.policyVersion.trim())throw new ProposalError("Save approved cancellation, deposit/refund and event policies in Private Events settings, then create a new proposal. Acceptance and payment remain inactive.",409);
    if(s.details.guestCount<s.catalog.minimumGuests||s.details.guestCount>s.catalog.maximumGuests)throw new ProposalError("The guest count is outside the configured venue capacity.");
    if(!["Draft","Tentative","Confirmed"].includes(plan.status))throw new ProposalError("This event is not available for booking.",409);
    await availability(client,planId,s.details);
    await closeUnpaidEventCheckouts(client,planId,id);

    await client.query("UPDATE website.private_event_proposals SET state='superseded',token_hash=NULL WHERE plan_id=$1 AND id<>$2 AND state NOT IN ('paid','paid_review','declined','cancelled','superseded')",[planId,id]);
    await client.query("UPDATE website.private_event_plans SET status=CASE WHEN status='Draft' THEN 'Tentative' ELSE status END,data=jsonb_set(data,'{status}',to_jsonb(CASE WHEN status='Draft' THEN 'Tentative' ELSE status END)),updated_at=now() WHERE id=$1",[planId]);
    return proposalRow((await client.query("UPDATE website.private_event_proposals SET token_hash=$1,approved_at=COALESCE(approved_at,now()),approved_by='manager-session',state=CASE WHEN accepted_at IS NULL THEN 'sent' ELSE state END WHERE id=$2 RETURNING *",[tokenHash(token),id])).rows[0]);
  });
  const link=publicSiteUrl()+"/event-proposal#token="+token;
  const attachment=path.join(os.tmpdir(),'aviator-proposal-'+randomUUID()+'.pdf');
  let sent=false;
  try {
    await fs.writeFile(attachment,await proposalPdf(proposal));
    sent=await sendMail({to:proposal.snapshot.details.contactEmail,fromName:"Aviator Events",replyTo:"events@aviatorbrew.com",subject:`Review your Aviator event proposal ${proposal.number}`,attachments:[{filename:proposal.number+".pdf",path:attachment,contentType:"application/pdf"}],html:`<div style="font:16px/1.6 Arial,sans-serif;color:#172b3b"><img src="cid:aviator-logo" alt="Aviator Brewing Company" width="110"><h1>Your Aviator event proposal</h1><p>Review the quoted menu, prices and policies in proposal ${proposal.number}.</p><p><a href="${link}" style="display:inline-block;padding:12px 18px;background:#efb45f;color:#102b3e">Review Your Aviator Event Proposal</a></p><p>The attached PDF is an optional printable copy. Accept the proposal and pay the deposit using the secure link. Your booking requires staff approval, availability verification and the required deposit.</p><p>Questions? Reply to events@aviatorbrew.com.</p></div>`,text:["Review Your Aviator Event Proposal",proposal.number,link,`For ${eventDateLabel(proposal.snapshot.details.date)} at ${timeLabel(proposal.snapshot.details.startTime)}.`,"Review the exact menu, prices and event policies, then accept and pay the required deposit through Stripe.",`Link expires: ${proposal.expires_at}`,"Your event is confirmed only after approved availability and verified deposit payment.","Questions? events@aviatorbrew.com"].join("\n")});
  }finally{await fs.unlink(attachment).catch(()=>undefined);}
  if(!sent)throw new ProposalError("The proposal was approved, but email was not delivered. Use Resend proposal link to retry.",503);
  await withDatabase(client=>client.query("UPDATE website.private_event_proposals SET sent_at=now() WHERE id=$1",[id]));
  return {sent:true,proposalId:id};
}
async function accessRow(client:PoolClient,token:string,lock=false){
  const p=(await client.query("SELECT * FROM website.private_event_proposals WHERE token_hash=$1"+(lock?" FOR UPDATE":""),[tokenHash(token)])).rows[0];
  if(!p||new Date(p.expires_at).getTime()<=Date.now())throw new ProposalError("This proposal link is invalid or expired. Please contact events@aviatorbrew.com for a new proposal.",410);
  return proposalRow(p);
}
export async function customerProposal(token:string){return withDatabase(async client=>{
  const p=await accessRow(client,token),plan=(await client.query("SELECT data,status FROM website.private_event_plans WHERE id=$1",[p.plan_id])).rows[0];
  const payments=(await client.query("SELECT amount_cents,session_id,payment_intent,paid_at FROM website.private_event_deposits WHERE plan_id=$1 ORDER BY paid_at",[p.plan_id])).rows;
  const current=plan&&materialHash(plan.data)===p.material_hash&&!['Cancelled','Completed'].includes(plan.status)&&!['superseded','cancelled','declined'].includes(p.state);
  const lastAttempt=(await client.query("SELECT status FROM website.private_event_checkout_attempts WHERE proposal_id=$1 ORDER BY created_at DESC LIMIT 1",[p.id])).rows[0];
  const status=plan?.status==='Cancelled'?'Canceled':plan?.status==='Completed'?'Completed':!current?'Revised proposal required':p.state==='paid_review'?'Deposit paid — staff review required':!p.approved_at?'Under Review':p.accepted_at&&plan?.status==='Confirmed'?'Confirmed':p.accepted_at?(lastAttempt?.status==='failed'?'Payment Failed / Pending':'Awaiting Deposit'):p.sent_at?'Proposal Sent':'Under Review';
  return {proposal:p,status,canAccept:Boolean(current&&p.approved_at&&p.snapshot.policyText&&p.snapshot.policyVersion),payments,recordedPaidCents:Number(plan?.data.paidCents||0),remainingCents:p.snapshot.totals.total-Number(plan?.data.paidCents||0)};
});}
export async function acceptAndCheckout(token:string,input:{name:unknown;agreed:unknown;proposalVersion:unknown;policyVersion:unknown;userAgent?:string;ip?:string}){
  const name=typeof input.name==='string'?input.name.trim():'';
  if(name.length<2||name.length>200||input.agreed!==true)throw new ProposalError("Enter your name and agree to the event, deposit and cancellation policies.");
  if(!process.env.STRIPE_SECRET_KEY||!process.env.STRIPE_WEBHOOK_SECRET)throw new ProposalError("Deposit payment is not configured. Please contact the events team.",503);
  const data=await transaction(async client=>{
    const p=await accessRow(client,token,true),plan=(await client.query("SELECT * FROM website.private_event_plans WHERE id=$1 FOR UPDATE",[p.plan_id])).rows[0];
    if(!p.approved_at||!p.snapshot.policyText||!p.snapshot.policyVersion||input.proposalVersion!==p.version||input.policyVersion!==p.snapshot.policyVersion)throw new ProposalError("Review the latest approved proposal and its policies before accepting.",409);
    if(!plan||materialHash(plan.data)!==p.material_hash||!['Tentative','Confirmed'].includes(plan.status)||['superseded','cancelled','declined'].includes(p.state))throw new ProposalError("The event has changed. Please request a revised proposal.",409);
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
    let confirmed=Boolean(p.approved_at&&new Date(p.expires_at).getTime()>Date.now()&&materialHash(details)===p.material_hash&&!['superseded','cancelled','declined'].includes(p.state)&&['Tentative','Confirmed'].includes(plan.status));
    if(confirmed){try{await availability(client,p.plan_id,details);}catch{confirmed=false;}}
    if(confirmed&&details.paidCents>=p.snapshot.depositCents)details.status='Confirmed';else confirmed=false;
    await client.query("UPDATE website.private_event_plans SET status=$1,data=$2::jsonb,version=version+1,updated_at=now() WHERE id=$3",[details.status,JSON.stringify(details),p.plan_id]);
    await client.query("UPDATE website.private_event_proposals SET state=$1 WHERE id=$2",[confirmed?'paid':'paid_review',p.id]);
    const s=p.snapshot as ProposalSnapshot;
    const text=[confirmed?'Your Aviator event is confirmed.':'Your deposit was received. The events team must review the current event details and availability before confirming the booking.',p.number,s.details.title,eventDateLabel(s.details.date)+' '+timeLabel(s.details.startTime)+'–'+timeLabel(s.details.endTime),s.details.location,`${s.details.guestCount} guests`,`Deposit received: ${money(a.amount_cents)}`,`Total payments recorded: ${money(details.paidCents)}`,`Estimated event total: ${money(s.totals.total)}`,`Estimated remaining balance: ${money(s.totals.total-details.paidCents)}`,s.exclusions,`Stripe receipt reference: ${session.id}`,`Payment reference: ${intent}`,'Questions? events@aviatorbrew.com'].join('\n');
    for(const recipient of [s.details.contactEmail,process.env.PRIVATE_EVENT_PAYMENT_RECIPIENT_EMAIL||'events@aviatorbrew.com'])await client.query("INSERT INTO website.private_event_deliveries(key,proposal_id,recipient,subject,message) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",[session.id+':'+recipient,p.id,recipient,(confirmed?'Confirmed: ':'Deposit received — review required: ')+p.number,text]);
    return {proposalId:p.id};
  });
  return deliverProposalMessages(result.proposalId);
}
export async function markProposalAttempt(session:DepositSession,status:'expired'|'failed'){
  await withDatabase(client=>client.query("UPDATE website.private_event_checkout_attempts SET status=$1 WHERE session_id=$2 AND status<>'paid'",[status,session.id]));
}
export async function deliverProposalMessages(proposalId:string){
  const rows=await withDatabase(client=>client.query("SELECT * FROM website.private_event_deliveries WHERE proposal_id=$1 AND (status IN ('pending','failed') OR (status='sending' AND updated_at<now()-interval '5 minutes'))",[proposalId]));
  let all=true;
  for(const row of rows.rows){
    const claimed=await withDatabase(client=>client.query("UPDATE website.private_event_deliveries SET status='sending',updated_at=now() WHERE key=$1 AND (status IN ('pending','failed') OR (status='sending' AND updated_at<now()-interval '5 minutes')) RETURNING key",[row.key]));
    if(!claimed.rowCount)continue;
    let sent=false;try{sent=await sendMail({to:row.recipient,subject:row.subject,text:row.message,replyTo:'events@aviatorbrew.com',fromName:'Aviator Events'});}catch{}
    await withDatabase(client=>client.query("UPDATE website.private_event_deliveries SET status=$1,updated_at=now() WHERE key=$2",[sent?'sent':'failed',row.key]));all&&=sent;
  }
  const pending=await withDatabase(client=>client.query("SELECT count(*)::int AS count FROM website.private_event_deliveries WHERE proposal_id=$1 AND status<>'sent'",[proposalId]));
  return all&&pending.rows[0].count===0;
}
export async function declineProposal(token:string){return transaction(async client=>{const p=await accessRow(client,token,true);if(p.accepted_at)throw new ProposalError("Contact the events team to cancel or change an accepted proposal.",409);await client.query("UPDATE website.private_event_proposals SET state='declined',token_hash=NULL WHERE id=$1",[p.id]);return {declined:true};});}
