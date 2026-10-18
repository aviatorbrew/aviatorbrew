"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { EventProposalManager } from "@/components/event-proposal-manager";
import { EventFlightPlanFields } from "@/components/event-flight-plan-fields";
import { PrivateEventsInquiryManager, type ManagedInquiry, type InquiryFocusRequest } from "@/components/catering-manager";
import { defaultCateringCatalog, type CateringCatalog, emptyEventPlan, eventDateLabel, eventStatuses, eventTotals, itemCategories, money, parseEventPlan, readyRoomPackages, timeLabel, type EventOrderItem, type EventPlan, type EventPlanDetails } from "@/lib/event-plan";

type Update = { recipient: string; subject: string; status: string; updated_at: string; plan_version: number };
function today() { return new Intl.DateTimeFormat("en-CA", {timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()); }
function tentativeCalendarEvent(plan: EventPlan) { return plan.details.status === "Tentative" || Boolean(plan.sourceInquiryId && plan.details.status === "Draft"); }
function cents(value: string) { return Math.round(Number(value || 0) * 100); }
async function result(response: Response) { const body = await response.json(); if (!response.ok) throw new Error(body.error || "The request failed."); return body; }
const summaryUrl = (id: string, flightPlan = false) => `/api/manager/event-plans/${encodeURIComponent(id)}/summary${flightPlan ? "?view=flight-plan" : ""}`;

function KitchenSheetLink({plan,disabled=false}:{plan:EventPlan|null;disabled?:boolean}) {
  if (!plan || disabled) return <button type="button" className="button button-outline" disabled title="Save the event and any menu changes before printing.">Kitchen Production Sheet / Print</button>;
  return <a className="button button-outline" href={`/api/manager/event-plans/${encodeURIComponent(plan.id)}/kitchen`} target="_blank" rel="noreferrer">Kitchen Production Sheet / Print</a>;
}

function CalendarSourceNotice({plan}:{plan:EventPlan}) {
  const sync=plan.calendarSync;
  if(!sync?.status||sync.status==="active")return null;
  const label=sync.status==="removed"?"Deleted from Google Calendar":sync.status==="cancelled"?"Cancelled in Google Calendar":"Google Calendar has changes to review";
  return <details className="event-calendar-source-notice"><summary>{label} — saved plan preserved</summary><p>Your event details, food order and payments have been kept. Review the Google entry before changing or cancelling this plan.</p>{sync.source?<><p><strong>Google entry:</strong> {sync.source.title} · {sync.source.date} {sync.source.startTime}–{sync.source.endTime}</p>{sync.source.description?<p className="preserve">{sync.source.description}</p>:null}<a href={sync.source.url} target="_blank" rel="noreferrer">View Google Calendar entry</a></>:null}</details>;
}

export function EventPlanningManager() {
  const [catalog,setCatalog]=useState<CateringCatalog>(structuredClone(defaultCateringCatalog));
  const readyRoomPackages=catalog.packages;
  const [month, setMonth] = useState(() => today().slice(0,7));
  const [plans, setPlans] = useState<EventPlan[]>([]);
  const [calendarSyncStatus,setCalendarSyncStatus]=useState<{checkedAt:string}|null>(null);
  const [query, setQuery] = useState("");
  const [defaultFee, setDefaultFee] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const errorNotice = useRef<HTMLParagraphElement>(null);
  const [selected, setSelected] = useState<EventPlan | null>(null);
  const [draft, setDraft] = useState<EventPlanDetails | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [emailPlan, setEmailPlan] = useState<EventPlan | null>(null);
  const [subject, setSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [includeSummary, setIncludeSummary] = useState(true);
  const [emailResult, setEmailResult] = useState("");
  const [emailError, setEmailError] = useState("");
  const requestId = useRef("");
  const editor = useRef<HTMLDivElement>(null);
  const inquiryArchive = useRef<HTMLDetailsElement>(null);
  const [inquiryFocus,setInquiryFocus] = useState<InquiryFocusRequest|null>(null);
  const dirty = Boolean(draft && (!selected || JSON.stringify(draft) !== JSON.stringify(selected.details)));
  const totals = draft ? eventTotals(draft,catalog) : null;

  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    fetch(`/api/manager/event-plans?month=${month}`, {signal:controller.signal,cache:"no-store"}).then(result).then(body => {setPlans(body.plans);setCatalog(body.catering||structuredClone(defaultCateringCatalog));setDefaultFee(body.defaultRoomFeeCents);setCalendarSyncStatus(body.calendarSyncStatus||null);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[month]);
  useEffect(() => { if(error) errorNotice.current?.scrollIntoView({block:"center"}); }, [error]);
  useEffect(() => {
    if (!emailPlan) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setEmailPlan(null);
      if (event.key !== "Tab") return;
      const controls = Array.from(document.querySelectorAll<HTMLElement>(".event-email-composer input:not(:disabled),.event-email-composer textarea:not(:disabled),.event-email-composer button:not(:disabled)"));
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {event.preventDefault();last?.focus();}
      if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first?.focus();}
    };
    document.addEventListener("keydown",onKey);
    return () => {document.body.style.overflow = previous;document.removeEventListener("keydown",onKey);};
  }, [emailPlan,busy]);
  function patch<K extends keyof EventPlanDetails>(key: K, value: EventPlanDetails[K]) { setDraft(current => current ? {...current,[key]:value} : current); }
  function patchItem(id: string, values: Partial<EventOrderItem>) { setDraft(current=>current ? {...current,items:current.items.map(row=>row.id===id ? {...row,...values}:row)} : current); }
  function discardOkay() { return !dirty || window.confirm("Discard your unsaved event changes?"); }
  function focusEditor() { window.setTimeout(()=>{ const target=editor.current; if(target){target.scrollIntoView({behavior:"instant",block:"start"});target.focus({preventScroll:true});} },50); }
  function newPlan(date = "", inquiry?: ManagedInquiry) {
    if (!discardOkay()) return;
    if(inquiry?.planId){getExistingInquiryPlan(inquiry.planId);return;}
    const details = emptyEventPlan(defaultFee);
    if (inquiry) Object.assign(details,{title:`${inquiry.eventType || "Private event"} - ${inquiry.name || "Guest"}`,contactName:inquiry.name,contactEmail:inquiry.email,phone:inquiry.phone,guestCount:Number(inquiry.guestCount)||0,notes:inquiry.message,date:inquiry.eventDate || ""});
    if(inquiry?.payload?.cateringPlan)Object.assign(details,inquiry.payload.cateringPlan,{status:"Draft",paidCents:0,internalNotes:""});
    if (date) details.date=date;
    setSelected(null);setSource(inquiry?.id || null);setDraft(details);setUpdates([]);setError("");setNotice("");focusEditor();
  }
  async function getExistingInquiryPlan(id:string){setBusy(true);try{const body=await result(await fetch(`/api/manager/event-plans/${id}`,{cache:"no-store"}));setSelected(body.plan);setDraft(body.plan.details);setSource(body.plan.sourceInquiryId);setUpdates(body.updates);focusEditor();}catch(e){setError(e instanceof Error?e.message:"Could not open the existing event plan.");}finally{setBusy(false);}}
  async function openPlan(plan: EventPlan) {
    if (!discardOkay()) return;
    setBusy(true);setError("");
    try {const body=await result(await fetch(`/api/manager/event-plans/${plan.id}`,{cache:"no-store"}));setSelected(body.plan);setDraft(body.plan.details);setSource(body.plan.sourceInquiryId);setUpdates(body.updates);focusEditor();}
    catch(e){setError(e instanceof Error ? e.message:"Could not open event.");}finally{setBusy(false);}
  }
  async function persist(): Promise<EventPlan> {
    if (!draft) throw new Error("Open an event first.");
    const details = parseEventPlan({...draft,guestEmails:draft.guestEmails.map(s=>s.trim()).filter(Boolean)},catalog);
    const response = await fetch(selected ? `/api/manager/event-plans/${selected.id}` : "/api/manager/event-plans",{method:selected?"PUT":"POST",headers:{"content-type":"application/json"},body:JSON.stringify({details,version:selected?.version,sourceInquiryId:source})});
    const body=await result(response);const plan=body.plan as EventPlan;
    setSelected(plan);setDraft(plan.details);setSource(plan.sourceInquiryId);
    if (plan.details.date.slice(0,7)!==month)setMonth(plan.details.date.slice(0,7));
    else setPlans(current=>[...current.filter(p=>p.id!==plan.id),plan].sort((a,b)=>(a.details.date+a.details.startTime).localeCompare(b.details.date+b.details.startTime)));
    setNotice(`Event saved · revision ${plan.version}. No email was sent.`);return plan;
  }
  async function save(event: FormEvent) {event.preventDefault();setBusy(true);setError("");try{await persist();}catch(e){setError(e instanceof Error?e.message:"Could not save event.");}finally{setBusy(false);}}
  async function print(plan?: EventPlan, flightPlan = false) {
    const popup=window.open("about:blank","_blank");if(popup)popup.opener=null;
    setBusy(true);setError("");
    try{const saved=(!plan || (selected?.id===plan.id && dirty)) ? await persist() : plan;if(popup)popup.location.href=summaryUrl(saved.id, flightPlan);else window.location.assign(summaryUrl(saved.id, flightPlan));}
    catch(e){popup?.close();setError(e instanceof Error?e.message:"Could not create summary.");}finally{setBusy(false);}
  }
  async function compose(plan?: EventPlan) {
    setBusy(true);setError("");
    try {
      const saved=(!plan || (selected?.id===plan.id && dirty)) ? await persist() : plan;
      const body=await result(await fetch(`/api/manager/event-plans/${saved.id}`,{cache:"no-store"}));
      setEmailPlan(body.plan);setSubject(`Event update: ${body.plan.details.title}`);setEmailMessage("");setIncludeSummary(true);setEmailResult("");setEmailError("");requestId.current=crypto.randomUUID();
    }catch(e){setError(e instanceof Error?e.message:"Could not open message.");}finally{setBusy(false);}
  }
  async function sendUpdate(event: FormEvent) {
    event.preventDefault();if(!emailPlan || busy)return;setBusy(true);setEmailError("");setEmailResult("");
    try {
      const body=await result(await fetch(`/api/manager/event-plans/${emailPlan.id}/email`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({requestId:requestId.current,version:emailPlan.version,subject,message:emailMessage,includeSummary})}));
      setEmailResult(`${body.sent.length} accepted for delivery${body.failed.length?`, ${body.failed.length} failed — retry to send only to failed recipients`:""}${body.pending.length?`, ${body.pending.length} still pending — check delivery before sending another message`:""}.`);
      if(selected?.id===emailPlan.id){const history=await result(await fetch(`/api/manager/event-plans/${emailPlan.id}`,{cache:"no-store"}));setUpdates(history.updates);}
    }catch(e){setEmailError(e instanceof Error?e.message:"Could not send. Your draft is still here.");}finally{setBusy(false);}
  }
  function openCalendarEvent(plan: EventPlan) {
    if (!plan.sourceInquiryId) { openPlan(plan); return; }
    if (inquiryArchive.current) {
      inquiryArchive.current.open = true;
      inquiryArchive.current.scrollIntoView({behavior:"instant",block:"start"});
    }
    setInquiryFocus(current=>({id:plan.sourceInquiryId!,sequence:(current?.sequence||0)+1}));
  }
  function changeMonth(delta: number) {const [year,m]=month.split("-").map(Number);const d=new Date(Date.UTC(year,m-1+delta,1));setMonth(d.toISOString().slice(0,7));}
  const first=new Date(month+"-01T12:00:00Z");
  const days=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  const visible=plans.filter(plan=>`${plan.details.title} ${plan.details.contactName} ${plan.details.contactEmail}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="coupon-manager event-planning" id="event-planning">
    <div className="event-planning-heading"><div><p className="eyebrow">Private event operations</p><h2>Event planning</h2><p>Review online buffet requests or enter manual event orders. Recalculate summaries, issue proposals, track deposits and print kitchen sheets here.</p></div><button className="button" type="button" disabled={loading||busy} onClick={()=>newPlan()}>+ New event</button></div>
    {calendarSyncStatus?<p className="event-calendar-sync-status">Google Calendar sync: 8 a.m., noon and 3 p.m. Eastern. Last checked: {new Date(calendarSyncStatus.checkedAt).toLocaleString("en-US",{timeZone:"America/New_York"})}. Existing plans are preserved.</p>:null}
    {notice?<p role="status" className="event-plan-notice">{notice}</p>:null}{error?<p ref={errorNotice} role="alert" className="event-plan-error">{error}</p>:null}
    <div className="event-calendar-toolbar"><button type="button" aria-label="Previous month" onClick={()=>changeMonth(-1)}>←</button><label>Calendar month<input type="month" value={month} required onChange={e=>{if(e.target.value)setMonth(e.target.value);}} /></label><button type="button" aria-label="Next month" onClick={()=>changeMonth(1)}>→</button><button type="button" onClick={()=>setMonth(today().slice(0,7))}>This month</button><span>{loading?"Loading events…":`${plans.length} event(s)`}</span></div>
    <div className="event-calendar" aria-label="Private event calendar">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day=><div className="event-weekday" key={day}>{day}</div>)}{Array.from({length:first.getUTCDay()},(_,i)=><div className="event-day empty" key={`empty-${i}`} />)}{Array.from({length:days},(_,i)=>{const date=`${month}-${String(i+1).padStart(2,"0")}`;return <div className={`event-day${date===today()?" today":""}`} key={date}><button type="button" className="event-day-number" aria-label={`New event on ${date}`} disabled={busy||loading} onClick={()=>newPlan(date)}>{i+1}</button>{plans.filter(p=>p.details.date===date).map(p=><button type="button" className={"event-calendar-entry "+(tentativeCalendarEvent(p)?"tentative":p.details.status.toLowerCase())} key={p.id} disabled={busy} onClick={()=>openCalendarEvent(p)} title={`${tentativeCalendarEvent(p)?"Tentative: ":""}${p.details.title} · ${p.sourceInquiryId?"Open website inquiry":"Open event plan"}`}><span>{p.details.startTime?timeLabel(p.details.startTime):"Time TBD"}</span>{tentativeCalendarEvent(p)?"Tentative: ":""}{p.details.title}{p.calendarSync?.status&&p.calendarSync.status!=="active"?<span className="event-calendar-source-tag">Google: {p.calendarSync.status==="removed"?"deleted":p.calendarSync.status}</span>:null}</button>)}</div>;})}{Array.from({length:(7-((first.getUTCDay()+days)%7))%7},(_,i)=><div className="event-day empty" key={`trailing-${i}`} />)}</div>
    <label className="event-list-search">Find an event in this month<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Event name, contact, or email" /></label>
    <div className="event-plan-list">{visible.map(plan=><article key={plan.id}><div className="event-plan-row-title"><button type="button" onClick={()=>openPlan(plan)} disabled={busy}><strong>{plan.details.title}</strong></button><button type="button" className="event-print-button" onClick={()=>print(plan)} disabled={busy}>Order Summary / Print</button><button type="button" onClick={()=>print(plan,true)} disabled={busy}>Menu Planning Sheet / PDF</button><KitchenSheetLink plan={plan} disabled={busy||(selected?.id===plan.id&&dirty)}/></div><p>{eventDateLabel(plan.details.date)} · {timeLabel(plan.details.startTime)} · {plan.bookingStage||plan.details.status} · {plan.details.guestCount} guests</p><p>{plan.details.contactName} {plan.details.contactEmail?`· ${plan.details.contactEmail}`:""} · {money(eventTotals(plan.details,catalog).total)}</p><CalendarSourceNotice plan={plan}/><div className="event-row-actions"><button type="button" onClick={()=>openPlan(plan)} disabled={busy}>Edit plan</button><button type="button" onClick={()=>compose(plan)} disabled={busy}>Write guest update</button></div></article>)}{!loading&&!visible.length?<p>No event plans for this month. Choose a date or add an event from an inquiry below.</p>:null}</div>
    {draft?<div className="event-plan-editor" ref={editor} tabIndex={-1}><div className="event-editor-actions"><h3>{selected?`Edit ${selected.details.title}`:"New event plan"}</h3><KitchenSheetLink plan={selected} disabled={busy||dirty}/></div><p>{!selected||dirty?"Save the event and any menu changes to enable kitchen printing. ":""}Kitchen production sheets use the saved menu for approved or confirmed events.</p>{selected?<CalendarSourceNotice plan={selected}/>:null}<p>Saving and printing do not send email. Use “Write guest update” separately when you want to contact guests.</p><form onSubmit={save}>
      <fieldset disabled={busy}><legend>Event & contact</legend><div className="event-fields">
        <label className="event-field-span2">Event name<input value={draft.title} maxLength={200} required onChange={e=>patch("title",e.target.value)} /></label><label>Status<select value={draft.status} onChange={e=>patch("status",e.target.value as EventPlanDetails["status"])}>{eventStatuses.map(s=><option key={s}>{s}</option>)}</select></label>
        <label>Date<input type="date" value={draft.date} required onChange={e=>patch("date",e.target.value)} /></label><label>Start time<input type="time" value={draft.startTime} onChange={e=>patch("startTime",e.target.value)} /></label><label>End time<input type="time" title="An earlier end time means the next day." value={draft.endTime} onChange={e=>patch("endTime",e.target.value)} /></label>
        <label>Guest count<input type="number" min={draft.flightPlan?.packageId?30:0} max={10000} step={1} value={draft.guestCount||""} onChange={e=>patch("guestCount",Number(e.target.value))} /></label><label className="event-field-span2">Location<input value={draft.location} required maxLength={300} onChange={e=>patch("location",e.target.value)} /></label>
        <label>Contact name<input value={draft.contactName} maxLength={200} onChange={e=>patch("contactName",e.target.value)} /></label><label>Contact email (optional)<input type="email" value={draft.contactEmail} onChange={e=>patch("contactEmail",e.target.value)} /></label><label>Phone<input type="tel" value={draft.phone} onChange={e=>patch("phone",e.target.value)} /></label>
        <label>Setup access<input type="time" value={draft.setupTime} onChange={e=>patch("setupTime",e.target.value)} /></label><label>Entrees / food served<input type="time" value={draft.foodTime} onChange={e=>patch("foodTime",e.target.value)} /></label><label>Last call<input type="time" value={draft.lastCall} onChange={e=>patch("lastCall",e.target.value)} /></label>
      </div><details className="event-compact-details"><summary>Additional guest email addresses (optional)</summary><label>Guest emails<textarea rows={2} value={draft.guestEmails.join("\n")} onChange={e=>patch("guestEmails",e.target.value.split(/[,;\n]/))} placeholder="One address per line, up to 20" /></label></details></fieldset>
      <fieldset className="event-flight-wrapper" disabled={busy}><EventFlightPlanFields catalog={catalog} details={draft} onChange={value=>patch("flightPlan",value)} /></fieldset>
      <fieldset disabled={busy}><legend>Order summary & custom charges</legend><p>Package and extras recalculate with guest count. Add custom charges below; enter drink charges at actual prices.</p><div className="event-order-rows">{draft.items.map((item,index)=><div className="event-order-row" key={item.id} aria-label={`Order row ${index+1}`}><label>Category<select value={item.category} onChange={e=>patchItem(item.id,{category:e.target.value as EventOrderItem["category"]})}>{itemCategories.map(c=><option key={c}>{c}</option>)}</select></label><label className="event-item-name">Item / menu selection<input value={item.name} maxLength={200} required onChange={e=>patchItem(item.id,{name:e.target.value})} /></label><label>Quantity<input type="number" min={1} max={10000} step={1} value={item.quantity||""} required onChange={e=>patchItem(item.id,{quantity:Number(e.target.value)})} /></label><label>Unit price ($)<input type="number" min={0} max={100000} step="0.01" value={item.unitPriceCents/100} required onChange={e=>patchItem(item.id,{unitPriceCents:cents(e.target.value)})} /></label><label className="event-taxable"><input type="checkbox" checked={item.taxable} onChange={e=>patchItem(item.id,{taxable:e.target.checked})} />Taxable</label><strong className="event-line-total">{money(item.quantity*item.unitPriceCents)}</strong><button type="button" aria-label={`Remove order row ${index+1}`} onClick={()=>patch("items",draft.items.filter(row=>row.id!==item.id))}>Remove</button><label className="event-field-wide">Preparation / selection notes<input value={item.notes} maxLength={1000} onChange={e=>patchItem(item.id,{notes:e.target.value})} /></label></div>)}</div><button type="button" className="button button-outline" disabled={draft.items.length>=100} onClick={()=>patch("items",[...draft.items,{id:crypto.randomUUID(),category:"Food",name:"",quantity:1,unitPriceCents:0,taxable:true,notes:""}])}>+ Add order item</button>
      <div className="event-fields event-total-fields"><label>Sales tax (%)<input type="number" min={0} max={100} step="0.01" value={draft.taxRateBps/100} onChange={e=>patch("taxRateBps",Math.round(Number(e.target.value)*100))} /></label><label>PFB tax (%)<input type="number" min={0} max={100} step="0.01" value={(draft.pfbTaxRateBps||0)/100} onChange={e=>patch("pfbTaxRateBps",Math.round(Number(e.target.value)*100))} /></label><label>Deposit / payments received ($)<input type="number" min={0} max={10000000} step="0.01" value={draft.paidCents/100} onChange={e=>patch("paidCents",cents(e.target.value))} /></label></div>
      <p className="event-package-hint">Reservation deposit: {money(draft.reservationDepositCents||defaultFee)} applied to the final bill. Record payments only when received. Taxes apply to taxable items; gratuity is excluded.</p><div className="event-generated-charges">{draft.flightPlan?.packageId?<><span>{draft.guestCount} guests × {money(readyRoomPackages.find(p=>p.id===draft.flightPlan?.packageId)?.priceCents||0)} / guest</span><span>Package & extras: {money(totals!.subtotal-draft.items.reduce((sum,row)=>sum+row.quantity*row.unitPriceCents,0))}</span></>:null}</div><div className="event-totals" aria-live="polite"><span>Subtotal <b>{money(totals!.subtotal)}</b></span><span>Sales tax <b>{money(totals!.salesTax)}</b></span><span>PFB tax <b>{money(totals!.pfbTax)}</b></span><span>Total <b>{money(totals!.total)}</b></span><span>Payments <b>{money(totals!.paid)}</b></span><span>{totals!.balance<0?"Credit":"Balance"} <b>{money(Math.abs(totals!.balance))}</b></span></div></fieldset>
      <fieldset disabled={busy}><legend>Service & notes</legend><div className="event-fields"><label>Bar service / drink-ticket plan<textarea value={draft.barDetails} rows={2} maxLength={5000} onChange={e=>patch("barDetails",e.target.value)} /></label><label>Event notes for summary & guests<textarea value={draft.notes} rows={2} maxLength={5000} onChange={e=>patch("notes",e.target.value)} /></label><label>Staff-only notes (excluded from print and guest emails)<textarea value={draft.internalNotes} rows={2} maxLength={5000} onChange={e=>patch("internalNotes",e.target.value)} /></label></div></fieldset>
      <p className={error?"event-plan-error":"event-plan-notice"}>{error || (dirty?"Unsaved changes. Save or recreate the summary to keep these edits.":selected?`Saved revision ${selected.version}. Saving and printing do not send email.`:"")}</p>
      <div className="event-editor-actions"><button className="button" disabled={busy}>{busy?"Working…":selected?"Save event — no email":"Add event to calendar"}</button><button type="button" className="button button-outline" disabled={busy} onClick={()=>print()}>Save & print summary</button><button type="button" className="button button-outline" disabled={busy} onClick={()=>print(undefined,true)}>Save & print menu planning sheet</button><button type="button" className="button button-outline" disabled={busy} onClick={()=>compose()}>Write guest update (optional)</button><button type="button" disabled={busy} onClick={()=>{if(discardOkay()){setDraft(null);setSelected(null);}}}>Close</button></div>
      </form>{updates.length?<details className="event-update-history"><summary>Guest email history</summary>{updates.map((update,index)=><p key={index}>{update.recipient} · {update.subject} · {update.status==="sent"?"Accepted for delivery":update.status} · revision {update.plan_version}</p>)}</details>:null}
    </div>:null}
    {selected?<EventProposalManager plan={selected} dirty={dirty} onRefresh={()=>getExistingInquiryPlan(selected.id)}/>:null}
    {emailPlan?<div className="event-email-overlay" role="dialog" aria-modal="true" aria-labelledby="event-email-heading"><form className="event-email-composer" onSubmit={sendUpdate}><h3 id="event-email-heading">Guest update: {emailPlan.details.title}</h3><p>To: {[emailPlan.details.contactEmail,...emailPlan.details.guestEmails].filter(Boolean).join(", ") || "No guest email saved"}</p><p>Replies go to events@aviatorbrew.com. Each recipient receives a separate message.</p><label>Subject<input autoFocus value={subject} required maxLength={160} disabled={busy} onChange={e=>{setSubject(e.target.value);requestId.current=crypto.randomUUID();}} /></label><label>Message<textarea rows={4} value={emailMessage} required maxLength={5000} disabled={busy} onChange={e=>{setEmailMessage(e.target.value);requestId.current=crypto.randomUUID();}} /></label><label className="event-check"><input type="checkbox" checked={includeSummary} disabled={busy} onChange={e=>{setIncludeSummary(e.target.checked);requestId.current=crypto.randomUUID();}} />Include the saved order summary (revision {emailPlan.version})</label>{emailResult?<p role="status">{emailResult}</p>:null}{emailError?<p role="alert" className="event-plan-error">{emailError}</p>:null}<div className="event-editor-actions"><button className="button" disabled={busy||![emailPlan.details.contactEmail,...emailPlan.details.guestEmails].some(Boolean)}>{busy?"Sending…":"Send update"}</button><button className="button button-outline" type="button" disabled={busy} onClick={()=>setEmailPlan(null)}>Skip / Close — don’t send</button></div></form></div>:null}
    <details className="event-inquiry-archive" ref={inquiryArchive}><summary>Website inquiries — start an event plan</summary><PrivateEventsInquiryManager focusRequest={inquiryFocus} onPlan={item=>newPlan("",item)} /></details>
  </section>;
}
