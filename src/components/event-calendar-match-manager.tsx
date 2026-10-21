"use client";
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {eventDateLabel,eventDisplayName,timeLabel,type EventPlan} from '@/lib/event-plan';
import type {CalendarEventMatch} from '@/lib/event-calendar-matches';
import {getManagerJson,readManagerResponse} from '@/lib/manager-fetch';

function MatchConfirmation({plan,match,busy,onCancel,onConfirm}:{plan:EventPlan;match:CalendarEventMatch;busy:boolean;onCancel:()=>void;onConfirm:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const element=dialog.current,previous=document.activeElement instanceof HTMLElement?document.activeElement:null;element?.showModal();return()=>{element?.close();previous?.focus({preventScroll:true});};},[]);
 return createPortal(<dialog ref={dialog} className="proposal-send-dialog" aria-labelledby="calendar-match-title" onCancel={e=>{e.preventDefault();if(!busy)onCancel();}}><h2 id="calendar-match-title">Is this the same event?</h2><dl><dt>Website event</dt><dd>{eventDisplayName(plan.details)}<br/>{eventDateLabel(plan.details.date)} · {timeLabel(plan.details.startTime)}–{timeLabel(plan.details.endTime)}</dd><dt>Google event</dt><dd>{match.title}<br/>{eventDateLabel(match.date)} · {timeLabel(match.startTime)}–{timeLabel(match.endTime)} Eastern</dd></dl><p>Keep the website event as the source of truth: its date, time, customer details, menu, prices, notes, proposals and payments stay exactly as entered. The duplicate imported entry will be archived and retained in reports.</p><p>The event stays under review. No customer email will be sent. Future Google changes are shown for review and never replace the website event details.</p>{busy?<p role="status">Linking the calendar booking…</p>:null}<div className="proposal-send-dialog-actions"><button type="button" autoFocus disabled={busy} onClick={onCancel}>No — keep separate</button><button type="button" disabled={busy} onClick={onConfirm}>{busy?'Linking…':'Yes — keep website event'}</button></div></dialog>,document.body);
}

export function EventCalendarMatchManager({plan,disabled,onLinked}:{plan:EventPlan;disabled:boolean;onLinked:(plan:EventPlan,archivedId:string)=>void}){
 const [matches,setMatches]=useState<CalendarEventMatch[]>([]),[linked,setLinked]=useState<{title:string}|null>(null),[confirm,setConfirm]=useState<CalendarEventMatch|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[revision,setRevision]=useState(0);
 const inFlight=useRef(false),base=`/api/manager/event-plans/${encodeURIComponent(plan.id)}/calendar-match`;
 useEffect(()=>{const controller=new AbortController();setError('');getManagerJson(base,controller.signal).then(body=>{setMatches(body.matches||[]);setLinked(body.linked||null);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[base,plan.version,revision]);
 async function link(match:CalendarEventMatch){
  if(inFlight.current||disabled)return;inFlight.current=true;setBusy(true);setError('');setMessage('');
  try{const body=await readManagerResponse(await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sameEvent:true,version:plan.version,matchId:match.id,matchVersion:match.version,fingerprint:match.fingerprint})}));setMatches([]);setLinked({title:match.title});setMessage('Linked to the Google Calendar booking. All website event details were kept. No customer email was sent.'+(body.googleScheduleDiffers?' The Google date/time differs; the website date/time remains authoritative.':''));onLinked(body.plan,body.archivedId);}
  catch(e){setError(e instanceof Error?e.message:'Could not link the calendar event.');}
  finally{setConfirm(null);inFlight.current=false;setBusy(false);}
 }
 if(!matches.length&&!linked&&!error&&!message)return null;
 return <section className="event-calendar-match-manager" aria-label="Google Calendar event matching"><h3>Google Calendar booking</h3>{linked?<p>Linked to: <strong>{linked.title}</strong>. The website event is the source of truth. Google changes and deletions remain available for staff review.</p>:null}{message?<p role="status">{message}</p>:null}{error?<p role="alert">{error}</p>:null}{matches.map(match=><article key={match.id}><p><strong>{match.reason} — Is this the same event?</strong></p><p>{match.title} · {eventDateLabel(match.date)} · {timeLabel(match.startTime)}–{timeLabel(match.endTime)} Eastern</p><button type="button" disabled={disabled||busy} onClick={()=>setConfirm(match)}>Review calendar match</button></article>)}{disabled&&matches.length?<p>Save your event changes before linking a calendar booking.</p>:null}{!linked?<button type="button" disabled={busy||disabled} onClick={()=>setRevision(value=>value+1)}>Refresh calendar matches</button>:null}{confirm?<MatchConfirmation plan={plan} match={confirm} busy={busy} onCancel={()=>setConfirm(null)} onConfirm={()=>link(confirm)}/>:null}</section>;
}
