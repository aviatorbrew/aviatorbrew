import type {FeastOrder} from '@/lib/feast';
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
