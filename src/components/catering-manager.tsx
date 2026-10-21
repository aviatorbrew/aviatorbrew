"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { getManagerJson, readManagerResponse } from "@/lib/manager-fetch";
import type { InquiryAvailability } from "@/lib/event-inquiry-availability";
import { eventDateLabel, timeLabel, type EventPlan } from "@/lib/event-plan";

type InquiryKind = "catering" | "event";
export type ManagedInquiry = {
  bookingStage?: string; planId?: string; reviewed?:boolean; reviewedAt?:string|null; eventContactEmail?:string;
  availability?:InquiryAvailability;
  payload?: {cateringPlan?: import("@/lib/event-plan").EventPlanDetails};
  id: string; kind: InquiryKind; createdAt: string; source: string; name: string; email: string; phone: string;
  pickupDate: string; pickupTime: string; guestCount: string; eventDate: string; eventTime: string; eventType: string; location: string;
  estimatedSubtotal: string; estimatedTax: string; estimatedTotal: string; cateringMenu: string; menuScanSource: string; orderSummary: string; message: string;
};
export type InquiryFocusRequest = { id: string; sequence: number };
type InquiryResponse = { inquiries?: ManagedInquiry[]; total?: number; filtered?: boolean; unreviewedCount?:number; error?: string };

