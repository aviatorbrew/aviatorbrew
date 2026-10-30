"use client";
import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { EventProposalManager } from "@/components/event-proposal-manager";
import { EventCalendarMatchManager } from "@/components/event-calendar-match-manager";
import { EventAppetizerOrderFields } from "@/components/event-appetizer-order-fields";
import { EventFlightPlanFields } from "@/components/event-flight-plan-fields";
import { PrivateEventsInquiryManager, type ManagedInquiry, type InquiryFocusRequest } from "@/components/catering-manager";
import { getManagerJson, readManagerResponse as result } from "@/lib/manager-fetch";
import { defaultCateringCatalog, type CateringCatalog, emptyEventPlan, emptyFlightPlan, eventDateLabel, eventDisplayName, eventStatuses, eventStatusDisplay, eventTotals, itemCategories, money, parseEventPlan, readyRoomPackages, timeLabel, type EventOrderItem, type EventPlan, type EventPlanDetails } from "@/lib/event-plan";

type Update = { recipient: string; subject: string; status: string; updated_at: string; plan_version: number };
function today() { return new Intl.DateTimeFormat("en-CA", {timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()); }
function pendingInquiryEvent(plan: EventPlan) { return Boolean(plan.sourceInquiryId && ["Draft","Tentative"].includes(plan.details.status)); }
function cents(value: string) { return Math.round(Number(value || 0) * 100); }
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
  const [listedPlans,setListedPlans]=useState<EventPlan[]>([]),[listLoading,setListLoading]=useState(true),[listError,setListError]=useState(""),[listRevision,setListRevision]=useState(0);
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
  const [emailApproved,setEmailApproved] = useState(false);
  const [emailResult, setEmailResult] = useState("");
  const [emailError, setEmailError] = useState("");
  const requestId = useRef("");
  const editor = useRef<HTMLDivElement>(null);
  const inquiryArchive = useRef<HTMLDetailsElement>(null);
  const [inquiryFocus,setInquiryFocus] = useState<InquiryFocusRequest|null>(null);
  const [unreviewedCount,setUnreviewedCount] = useState<number|null>(null);
  const [inquiryRefresh,setInquiryRefresh] = useState(0);
  const dirty = Boolean(draft && (!selected || JSON.stringify(draft) !== JSON.stringify(selected.details)));
  const totals = draft ? eventTotals(draft,catalog) : null;

  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    getManagerJson(`/api/manager/event-plans?month=${month}`,controller.signal).then(body => {setPlans(body.plans);setCatalog(body.catering||structuredClone(defaultCateringCatalog));setDefaultFee(body.defaultRoomFeeCents);setCalendarSyncStatus(body.calendarSyncStatus||null);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[month]);
  useEffect(()=>{
    const controller=new AbortController();setListLoading(true);setListError("");
    const timer=window.setTimeout(()=>{getManagerJson('/api/manager/event-plans?'+new URLSearchParams({view:'upcoming',q:query.trim()}),controller.signal).then(body=>setListedPlans(body.plans)).catch(e=>{if(!controller.signal.aborted)setListError(e.message);}).finally(()=>{if(!controller.signal.aborted)setListLoading(false);});},query.trim()?250:0);
    return()=>{window.clearTimeout(timer);controller.abort();};
  },[query,listRevision]);
  useEffect(() => { if(error) errorNotice.current?.scrollIntoView({block:"center"}); }, [error]);
  useEffect(() => {
    const params=new URLSearchParams(window.location.search),eventId=params.get("event");
    if(eventId&&/^(?:[a-f0-9-]{36}|gcal-[a-f0-9]{64})$/i.test(eventId)){getExistingInquiryPlan(eventId,true);return;}
    const id=params.get("inquiry");
    if(!id||!/^\d{1,20}$/.test(id))return;
    if(inquiryArchive.current)inquiryArchive.current.open=true;
    setInquiryFocus({id,sequence:1});
    requestAnimationFrame(()=>inquiryArchive.current?.scrollIntoView({block:"start"}));
  },[]);
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
  async function newPlan(date = "", inquiry?: ManagedInquiry) {
    if(busy)return;
    if (!discardOkay()) return;
    if(inquiry?.planId){getExistingInquiryPlan(inquiry.planId);return;}
    if(inquiry&&!inquiry.reviewed){
      setBusy(true);setError("");
      try{await result(await fetch(`/api/manager/inquiries?kind=event&id=${encodeURIComponent(inquiry.id)}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"review"})}));setInquiryFocus(null);setInquiryRefresh(current=>current+1);}
      catch(e){setError(e instanceof Error?e.message:"Could not mark this inquiry reviewed.");return;}
      finally{setBusy(false);}
    }
    const details = emptyEventPlan(defaultFee);
    if (inquiry) Object.assign(details,{title:`${inquiry.eventType || "Private event"} - ${inquiry.name || "Guest"}`,contactName:inquiry.name,contactEmail:inquiry.email,phone:inquiry.phone,guestCount:Number(inquiry.guestCount)||0,notes:inquiry.message,date:inquiry.eventDate || ""});
    if(inquiry?.payload?.cateringPlan)Object.assign(details,inquiry.payload.cateringPlan,{status:"Draft",paidCents:0,internalNotes:""});
    if (date) details.date=date;
    setSelected(null);setSource(inquiry?.id || null);setDraft(details);setUpdates([]);setError("");setNotice("");focusEditor();
  }
  async function getExistingInquiryPlan(id:string,showMonth=false,moveFocus=true){setBusy(true);setError("");try{const body=await getManagerJson(`/api/manager/event-plans/${id}`);setSelected(body.plan);setDraft(body.plan.details);setSource(body.plan.sourceInquiryId);setUpdates(body.updates);if(["Confirmed","Completed","Cancelled"].includes(body.plan.details.status)){setInquiryFocus(null);setInquiryRefresh(current=>current+1);}setPlans(current=>current.map(plan=>plan.id===body.plan.id?body.plan:plan));setListedPlans(current=>current.map(plan=>plan.id===body.plan.id?body.plan:plan));if(showMonth)setMonth(body.plan.details.date.slice(0,7));if(moveFocus)focusEditor();}catch(e){setError(e instanceof Error?e.message:"Could not open the existing event plan.");}finally{setBusy(false);}}
  async function openPlan(plan: EventPlan) {
    if (!discardOkay()) return;
    setBusy(true);setError("");
    try {const body=await getManagerJson(`/api/manager/event-plans/${plan.id}`);setSelected(body.plan);setDraft(body.plan.details);setSource(body.plan.sourceInquiryId);setUpdates(body.updates);if(["Confirmed","Completed","Cancelled"].includes(body.plan.details.status)){setInquiryFocus(null);setInquiryRefresh(current=>current+1);}setPlans(current=>current.map(plan=>plan.id===body.plan.id?body.plan:plan));setListedPlans(current=>current.map(plan=>plan.id===body.plan.id?body.plan:plan));focusEditor();}
    catch(e){setError(e instanceof Error ? e.message:"Could not open event.");}finally{setBusy(false);}
  }
  async function persist(statusOverride?: EventPlanDetails["status"]): Promise<EventPlan> {
    if (!draft) throw new Error("Open an event first.");
    const details = parseEventPlan({...draft,...(statusOverride?{status:statusOverride}:{}),guestEmails:draft.guestEmails.map(s=>s.trim()).filter(Boolean)},catalog);
    const response = await fetch(selected ? `/api/manager/event-plans/${selected.id}` : "/api/manager/event-plans",{method:selected?"PUT":"POST",headers:{"content-type":"application/json"},body:JSON.stringify({details,version:selected?.version,sourceInquiryId:source})});
    const body=await result(response);const plan=body.plan as EventPlan;
    setSelected(plan);setDraft(plan.details);setSource(plan.sourceInquiryId);
    setListedPlans(current=>[...current.filter(item=>item.id!==plan.id),plan]);setListRevision(current=>current+1);
    if(["Confirmed","Completed","Cancelled"].includes(plan.details.status))setInquiryFocus(null);
    setInquiryRefresh(current=>current+1);
    if (plan.details.date.slice(0,7)!==month)setMonth(plan.details.date.slice(0,7));
    else setPlans(current=>[...current.filter(p=>p.id!==plan.id),plan].sort((a,b)=>(a.details.date+a.details.startTime).localeCompare(b.details.date+b.details.startTime)));
    setNotice(`Event saved · revision ${plan.version}. No email was sent.`);return plan;
  }
  async function save(event: FormEvent) {event.preventDefault();setBusy(true);setError("");try{await persist();}catch(e){setError(e instanceof Error?e.message:"Could not save event.");}finally{setBusy(false);}}
  async function approveWithoutEmail() {
    if(!draft||busy)return;setBusy(true);setError("");
    try{const plan=await persist("Confirmed");setNotice(`Event approved and confirmed · revision ${plan.version}. Recorded payments are credited. No customer email was sent.`);}
    catch(e){setError(e instanceof Error?e.message:"Could not approve event.");}finally{setBusy(false);}
  }
  async function unCancelEvent() {
    if(!draft||busy)return;setBusy(true);setError("");
    try{const plan=await persist("Tentative");setNotice(`Event reopened under review · revision ${plan.version}. Menu and payment records were kept. No customer email was sent.`);}
    catch(e){setError(e instanceof Error?e.message:"Could not reopen event.");}finally{setBusy(false);}
  }
  function preserveEventPosition(plan:EventPlan,trigger?:HTMLButtonElement){
    const top=window.scrollY,left=window.scrollX,rows=Array.from(document.querySelectorAll<HTMLElement>('.event-plan-list>[data-event-id]')),index=rows.findIndex(row=>row.dataset.eventId===plan.id),fallback=(rows[index+1]||rows[index-1])?.querySelector<HTMLButtonElement>('button');
    return ()=>requestAnimationFrame(()=>{window.scrollTo({top,left,behavior:'instant'});const focus=trigger?.isConnected&&!trigger.disabled?trigger:fallback?.isConnected?fallback:undefined;focus?.focus({preventScroll:true});});
  }
  async function deleteEvent(plan:EventPlan,trigger?:HTMLButtonElement) {
    if(busy||(selected?.id===plan.id&&dirty))return;
    if(!window.confirm(`Are you sure you want to delete “${plan.details.title}” from the event list and calendar? Stored event and payment records will be kept. Its website inquiry will remain available. No customer email will be sent.`))return;
    const restorePosition=preserveEventPosition(plan,trigger);
    setBusy(true);setError("");
    try{
      await result(await fetch(`/api/manager/event-plans/${plan.id}`,{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({version:plan.version})}));
      setPlans(current=>current.filter(item=>item.id!==plan.id));setListedPlans(current=>current.filter(item=>item.id!==plan.id));setListRevision(current=>current+1);
      if(selected?.id===plan.id){setSelected(null);setDraft(null);setSource(null);setUpdates([]);}
      setInquiryRefresh(current=>current+1);setNotice("Event deleted from the list and calendar. Stored event and payment records were kept. No customer email was sent.");restorePosition();
    }catch(e){setError(e instanceof Error?e.message:"Could not delete event.");}finally{setBusy(false);}
  }
  async function cancelEvent(plan: EventPlan,trigger?:HTMLButtonElement) {
    if(busy||plan.details.status==="Cancelled"||(selected?.id===plan.id&&dirty))return;
    if(!window.confirm(`Are you sure you want to cancel “${plan.details.title}”? Event details and payments will be kept. No customer email will be sent.`))return;
    const restorePosition=preserveEventPosition(plan,trigger);
    setBusy(true);setError("");
    try{
      const body=await result(await fetch(`/api/manager/event-plans/${plan.id}`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({details:{...plan.details,status:"Cancelled"},version:plan.version})}));
      const saved=body.plan as EventPlan;
      setPlans(current=>current.map(item=>item.id===saved.id?saved:item));setListedPlans(current=>current.map(item=>item.id===saved.id?saved:item));setListRevision(current=>current+1);
      if(selected?.id===saved.id){setSelected(saved);setDraft(saved.details);setSource(saved.sourceInquiryId);}
      setInquiryRefresh(current=>current+1);
      setNotice(`Event cancelled · revision ${saved.version}. Event details and payments were kept. No customer email was sent.`);restorePosition();
    }catch(e){setError(e instanceof Error?e.message:"Could not cancel event.");}finally{setBusy(false);}
  }
  function inquiryDeleted(id:string) {
    setPlans(current=>current.map(plan=>plan.sourceInquiryId===id?{...plan,sourceInquiryId:null}:plan));
    setListedPlans(current=>current.map(plan=>plan.sourceInquiryId===id?{...plan,sourceInquiryId:null}:plan));
    setSelected(current=>current?.sourceInquiryId===id?{...current,sourceInquiryId:null}:current);
    if(source===id)setSource(null);
    setInquiryFocus(current=>current?.id===id?null:current);
  }
  function calendarEventLinked(plan:EventPlan,archivedId:string){
    setSelected(plan);setDraft(plan.details);setSource(plan.sourceInquiryId);
    setPlans(current=>[...current.filter(item=>item.id!==archivedId&&item.id!==plan.id),plan]);
    setListedPlans(current=>current.filter(item=>item.id!==archivedId).map(item=>item.id===plan.id?plan:item));
    setListRevision(current=>current+1);setInquiryRefresh(current=>current+1);setMonth(plan.details.date.slice(0,7));
  }
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
      const body=await getManagerJson(`/api/manager/event-plans/${saved.id}`);
      setEmailPlan(body.plan);setSubject(`Event update: ${body.plan.details.title}`);setEmailMessage("");setIncludeSummary(true);setEmailApproved(false);setEmailResult("");setEmailError("");requestId.current=crypto.randomUUID();
    }catch(e){setError(e instanceof Error?e.message:"Could not open message.");}finally{setBusy(false);}
  }
  async function sendUpdate(event: FormEvent) {
    event.preventDefault();if(!emailPlan || busy || !emailApproved)return;setBusy(true);setEmailError("");setEmailResult("");
    try {
      const body=await result(await fetch(`/api/manager/event-plans/${emailPlan.id}/email`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({requestId:requestId.current,version:emailPlan.version,subject,message:emailMessage,includeSummary,emailApproved})}));
      setEmailApproved(false);
      setEmailResult(`${body.sent.length} accepted for delivery${body.failed.length?`, ${body.failed.length} failed — retry to send only to failed recipients`:""}${body.pending.length?`, ${body.pending.length} still pending — check delivery before sending another message`:""}.`);
      if(selected?.id===emailPlan.id){const history=await getManagerJson(`/api/manager/event-plans/${emailPlan.id}`);setUpdates(history.updates);}
    }catch(e){setEmailError(e instanceof Error?e.message:"Could not send. Your draft is still here.");}finally{setBusy(false);}
  }
  function openCalendarEvent(plan: EventPlan) { openPlan(plan); }
  function changeMonth(delta: number) {const [year,m]=month.split("-").map(Number);const d=new Date(Date.UTC(year,m-1+delta,1));setMonth(d.toISOString().slice(0,7));}
  const first=new Date(month+"-01T12:00:00Z");
  const days=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  const visible=listedPlans.filter(plan=>query.trim()?`${plan.details.title} ${plan.details.contactName} ${plan.details.contactEmail} ${plan.details.date}`.toLowerCase().includes(query.trim().toLowerCase()):plan.details.date>=today()).sort((a,b)=>(a.details.date+a.details.startTime).localeCompare(b.details.date+b.details.startTime));
  return <section className="coupon-manager event-planning" id="event-planning">
    <div className="event-planning-heading"><div><p className="eyebrow">Private event operations</p><h2>Event planning</h2><p>Review online buffet requests or enter manual event orders. Recalculate summaries, issue proposals, track deposits and print kitchen sheets here.</p></div><button className="button" type="button" disabled={loading||busy} onClick={()=>newPlan()}>+ New event</button></div>
    {calendarSyncStatus?<p className="event-calendar-sync-status">Google Calendar sync: 8 a.m., noon and 3 p.m. Eastern. Last checked: {new Date(calendarSyncStatus.checkedAt).toLocaleString("en-US",{timeZone:"America/New_York"})}. Existing plans are preserved.</p>:null}
    {notice?<p role="status" className="event-plan-notice">{notice}</p>:null}{error?<p ref={errorNotice} role="alert" className="event-plan-error">{error}</p>:null}
    <div className="event-calendar-toolbar"><button type="button" aria-label="Previous month" onClick={()=>changeMonth(-1)}>←</button><label>Calendar month<input type="month" value={month} required onChange={e=>{if(e.target.value)setMonth(e.target.value);}} /></label><button type="button" aria-label="Next month" onClick={()=>changeMonth(1)}>→</button><button type="button" onClick={()=>setMonth(today().slice(0,7))}>This month</button><span>{loading?"Loading events…":`${plans.length} event(s)`}</span></div>
    <div className="event-outline-legend" aria-label="Event status colors"><span className="event-status-review">Under review</span><span className="event-status-confirmed">Confirmed</span><span className="event-status-cancelled">Cancelled</span><span className="event-status-inquiry">Inquiry — website request</span></div>
    <div className="event-calendar" aria-label="Private event calendar">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day=><div className="event-weekday" key={day}>{day}</div>)}{Array.from({length:first.getUTCDay()},(_,i)=><div className="event-day empty" key={`empty-${i}`} />)}{Array.from({length:days},(_,i)=>{const date=`${month}-${String(i+1).padStart(2,"0")}`;return <div className={`event-day${date===today()?" today":""}`} key={date}><button type="button" className="event-day-number" aria-label={`New event on ${date}`} disabled={busy||loading} onClick={()=>newPlan(date)}>{i+1}</button>{plans.filter(p=>p.details.date===date).map(p=><button type="button" className={"event-calendar-entry "+(eventStatusDisplay(p.details.status).className)+(pendingInquiryEvent(p)?" is-inquiry-event":"")} key={p.id} disabled={busy} onClick={()=>openCalendarEvent(p)} title={`${eventStatusDisplay(p.details.status).label}: ${eventDisplayName(p.details)} · Open event plan`}><span>{p.details.startTime?timeLabel(p.details.startTime):"Time TBD"}</span>{eventStatusDisplay(p.details.status).label}: {eventDisplayName(p.details)}{p.calendarSync?.status&&p.calendarSync.status!=="active"?<span className="event-calendar-source-tag">Google: {p.calendarSync.status==="removed"?"deleted":p.calendarSync.status}</span>:null}</button>)}</div>;})}{Array.from({length:(7-((first.getUTCDay()+days)%7))%7},(_,i)=><div className="event-day empty" key={`trailing-${i}`} />)}</div>
    <h2 className="event-section-title">Events</h2>
    <label className="event-list-search">Search events, including past events<input type="search" value={query} maxLength={200} onChange={e=>setQuery(e.target.value)} placeholder="Customer, event name, email, or YYYY-MM-DD" /></label><p className="event-list-scope">{query.trim()?"Search results include past and future events.":"Showing events from today forward, across all months."}{query.trim()?<button type="button" onClick={()=>setQuery("")}>Show upcoming events</button>:null}</p>{listLoading?<p role="status">Loading event list…</p>:null}{listError?<p role="alert">{listError}</p>:null}
    <div className="event-plan-list">{visible.map((plan,index)=><Fragment key={plan.id}>{index===0||visible[index-1].details.date.slice(0,7)!==plan.details.date.slice(0,7)?<h3 className="event-list-month">{new Date(plan.details.date+"T12:00:00Z").toLocaleDateString("en-US",{timeZone:"UTC",month:"long",year:"numeric"})}</h3>:null}<article data-event-id={plan.id} className={eventStatusDisplay(plan.details.status).className+(pendingInquiryEvent(plan)?" is-inquiry-event":"")}><div className="event-plan-row-title"><button type="button" onClick={()=>openPlan(plan)} disabled={busy}><strong><span className="event-status-label">{eventStatusDisplay(plan.details.status).label}</span>: {eventDisplayName(plan.details)}</strong></button><button type="button" className="event-print-button" onClick={()=>print(plan)} disabled={busy}>Order Summary / Print</button><button type="button" onClick={()=>print(plan,true)} disabled={busy}>Menu Planning Sheet / PDF</button><KitchenSheetLink plan={plan} disabled={busy||(selected?.id===plan.id&&dirty)}/></div><p><time className="event-list-date" dateTime={plan.details.date}>{eventDateLabel(plan.details.date)}</time> · {timeLabel(plan.details.startTime)} · {plan.bookingStage||eventStatusDisplay(plan.details.status).label} · {plan.details.guestCount} guests</p><p>{plan.details.contactName} {plan.details.contactEmail?`· ${plan.details.contactEmail}`:""} · {money(eventTotals(plan.details,catalog).total)}</p><CalendarSourceNotice plan={plan}/><div className="event-row-actions"><button type="button" onClick={()=>openPlan(plan)} disabled={busy}>Edit plan</button><button type="button" onClick={()=>compose(plan)} disabled={busy}>Write guest update</button><button type="button" className="event-cancel-button" disabled={busy||plan.details.status==="Cancelled"||(selected?.id===plan.id&&dirty)} title={selected?.id===plan.id&&dirty?"Save or discard your changes before cancelling this event.":undefined} onClick={e=>cancelEvent(plan,e.currentTarget)}>{plan.details.status==="Cancelled"?"Cancelled":"Cancel Event"}</button><button type="button" className="event-cancel-button" disabled={busy||(selected?.id===plan.id&&dirty)} title={selected?.id===plan.id&&dirty?"Save or discard your changes before deleting this event.":undefined} onClick={e=>deleteEvent(plan,e.currentTarget)}>Delete Event</button></div></article></Fragment>)}{!listLoading&&!visible.length?<p>{query.trim()?"No events match your search.":"No upcoming event plans. Add an event or search for past events."}</p>:null}</div>
    {draft?<div className={"event-plan-editor "+eventStatusDisplay(draft.status).className+(source&&["Draft","Tentative"].includes(draft.status)?" is-inquiry-event":"")} ref={editor} tabIndex={-1}><div className="event-editor-actions"><h3>{selected?`Edit ${eventStatusDisplay(draft.status).label}: ${eventDisplayName(draft)}`:"New event plan"}</h3><KitchenSheetLink plan={selected} disabled={busy||dirty}/>{selected?<button type="button" className="event-cancel-button" disabled={busy||dirty||selected.details.status==="Cancelled"} title={dirty?"Save or discard your changes before cancelling this event.":undefined} onClick={e=>cancelEvent(selected,e.currentTarget)}>{selected.details.status==="Cancelled"?"Cancelled":"Cancel Event"}</button>:null}{selected?<button type="button" className="event-cancel-button" disabled={busy||dirty} title={dirty?"Save or discard your changes before deleting this event.":undefined} onClick={e=>deleteEvent(selected,e.currentTarget)}>Delete Event</button>:null}</div><p>{!selected||dirty?"Save the event and any menu changes to enable kitchen printing. ":""}Kitchen sheets use the saved menu. Unapproved events are labeled as planning previews.</p>{selected?<CalendarSourceNotice plan={selected}/>:null}<p>Saving and printing do not send email. Use “Write guest update” separately when you want to contact guests.</p><form id="event-plan-details" onSubmit={save}>
      <fieldset disabled={busy}><legend>Event & contact</legend><div className="event-fields">
        <label className="event-field-span2">Event name<input value={draft.title} maxLength={200} required onChange={e=>patch("title",e.target.value)} /></label><label>Status<select value={draft.status} onChange={e=>patch("status",e.target.value as EventPlanDetails["status"])}>{eventStatuses.map(s=><option key={s} value={s}>{s==="Draft"?"Under Review (Draft)":s==="Tentative"?"Under Review (Tentative)":s}</option>)}</select></label>
        <label>Date<input type="date" value={draft.date} required onChange={e=>patch("date",e.target.value)} /></label><label>Start time<input id="event-start-time" type="time" value={draft.startTime} onChange={e=>patch("startTime",e.target.value)} /></label><label>Food Out Time:<input type="time" value={draft.foodTime} onChange={e=>patch("foodTime",e.target.value)} /></label><label>End time<input id="event-end-time" type="time" title="An earlier end time means the next day." value={draft.endTime} onChange={e=>patch("endTime",e.target.value)} /></label>
        <label>Guest count<input type="number" min={draft.flightPlan?.packageId?30:0} max={10000} step={1} value={draft.guestCount||""} onChange={e=>patch("guestCount",Number(e.target.value))} /></label><label className="event-field-span2">Location<input value={draft.location} required maxLength={300} onChange={e=>patch("location",e.target.value)} /></label>
        <label>Contact name<input id="event-contact-name" value={draft.contactName} maxLength={200} onChange={e=>patch("contactName",e.target.value)} /></label><label>Contact email (optional)<input id="event-contact-email" type="email" value={draft.contactEmail} onChange={e=>patch("contactEmail",e.target.value)} /></label><label>Phone<input type="tel" value={draft.phone} onChange={e=>patch("phone",e.target.value)} /></label>
        <label>Setup access<input type="time" value={draft.setupTime} onChange={e=>patch("setupTime",e.target.value)} /></label><label>Last call<input type="time" value={draft.lastCall} onChange={e=>patch("lastCall",e.target.value)} /></label>
      </div><details className="event-compact-details"><summary>Additional guest email addresses (optional)</summary><label>Guest emails<textarea rows={2} value={draft.guestEmails.join("\n")} onChange={e=>patch("guestEmails",e.target.value.split(/[,;\n]/))} placeholder="One address per line, up to 20" /></label></details></fieldset>
      <fieldset className="event-flight-wrapper" disabled={busy}><EventFlightPlanFields catalog={catalog} details={draft} onChange={value=>patch("flightPlan",value)} /></fieldset>
      {!draft.flightPlan?.packageId?<fieldset disabled={busy||loading}><legend>Appetizers for meetings & custom events</legend><EventAppetizerOrderFields key={selected?.id||"new"} details={draft} catalog={catalog} onAdd={item=>setDraft(current=>current?{...current,items:[...current.items,item],flightPlan:{...emptyFlightPlan(),...current.flightPlan,cateringMode:current.flightPlan?.cateringMode==="custom"?"custom":"appetizers"}}:current)}/></fieldset>:null}
      <fieldset disabled={busy}><legend>Order summary & custom charges</legend><p>{draft.flightPlan?.packageId?"Package and extras recalculate with guest count. Add custom charges below; enter drink charges at actual prices.":"No buffet package charge. Add agreed drinks, off-menu food, room or service items here. Notes alone do not add a charge."}</p><div className="event-order-rows">{draft.items.map((item,index)=><div className="event-order-row" key={item.id} aria-label={`Order row ${index+1}`}><label>Category<select value={item.category} onChange={e=>patchItem(item.id,{category:e.target.value as EventOrderItem["category"]})}>{itemCategories.map(c=><option key={c}>{c}</option>)}</select></label><label className="event-item-name">Item / menu selection<input value={item.name} maxLength={200} required onChange={e=>patchItem(item.id,{name:e.target.value})} /></label><label>Quantity<input type="number" min={1} max={10000} step={1} value={item.quantity||""} required onChange={e=>patchItem(item.id,{quantity:Number(e.target.value)})} /></label><label>Unit price ($)<input type="number" min={0} max={100000} step="0.01" value={item.unitPriceCents/100} required onChange={e=>patchItem(item.id,{unitPriceCents:cents(e.target.value)})} /></label><label className="event-taxable"><input type="checkbox" checked={item.taxable} onChange={e=>patchItem(item.id,{taxable:e.target.checked})} />Taxable</label><strong className="event-line-total">{money(item.quantity*item.unitPriceCents)}</strong><button type="button" aria-label={`Remove order row ${index+1}`} onClick={()=>patch("items",draft.items.filter(row=>row.id!==item.id))}>Remove</button><label className="event-field-wide">Preparation / selection notes<input value={item.notes} maxLength={1000} onChange={e=>patchItem(item.id,{notes:e.target.value})} /></label></div>)}</div><button type="button" className="button button-outline" disabled={draft.items.length>=100} onClick={()=>patch("items",[...draft.items,{id:crypto.randomUUID(),category:"Food",name:"",quantity:1,unitPriceCents:0,taxable:true,notes:""}])}>+ Add order item</button>
      <div className="event-fields event-manager-discount"><label>One-time event discount ($)<input type="number" min={0} max={(totals?.subtotal||0)/100} step="0.01" value={(draft.managerDiscount?.amountCents||0)/100} onChange={e=>patch("managerDiscount",{amountCents:cents(e.target.value),reason:draft.managerDiscount?.reason||""})}/></label><label className="event-field-wide">Discount reason (shown on proposal)<input maxLength={300} required={Boolean(draft.managerDiscount?.amountCents)} value={draft.managerDiscount?.reason||""} onChange={e=>patch("managerDiscount",{amountCents:draft.managerDiscount?.amountCents||0,reason:e.target.value})}/></label></div><p className="event-package-hint">Manager only. This dollar discount applies once to this event before tax, with taxable charges reduced proportionally. It is saved with the event and shown on its proposal. Set it to $0 to remove it. Save changes and create a revised proposal before asking the customer to accept changed pricing.</p>
      <div className="event-fields event-total-fields"><label>Sales tax (%)<input type="number" min={0} max={100} step="0.01" value={draft.taxRateBps/100} onChange={e=>patch("taxRateBps",Math.round(Number(e.target.value)*100))} /></label><label>PFB tax (%)<input type="number" min={0} max={100} step="0.01" value={(draft.pfbTaxRateBps||0)/100} onChange={e=>patch("pfbTaxRateBps",Math.round(Number(e.target.value)*100))} /></label><label>Deposit / payments received ($)<input type="number" min={0} max={10000000} step="0.01" value={draft.paidCents/100} onChange={e=>patch("paidCents",cents(e.target.value))} /></label></div>
      <p className="event-package-hint">Reservation deposit: {money(draft.reservationDepositCents||defaultFee)} applied to the final bill. Record manual payments here only when received, then use Approve Event — No Email to confirm directly. Taxes apply to taxable items; gratuity is excluded.</p><div className="event-generated-charges">{draft.flightPlan?.packageId?<><span>{draft.guestCount} guests × {money(readyRoomPackages.find(p=>p.id===draft.flightPlan?.packageId)?.priceCents||0)} / guest</span><span>Package & extras: {money(totals!.subtotal-draft.items.reduce((sum,row)=>sum+row.quantity*row.unitPriceCents,0))}</span></>:null}</div><div className="event-totals" aria-live="polite"><span>Subtotal <b>{money(totals!.subtotal)}</b></span>{totals!.discount?<><span>One-time event discount <b>−{money(totals!.discount)}</b></span><span>Subtotal after discount <b>{money(totals!.discountedSubtotal!)}</b></span></>:null}<span>Sales tax <b>{money(totals!.salesTax)}</b></span><span>PFB tax <b>{money(totals!.pfbTax)}</b></span><span>Total <b>{money(totals!.total)}</b></span><span>Payments <b>{money(totals!.paid)}</b></span><span>{totals!.balance<0?"Credit":"Balance"} <b>{money(Math.abs(totals!.balance))}</b></span></div></fieldset>
      <fieldset disabled={busy}><legend>Service & notes</legend><div className="event-fields"><label>Bar service / drink-ticket plan<textarea value={draft.barDetails} rows={2} maxLength={5000} onChange={e=>patch("barDetails",e.target.value)} /></label><label>Event notes for summary & guests<textarea value={draft.notes} rows={2} maxLength={5000} onChange={e=>patch("notes",e.target.value)} /></label><label>Staff-only notes (excluded from print and guest emails)<textarea value={draft.internalNotes} rows={2} maxLength={5000} onChange={e=>patch("internalNotes",e.target.value)} /></label></div></fieldset>
      <p className={error?"event-plan-error":"event-plan-notice"}>{error || (dirty?"Unsaved changes. Save or recreate the summary to keep these edits.":selected?`Saved revision ${selected.version}. Saving and printing do not send email.`:"")}</p>
      </form>{selected?<EventCalendarMatchManager key={"calendar-match-"+selected.id} plan={selected} disabled={busy||dirty} onLinked={calendarEventLinked}/>:null}{selected?<EventProposalManager key={selected.id} plan={selected} dirty={dirty} onRefresh={()=>getExistingInquiryPlan(selected.id,false,false)}/>:null}<div className="event-editor-actions"><button className="button" type="submit" form="event-plan-details" disabled={busy}>{busy?"Working…":selected?"Save event — no email":"Add event to calendar"}</button>{draft.status==="Cancelled"?<button type="button" className="button button-outline" disabled={busy} onClick={unCancelEvent}>Un-Cancel Event</button>:null}{["Draft","Tentative"].includes(draft.status)?<button type="button" className="button button-outline" disabled={busy} onClick={approveWithoutEmail}>Approve Event — No Email</button>:null}<button type="button" className="button button-outline" disabled={busy} onClick={()=>print()}>Save & print summary</button><button type="button" className="button button-outline" disabled={busy} onClick={()=>print(undefined,true)}>Save & print menu planning sheet</button><button type="button" className="button button-outline" disabled={busy} onClick={()=>compose()}>Write guest update (optional)</button><button type="button" disabled={busy} onClick={()=>{if(discardOkay()){setDraft(null);setSelected(null);}}}>Close</button><KitchenSheetLink plan={selected} disabled={busy||dirty}/></div>
      {updates.length?<details className="event-update-history"><summary>Guest email history</summary>{updates.map((update,index)=><p key={index}>{update.recipient} · {update.subject} · {update.status==="sent"?"Accepted for delivery":update.status} · revision {update.plan_version}</p>)}</details>:null}
    </div>:null}
    {emailPlan?<div className="event-email-overlay" role="dialog" aria-modal="true" aria-labelledby="event-email-heading"><form className="event-email-composer" onSubmit={sendUpdate}><h3 id="event-email-heading">Guest update: {emailPlan.details.title}</h3><p>To: {[emailPlan.details.contactEmail,...emailPlan.details.guestEmails].filter(Boolean).join(", ") || "No guest email saved"}</p><p>Replies go to events@aviatorbrew.com. Each recipient receives a separate message.</p><label>Subject<input autoFocus value={subject} required maxLength={160} disabled={busy} onChange={e=>{setSubject(e.target.value);setEmailApproved(false);requestId.current=crypto.randomUUID();}} /></label><label>Message<textarea rows={4} value={emailMessage} required maxLength={5000} disabled={busy} onChange={e=>{setEmailMessage(e.target.value);setEmailApproved(false);requestId.current=crypto.randomUUID();}} /></label><label className="event-check"><input type="checkbox" checked={includeSummary} disabled={busy} onChange={e=>{setIncludeSummary(e.target.checked);setEmailApproved(false);requestId.current=crypto.randomUUID();}} />Include the saved order summary (revision {emailPlan.version})</label><label className="event-check"><input type="checkbox" checked={emailApproved} required disabled={busy} onChange={e=>setEmailApproved(e.target.checked)}/>I have reviewed the recipients, message and included summary, and approve sending this customer email.</label>{emailResult?<p role="status">{emailResult}</p>:null}{emailError?<p role="alert" className="event-plan-error">{emailError}</p>:null}<div className="event-editor-actions"><button className="button" disabled={busy||!emailApproved||![emailPlan.details.contactEmail,...emailPlan.details.guestEmails].some(Boolean)}>{busy?"Sending…":"Approve & send update"}</button><button className="button button-outline" type="button" disabled={busy} onClick={()=>setEmailPlan(null)}>Skip / Close — don’t send</button></div></form></div>:null}
    <details className="event-inquiry-archive" ref={inquiryArchive}><summary><h2>Website Inquiry <span className="event-unreviewed-count" title="Website inquiries not yet reviewed and without a saved event plan, across all dates.">{unreviewedCount===null?"Loading…":`${unreviewedCount} unreviewed`}</span></h2></summary><PrivateEventsInquiryManager hideHeading onAlternativeSaved={plan=>{setPlans(current=>[...current.filter(item=>item.id!==plan.id),plan]);setListedPlans(current=>[...current.filter(item=>item.id!==plan.id),plan]);setListRevision(current=>current+1);if(selected?.id===plan.id&&!dirty){setSelected(plan);setDraft(plan.details);}setMonth(plan.details.date.slice(0,7));}} onUnreviewedCount={setUnreviewedCount} refreshKey={inquiryRefresh} onDeleted={inquiryDeleted} focusRequest={inquiryFocus} onPlan={item=>newPlan("",item)} /></details>
  </section>;
}
