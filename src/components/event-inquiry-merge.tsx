"use client";
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {getManagerJson,readManagerResponse} from '@/lib/manager-fetch';
import {mergeInquiryMenuDetails} from '@/lib/event-inquiry-menu';
import {eventDateLabel,eventDisplayName,eventTotals,flightPlanSelections,money,timeLabel,type CateringCatalog,type EventPlan,type EventPlanDetails} from '@/lib/event-plan';
import type {ManagedInquiry} from '@/components/catering-manager';

type Candidate={id:string;version:number;details:EventPlanDetails;lastNameMatch:boolean};
export function EventInquiryMerge({inquiry,onClose,onMerged,canMerge}:{inquiry:ManagedInquiry;onClose:()=>void;onMerged:(plan:EventPlan)=>void;canMerge?:(id:string)=>boolean}){
 const dialog=useRef<HTMLDialogElement>(null),inFlight=useRef(false);
 const [query,setQuery]=useState(''),[candidates,setCandidates]=useState<Candidate[]>([]),[selected,setSelected]=useState(''),[catalog,setCatalog]=useState<CateringCatalog|null>(null),[fingerprint,setFingerprint]=useState(''),[total,setTotal]=useState(0),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[approved,setApproved]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const d=dialog.current,previous=document.activeElement instanceof HTMLElement?document.activeElement:null;d?.showModal();return()=>{d?.close();previous?.isConnected&&previous.focus({preventScroll:true});};},[]);
 useEffect(()=>{
   const controller=new AbortController();setLoading(true);setApproved(false);setError('');
   const timer=setTimeout(()=>{getManagerJson(`/api/manager/inquiries/${inquiry.id}/merge?`+new URLSearchParams({q:query.trim()}),controller.signal).then(b=>{setCandidates(b.candidates);setCatalog(b.catering);setFingerprint(b.fingerprint);setTotal(b.total);setSelected(current=>b.candidates.some((p:Candidate)=>p.id===current)?current:b.candidates.filter((p:Candidate)=>p.lastNameMatch).length===1?b.candidates.find((p:Candidate)=>p.lastNameMatch).id:'');}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});},query?250:0);
   return()=>{clearTimeout(timer);controller.abort();};
 },[inquiry.id,query]);
 const target=candidates.find(c=>c.id===selected);let preview:EventPlanDetails|null=null,previewError='';
 if(target&&catalog)try{preview=mergeInquiryMenuDetails(target.details,inquiry.payload?.cateringPlan!,catalog);}catch(e){previewError=e instanceof Error?e.message:'The menu cannot be merged.';}
 async function merge(){
   if(!target||!approved||!preview||busy||loading||inFlight.current)return;
   if(canMerge&&!canMerge(target.id)){setError('Save or close the unsaved edits for this event before merging its menu.');return;}
   inFlight.current=true;setBusy(true);setError('');
   try{const b=await readManagerResponse(await fetch(`/api/manager/inquiries/${inquiry.id}/merge`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({targetId:target.id,version:target.version,fingerprint,confirmed:true})}));onMerged(b.plan);}
   catch(e){setError(e instanceof Error?e.message:'Could not merge this menu.');setApproved(false);}
   finally{inFlight.current=false;setBusy(false);}
 }
 return createPortal(<dialog ref={dialog} className="inquiry-merge-dialog" aria-labelledby="inquiry-merge-title" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
   <h2 id="inquiry-merge-title">Merge menu into a confirmed event</h2>
   <p><strong>Website inquiry:</strong> {inquiry.name} · {inquiry.eventDate?eventDateLabel(inquiry.eventDate):'Date not set'} · {inquiry.guestCount} guests</p>
   <p>Last-name matches appear first. You can choose another confirmed event. Review the current and incoming menu below.</p>
   <label htmlFor="inquiry-merge-search">Search confirmed events</label><input id="inquiry-merge-search" autoFocus type="search" value={query} maxLength={200} disabled={busy} placeholder="Customer, last name, event, or YYYY-MM-DD" onChange={e=>setQuery(e.target.value)}/>
   <label htmlFor="inquiry-merge-target">Confirmed event</label><select id="inquiry-merge-target" value={selected} disabled={busy||loading} onChange={e=>{setSelected(e.target.value);setApproved(false);setError('');}}><option value="">Choose the event to update…</option>{candidates.map(c=><option key={c.id} value={c.id}>{c.lastNameMatch?'Suggested last-name match · ':''}{eventDateLabel(c.details.date)} · {eventDisplayName(c.details)}</option>)}</select>
   {loading?<p role="status">Finding confirmed events…</p>:<p>{total} confirmed event(s){total>candidates.length?' · Refine your search to see more events.':''}</p>}
   {target&&catalog?<section className="inquiry-merge-preview"><h3>{eventDisplayName(target.details)}</h3><p><strong>Booking kept:</strong> {eventDateLabel(target.details.date)} · {timeLabel(target.details.startTime)}–{timeLabel(target.details.endTime)} · {target.details.location} · CONFIRMED</p>{target.lastNameMatch?<p className="inquiry-merge-match">Last name matches this inquiry.</p>:<p>Please verify this is the correct customer and event.</p>}<div className="inquiry-merge-columns"><div><h4>Current saved menu</h4><p>{target.details.guestCount} guests · {money(eventTotals(target.details,catalog).subtotal)} before tax</p>{target.details.flightPlan?.packageId?<ul>{flightPlanSelections(target.details,catalog).map(([k,v])=><li key={k}><strong>{k}:</strong> {v}</li>)}</ul>:<p>No buffet package selected.</p>}</div><div><h4>Menu after merging</h4>{preview?<><p><strong>{preview.guestCount} guests · {money(eventTotals(preview,catalog).subtotal)} before tax</strong></p><p>Food out: {preview.foodTime?timeLabel(preview.foodTime):'Not set'}</p><ul>{flightPlanSelections(preview,catalog).map(([k,v])=><li key={k}><strong>{k}:</strong> {v}</li>)}</ul></>:<p role="alert">{previewError}</p>}</div></div><p>The incoming buffet choices replace the current buffet choices and update the guest count and requested food-out time. Booking date, start/end times, recorded payments, custom charges and prior proposals are kept. A revised proposal is needed for customer approval of changed terms. An unpaid planning copy for this inquiry can be removed from the active list and retained in Reports; copies with sent proposals or payment history require separate review.</p></section>:null}
   {error?<p role="alert">{error}</p>:null}
   <label className="event-check"><input type="checkbox" checked={approved} disabled={!preview||loading||busy} onChange={e=>setApproved(e.target.checked)}/>I have reviewed the customer, confirmed event and replacement menu.</label>
   <p>No customer email is sent by merging.</p><div className="event-row-actions"><button type="button" disabled={!approved||!preview||loading||busy} onClick={merge}>{busy?'Merging menu…':'Merge menu into this confirmed event'}</button><button type="button" disabled={busy} onClick={onClose}>Cancel — keep events unchanged</button></div>
 </dialog>,document.body);
}
