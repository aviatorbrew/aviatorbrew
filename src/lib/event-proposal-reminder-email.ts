import {eventDateLabel,timeLabel} from '@/lib/event-plan';
import {publicSiteUrl} from '@/lib/site-url';
import type {EventProposal} from '@/lib/event-proposals';
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function proposalReminderEmail(proposal:EventProposal,token:string,releaseAt:Date){
 const details=proposal.snapshot.details,base=publicSiteUrl(),review=base+'/event-proposal#token='+token,changes=base+'/event-proposal?view=changes#token='+token,decline=base+'/event-proposal?view=decline#token='+token;
 const schedule=eventDateLabel(details.date)+' · '+timeLabel(details.startTime)+'–'+timeLabel(details.endTime)+' Eastern';
 const deadline=releaseAt.toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'long',timeStyle:'short'})+' Eastern';
 const warning='We cannot hold your date much longer. Please approve your proposal or request a change within the next 24 hours. If we do not hear from you by '+deadline+', your tentative date will be released.';
 return {to:details.contactEmail,cc:'events@aviatorbrew.com',replyTo:'events@aviatorbrew.com',fromName:'Aviator Events',subject:'Your event date will be released in 24 hours · '+proposal.number,
  text:['Are you still planning your Aviator event?',details.title,schedule,proposal.number,'It has been at least two days since we sent your proposal, and we have not received your acceptance.',warning,'Review & approve your proposal:',review,'Request a change:',changes,'Decline proposal:',decline,'Questions? Reply to events@aviatorbrew.com.'].join('\n\n'),
  html:`<div style="font:16px/1.6 Arial,sans-serif;color:#172b3b"><h1>Are you still planning your Aviator event?</h1><p><strong>${escape(details.title)}</strong><br>${escape(schedule)}<br>${escape(proposal.number)}</p><p>It has been at least two days since we sent your proposal, and we have not received your acceptance.</p><p style="padding:16px;border:2px solid #c49c58"><strong>${escape(warning)}</strong></p><p><a href="${review}" style="display:inline-block;padding:12px 18px;background:#efb45f;color:#102b3e">Review &amp; approve proposal</a> <a href="${changes}" style="display:inline-block;padding:12px 18px;border:1px solid #465d70;color:#102b3e">Request a change</a></p><p style="margin:6px 0 24px"><a href="${decline}" style="font-size:12px;color:#526474">Decline proposal</a></p><p>Questions? Reply to events@aviatorbrew.com.</p></div>`};
}
