import { closeUnpaidEventCheckouts, materialHash } from "@/lib/event-proposals";
import { activeEventBookingSql, hasEventBookingHold, eventRecordConflicts, eventBookingStage } from "@/lib/event-booking";
import { getPrivateEventSettings } from "@/lib/private-event-settings";
import { createHash, randomUUID } from "node:crypto";
import { withDatabase } from "@/lib/database";
import { sendMail, isMailConfigured } from "@/lib/mail";
import type { PoolClient } from "pg";
import { eventStatuses, type EventReport } from "@/lib/event-plan";
import { eventDateLabel, eventOrderItems, eventTotals, flightPlanSelections, money, parseEventPlan, timeLabel, defaultCateringCatalog, type CateringCatalog, type EventPlan, type EventPlanDetails } from "@/lib/event-plan";

export class EventPlanError extends Error { constructor(message: string, public status = 400) { super(message); } }
function record(row: Record<string, unknown>): EventPlan {
  return { bookingStage: eventBookingStage(String(row.status),row.proposal_workflow as Parameters<typeof eventBookingStage>[1]), calendarSync: row.calendar_sync as EventPlan["calendarSync"], id: String(row.id), version: Number(row.version), sourceInquiryId: row.source_inquiry_id ? String(row.source_inquiry_id) : null, details: row.data as EventPlanDetails, createdAt: new Date(row.created_at as string).toISOString(), updatedAt: new Date(row.updated_at as string).toISOString() };
}
const eventPlanSelect = `SELECT e.*, CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('state',p.state,'expires_at',p.expires_at,'accepted_at',p.accepted_at,'sent_at',p.sent_at,'attempt_status',a.status) END AS proposal_workflow
 FROM website.private_event_plans e
 LEFT JOIN LATERAL (SELECT * FROM website.private_event_proposals WHERE plan_id=e.id ORDER BY version DESC LIMIT 1) p ON true
 LEFT JOIN LATERAL (SELECT status FROM website.private_event_checkout_attempts WHERE proposal_id=p.id ORDER BY created_at DESC LIMIT 1) a ON true`;
