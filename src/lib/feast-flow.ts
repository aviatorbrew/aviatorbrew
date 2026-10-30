import type {FeastOrder,FeastSettings} from '@/lib/feast';
export type FeastFlowEvent={id:string;order_id:string;version:number;kind:string;label:string;created_at:string};
export function feastBalance(o:Pick<FeastOrder,'quote'|'paidCents'>){return o.quote.totalCents===null?null:Math.max(0,o.quote.totalCents-o.paidCents);}
export function feastFlowStatus(o:FeastOrder){
 const balance=feastBalance(o);
 if(o.automationAttention)return {label:'Payment / delivery needs staff attention',tone:'attention',step:1};
 if(o.state==='Cancelled')return {label:o.paidCents?'Cancelled — payment recorded; staff review required':'Order cancelled'+(o.paymentCancelledAt?' — unpaid':''),tone:'cancelled',step:-1};
 if(o.state==='Completed')return {label:'Order completed',tone:'paid',step:5};if(o.state==='Ready')return {label:'Ready for pickup',tone:'paid',step:4};if(o.state==='Preparing')return {label:'Kitchen preparing order',tone:'paid',step:3};
 if(balance===0)return {label:'Customer paid'+(o.paymentMethod?' via '+o.paymentMethod:''),tone:'paid',step:2};
 if(o.state!=='Approved')return {label:'Waiting for staff approval',tone:'review',step:0};
 if(o.paymentWarningSentAt)return {label:'Cancellation warning sent — waiting for customer to pay',tone:'attention',step:1};
 if(o.paymentRequestedAt)return {label:'Approved; payment request sent — waiting for customer to pay',tone:'waiting',step:1};
 return {label:'Order approved — payment request needs to be sent',tone:'attention',step:1};
}

export const feastMessageLabels={request:'Request copy',approval:'Approval & payment request',payment:'Payment request',payment_warning:'Cancellation warning',cancelled:'Order cancellation',paid:'Payment confirmation'} as const;

export function feastOrderListStatus(o:FeastOrder){
 return o.state==='Approved'&&o.paidCents>0&&feastBalance(o)===0?'Paid':o.state;
}
// Setup guidance only. Approval still runs the authoritative server checks.
export function feastApprovalSetupIssues(o:FeastOrder,s:FeastSettings){
 if(o.state!=='Under review')return [];
 return [...(o.quote.totalCents===null?['Edit menu / recalculate and save this order to include the configured taxes.']:[]),...(!s.slots.some(w=>w.enabled&&w.season===o.input.season&&w.date===o.input.pickupDate&&o.input.pickupTime>=w.start&&o.input.pickupTime<=w.end)?['Add an enabled pickup window covering this order’s pickup date and time in seasonal settings.']:[]),...(!s.turkeyWeightConfirmed&&(o.input.packages.some(p=>p.id.startsWith('turkey-'))||o.input.extras.some(i=>i.id.startsWith('whole-turkey')))?['Confirm whole-turkey weights and serving yields in seasonal settings.']:[]),...(!s.policyText.trim()||!s.policyVersion.trim()?['Save approved Feast order policies and their version in seasonal settings.']:[])];
}