function dateTime(value: string) { return value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : ""; }
function InquiryAvailabilityLabel({availability,onChoose}:{availability?:InquiryAvailability;onChoose:(option:InquiryAvailability["alternatives"][number])=>void}) {
  if(!availability)return null;
  return <div className="inquiry-availability"><span className={`inquiry-availability-label is-${availability.status}`}>{availability.status==="available"?"Date and Time Available":availability.status==="unavailable"?"Date/Time Not Available":"Date/time needed"}</span>{availability.reason?<small>{availability.reason}</small>:null}{availability.status==="unavailable"?<div className="inquiry-availability-alternatives"><strong>Available alternatives</strong>{availability.alternatives.length?<ul>{availability.alternatives.map(option=><li key={option.date}><button type="button" onClick={()=>onChoose(option)}>{eventDateLabel(option.date)} · {timeLabel(option.startTime)}{option.endTime?`–${timeLabel(option.endTime)}`:" (4-hour event)"} Eastern</button></li>)}</ul>:<p>No open alternatives within ±2 days or the following weekend. Review the calendar for other dates.</p>}</div>:null}</div>;
}
function csvValue(value: string) { return '"' + (value || "").replace(/"/g, '""') + '"'; }
function csv(inquiries: ManagedInquiry[], kind: InquiryKind) {
  const headers = kind === "catering"
    ? ["Submitted", "Name", "Email", "Phone", "Pickup Date", "Pickup Time", "Guests", "Subtotal", "Tax", "Total", "Order", "Notes"]
    : ["Submitted", "Name", "Email", "Phone", "Event Date", "Event Time", "Event Type", "Location", "Guests", "Notes"];
  const rows = inquiries.map((item) => kind === "catering"
    ? [dateTime(item.createdAt), item.name, item.email, item.phone, item.pickupDate, item.pickupTime, item.guestCount, item.estimatedSubtotal, item.estimatedTax, item.estimatedTotal, item.orderSummary, item.message]
    : [dateTime(item.createdAt), item.name, item.email, item.phone, item.eventDate, item.eventTime, item.eventType, item.location, item.guestCount, item.message]);
  return [headers, ...rows].map((row) => row.map(csvValue).join(",")).join("\n");
}

function DetailFields({ item, kind }: { item: ManagedInquiry; kind: InquiryKind }) {
  const fields = kind === "catering"
    ? [
      ["pickupDate", item.pickupDate], ["pickupTime", item.pickupTime], ["guestCount", item.guestCount],
      ["estimatedSubtotal", item.estimatedSubtotal], ["estimatedTax", item.estimatedTax], ["estimatedTotal", item.estimatedTotal],
    ]
    : [
      ["eventDate", item.eventDate], ["eventTime", item.eventTime], ["eventType", item.eventType || "Other"], ["location", item.location], ["guestCount", item.guestCount],
    ];
  return <dl className="manager-inquiry-fields">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Not set"}</dd></div>)}</dl>;
}

function InquiryManager({ kind, title, eyebrow, copy, onPlan, focusRequest, onDeleted, onUnreviewedCount, refreshKey=0, hideHeading=false, onAlternativeSaved }: { kind: InquiryKind; title: string; eyebrow: string; copy: string; onPlan?: (item: ManagedInquiry) => void; focusRequest?: InquiryFocusRequest | null; onDeleted?: (id:string)=>void; onUnreviewedCount?:(count:number)=>void; refreshKey?:number; hideHeading?:boolean;onAlternativeSaved?:(plan:EventPlan)=>void }) {
  const section = useRef<HTMLElement>(null);
  const loadSequence = useRef(0);
  const [inquiries, setInquiries] = useState<ManagedInquiry[]>([]);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState("Loading inquiries...");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [query, setQuery] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [alternative,setAlternative]=useState<{item:ManagedInquiry;date:string;email:string;subject:string;message:string;requestId:string;saved?:boolean;deliveryComplete?:boolean}|null>(null);
  const [alternativeApproved,setAlternativeApproved]=useState(false),[alternativeBusy,setAlternativeBusy]=useState(false),[alternativeResult,setAlternativeResult]=useState("");
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(()=>{if(alternative)document.querySelector(".inquiry-alternative-email")?.scrollIntoView({block:"start"});},[alternative?.item.id,alternative?.date]);
  const marketingCount = useMemo(() => new Set(inquiries.map((item) => item.email.toLowerCase()).filter(Boolean)).size, [inquiries]);

  async function load(next: { q?: string; start?: string; end?: string; id?: string; all?: boolean } = {}) {
    const sequence = ++loadSequence.current;
    setBusy(true); setMessage("Loading inquiries...");
    const q = next.q ?? query; const startDate = next.start ?? start; const endDate = next.end ?? end;
    const all = !next.id && (next.all ?? showAll);
    setShowAll(all);
    const params = new URLSearchParams({ kind });
    if (next.id) params.set("id", next.id);
    if (q) params.set("q", q); if (startDate) params.set("start", startDate); if (endDate) params.set("end", endDate);
    params.set("limit", all ? "250" : q || startDate || endDate ? "200" : "5");
    try {
      const body = await getManagerJson("/api/manager/inquiries?" + params.toString()) as InquiryResponse;
      if (sequence !== loadSequence.current) return;
      const rows = [...(body.inquiries || [])];
      while (all && rows.length < (body.total || 0)) {
        params.set("offset", String(rows.length));
        const page = await getManagerJson("/api/manager/inquiries?" + params.toString()) as InquiryResponse;
        if (sequence !== loadSequence.current) return;
        if (!page.inquiries?.length) break;
        rows.push(...page.inquiries);
      }
      body.inquiries = Array.from(new Map(rows.map(item=>[item.id,item])).values());
      if (sequence !== loadSequence.current) return;
      setInquiries(body.inquiries || []); setTotal(body.total || 0);
      if(typeof body.unreviewedCount==="number")onUnreviewedCount?.(body.unreviewedCount);
      const shown = body.inquiries?.length || 0;
      setMessage(next.id ? (shown ? "Showing the original website inquiry for this calendar event. Use Plan event to open its event plan, or Last 5 to return to recent inquiries." : "The original website inquiry is no longer available. Open Edit plan in the event list to continue working with the saved event.") : all ? `Showing all ${shown} inquiries${body.filtered?" matching your filters":""}.` : body.filtered ? (shown ? "Showing " + shown + " of " + (body.total || 0) + " matched records." : "No records found for that filter.") : (shown ? "Showing the last " + shown + " records. Search by date or name to review older inquiries." : "No records stored yet."));
    } catch (error) { if (sequence === loadSequence.current) setMessage(error instanceof Error ? error.message : "Could not load inquiries."); }
    finally { if (sequence === loadSequence.current) setBusy(false); }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { if(refreshKey)load(focusRequest?{id:focusRequest.id}:{}); }, [refreshKey]);
  useEffect(() => {
    if (!focusRequest) return;
    setQuery(""); setStart(""); setEnd(""); setOpenId(focusRequest.id);
    load({ id: focusRequest.id, q: "", start: "", end: "" });
  }, [focusRequest]);
  useEffect(() => {
    if (!focusRequest || openId !== focusRequest.id) return;
    const row = section.current?.querySelector<HTMLElement>(`[data-inquiry-id="${focusRequest.id}"]`);
    if (row) { row.scrollIntoView({ behavior: "instant", block: "start" }); row.focus({ preventScroll: true }); }
  }, [focusRequest, inquiries, openId]);
  function chooseAlternative(item:ManagedInquiry,option:InquiryAvailability["alternatives"][number]){
    const timing=eventDateLabel(option.date)+" at "+timeLabel(option.startTime)+(option.endTime?"–"+timeLabel(option.endTime):" (4-hour event)")+" Eastern";
    setAlternative({item,date:option.date,email:item.eventContactEmail||item.email,subject:"Alternative date for your Aviator private event",message:`Hi ${item.name||"there"},\n\nYour requested event time is unavailable. Would ${timing} work for your event instead?\n\nWe have tentatively moved your event request to that date while we wait for your reply. Please let us know whether it works for you. Your event is not confirmed until Aviator approves the reservation and the required deposit is paid.\n\nThank you,\nAviator Events`,requestId:crypto.randomUUID()});setAlternativeApproved(false);setAlternativeResult("");
  }
  async function offerAlternative(event:FormEvent){event.preventDefault();if(!alternative||!alternativeApproved||alternativeBusy)return;setAlternativeBusy(true);setAlternativeResult("");try{const body=await readManagerResponse(await fetch(`/api/manager/inquiries/${alternative.item.id}/alternative`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({date:alternative.date,requestId:alternative.requestId,subject:alternative.subject,message:alternative.message,expectedEmail:alternative.email,emailApproved:true})}));onAlternativeSaved?.(body.plan);setAlternative(current=>current?{...current,saved:true,deliveryComplete:body.failed.length===0}:current);setAlternativeApproved(false);setAlternativeResult(body.failed.length?"Event moved to the alternative date as tentative. Email failed; approve and retry this same message to retry delivery.":body.pending.length?"Event moved to the alternative date as tentative. Email delivery is pending; check the event email history before trying again.":"Event moved to the alternative date as tentative. Email accepted for delivery.");await load({id:alternative.item.id,q:"",start:"",end:""});}catch(e){setAlternativeResult(e instanceof Error?e.message:"Could not offer this date. Refresh the event before retrying.");}finally{setAlternativeBusy(false);}}
  function closeInquiry(id:string){setOpenId(null);requestAnimationFrame(()=>{const row=section.current?.querySelector<HTMLElement>(`[data-inquiry-id="${id}"]`);row?.scrollIntoView({block:"nearest"});row?.querySelector<HTMLButtonElement>(".manager-catering-actions button")?.focus({preventScroll:true});});}
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); load(); }
  function clearFilters() { setQuery(""); setStart(""); setEnd(""); load({ q: "", start: "", end: "", all: false }); }
  function showAllInquiries() { setQuery(""); setStart(""); setEnd(""); load({q:"",start:"",end:"",all:true}); }
  function exportCsv() { const blob = new Blob([csv(inquiries, kind)], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = kind === "catering" ? "aviator-catering-orders.csv" : "aviator-private-event-inquiries.csv"; link.click(); URL.revokeObjectURL(url); }

  async function deleteInquiry(item: ManagedInquiry) {
    const label = kind === "catering" ? "catering order" : "private event inquiry";
    if (!window.confirm("Delete this saved " + label + " for " + (item.name || item.email || "this customer") + "? "+(kind==="event"?"Any saved event plan, proposals and payments will be kept. ":"")+"This cannot be undone.")) return;
    setDeletingId(item.id);
    try {
      const response = await fetch("/api/manager/inquiries?kind=" + encodeURIComponent(kind) + "&id=" + encodeURIComponent(item.id), { method: "DELETE" });
      const body = await readManagerResponse(response) as { unreviewedCount?:number };
      setInquiries((current) => current.filter((record) => record.id !== item.id));
      setTotal((current) => Math.max(0, current - 1));
      if (openId === item.id) setOpenId(null);
      onDeleted?.(item.id);
      if(typeof body.unreviewedCount==="number")onUnreviewedCount?.(body.unreviewedCount);
      setMessage("Saved " + label + " deleted."+(kind==="event"?" Existing event plans, proposals and payments were kept. No email was sent.":""));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete inquiry.");
    } finally {
      setDeletingId("");
    }
  }

  return <section ref={section} id={kind === "catering" ? "catering" : "private-events"} className={"coupon-manager manager-inquiries"+(kind==="event"?" website-inquiries":"")}>
    <p className="eyebrow">{eyebrow}</p>{!hideHeading?<h2>{title}</h2>:null}<p>{copy}</p>{kind==="event"?<p className="inquiry-calendar-note">Availability uses the current calendar; staff approval and the required deposit are still needed.</p>:null}<p className="media-message" role="status">{message}</p>
    <div className="manager-catering-stats"><article><span>Total matched</span><strong>{total}</strong></article><article><span>Unique emails shown</span><strong>{marketingCount}</strong></article><article><span>Visible rows</span><strong>{inquiries.length}</strong></article></div>
    <form className="manager-catering-query" onSubmit={submit}><label>Search by name<input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Name, email, phone, item, notes" /></label><label>Start date<input type="date" value={start} onChange={(event) => setStart(event.currentTarget.value)} /></label><label>End date<input type="date" value={end} onChange={(event) => setEnd(event.currentTarget.value)} /></label><div><button className="button" disabled={busy}>{busy ? "Loading..." : "Search"}</button><button className="button button-outline" type="button" onClick={clearFilters} disabled={busy}>Last 5</button>{kind==="event"?<button className="button button-outline" type="button" onClick={showAllInquiries} disabled={busy} aria-pressed={showAll}>Show All</button>:null}<button className="button button-outline" type="button" onClick={exportCsv} disabled={!inquiries.length}>Export CSV</button></div></form>
    {alternative?<form className="inquiry-alternative-email" onSubmit={offerAlternative}><h3>Review alternative date &amp; customer email</h3><p><strong>To:</strong> {alternative.email}<br/><strong>Reply to:</strong> events@aviatorbrew.com<br/><strong>New date:</strong> {eventDateLabel(alternative.date)} · Tentative / Under Review</p><label>Subject<input value={alternative.subject} required maxLength={160} disabled={alternativeBusy||alternative.saved} onChange={e=>{setAlternative({...alternative,subject:e.target.value,requestId:crypto.randomUUID()});setAlternativeApproved(false);}}/></label><label>Message<textarea rows={8} value={alternative.message} required maxLength={5000} disabled={alternativeBusy||alternative.saved} onChange={e=>{setAlternative({...alternative,message:e.target.value,requestId:crypto.randomUUID()});setAlternativeApproved(false);}}/></label><label className="event-check"><input type="checkbox" checked={alternativeApproved} required disabled={alternativeBusy||alternative.deliveryComplete} onChange={e=>setAlternativeApproved(e.target.checked)}/>I have reviewed the recipient and message, and approve changing the event date to tentative and sending this email.</label>{alternativeResult?<p role="status">{alternativeResult}</p>:null}<div className="event-row-actions"><button type="submit" className="button" disabled={alternativeBusy||!alternativeApproved||alternative.deliveryComplete}>{alternativeBusy?"Working…":alternative.deliveryComplete?"Email processed":alternative.saved?"Retry approved email":"Confirm date change & send email"}</button><button type="button" disabled={alternativeBusy} onClick={()=>setAlternative(null)}>Close — don’t send</button></div></form>:null}
    <div className="manager-catering-list">{inquiries.length ? inquiries.map((item) => <article key={item.id} data-inquiry-id={item.id} tabIndex={-1} className={focusRequest?.id===item.id?"is-calendar-inquiry":undefined}><header><div><div className="inquiry-name-line"><strong>{kind==="event"?<><span className="event-status-label event-status-inquiry">{item.reviewed||item.planId?"REVIEWED":"INQUIRY"}</span>: </>:null}{item.name || "Unnamed customer"}</strong>{kind==="event"?<InquiryAvailabilityLabel availability={item.availability} onChoose={option=>chooseAlternative(item,option)}/>:null}</div>{kind === "event" ? <div className="event-inquiry-header-actions">{onPlan?<button className="event-inquiry-plan" type="button" onClick={() => onPlan(item)}>{item.planId?"Open event plan":"Plan event"}</button>:null}<button className="is-danger" type="button" onClick={()=>deleteInquiry(item)} disabled={deletingId===item.id}>{deletingId===item.id?"Deleting…":"Delete Inquiry"}</button></div> : null}<span>{kind==="event"?(item.planId?"Event status: "+(item.bookingStage||"Under Review")+" · ":""):""}{item.email}{item.phone ? " / " + item.phone : ""}</span></div><time>{dateTime(item.createdAt)}</time></header><dl>{kind === "catering" ? <><div><dt>Pickup</dt><dd>{item.pickupDate || "No date"} {item.pickupTime || ""}</dd></div><div><dt>Guests</dt><dd>{item.guestCount || "Not set"}</dd></div><div><dt>Total</dt><dd>{item.estimatedTotal || "Confirm"}</dd></div></> : <><div><dt>Event</dt><dd>{item.eventDate || "No date"} {item.eventTime || ""}</dd></div><div><dt>Type</dt><dd>{item.eventType || "Other"}</dd></div><div><dt>Guests</dt><dd>{item.guestCount || "Not set"}</dd></div></>}</dl><div className="manager-catering-actions"><button type="button" onClick={() => setOpenId(openId === item.id ? null : item.id)}>{openId === item.id ? "Hide details" : "Review details"}</button>{kind==="catering"?<button className="is-danger" type="button" onClick={() => deleteInquiry(item)} disabled={deletingId === item.id}>{deletingId === item.id ? "Deleting..." : "Delete"}</button>:null}</div>{openId === item.id ? <section className="manager-catering-details" aria-label={kind==="event"?"Website inquiry details":"Catering order details"}>{kind==="event"?<div className="manager-catering-actions inquiry-close-actions"><button type="button" onClick={()=>closeInquiry(item.id)}>Close</button></div>:null}<div><h3>{kind === "catering" ? "Order fields" : "Event fields"}</h3><DetailFields item={item} kind={kind} />{kind==="event"&&item.orderSummary?<><h3>Requested buffet & estimate</h3><pre>{item.orderSummary}</pre></>:null}{kind === "catering" ? <><h3>Food order</h3><pre>{item.orderSummary || "No structured order entered."}</pre></> : null}</div><div><h3>Customer notes</h3><p>{item.message || "No notes."}</p>{kind === "catering" ? <><h3>Totals</h3><p>Subtotal {item.estimatedSubtotal || "$0.00"} / Tax {item.estimatedTax || "$0.00"} / Total {item.estimatedTotal || "$0.00"}</p>{item.cateringMenu ? <p><a href={item.cateringMenu} target="_blank" rel="noreferrer">Open submitted menu source</a></p> : null}</> : null}</div>{kind==="event"?<div className="manager-catering-actions inquiry-close-actions"><button type="button" onClick={()=>closeInquiry(item.id)}>Close</button></div>:null}</section> : null}</article>) : <p className="tour-schedule-empty">No records found.</p>}</div>
  </section>;
}

