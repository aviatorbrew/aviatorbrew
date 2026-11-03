import type { EventProposal } from "@/lib/event-proposals";

export function eventProposalProgress({proposals,status,dirty=false,loaded=true,now=Date.now()}:{proposals:EventProposal[];status:string;dirty?:boolean;loaded?:boolean;now?:number}) {
  const current=proposals[0],previousAcceptance=proposals.slice(1).find(p=>p.accepted_at);
  const earlier=previousAcceptance?`Earlier v.${previousAcceptance.version} was accepted. `:"";
  if(status==='Cancelled')return {label:'Event cancelled',detail:'Customer acceptance and payment records are retained.',next:'Un-cancel the event before continuing with a proposal.',tone:'closed'};
  if(status==='Completed')return {label:'Event completed',detail:'Previous customer responses remain on file.',next:'Review the saved proposal and payment history.',tone:'accepted'};
  if(!loaded)return {label:'Customer status unavailable',detail:'The latest proposal records have not loaded.',next:'Refresh acceptance & payment status.',tone:'review'};
  if(dirty)return {label:'Unsaved event changes',detail:'The customer has not received these unsaved changes.',next:'Save the event before creating or sending an updated proposal.',tone:'review'};
  if(!current)return {label:'No proposal sent',detail:'No proposal has been created for this event.',next:'Create a proposal draft from the saved event details.',tone:'draft'};
  if(current.state==='changes_requested')return {label:'Customer requested changes',detail:`The customer requested changes to v.${current.version}.`,next:'Read the customer message, save the changes and create a revised proposal.',tone:'review'};
  if(current.termsCurrent===false)return {label:'Updated proposal needed',detail:`${earlier}The saved event differs from the latest quoted version.`,next:'Create and send a revised proposal for new customer acceptance.',tone:'review'};
  if(['superseded','cancelled','declined'].includes(current.state))return {label:current.state==='declined'?'Customer declined':'No current proposal for acceptance',detail:`Proposal v.${current.version} is ${current.state}. Earlier responses remain on file.`,next:'Review the event and create an updated proposal if it is going ahead.',tone:'closed'};
  if(current.accepted_at)return {label:current.acceptanceMethod==='manual'?'Customer accepted manually':'Customer accepted online',detail:`Acceptance is recorded for the latest proposal, v.${current.version}.`,next:current.state==='paid_review'?'Review booking availability and the recorded payment before confirming.':'Check the separate deposit and booking status below.',tone:'accepted'};
  if(new Date(current.expires_at).getTime()<=now)return {label:'Proposal expired — no acceptance',detail:`${earlier}Proposal v.${current.version} expired without acceptance.`,next:'Create an updated draft with a new expiration and send it for acceptance.',tone:'review'};
  if(current.sent_at)return {label:`Waiting for customer acceptance · v.${current.version}`,detail:`${earlier}${previousAcceptance?'The updated proposal needs its own acceptance.':'No acceptance is recorded for this proposal.'}`,next:'Follow up with the customer or resend the proposal link. Record manual acceptance only after receiving it.',tone:'review'};
  return {label:`Latest proposal not emailed · v.${current.version}`,detail:`${earlier}The customer has not received this latest version.`,next:'Preview the PDF, review the email approval and use Approve & Email Proposal.',tone:'draft'};
}
