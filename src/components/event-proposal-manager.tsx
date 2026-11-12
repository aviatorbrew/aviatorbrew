"use client";
import { useEffect,useRef,useState,type ReactNode } from "react";
import {EventManualPaymentFields} from "@/components/event-manual-payment-fields";
import {eventPaymentSummary} from "@/lib/event-payments";
import { EventOrderFlow } from "@/components/event-order-flow";
import { revealEventEditorField } from "@/components/event-editor-section";
import { eventOrderFlow } from "@/lib/event-order-flow";
import { createPortal } from "react-dom";
import type { EventPlan } from "@/lib/event-plan";
import { money, eventDateLabel, timeLabel } from "@/lib/event-plan";
import type { EventProposal, ProposalReview, ProposalChangeRequest } from "@/lib/event-proposals";
import { getManagerJson, readManagerResponse } from "@/lib/manager-fetch";
import { proposalStatus } from "@/lib/event-proposal-status";
import { eventProposalProgress } from "@/lib/event-proposal-progress";
type Ledger={session_id:string;payment_intent:string;proposal_id:string;amount_cents:number;paid_at:string};
type DepositAttempt={proposal_id:string;status:string;expires_at:string;created_at:string};
type SendFeedback={id:string;kind:'sending'|'success'|'error';text:string;purpose?:'proposal'|'deposit'};
type DepositLink={proposal_id:string;recipient:string;status:string;sent_at:string|null;created_at:string};
type DraftFeedback={kind:'creating'|'success'|'error';text:string;proposalId?:string};
function eventTimestamp(value:string){return new Date(value).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'})+' Eastern';}
function SendConfirmation({proposal,onCancel,onConfirm,purpose='proposal',depositDueCents,emailNote,onEmailNoteChange,emailApproved,reviewSaving,approvalError,onApprovalChange,base,retryRecipients}:{proposal:EventProposal;onCancel:()=>void;onConfirm:(recipientEmail?:string,emailNote?:string)=>void;purpose?:'proposal'|'deposit'|'retry';depositDueCents:number;emailNote:string;onEmailNoteChange:(note:string)=>void;emailApproved:boolean;reviewSaving:boolean;approvalError:string;onApprovalChange:(approved:boolean)=>void;base:string;retryRecipients:string[]}){
 const dialog=useRef<HTMLDialogElement>(null),recipientInput=useRef<HTMLInputElement>(null),details=proposal.snapshot.details;
 const [staffCopy,setStaffCopy]=useState(false),[staffEmail,setStaffEmail]=useState('');
 useEffect(()=>{const element=dialog.current;const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;element?.showModal();return()=>{element?.close();previous?.focus({preventScroll:true});};},[]);
 return createPortal(<dialog ref={dialog} className="proposal-send-dialog" aria-labelledby="proposal-send-title" aria-describedby="proposal-send-description" onCancel={e=>{e.preventDefault();onCancel();}}>
  <h2 id="proposal-send-title">{purpose==='deposit'?'Confirm deposit payment email':purpose==='retry'?'Confirm email retry':'Confirm proposal email'}</h2>
  <p id="proposal-send-description">{purpose==='deposit'?'Review the recipient and deposit amount.':purpose==='retry'?'Retry undelivered notifications. Already sent messages are skipped.':'Review the proposal, add an optional note, then send.'}</p>
  <dl><dt>{purpose==='retry'?'Retry delivery to':'Send to'}</dt><dd>{purpose==='retry'?retryRecipients.join(', '):staffCopy?staffEmail||"Enter staff address below":details.contactEmail}</dd><dt>Copy to</dt><dd>events@aviatorbrew.com</dd><dt>Customer</dt><dd>{details.contactName}</dd><dt>Event</dt><dd>{details.title}</dd><dt>Date and time</dt><dd>{eventDateLabel(details.date)} · {timeLabel(details.startTime)}–{timeLabel(details.endTime)} Eastern</dd><dt>Guests</dt><dd>{details.guestCount}</dd><dt>Proposal total</dt><dd>{money(proposal.snapshot.totals.total)}</dd>{purpose==='deposit'?<><dt>Deposit due now</dt><dd><strong>{money(depositDueCents)}</strong></dd></>:null}<dt>Link expires</dt><dd>{eventTimestamp(proposal.expires_at)}</dd></dl>
  <a href={base+'/'+proposal.id} target="_blank" rel="noreferrer">Preview proposal PDF · {proposal.number}</a>
  {purpose==='deposit'?<div><label className="event-check"><input type="checkbox" checked={staffCopy} onChange={e=>setStaffCopy(e.target.checked)}/>Send a staff copy instead of emailing the customer</label>{staffCopy?<label>Staff email address<input ref={recipientInput} type="email" required maxLength={254} pattern=".+@aviatorbrew[.]com" value={staffEmail} onChange={e=>setStaffEmail(e.target.value.toLowerCase())} placeholder="name@aviatorbrew.com"/></label>:null}</div>:null}
  {purpose==='proposal'?<div className="proposal-email-note"><label htmlFor="proposal-email-note">Note to include in proposal email (optional)</label><textarea id="proposal-email-note" rows={4} maxLength={2000} value={emailNote} onChange={e=>onEmailNoteChange(e.target.value)} aria-describedby="proposal-email-note-help" placeholder="Add a personal message for the customer…"/><p id="proposal-email-note-help">Your message appears above the proposal link. {emailNote.length.toLocaleString()} / 2,000 characters.</p>{emailNote.trim()?<section className="proposal-email-note-preview" aria-label="Email note preview"><strong>Email note preview</strong><p>{emailNote.trim()}</p></section>:null}</div>:null}
  <p>{purpose==='deposit'?'Includes a secure deposit payment link.':purpose==='retry'?'This retries the failed notifications listed above.':'Includes the proposal PDF and secure approval/payment link.'}</p>
  <label className="event-check proposal-email-approval"><input type="checkbox" checked={emailApproved} disabled={reviewSaving} onChange={e=>onApprovalChange(e.target.checked)}/>I approve sending this email.</label>
  {reviewSaving?<p role="status">Saving approval…</p>:null}{approvalError?<p role="alert">{approvalError}</p>:null}
  <div className="proposal-send-dialog-actions"><button type="button" autoFocus onClick={onCancel}>Cancel — do not send</button><button type="button" disabled={!emailApproved||reviewSaving} onClick={()=>{if(!emailApproved||reviewSaving||staffCopy&&!recipientInput.current?.reportValidity())return;onConfirm(staffCopy?staffEmail.trim():undefined,purpose==='proposal'?emailNote.trim():undefined);}}>{purpose==='deposit'?'Confirm & email deposit link':purpose==='retry'?'Confirm & retry delivery':'Confirm & send email'}</button></div>
 </dialog>,document.body);
}
function ManualAcceptanceConfirmation({proposal,onCancel,onConfirm}:{proposal:EventProposal;onCancel:()=>void;onConfirm:(name:string,note:string)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[name,setName]=useState(proposal.snapshot.details.contactName),[note,setNote]=useState('');
 useEffect(()=>{const element=dialog.current,previous=document.activeElement instanceof HTMLElement?document.activeElement:null;element?.showModal();return()=>{element?.close();previous?.focus({preventScroll:true});};},[]);
 return createPortal(<dialog ref={dialog} className="proposal-send-dialog" aria-labelledby="manual-accept-title" aria-describedby="manual-accept-description" onCancel={e=>{e.preventDefault();onCancel();}}><form onSubmit={e=>{e.preventDefault();onConfirm(name,note);}}><h2 id="manual-accept-title">Record manual customer acceptance</h2><p id="manual-accept-description">Confirm that the customer accepted {proposal.number} · v.{proposal.version}, including its quoted menu, prices and policy version {proposal.snapshot.policyVersion}.</p><p>This records acceptance received by phone, in person or outside the website. If the current proposal was successfully emailed, the event is confirmed after availability checks. No email or payment is sent by this action.</p><label>Customer name<input autoFocus required minLength={2} maxLength={200} value={name} onChange={e=>setName(e.target.value)}/></label><label>Staff note (optional)<textarea rows={3} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} placeholder="For example: accepted by phone; coordinator initials."/></label><div className="proposal-send-dialog-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="submit">Confirm Manual Acceptance</button></div></form></dialog>,document.body);
}
function ProposalActivity({proposal,plan,deposits,attempts,depositLinks}:{proposal:EventProposal;plan:EventPlan;deposits:Ledger[];attempts:DepositAttempt[];depositLinks:DepositLink[]}){
 const payments=deposits.filter(d=>d.proposal_id===proposal.id),stripeTotal=deposits.reduce((sum,d)=>sum+d.amount_cents,0),paid=payments.reduce((sum,d)=>sum+d.amount_cents,0),manual=eventPaymentSummary(plan.details.paidCents,stripeTotal).manualCents,lastAttempt=attempts.find(a=>a.proposal_id===proposal.id),pending=lastAttempt&&(['creating','open'].includes(lastAttempt.status)&&new Date(lastAttempt.expires_at).getTime()>Date.now()||lastAttempt.status==='paid');
 const reminder=depositLinks.find(l=>l.proposal_id===proposal.id);
 return <div className="event-proposal-activity">{reminder?<p><strong>Deposit link email:</strong> {reminder.status==='sent'&&reminder.sent_at?<>Email sent · <time dateTime={reminder.sent_at}>{eventTimestamp(reminder.sent_at)}</time> · {reminder.recipient} · copied to events@aviatorbrew.com</>:reminder.status==='sending'?'Sending — delivery is not yet confirmed.':reminder.status==='unknown'?'Delivery unverified — check before sending another reminder.':'Not delivered — review before resending.'}</p>:null}<p><strong>Proposal email:</strong> {proposal.sent_at?<span className="event-proposal-paid">Email sent · <time dateTime={proposal.sent_at}>{eventTimestamp(proposal.sent_at)}</time> · {proposal.snapshot.details.contactEmail}</span>:<>Not sent — no successful send recorded.</>}</p>
 {paid?<><p className="event-proposal-paid"><strong>Paid via Stripe:</strong> {money(paid)} deposit credited toward the event total.{proposal.state==='paid_review'?' Booking still needs staff review.':''}</p>{payments.map(payment=><p key={payment.session_id}>Payment received · <time dateTime={payment.paid_at}>{eventTimestamp(payment.paid_at)}</time> · {money(payment.amount_cents)}</p>)}<details><summary>Stripe payment references</summary>{payments.map(payment=><p key={payment.session_id}>Checkout: {payment.session_id}<br/>Payment: {payment.payment_intent}</p>)}</details></>:stripeTotal?<p className="event-proposal-paid"><strong>Stripe deposit already paid:</strong> {money(stripeTotal)} on another proposal version; this credit applies to the event.</p>:manual?null:<p className="event-proposal-unpaid"><strong>{pending?'Payment pending — not paid:':'Not paid:'}</strong> {pending?'Awaiting verified Stripe payment confirmation.':lastAttempt?.status==='failed'?'The last payment attempt failed. The customer can retry through the secure proposal link.':lastAttempt?.status==='expired'?'The last checkout expired without payment.':proposal.accepted_at?'Proposal accepted; awaiting the deposit.':'No verified deposit payment recorded.'}</p>}
 {manual>0?<p className="event-proposal-paid"><strong>Manual payments received:</strong> {money(manual)} credited toward this event.</p>:null}
 {(paid||stripeTotal||manual)?<p><strong>Estimated remaining event balance:</strong> {money(proposal.snapshot.totals.total-Math.max(plan.details.paidCents,stripeTotal))}</p>:null}</div>;
}

function ProposalHistory({proposals,plan,deposits,attempts,depositLinks,changeRequests,busy,onDeleteDraft}:{busy:boolean;onDeleteDraft:(proposal:EventProposal)=>void;proposals:EventProposal[];plan:EventPlan;deposits:Ledger[];attempts:DepositAttempt[];depositLinks:DepositLink[];changeRequests:ProposalChangeRequest[]}){
 if(!proposals.length)return null;
 return <details className="event-proposal-history"><summary><strong>Previous proposals ({proposals.length})</strong><span>Superseded and earlier versions · View history</span></summary><div className="event-proposal-history-list">{proposals.map(p=>{const status=proposalStatus(p);return <details className="event-proposal-history-item" key={p.id}><summary><strong>{p.number} · v.{p.version}</strong><span className={`proposal-status-badge is-${status.tone}`}>{status.label}</span><span>{p.accepted_at?(p.acceptanceMethod==='manual'?'Accepted manually':'Customer accepted'):p.sent_at?'Emailed · no acceptance':'Never emailed'}</span></summary><div className="event-proposal-history-record"><p><strong>Customer:</strong> {p.snapshot.details.contactName} · {p.snapshot.details.contactEmail}</p><p>Created {eventTimestamp(p.created_at)} · quoted total {money(p.snapshot.totals.total)}</p>{p.accepted_at?<p><strong>Acceptance for v.{p.version}:</strong> {p.accepted_name} · {eventTimestamp(p.accepted_at)} · policy {p.snapshot.policyVersion}</p>:null}{p.manualAcceptanceNote?<p><strong>Staff acceptance note:</strong> {p.manualAcceptanceNote}</p>:null}<ProposalActivity proposal={p} plan={plan} deposits={deposits} attempts={attempts} depositLinks={depositLinks}/>{changeRequests.filter(r=>r.proposal_id===p.id).map(r=><section className="event-proposal-change-request" key={r.id}><h5>Customer requested changes · v.{p.version}</h5><p>{r.customer_name} · {eventTimestamp(r.requested_at)}</p><p className="event-proposal-change-message">{r.message}</p><p>Events team notification: {r.notification_status==='sent'?'Email sent to events@aviatorbrew.com':r.notification_status==='failed'?'Delivery failed':'Pending delivery'}</p></section>)}<div className="event-row-actions">{!p.sent_at&&!p.approved_at&&!p.accepted_at&&p.state==="draft"?<button type="button" disabled={busy} onClick={()=>onDeleteDraft(p)}>Delete Draft</button>:null}</div><p>Earlier versions are retained. Proposal PDFs and receipts are available in Print orders &amp; receipts.</p></div></details>;})}</div></details>;
}
function ProposalDocuments({proposal,base,deposits}:{proposal:EventProposal;base:string;deposits:Ledger[]}){
 return <div className="event-proposal-documents"><strong>{proposal.number} · v.{proposal.version}</strong><div className="event-row-actions"><a href={base+'/'+proposal.id} target="_blank" rel="noreferrer">Preview / print PDF</a><a href={base+'/'+proposal.id+'?download=1'}>Download proposal</a>{deposits.some(d=>d.proposal_id===proposal.id)?<a href={base+'/'+proposal.id+'?receipt=1'} target="_blank" rel="noreferrer">Deposit receipt PDF</a>:null}</div></div>;
}

export function EventProposalManager({plan,dirty,onRefresh,eventActions,printActions,depositCents,workspaceTab,paymentEntry}:{paymentEntry?:{paidCents:number;disabled:boolean;onChange:(value:number)=>void};plan:EventPlan;dirty:boolean;onRefresh:()=>void;eventActions?:ReactNode;printActions?:ReactNode;depositCents:number;workspaceTab?:"details"|"menu"|"proposal"|"activity"}){
 const [proposals,setProposals]=useState<EventProposal[]>([]),[deposits,setDeposits]=useState<Ledger[]>([]),[attempts,setAttempts]=useState<DepositAttempt[]>([]),[deliveries,setDeliveries]=useState<Array<{proposal_id:string;recipient:string;subject:string;status:string}>>([]),[expires,setExpires]=useState(''),[review,setReview]=useState<ProposalReview|null>(null),[reviewSaving,setReviewSaving]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const loadSequence=useRef(0);
 const [loaded,setLoaded]=useState(false);
 const actionInFlight=useRef(false);
 const [confirmPurpose,setConfirmPurpose]=useState<'proposal'|'deposit'|'retry'>('proposal'),[depositLinks,setDepositLinks]=useState<DepositLink[]>([]);
 const [emailNote,setEmailNote]=useState(''),[approvalError,setApprovalError]=useState(''),[draftOpen,setDraftOpen]=useState(false);
 const expirationInput=useRef<HTMLInputElement>(null),activityHeading=useRef<HTMLHeadingElement>(null);
 const [confirmId,setConfirmId]=useState<string|null>(null),[sendFeedback,setSendFeedback]=useState<SendFeedback|null>(null);
 const [draftFeedback,setDraftFeedback]=useState<DraftFeedback|null>(null);
 const [changeRequests,setChangeRequests]=useState<ProposalChangeRequest[]>([]);
 const [manualId,setManualId]=useState<string|null>(null),[manualFeedback,setManualFeedback]=useState<{id:string;error:boolean;text:string}|null>(null);
 const emailApproved=!dirty&&Boolean(review?.emailApproved);
 const base=`/api/manager/event-plans/${encodeURIComponent(plan.id)}/proposals`;
 const missingDetails=[!plan.details.contactName.trim()?'contact name':'',!plan.details.contactEmail.trim()?'contact email':'',!plan.details.startTime?'start time':'',!plan.details.endTime?'end time':''].filter(Boolean);
 const draftHelp=dirty?'Save event changes before creating a proposal.':missingDetails.length?`Add ${missingDetails.join(', ')} in Event & contact info, then save the event before creating a proposal.`:['Cancelled','Completed'].includes(plan.details.status)?`This ${plan.details.status.toLowerCase()} event cannot receive a new proposal.`:'';
 const draftHelpId=`proposal-draft-help-${plan.id}`;
 async function load(){const sequence=++loadSequence.current;const b=await getManagerJson(base);if(sequence!==loadSequence.current)return;setProposals(b.proposals);setDeposits(b.deposits);setAttempts(b.attempts||[]);setDeliveries(b.deliveries||[]);setReview(b.review||null);setChangeRequests(b.changeRequests||[]);setDepositLinks(b.depositLinks||[]);setLoaded(true);}
 useEffect(()=>{setLoaded(false);setReview(null);setSendFeedback(null);setDraftFeedback(null);setConfirmId(null);setManualId(null);load().catch(e=>setMessage(e.message));return()=>{loadSequence.current++;};},[plan.id,plan.version]);
 useEffect(()=>{if(dirty)setDraftFeedback(null);},[dirty]);
 useEffect(()=>{setEmailNote('');setDraftOpen(false);setApprovalError('');},[plan.id,proposals[0]?.id]);
 useEffect(()=>{const date=new Date(Date.now()+14*86400000);setExpires(new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16));},[plan.id]);
 async function saveApproval(key:'availabilityApproved'|'capacityApproved'|'emailApproved',value:boolean){
  if(!review||busy||reviewSaving||dirty)return;const previous=review;setReview({...review,[key]:value});setReviewSaving(true);setApprovalError('');
  try{const body=await readManagerResponse(await fetch(base,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({...review,[key]:value})}));setReview(body.review);}
  catch(e){setReview(previous);setApprovalError(e instanceof Error?e.message:'Could not save email approval.');await load().catch(()=>setReview(null));}
  finally{setReviewSaving(false);}
 }
 async function action(id?:string,retry=false,deposit=false,recipientEmail?:string,note?:string){
  if(actionInFlight.current||reviewSaving)return;
  if(!id&&draftHelp){setDraftFeedback({kind:'error',text:draftHelp});return;}
  if(!id&&!expirationInput.current?.reportValidity())return;
  if(id&&!retry){const proposal=proposals.find(p=>p.id===id);const blockers=proposal?(deposit?depositBlockers(proposal):sendBlockers(proposal)):['Refresh the proposal before sending.'];if(blockers.length){setConfirmId(null);setSendFeedback({id,kind:'error',text:blockers.join(' ')});return;}}
  actionInFlight.current=true;setConfirmId(null);setBusy(true);setMessage('');
  if(!id)setDraftFeedback({kind:'creating',text:'Creating proposal draft from the saved event…'});
  if(id)setSendFeedback({id,purpose:deposit?'deposit':'proposal',kind:'sending',text:deposit?'Sending deposit payment email…':retry?'Retrying failed confirmation delivery…':'Sending proposal email… Keep this page open while delivery is checked.'});
  try{
   const payload=id?deposit?{action:'resend-deposit',emailApproved,reviewContext:review?.context,requestId:crypto.randomUUID(),...(recipientEmail?{recipientEmail}:{})}:retry?{action:'retry-delivery',emailApproved,reviewContext:review?.context}:{emailApproved,reviewContext:review?.context,...(note?{emailNote:note}:{})}:{version:plan.version,expiresAt:new Date(expires).toISOString()};
   const r=await fetch(id?base+'/'+id:base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const body=await readManagerResponse(r);
   if(id&&!retry&&!deposit)setEmailNote('');
   const result=id?deposit?`Deposit link email sent to ${body.recipient||'the customer'} and copied to events@aviatorbrew.com. Payment status is unchanged.`:retry?'Delivery retry completed. Check the delivery status below.':'Proposal email sent.':'Draft ready. Preview the PDF, then email it to the customer.';
   let refreshWarning='';try{await load();}catch{refreshWarning=' Status could not be refreshed. Use Refresh acceptance & payment status to check the latest record.';}
   if(id){setSendFeedback({id,purpose:deposit?'deposit':'proposal',kind:'success',text:result+refreshWarning});if(!retry&&!dirty)onRefresh();}else setDraftFeedback({kind:'success',text:result+refreshWarning,proposalId:body.proposal?.id});
  }catch(e){const error=e instanceof Error?e.message:'Could not update proposal.';if(id){setSendFeedback({id,purpose:deposit?'deposit':'proposal',kind:'error',text:error+' No successful delivery was confirmed by this request. Refresh the status before retrying.'});await load().catch(()=>undefined);}else setDraftFeedback({kind:'error',text:error});}
  finally{actionInFlight.current=false;setBusy(false);}
 }
 async function refresh(){setBusy(true);setMessage('');try{await load();if(!dirty)onRefresh();setMessage('Status refreshed.');}catch(e){setMessage(e instanceof Error?e.message:'Could not refresh acceptance and payment status.');}finally{setBusy(false);}}
 async function deleteDraft(proposal:EventProposal){if(busy||!window.confirm(`Are you sure you want to delete unsent proposal draft ${proposal.number}? Sent proposals are kept.`))return;setBusy(true);setMessage('');try{await readManagerResponse(await fetch(base+'/'+proposal.id,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({version:proposal.version})}));await load();setMessage('Unsent proposal draft deleted.');}catch(e){setMessage(e instanceof Error?e.message:'Could not delete draft.');}finally{setBusy(false);}}
 function manualBlocker(p:EventProposal){return dirty?'Save event changes first.':proposals[0]?.id!==p.id?'Use the latest proposal.':p.termsCurrent===false?'Create an updated draft with the current event details.':p.accepted_at?'Acceptance is already recorded.':['Cancelled','Completed'].includes(plan.details.status)||['cancelled','superseded','declined','changes_requested'].includes(p.state)?'Create a current proposal before recording acceptance.':new Date(p.expires_at).getTime()<=Date.now()?'Create an updated draft with a new expiration.':!p.snapshot.policyText?.trim()||!p.snapshot.policyVersion?.trim()?'Create a draft with the approved event policies.':'';}
 async function manualAccept(p:EventProposal,name:string,note:string){
  if(actionInFlight.current||reviewSaving)return;const blocker=manualBlocker(p);setManualId(null);if(blocker){setManualFeedback({id:p.id,error:true,text:blocker});return;}
  actionInFlight.current=true;setBusy(true);setManualFeedback({id:p.id,error:false,text:'Recording manual acceptance…'});
  try{await readManagerResponse(await fetch(base+'/'+p.id,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'manual-accept',version:p.version,planVersion:plan.version,name,note,confirmed:true})}));let warning='';try{await load();if(!dirty)onRefresh();}catch{warning=' Refresh status to load the saved record.';}setManualFeedback({id:p.id,error:false,text:'Customer acceptance recorded.'+warning});}
  catch(e){setManualFeedback({id:p.id,error:true,text:e instanceof Error?e.message:'Could not record manual acceptance.'});}
  finally{actionInFlight.current=false;setBusy(false);}
 }
 function sendBlockers(proposal:EventProposal,requireEmailApproval=true){
   if(dirty)return ['Save the event changes before sending.'];
   if(['Cancelled','Completed'].includes(plan.details.status))return ['This event is '+plan.details.status.toLowerCase()+'. It cannot receive a proposal.'];
   const reasons:string[]=[];
   if(proposal.state==='changes_requested')reasons.push('The customer requested changes. Review the message below and create a revised draft.');
   if(proposal.termsCurrent===false)reasons.push('The event terms changed. Create an updated draft before sending.');
   if(!proposal.snapshot.policyText?.trim()||!proposal.snapshot.policyVersion?.trim())reasons.push('This draft has no cancellation/deposit policies. Create an updated draft to include the saved policies.');
   if(new Date(proposal.expires_at).getTime()<=Date.now())reasons.push('This proposal has expired. Create an updated draft before sending.');
   if(proposal.state==='superseded'||proposal.state==='declined'||proposal.state==='cancelled')reasons.push('This proposal is '+proposal.state+'. Use a current proposal draft.');
   if(!review)reasons.push('Approval status is unavailable. Use Refresh acceptance & payment status to load it.');
   else if(review.proposalId!==proposal.id)reasons.push('A newer proposal exists. Review and send the latest proposal shown above.');
   else if(requireEmailApproval&&!emailApproved)reasons.push('Approve sending this email in the confirmation dialog.');
   return reasons;
 }
 function depositDue(p:EventProposal){return Math.max(0,p.snapshot.depositCents-Math.max(plan.details.paidCents,deposits.reduce((sum,d)=>sum+d.amount_cents,0)));}
 function depositBlockers(p:EventProposal,requireEmailApproval=true){return [...sendBlockers(p,requireEmailApproval),...(!p.sent_at||!p.approved_at?['Approve and send this proposal first.']:[]),...(depositDue(p)<=0?['The required deposit is already paid.']:[])];}
 const confirmation=confirmId?proposals.find(p=>p.id===confirmId):null;
 const manualProposal=manualId?proposals.find(p=>p.id===manualId):null;
 const flow=eventOrderFlow({plan,proposals,deposits,attempts,changes:changeRequests,dirty,loaded,depositCents});
 const customerProgress=eventProposalProgress({proposals,status:plan.details.status,dirty,loaded});
 const latest=proposals[0],previousProposals=proposals.slice(1),stripeTotal=deposits.reduce((sum,d)=>sum+d.amount_cents,0),payment=eventPaymentSummary(plan.details.paidCents,stripeTotal);
 const quotedTotal=latest?.snapshot.totals.total,balance=quotedTotal===undefined?undefined:quotedTotal-payment.paidCents;
 const blockers=latest?sendBlockers(latest,false):[],depositReasons=latest?depositBlockers(latest,false):[];
 const feedback=sendFeedback?.id===latest?.id?sendFeedback:null,reminder=depositLinks.find(l=>l.proposal_id===latest?.id),attempt=attempts.find(a=>a.proposal_id===latest?.id);
 const pending=Boolean(attempt&&(['creating','open'].includes(attempt.status)&&new Date(attempt.expires_at).getTime()>Date.now()||attempt.status==='paid'));
 const proposalNext=dirty?'Save event changes to continue.':latest?.state==='paid_review'?'Payment received. Review event availability before confirming the booking.':customerProgress.tone==='accepted'?'Customer acceptance is recorded. Check the payment balance.':latest?.sent_at&&customerProgress.tone==='review'&&latest.termsCurrent!==false&&new Date(latest.expires_at).getTime()>Date.now()&&latest.state!=='changes_requested'?'Waiting for the customer. If they accepted by phone or in person, record it below.':customerProgress.next;
 function openEmail(purpose:'proposal'|'deposit'|'retry'){if(!latest)return;setSendFeedback(null);setApprovalError('');setConfirmPurpose(purpose);setConfirmId(latest.id);}
 return <div className="event-proposal-manager">
  {workspaceTab!=="proposal"?<EventOrderFlow flow={flow} loaded={loaded} customerProgress={customerProgress} compact={Boolean(workspaceTab)}/>:null}
  <div data-event-panel="proposal" hidden={Boolean(workspaceTab&&workspaceTab!=="proposal")}>
   {manualProposal?<ManualAcceptanceConfirmation proposal={manualProposal} onCancel={()=>setManualId(null)} onConfirm={(name,note)=>manualAccept(manualProposal,name,note)}/>:null}
   {confirmation?<SendConfirmation proposal={confirmation} purpose={confirmPurpose} depositDueCents={depositDue(confirmation)} emailNote={emailNote} onEmailNoteChange={setEmailNote} emailApproved={emailApproved} reviewSaving={reviewSaving} approvalError={approvalError} onApprovalChange={approved=>saveApproval('emailApproved',approved)} base={base} retryRecipients={deliveries.filter(d=>d.proposal_id===confirmation.id&&d.status!=='sent').map(d=>d.recipient)} onCancel={()=>setConfirmId(null)} onConfirm={(recipientEmail,note)=>action(confirmation.id,confirmPurpose==='retry',confirmPurpose==='deposit',recipientEmail,note)}/>:null}
   <h3>Proposal & payments</h3>
   {message?<p role="status">{message}</p>:null}
   <div className="event-proposal-overview">
    <section className="event-proposal-card" aria-label="Customer proposal">
     <header><h4>Customer proposal</h4><span className={'proposal-status-badge is-'+customerProgress.tone}>{customerProgress.label}</span></header>
     {latest?<>
      <p className="event-proposal-reference">{latest.number} · v.{latest.version}</p>
      <p className="event-proposal-next">{proposalNext}</p>
      <dl className="event-proposal-facts"><div><dt>Customer</dt><dd>{latest.snapshot.details.contactName}<br/>{latest.snapshot.details.contactEmail}</dd></div><div><dt>{latest.sent_at?'Last emailed':'Email'}</dt><dd>{latest.sent_at?eventTimestamp(latest.sent_at):'Not sent yet'}</dd></div><div><dt>Link expires</dt><dd>{eventTimestamp(latest.expires_at)}</dd></div>{latest.accepted_at?<div><dt>Accepted by</dt><dd>{latest.accepted_name} · {eventTimestamp(latest.accepted_at)}</dd></div>:null}</dl>
      {latest.manualAcceptanceNote?<p className="event-proposal-change-message">{latest.manualAcceptanceNote}</p>:null}
      {changeRequests.filter(r=>r.proposal_id===latest.id).map(r=><section className="event-proposal-change-request" key={r.id}><h5>Customer requested changes</h5><p>{r.customer_name}</p><p className="event-proposal-change-message">{r.message}</p>{r.notification_status!=='sent'?<p>Team notification {r.notification_status==='failed'?'failed':'pending'}.</p>:null}</section>)}
      {manualFeedback?.id===latest.id?<p role={manualFeedback.error?'alert':'status'}>{manualFeedback.text}</p>:null}
      {feedback?<p className="event-proposal-feedback" role={feedback.kind==='error'?'alert':'status'}>{feedback.text}</p>:null}
      {blockers.length?<ul className="event-proposal-blockers" id="proposal-send-blockers">{blockers.map(reason=><li key={reason}>{reason}</li>)}</ul>:null}
      <div className="event-row-actions event-proposal-main-actions"><button type="button" disabled={busy||reviewSaving||blockers.length>0} aria-describedby={blockers.length?'proposal-send-blockers':undefined} onClick={()=>openEmail('proposal')}>{feedback?.kind==='sending'&&feedback.purpose!=='deposit'?'Sending…':latest.sent_at?'Resend proposal link':'Approve & Email Proposal'}</button>{!latest.accepted_at?<button type="button" disabled={busy||reviewSaving||Boolean(manualBlocker(latest))} title={manualBlocker(latest)||'Record acceptance received by phone or in person'} onClick={()=>{setManualFeedback(null);setManualId(latest.id);}}>Record customer acceptance</button>:null}</div>
      <div className="event-row-actions event-proposal-document-links"><a href={base+'/'+latest.id} target="_blank" rel="noreferrer">Preview proposal PDF</a><a href={base+'/'+latest.id+'?download=1'}>Download PDF</a><button type="button" disabled={busy||reviewSaving||['Cancelled','Completed'].includes(plan.details.status)} onClick={()=>setDraftOpen(open=>!open)}>{draftOpen?'Close revision':'Revise proposal'}</button>{!latest.sent_at&&!latest.approved_at&&!latest.accepted_at&&latest.state==='draft'?<button type="button" disabled={busy||reviewSaving} onClick={()=>deleteDraft(latest)}>Delete Draft</button>:null}</div>
     </>:<p>{loaded?'Create a proposal from the saved event menu and prices.':'Loading proposal…'}</p>}
     {(!latest||draftOpen)?<div className="event-proposal-create"><h5>{latest?'Create a revised proposal':'New proposal'}</h5>{latest?<p>Save menu or price changes first. This creates a new version for customer approval.</p>:null}<label>New proposal expires (your local time)<input ref={expirationInput} type="datetime-local" required value={expires} onChange={e=>setExpires(e.target.value)}/></label><button type="button" disabled={busy||reviewSaving||dirty||['Cancelled','Completed'].includes(plan.details.status)} aria-describedby={draftHelpId} title={draftHelp||undefined} onClick={()=>action()}>{draftFeedback?.kind==='creating'?'Creating draft…':'Create proposal draft'}</button></div>:null}
     <div id={draftHelpId}>{draftHelp&&(!latest||draftOpen)?<p role="status">{draftHelp}</p>:null}{draftFeedback?<p role={draftFeedback.kind==='error'?'alert':'status'}>{draftFeedback.text}</p>:null}{missingDetails.length?<button type="button" onClick={()=>{const field=document.getElementById(!plan.details.contactName.trim()?'event-contact-name':!plan.details.contactEmail.trim()?'event-contact-email':!plan.details.startTime?'event-start-time':'event-end-time');revealEventEditorField(field);}}>Edit missing event details</button>:null}</div>
    </section>
    <section className="event-proposal-card event-payment-card" aria-label="Event payment summary">
     <header><h4>Payments</h4>{loaded?<span className={'proposal-status-badge is-'+(flow.due?'review':'accepted')}>{flow.required===0?'No deposit required':flow.due?'Deposit due':'Deposit paid'}</span>:null}</header>
     {loaded?<>
      <dl className="event-payment-totals"><div><dt>{latest?.termsCurrent===false?'Last quoted total':'Proposal total'}</dt><dd>{quotedTotal===undefined?'—':money(quotedTotal)}</dd></div><div><dt>Received</dt><dd>{money(payment.paidCents)}</dd></div><div><dt>{balance!==undefined&&balance<0?'Credit balance':'Balance due'}</dt><dd>{balance===undefined?'—':money(Math.abs(balance))}</dd></div></dl>
      <p className="event-payment-breakdown">Manual: {money(payment.manualCents)} · Stripe: {money(payment.stripeCents)}</p>
      <p className="event-deposit-summary">{flow.due?<><strong>{money(flow.due)} deposit still due</strong> · {money(flow.required)} required.</>:flow.required?<>{money(flow.required)} deposit covered by payments received.</>:'No deposit is required for this event.'}</p>
      {flow.due&&pending?<p role="status">Payment pending. It will appear in Received after confirmation.</p>:flow.due&&attempt?.status==='failed'?<p role="status">The last online payment failed.</p>:null}
      {latest&&flow.due>0?<div className="event-row-actions"><button type="button" disabled={busy||reviewSaving||depositReasons.length>0} title={depositReasons.length?depositReasons.join(' '):'Review and email the outstanding deposit link'} onClick={()=>openEmail('deposit')}>{feedback?.kind==='sending'&&feedback.purpose==='deposit'?'Sending deposit link…':'Resend Deposit Link'}</button></div>:null}
      {reminder?<p className="event-payment-reminder">{reminder.status==='sent'&&reminder.sent_at?<>Deposit link emailed {eventTimestamp(reminder.sent_at)} to {reminder.recipient}.</>:reminder.status==='sending'?'Deposit email sending — delivery not confirmed.':reminder.status==='unknown'?'Deposit email delivery unverified. Check before resending.':'Deposit email was not delivered.'}</p>:null}
     </>:<p>Loading payments…</p>}
     {paymentEntry?<EventManualPaymentFields recordedPaidCents={paymentEntry.paidCents} verifiedPaidCents={stripeTotal} disabled={paymentEntry.disabled||busy||!loaded} dirty={dirty} onChange={paymentEntry.onChange}/>:null}
     <div className="event-row-actions event-receipt-actions">{dirty||busy||!loaded||paymentEntry?.disabled||latest?.termsCurrent===false?<button type="button" disabled title={latest?.termsCurrent===false?'Create an updated proposal before printing the receipt.':'Save event changes before printing the receipt.'}>Preview &amp; Print Receipt</button>:<a href={`/api/manager/event-plans/${encodeURIComponent(plan.id)}/receipt`} target="_blank" rel="noreferrer">Preview &amp; Print Receipt</a>}</div>
     {deposits.length?<a href={base+'/'+(deposits.find(d=>d.proposal_id===latest?.id)?.proposal_id||deposits[0].proposal_id)+'?receipt=1'} target="_blank" rel="noreferrer">Deposit receipt PDF</a>:null}
    </section>
   </div>
   <div className="event-row-actions event-proposal-footer"><button type="button" disabled={busy||reviewSaving} onClick={refresh}>Refresh status</button>{deliveries.some(d=>d.proposal_id===latest?.id&&d.status!=='sent')?<button type="button" disabled={busy||reviewSaving||dirty||!latest||review?.proposalId!==latest.id} onClick={()=>openEmail('retry')}>Retry failed email delivery</button>:null}{workspaceTab?<button type="button" onClick={()=>revealEventEditorField(activityHeading.current)}>Event activity & other actions</button>:null}{printActions}</div>
  </div>
  <div data-event-panel="activity" hidden={Boolean(workspaceTab&&workspaceTab!=="activity")}>
   <h3 ref={activityHeading} tabIndex={-1}>Event activity</h3>
   {eventActions?<section className="event-other-actions" aria-label="Other event actions"><h4>Other event actions</h4><div className="event-row-actions">{eventActions}</div></section>:null}
   <ol className="event-flow-history">{flow.history.map((item,i)=><li key={item.at+'-'+i}><time dateTime={item.at}>{eventTimestamp(item.at)}</time>{item.label}</li>)}</ol>
   <ProposalHistory key={latest?.id||'history'} proposals={previousProposals} plan={plan} deposits={deposits} attempts={attempts} depositLinks={depositLinks} changeRequests={changeRequests} busy={busy||reviewSaving} onDeleteDraft={deleteDraft}/>
   {deliveries.length?<details><summary>Confirmation delivery status</summary>{deliveries.map((d,i)=><p key={i}>{d.recipient} · {d.subject} · {d.status==='sent'?'Accepted for delivery':d.status}</p>)}</details>:null}
   {previousProposals.length?<details className="event-proposal-document-history" key={latest?.id}><summary>Earlier proposal PDFs &amp; receipts ({previousProposals.length})</summary>{previousProposals.map(p=><ProposalDocuments key={p.id} proposal={p} base={base} deposits={deposits}/>)}</details>:null}
  </div>
 </div>;
}
