// Saved payment credit includes manual receipts and verified Stripe payments.
export function eventPaymentSummary(recordedPaidCents:number,verifiedPaidCents:number){
 const paidCents=Math.max(recordedPaidCents,verifiedPaidCents);
 return {paidCents,stripeCents:verifiedPaidCents,manualCents:Math.max(0,recordedPaidCents-verifiedPaidCents)};
}
