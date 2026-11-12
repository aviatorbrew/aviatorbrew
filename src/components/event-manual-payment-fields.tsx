'use client';
import {money} from '@/lib/event-plan';
import {eventPaymentSummary} from '@/lib/event-payments';
export function EventManualPaymentFields({recordedPaidCents,verifiedPaidCents=0,disabled=false,dirty,onChange}:{recordedPaidCents:number;verifiedPaidCents?:number;disabled?:boolean;dirty:boolean;onChange:(totalPaidCents:number)=>void}){
 const payment=eventPaymentSummary(recordedPaidCents,verifiedPaidCents);
 return <fieldset className="event-manual-payment-entry" disabled={disabled} data-event-panel="proposal"><legend>Manual payments received</legend><div><label>Total manual payments received ($)<input form="event-plan-details" type="number" min={0} max={(1000000000-verifiedPaidCents)/100} step="0.01" value={payment.manualCents/100} onChange={e=>{const cents=Math.round(Number(e.target.value)*100);if(Number.isFinite(cents)&&cents>=0)onChange(verifiedPaidCents+cents);}}/></label><button type="submit" form="event-plan-details" disabled={disabled||!dirty}>Save payment credit</button></div><p>Cash, check or other manual payments. Enter the total received; Stripe is counted automatically.</p>{dirty?<p role="status">Unsaved total credit: {money(payment.paidCents)}</p>:null}</fieldset>;
}
