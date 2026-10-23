import { defaultCateringCatalog, emptyEventPlan, eventOrderItems, eventTotals, flightPlanSelections, money, parseEventPlan, type CateringCatalog, type EventPlanDetails, type EventOrderItem, timeLabel } from "@/lib/event-plan";
import { availableCatalog } from "@/lib/catering-catalog";

export const buffetExplanation = "Your menu selections are for the entire group, not individual orders. All guests enjoy the same buffet featuring the dishes you select.";
export const inquiryAcknowledgement = "Thank you! We've received your event request. Our events team will review the details and contact you with a proposal. Your event is not confirmed until your reservation is approved and the required deposit is paid.";
export function easternToday(now = new Date()) { return new Intl.DateTimeFormat("en-CA", {timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(now); }
export function eventIsFuture(p:Pick<EventPlanDetails,"date"|"startTime">,now=new Date()) {
 const today=easternToday(now),time=new Intl.DateTimeFormat("en-GB",{timeZone:"America/New_York",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(now);
 return p.date>today||(p.date===today&&p.startTime>time);
}
export function eventWindow(p: Pick<EventPlanDetails,"date"|"startTime"|"endTime">) {
  const minute = (value: string) => { const [h,m] = value.split(":").map(Number); return h*60+m; };
  const day = Date.parse(p.date+"T00:00:00Z") / 60000;
  if (!p.startTime) return {start:day-60,end:day+1440+30};
  const start = day + minute(p.startTime), end = p.endTime ? day + minute(p.endTime) + (p.endTime <= p.startTime ? 1440 : 0) : start + 240;
  return {start:start-60,end:end+30};
}
export function eventWindowsOverlap(a: Parameters<typeof eventWindow>[0], b: Parameters<typeof eventWindow>[0]) { const x=eventWindow(a),y=eventWindow(b); return x.start < y.end && y.start < x.end; }
// A linked draft retains the reservation hold while staff completes the website event.
export const activeEventBookingSql="(status IN ('Tentative','Confirmed') OR (status='Draft' AND calendar_sync->>'linkedFromPlanId' IS NOT NULL))";
export function hasEventBookingHold(status:string,sync?:{linkedFromPlanId?:string}){return ['Tentative','Confirmed'].includes(status)||status==='Draft'&&Boolean(sync?.linkedFromPlanId);}
export function eventRecordConflicts(details:Pick<EventPlanDetails,"date"|"startTime"|"endTime">,record:{data:EventPlanDetails;calendar_sync?:{status?:string;linkedFromPlanId?:string;source?:{date:string;startTime:string;endTime:string}}}){
 return eventWindowsOverlap(details,record.data)||Boolean(!record.calendar_sync?.linkedFromPlanId&&record.calendar_sync?.status==="changed"&&record.calendar_sync.source&&eventWindowsOverlap(details,record.calendar_sync.source));
}
export function validateCateringRequest(value: unknown, catalog: CateringCatalog, depositCents: number, now = new Date()): EventPlanDetails {
  if (!value || typeof value !== "object") throw new Error("Build your catering menu first.");
  const p = value as EventPlanDetails, f = p.flightPlan;
  if (!f || !catalog.packages.some(pkg=>pkg.enabled&&pkg.id===f.packageId)) throw new Error("Choose an available catering package.");
  if (!Number.isInteger(p.guestCount) || p.guestCount < catalog.minimumGuests || p.guestCount > catalog.maximumGuests) throw new Error(`Choose ${catalog.minimumGuests}–${catalog.maximumGuests} guests. Contact events@aviatorbrew.com for other arrangements.`);
  if (!p.startTime || !p.endTime) throw new Error("Choose your event start and end time.");
  // Per-event appetizer/entree overrides are staff-only; public inquiries use catalog prices.
  const details = parseEventPlan({...emptyEventPlan(depositCents), title: p.title || `Private event — ${p.contactName || "Guest"}`, contactName:p.contactName,contactEmail:p.contactEmail,phone:p.phone,date:p.date,startTime:p.startTime,foodTime:p.foodTime||"",endTime:p.endTime,location:catalog.venue,guestCount:p.guestCount,notes:p.notes || "",taxRateBps:catalog.salesTaxBps,pfbTaxRateBps:catalog.pfbTaxBps,flightPlan:{...f,cateringMode:undefined,extraAppetizerPriceCents:undefined,extraEntreePriceCents:undefined,extraPremiumEntreePriceCents:undefined,extraSidePriceCents:catalog.extraPrices.side,extraSaladPriceCents:catalog.extraPrices.salad}}, availableCatalog(catalog));
  if (!details.contactName || !details.contactEmail || !details.phone) throw new Error("Enter your name, email and phone.");
  if (!eventIsFuture(details,now)) throw new Error("Choose a current or future event date.");
  if ([...details.flightPlan!.appetizers,...details.flightPlan!.extraAppetizers].some(n=>!availableCatalog(catalog).menu.appetizers.includes(n)&&!availableCatalog(catalog).menu.premiumAppetizers.includes(n))) throw new Error("Choose available appetizers.");
  const duration = eventWindow(details).end-eventWindow(details).start-90;
  if (duration > (4+details.flightPlan!.extraHours)*60) throw new Error("Add the extra event hours needed for your requested end time.");
  return details;
}
export type ProposalSnapshot = { details: EventPlanDetails; items: EventOrderItem[]; selections: [string,string][]; totals: ReturnType<typeof eventTotals>; depositCents: number; policyText: string; policyVersion: string; exclusions: string; catalog: CateringCatalog };
export function proposalSnapshot(details: EventPlanDetails, catalog: CateringCatalog, depositCents: number, policyText: string, policyVersion: string): ProposalSnapshot {
  const items = eventOrderItems(details,catalog);
  const safe = {...structuredClone(details),internalNotes:"",guestEmails:[]};
  return {details:safe,items:structuredClone(items),selections:[...flightPlanSelections(details,catalog),...([
    ["Event type",details.flightPlan?.eventType||""],["Company / organization",details.flightPlan?.organization||""],
    ["Setup access",details.setupTime?timeLabel(details.setupTime):""],["Food service",details.foodTime?timeLabel(details.foodTime):""],["Last call",details.lastCall?timeLabel(details.lastCall):""],
    ["Bar service notes",details.barDetails],["Bar setup",details.flightPlan?.barMode||""],["Bar planning cap (not an additional charge)",details.flightPlan?.barCapCents?money(details.flightPlan.barCapCents):""],
    ["Drink tickets",details.flightPlan?.ticketCount?String(details.flightPlan.ticketCount):""],["Appetizers served",details.flightPlan?.appetizerTime?timeLabel(details.flightPlan.appetizerTime):""],
    ["Decorating / setup notes",details.flightPlan?.decorNotes||""],["Included AV",details.flightPlan?.av.join(", ")||""],
  ] as [string,string][]).filter(([,value])=>Boolean(value))],totals:eventTotals({...safe,flightPlan:null,items}),depositCents,policyText,policyVersion,catalog:structuredClone(catalog),exclusions:"Gratuity and final bar consumption are excluded unless itemized. Other unpriced services require a revised proposal. The deposit is a credit toward the event total."};
}
export function cateringSummary(details: EventPlanDetails, catalog: CateringCatalog = defaultCateringCatalog) { return [buffetExplanation,...flightPlanSelections(details,catalog).map(([k,v])=>`${k}: ${v}`),...eventOrderItems(details,catalog).map(i=>`${i.quantity} × ${i.name} at ${money(i.unitPriceCents)} = ${money(i.quantity*i.unitPriceCents)}`),`Estimated subtotal: ${money(eventTotals(details,catalog).subtotal)}`].join("\n"); }

export function eventBookingStage(status:string,proposal?:{state:string;expires_at:string;accepted_at?:string|null;sent_at?:string|null;attempt_status?:string|null}|null) {
 if(status==="Cancelled")return "Canceled";
 if(status==="Completed")return "Completed";
 if(proposal){
 if(proposal.state==='changes_requested')return 'Changes Requested';
  if(proposal.state==="declined")return "Declined";
  if(proposal.state==="cancelled")return "Canceled";
  if(proposal.state==="paid_review")return "Deposit paid — staff review required";
  if(status==="Draft")return "Under Review";
  if(proposal.accepted_at&&status==="Confirmed")return "Confirmed";
  if(new Date(proposal.expires_at).getTime()<=Date.now())return "Expired Proposal";
  if(proposal.state==="superseded")return "Under Review";
  if(proposal.accepted_at)return proposal.attempt_status==="failed"?"Payment Failed / Pending":proposal.attempt_status?"Awaiting Deposit":"Proposal Accepted";
  if(proposal.sent_at)return "Proposal Sent";
 }
 return status==="Confirmed"?"Confirmed":"Under Review";
}