export async function inquiryBookingStages(ids:string[]) {
 return withDatabase(async client=>(await client.query(eventPlanSelect+" WHERE e.source_inquiry_id=ANY($1::bigint[])",[ids])).rows.map(row=>{const d=row.data as EventPlanDetails;return {inquiryId:String(row.source_inquiry_id),planId:String(row.id),contactEmail:d.contactEmail,contactName:d.contactName,title:d.title,schedule:{date:d.date,startTime:d.startTime,endTime:d.endTime},stage:record(row).bookingStage};}));
}
export async function listEventPlans(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new EventPlanError("Choose a calendar month.");
  return withDatabase(async (client) => (await client.query(eventPlanSelect+" WHERE e.deleted_at IS NULL AND e.event_date >= $1::date AND e.event_date < $1::date + interval '1 month' ORDER BY e.event_date, e.data->>'startTime', e.title", [month + "-01"])).rows.map(record));
}
export async function listManagerEvents(search="") {
  const q=search.trim();if(q.length>200)throw new EventPlanError("Keep event searches under 200 characters.");
  return withDatabase(async client=>(await client.query(eventPlanSelect+" WHERE e.deleted_at IS NULL AND ($1::text<>'' OR e.event_date>=(now() AT TIME ZONE 'America/New_York')::date) AND ($1::text='' OR e.title ILIKE $2 OR e.data->>'contactName' ILIKE $2 OR e.data->>'contactEmail' ILIKE $2 OR e.event_date::text ILIKE $2) ORDER BY e.event_date,e.data->>'startTime',e.id",[q,'%'+q+'%'])).rows.map(record));
}
export async function eventCalendarSyncStatus() {
  return withDatabase(async client => (await client.query("SELECT value FROM website.settings WHERE key='private_event_calendar_sync'")).rows[0]?.value || null);
}
export async function getEventPlan(id: string) {
  return withDatabase(async (client) => { const result = await client.query(eventPlanSelect+" WHERE e.id=$1 AND e.deleted_at IS NULL", [id]); return result.rows[0] ? record(result.rows[0]) : null; });
}
export async function searchEventReports(input:{q?:string;start?:string;end?:string;status?:string;includeDeleted?:boolean;offset?:number}) {
  const date=(value:string|undefined)=>{if(!value)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+"T12:00:00Z"))||new Date(value+"T12:00:00Z").toISOString().slice(0,10)!==value)throw new EventPlanError("Choose valid report dates.");return value;};
  const start=date(input.start),end=date(input.end),status=input.status||"",q=(input.q||"").trim();
  if(start&&end&&start>end)throw new EventPlanError("The report end date must follow the start date.");
  if(status&&!eventStatuses.includes(status as typeof eventStatuses[number]))throw new EventPlanError("Choose a valid event status.");
  if(q.length>200)throw new EventPlanError("Keep report searches under 200 characters.");
  const offset=input.offset??0;if(!Number.isInteger(offset)||offset<0||offset>1000000)throw new EventPlanError("Choose a valid report page.");
  const where=" WHERE ($1::date IS NULL OR e.event_date >= $1) AND ($2::date IS NULL OR e.event_date <= $2) AND ($3::text='' OR e.status=$3) AND ($4::text='' OR e.title ILIKE $5 OR e.data::text ILIKE $5) AND ($6::boolean OR e.deleted_at IS NULL)";
  const values=[start,end,status,q,'%'+q+'%',Boolean(input.includeDeleted)];
  return withDatabase(async client=>{
    const total=Number((await client.query("SELECT count(*)::int AS count FROM website.private_event_plans e"+where,values)).rows[0].count);
    const rows=(await client.query(eventPlanSelect+where+" ORDER BY e.event_date DESC,e.data->>'startTime' DESC,e.id LIMIT 50 OFFSET $7",[...values,offset])).rows;
    return {events:rows.map(row=>({...record(row),deletedAt:row.deleted_at?new Date(row.deleted_at).toISOString():null})),total,limit:50,offset};
  });
}
export async function getEventReport(id:string):Promise<EventReport|null> {
  return withDatabase(async client=>{const row=(await client.query(eventPlanSelect+" WHERE e.id=$1",[id])).rows[0];return row?{...record(row),deletedAt:row.deleted_at?new Date(row.deleted_at).toISOString():null}:null;});
}
export async function saveEventPlan(input: unknown, id?: string, version?: number, sourceInquiryId?: string, transactionClient?:PoolClient, transactionCatalog?:CateringCatalog) {
  const details = parseEventPlan(input,transactionCatalog||(await getPrivateEventSettings()).catering);
  const work=async (client:PoolClient) => {
    if(!transactionClient)await client.query("BEGIN");
    try {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('aviator-private-event-booking'))");
      const existing = id ? (await client.query("SELECT data,status,deleted_at,calendar_sync FROM website.private_event_plans WHERE id=$1 FOR UPDATE",[id])).rows[0] : null;
      if(id&&(!existing||existing.deleted_at))throw new EventPlanError("This event was deleted or is no longer available.",404);
      const old=existing?.data as EventPlanDetails|undefined;
      if(old&&(materialHash(old)!==materialHash(details)||old.paidCents!==details.paidCents||old.status!==details.status))await client.query("UPDATE website.private_event_plans SET proposal_review='{}'::jsonb WHERE id=$1",[id]);
      if(id){
        if(old&&details.status==="Draft"&&old.status!=="Draft")await client.query("UPDATE website.private_event_proposals SET approved_at=NULL WHERE plan_id=$1",[id]);
        const verifiedPaid=Number((await client.query("SELECT COALESCE(sum(amount_cents),0)::int AS paid FROM website.private_event_deposits WHERE plan_id=$1",[id])).rows[0].paid);
        if(details.paidCents<verifiedPaid)throw new EventPlanError("Verified Stripe deposits cannot be removed from the payment credit. Reconcile any refund with the events team first.",409);
        if(old&&details.paidCents>old.paidCents)await closeUnpaidEventCheckouts(client,id);
      }
      const changed=!old||old.date!==details.date||old.startTime!==details.startTime||old.endTime!==details.endTime||old.location!==details.location||existing.status!==details.status;
      if(changed&&hasEventBookingHold(details.status,existing?.calendar_sync)){
        const conflicts=(await client.query("SELECT data,calendar_sync FROM website.private_event_plans WHERE id<>$1 AND (event_date BETWEEN $2::date-1 AND $2::date+1 OR calendar_sync->'source'->>'date' BETWEEN ($2::date-1)::text AND ($2::date+1)::text) AND "+activeEventBookingSql,[id||"",details.date])).rows;
        if(conflicts.some(row=>eventRecordConflicts(details,row)))throw new EventPlanError("Another tentative or confirmed event overlaps this time, including setup and removal. Choose another time or resolve the conflicting event.",409);
      }
      const save = async () => {
    if (id) {
      if (!Number.isInteger(version) || !version || version < 1) throw new EventPlanError("Refresh this event before saving.");
      const result = await client.query("UPDATE website.private_event_plans SET title=$1,event_date=$2,status=$3,data=$4::jsonb,version=version+1,updated_at=now() WHERE id=$5 AND version=$6 RETURNING *", [details.title, details.date, details.status, JSON.stringify(details), id, version]);
      if (!result.rowCount) throw new EventPlanError("This event changed in another window. Reload it before saving to avoid overwriting those changes.", 409);
      return record(result.rows[0]);
    }
    if (sourceInquiryId) {
      if (!/^\d+$/.test(sourceInquiryId)) throw new EventPlanError("Choose a valid inquiry.");
      const inquiry = await client.query("SELECT id FROM website.form_inquiries WHERE id=$1 AND kind='event'", [sourceInquiryId]);
      if (!inquiry.rowCount) throw new EventPlanError("The original inquiry could not be found.", 404);
    }
    try {
      const result = await client.query("INSERT INTO website.private_event_plans(id,source_inquiry_id,title,event_date,status,data) VALUES($1,$2,$3,$4,$5,$6::jsonb) RETURNING *", [randomUUID(), sourceInquiryId || null, details.title, details.date, details.status, JSON.stringify(details)]);
      return record(result.rows[0]);
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new EventPlanError("This inquiry already has an event plan. Open the existing plan instead.", 409);
      throw error;
    }

      };
      const saved=await save();
      if(!transactionClient)await client.query("COMMIT");return saved;
    }catch(error){if(!transactionClient)await client.query("ROLLBACK").catch(()=>undefined);throw error;}
  };
  return transactionClient?work(transactionClient):withDatabase(work);
}
export async function deleteEventPlan(id:string,version:number) {
  return withDatabase(async client=>{
    await client.query("BEGIN");
    try{
      await client.query("SELECT pg_advisory_xact_lock(hashtext('aviator-private-event-booking'))");
      const plan=(await client.query("SELECT version,deleted_at FROM website.private_event_plans WHERE id=$1 FOR UPDATE",[id])).rows[0];
      if(!plan)throw new EventPlanError("Event not found.",404);
      if(!plan.deleted_at){
        if(!Number.isInteger(version)||version!==plan.version)throw new EventPlanError("This event changed in another window. Reload it before deleting.",409);
        await closeUnpaidEventCheckouts(client,id);
        await client.query("UPDATE website.private_event_plans SET deleted_at=now(),status='Cancelled',data=data||jsonb_build_object('status','Cancelled','deletedOriginalStatus',status,'deletedSourceInquiryId',source_inquiry_id),source_inquiry_id=NULL,version=version+1,updated_at=now() WHERE id=$1",[id]);
      }
      await client.query("COMMIT");return {id,deleted:true};
    }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}
  });
}
function escape(value: unknown) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!)); }
function flightPlanFacts(p: EventPlanDetails): [string, string][] {
  const f = p.flightPlan;
  if (!f) return [];
  return [["Event type", f.eventType], ["Organization", f.organization], ["Billing contact", f.billingName], ["Billing address", f.billingAddress], ["Appetizers served", f.appetizerTime ? timeLabel(f.appetizerTime) : ""], ["Outside seating", f.outsideSeating], ["Bar setup", f.barMode], ["Hosted tab cap", f.barCapCents ? money(f.barCapCents) : ""], ["Drink tickets", f.ticketCount ? String(f.ticketCount) : ""], ["Authorized bar contact", f.barContact], ["Decorator / vendor", f.decorContact], ["Decorator phone", f.decorPhone], ["Decorating company", f.decorCompany], ["Decorating / room setup", f.decorNotes], ["Included AV", f.av.join(", ")]].filter(([, value]) => Boolean(value)) as [string, string][];
}
function eventSummaryText(plan: EventPlan,catalog=defaultCateringCatalog) {
  const p = plan.details, t = eventTotals(p,catalog);
  return [p.title, `${eventDateLabel(p.date)} · ${timeLabel(p.startTime)}${p.endTime ? " – " + timeLabel(p.endTime) + (p.endTime < p.startTime ? " (next day)" : "") : ""}`, p.location, `${p.guestCount} guests · ${p.status}`, p.setupTime ? `Setup: ${timeLabel(p.setupTime)}` : "", p.foodTime ? `Entrees / food: ${timeLabel(p.foodTime)}` : "", p.lastCall ? `Last call: ${timeLabel(p.lastCall)}` : "", ...flightPlanSelections(p,catalog).map(([label, value]) => `${label}: ${value}`), ...flightPlanFacts(p).map(([label, value]) => `${label}: ${value}`), ...eventOrderItems(p,catalog).map(item => `${item.quantity} x ${item.name} @ ${money(item.unitPriceCents)}: ${money(item.quantity*item.unitPriceCents)}${item.notes ? " — " + item.notes : ""}`), `Subtotal: ${money(t.subtotal)}\nSales tax (${p.taxRateBps / 100}%): ${money(t.salesTax)}\nPFB tax (${(p.pfbTaxRateBps || 0) / 100}%): ${money(t.pfbTax)}\nTotal: ${money(t.total)}\nDeposit / payments received: ${money(t.paid)}\n${t.balance < 0 ? "Credit" : "Estimated balance"}: ${money(Math.abs(t.balance))}\nGratuity excluded.`, p.barDetails ? `Bar service: ${p.barDetails}` : "", p.flightPlan?.barMode === "Drink tickets" ? "Drink tickets are billed at actual drink prices, typically $6–$17. Bar charges are additional unless listed above." : "", p.notes, `Revision ${plan.version}`].filter(Boolean).join("\n");
}
export function eventSummaryHtml(plan: EventPlan, printable = false, message = "", flightPlan = false,catalog: CateringCatalog=defaultCateringCatalog) {
  const p = plan.details, t = eventTotals(p,catalog);
  const title = flightPlan ? "Event Menu Planning Sheet" : "Order Summary";
  const lines = eventOrderItems(p,catalog).map(item => `<tr><td>${escape(item.category)}</td><td><strong>${escape(item.name)}</strong>${item.notes ? `<div class="note">${escape(item.notes)}</div>` : ""}</td><td>${item.quantity}</td><td>${money(item.unitPriceCents)}</td><td>${money(item.quantity * item.unitPriceCents)}</td></tr>`).join("");
  const detail = (label: string, value: string) => value ? `<div><b>${escape(label)}</b> ${escape(value)}</div>` : "";
  const food = flightPlanSelections(p,catalog), facts = flightPlanFacts(p);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(p.title)} — ${title}</title><style>body{font:13px/1.4 Arial,sans-serif;color:#172b3b;margin:20px auto;padding:0 20px;max-width:900px}h1{font-size:26px;margin:4px 0}h2{font-size:16px;margin:14px 0 6px;border-bottom:1px solid #b6c7d2;padding-bottom:4px}p{margin:7px 0}.meta,.note{color:#526979}.details{display:grid;grid-template-columns:1fr 1fr;gap:5px 22px;margin:10px 0}.details div{overflow-wrap:anywhere}.food div{margin:4px 0;break-inside:avoid}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{padding:6px;border-bottom:1px solid #c4ced4;text-align:left;vertical-align:top}th{background:#eaf0f4}td:nth-child(n+3),th:nth-child(n+3){text-align:right;white-space:nowrap}.totals{margin-left:auto;width:330px;max-width:100%;break-inside:avoid}.totals div{display:flex;justify-content:space-between;gap:20px;padding:3px 0}.total{font-size:16px;font-weight:bold;border-top:2px solid #172b3b}.preserve{white-space:pre-wrap;overflow-wrap:anywhere}.toolbar{display:flex;gap:12px;margin:14px 0}button{padding:8px 16px;cursor:pointer}.brand{display:flex;align-items:center;gap:16px}img{width:70px;height:55px;object-fit:contain}thead{display:table-header-group}tr{break-inside:avoid}.signature{margin:24px 0 10px;display:flex;gap:20px;break-inside:avoid}.signature span{flex:1;border-top:1px solid #526979;padding-top:5px}.policy{font-size:11px;break-inside:avoid}@page{size:letter;margin:13mm}@media print{body{margin:0;padding:0;max-width:none}.toolbar{display:none}a{color:inherit;text-decoration:none}}@media(max-width:550px){.details{grid-template-columns:1fr}body{padding:0 12px}table{font-size:11px}th,td{padding:5px 3px}}</style></head><body>
  ${printable ? `<div class="toolbar"><button onclick="window.print()">Print / Save PDF</button><a href="?view=${flightPlan ? "summary" : "flight-plan"}">${flightPlan ? "Order Summary" : "Event Menu Planning Sheet"}</a></div>` : ""}
  <div class="brand">${printable ? '<img src="/api/branding/logo" alt="Aviator Brewing Company">' : ""}<div><p class="meta">AVIATOR READY ROOM · ${title.toUpperCase()}</p><h1>${escape(p.title)}</h1></div></div><p>${escape(eventDateLabel(p.date))} · ${escape(timeLabel(p.startTime))}${p.endTime ? " – " + escape(timeLabel(p.endTime)) + (p.endTime < p.startTime ? " (next day)" : "") : ""} · ${escape(p.status)}</p>
  ${message ? `<div class="preserve">${escape(message)}</div>` : ""}
  <div class="details">${detail("Location:", p.location)}${detail("Guests:", String(p.guestCount))}${detail("Contact:", p.contactName)}${detail("Email:", p.contactEmail)}${detail("Phone:", p.phone)}${detail("Setup access:", p.setupTime ? timeLabel(p.setupTime) : "")}${detail("Entrees / food served:", p.foodTime ? timeLabel(p.foodTime) : "")}${detail("Last call:", p.lastCall ? timeLabel(p.lastCall) : "")}</div>
  ${food.length ? `<h2>Package & food selections</h2><div class="food">${food.map(([label, value]) => detail(label + ":", value)).join("")}</div><p class="note">Package choices include buffet service, iced tea, soft drinks, water and a dedicated bartender. Only listed extras add a charge.</p>` : ""}
  ${facts.length ? `<h2>Event service & setup</h2><div class="details">${facts.map(([label, value]) => detail(label + ":", value)).join("")}</div>` : ""}
  ${p.barDetails ? `<p class="preserve"><b>Bar notes:</b> ${escape(p.barDetails)}</p>` : ""}
  ${p.flightPlan?.barMode === "Drink tickets" ? '<p class="note">Drink tickets are billed at actual drink prices, typically $6–$17. Bar charges are additional unless listed in this summary. Hosted tab caps are limits, not charges.</p>' : ""}
  <h2>Order summary</h2><table><thead><tr><th>Category</th><th>Item / selection</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead><tbody>${lines || '<tr><td colspan="5">No items entered.</td></tr>'}</tbody></table>
  <div class="totals"><div><span>Subtotal</span><b>${money(t.subtotal)}</b></div><div><span>Sales tax (${p.taxRateBps / 100}%)</span><b>${money(t.salesTax)}</b></div><div><span>PFB tax (${(p.pfbTaxRateBps || 0) / 100}%)</span><b>${money(t.pfbTax)}</b></div><div class="total"><span>Estimated total</span><span>${money(t.total)}</span></div><div><span>Deposit / payments received</span><b>${money(t.paid)}</b></div><div class="total"><span>${t.balance < 0 ? "Credit" : "Estimated balance"}</span><span>${money(Math.abs(t.balance))}</span></div><p class="note">Gratuity excluded. ${p.reservationDepositCents ? money(p.reservationDepositCents) + " reservation deposit is applied to the bill; only payments received are deducted above." : "Only recorded payments are deducted."}</p></div>
  ${p.notes ? `<h2>Event notes</h2><p class="preserve">${escape(p.notes)}</p>` : ""}
  ${flightPlan ? `<div class="policy"><h2>Timing, decorating & authorization</h2><p>Four guest hours, one hour of decorating access before the start, and 30 minutes for removal afterward. Additional hours: ${money(catalog.extraPrices.hour)} each, arranged in advance. All decorations require approval. No glitter, confetti, rice, silly string, flames, smoke, fog machines, wall adhesives, or items attached to fixtures. Keep exits, aisles and safety equipment clear.</p><p>Ready Room packages require ${catalog.minimumGuests} guests. Food is buffet-style. The reservation deposit is credited toward the final bill. Taxes are added and gratuity is excluded. Selections, availability and final pricing require written confirmation from Aviator.</p><div class="signature"><span>Customer printed name / signature</span><span>Date</span><span>Aviator confirmation</span></div></div>` : ""}
  <p class="meta">Revision ${plan.version} · Updated ${escape(new Date(plan.updatedAt).toLocaleString("en-US", {timeZone:"America/New_York"}))} Eastern<br>Questions or changes: events@aviatorbrew.com</p></body></html>`;
}
export async function eventUpdateHistory(id: string) {
  return withDatabase(async client => (await client.query("SELECT request_id,plan_version,recipient,subject,status,updated_at FROM website.private_event_updates WHERE plan_id=$1 ORDER BY updated_at DESC LIMIT 50", [id])).rows);
}
export async function emailEventUpdate(plan: EventPlan, input: { requestId: string; version: number; subject: string; message: string; includeSummary: boolean; emailApproved?: boolean }) {
  if (input.emailApproved !== true) throw new EventPlanError("Review and approve this customer email before sending.",403);
  if (input.version !== plan.version) throw new EventPlanError("The event changed. Reload the saved plan before sending its update.", 409);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId) || !input.subject.trim() || input.subject.length > 160 || /[\r\n]/.test(input.subject) || !input.message.trim() || input.message.length > 5000 || typeof input.includeSummary !== "boolean") throw new EventPlanError("Enter a subject and message (maximum 160 and 5,000 characters).");
  const catalog=(await getPrivateEventSettings()).catering;
  const recipients = [...new Set([plan.details.contactEmail, ...plan.details.guestEmails].filter(Boolean))];
  if (!recipients.length) throw new EventPlanError("Save a contact or guest email address before sending.");
  if (!isMailConfigured()) throw new EventPlanError("Email delivery is not configured.", 503);
  const hash = createHash("sha256").update(JSON.stringify([plan.id, input.version, input.subject, input.message, input.includeSummary])).digest("hex");
  const existing = await withDatabase(async client => client.query("SELECT content_hash FROM website.private_event_updates WHERE request_id=$1", [input.requestId]));
  if (existing.rows.some(row => row.content_hash !== hash)) throw new EventPlanError("Use a new message request after changing its contents.", 409);
  const sent: string[] = [], failed: string[] = [], pending: string[] = [];
  for (const recipient of recipients) {
    const claimed = await withDatabase(async client => client.query("INSERT INTO website.private_event_updates(plan_id,request_id,plan_version,recipient,content_hash,subject,status) VALUES($1,$2,$3,$4,$5,$6,'sending') ON CONFLICT(request_id,recipient) DO UPDATE SET status='sending',updated_at=now() WHERE website.private_event_updates.status='failed' AND website.private_event_updates.content_hash=EXCLUDED.content_hash RETURNING id", [plan.id, input.requestId, plan.version, recipient, hash, input.subject]));
    if (!claimed.rowCount) {
      const previous = await withDatabase(async client => client.query("SELECT status,content_hash FROM website.private_event_updates WHERE request_id=$1 AND recipient=$2", [input.requestId,recipient]));
      if (previous.rows[0]?.content_hash !== hash) throw new EventPlanError("This message request was already used for different contents.", 409);
      (previous.rows[0]?.status === "sent" ? sent : pending).push(recipient); continue;
    }
    let accepted = false;
    try {
      accepted = await sendMail({ to: recipient, fromName: "Aviator Events", replyTo: "events@aviatorbrew.com", subject: input.subject, text: `${input.message}\n\n${input.includeSummary ? eventSummaryText(plan,catalog) : plan.details.title + "\n" + eventDateLabel(plan.details.date) + " at " + timeLabel(plan.details.startTime)}\n\nReply to events@aviatorbrew.com`, html: input.includeSummary ? eventSummaryHtml(plan, false, input.message,false,catalog) : `<div style="font:16px/1.6 Arial,sans-serif;white-space:pre-wrap">${escape(input.message)}<p>Reply to events@aviatorbrew.com</p></div>` });
    } catch { /* Keep failed recipients retryable without repeating accepted messages. */ }
    await withDatabase(async client => client.query("UPDATE website.private_event_updates SET status=$1,updated_at=now() WHERE id=$2", [accepted ? "sent" : "failed", claimed.rows[0].id]));
    (accepted ? sent : failed).push(recipient);
  }
  return { sent, failed, pending };
}