export function CateringManager() { return <InquiryManager kind="catering" eyebrow="Catering operations" title="Catering To Go orders" copy="The last 5 Catering To Go submissions are shown first. Search by date, name, email, phone, order item, or notes to review older records and export follow-up lists." />; }
export function PrivateEventsInquiryManager({ onPlan, focusRequest, onDeleted, onUnreviewedCount, refreshKey, hideHeading, onAlternativeSaved }: { onPlan?: (item: ManagedInquiry) => void; focusRequest?: InquiryFocusRequest | null; onDeleted?: (id:string)=>void; onUnreviewedCount?:(count:number)=>void; refreshKey?:number; hideHeading?:boolean;onAlternativeSaved?:(plan:EventPlan)=>void } = {}) { return <InquiryManager onPlan={onPlan} focusRequest={focusRequest} onDeleted={onDeleted} onUnreviewedCount={onUnreviewedCount} refreshKey={refreshKey} hideHeading={hideHeading} onAlternativeSaved={onAlternativeSaved} kind="event" eyebrow="Online event requests" title="Website Inquiry" copy="Choose Plan event to mark a website request Reviewed, then save the plan to add it to the calendar. A saved draft is not a confirmed booking. Confirmed and closed requests leave this list; find their saved events in Event Settings → Reports. The last 5 pending inquiries are shown first." />; }
