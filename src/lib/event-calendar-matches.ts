import {createHash} from "node:crypto";
import type {PoolClient} from "pg";
import {withDatabase} from "@/lib/database";
import {activeEventBookingSql,eventIsFuture,eventRecordConflicts,eventWindowsOverlap} from "@/lib/event-booking";
import {EventPlanError,getEventPlan} from "@/lib/event-plans";
import type {EventCalendarSync,EventPlanDetails} from "@/lib/event-plan";

type Row={id:string;version:number;data:EventPlanDetails;calendar_sync:EventCalendarSync;status:string;deleted_at:string|null;source_inquiry_id:string|null};
export type CalendarEventMatch={id:string;version:number;fingerprint:string;title:string;date:string;startTime:string;endTime:string;reason:string};
export function similarCalendarEventNames(a:string,b:string){
 const words=(value:string)=>new Set(value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').split(' ').filter(word=>word.length>=4&&!['private','event','party','ready','room','tentative','confirmed','under','review','christmas','birthday','wedding','reception','dinner','celebration'].includes(word)));
 const first=words(a),second=words(b);return [...first].some(word=>second.has(word));
}
function candidate(plan:Row,row:Row):CalendarEventMatch|null{
 const sync=row.calendar_sync;
 if(row.id===plan.id||row.deleted_at||!['Tentative','Confirmed'].includes(row.status)||!sync?.calendarId||!sync.eventId||sync.linkedToPlanId||sync.linkedFromPlanId||['removed','cancelled'].includes(sync.status))return null;
 const schedule=sync.source||row.data;
 if(!schedule.date||!schedule.startTime||!schedule.endTime||!eventIsFuture(schedule))return null;
 const similar=similarCalendarEventNames(plan.data.title+' '+plan.data.contactName,schedule.title+' '+row.data.contactName);
 const overlapping=eventWindowsOverlap(plan.data,schedule);
 const dayDifference=Math.abs(Date.parse(plan.data.date+'T12:00Z')-Date.parse(schedule.date+'T12:00Z'))/86400000;
 if(!overlapping&&(!similar||dayDifference>7))return null;
 const title=schedule.title;
 const fingerprint=createHash('sha256').update(JSON.stringify([row.id,row.version,sync.calendarId,sync.eventId,sync.status,title,schedule.date,schedule.startTime,schedule.endTime])).digest('hex');
 return {id:row.id,version:row.version,fingerprint,title,date:schedule.date,startTime:schedule.startTime,endTime:schedule.endTime,reason:similar?'Similar event name':'Overlapping Google Calendar booking'};
}
async function candidates(client:PoolClient,plan:Row){
 if(plan.calendar_sync?.eventId||!['Draft','Tentative'].includes(plan.status))return [];
 const rows=(await client.query("SELECT * FROM website.private_event_plans WHERE id<>$1 AND deleted_at IS NULL AND status IN ('Tentative','Confirmed') AND calendar_sync->>'eventId' IS NOT NULL AND (event_date BETWEEN $2::date-7 AND $2::date+7 OR calendar_sync->'source'->>'date' BETWEEN ($2::date-7)::text AND ($2::date+7)::text) ORDER BY event_date,id",[plan.id,plan.data.date])).rows as Row[];
 return rows.map(row=>candidate(plan,row)).filter((item):item is CalendarEventMatch=>Boolean(item));
}
export async function getCalendarEventMatches(planId:string){return withDatabase(async client=>{
 const plan=(await client.query('SELECT * FROM website.private_event_plans WHERE id=$1 AND deleted_at IS NULL',[planId])).rows[0] as Row|undefined;
 if(!plan)throw new EventPlanError('Event not found.',404);
 return {matches:await candidates(client,plan),linked:plan.calendar_sync?.linkedFromPlanId?{title:plan.calendar_sync.source?.title,date:plan.data.date,startTime:plan.data.startTime,endTime:plan.data.endTime}:null};
});}
export async function linkCalendarEvent(planId:string,input:{sameEvent?:boolean;version:number;matchId:string;matchVersion:number;fingerprint:string}){
 if(!input||typeof input!=='object'||input.sameEvent!==true)throw new EventPlanError('Confirm that this is the same event before linking it.',403);
 if(!Number.isInteger(input.version)||!Number.isInteger(input.matchVersion)||typeof input.matchId!=='string'||typeof input.fingerprint!=='string')throw new EventPlanError('Refresh and review the Google Calendar match.');
 const result=await withDatabase(async client=>{
  await client.query('BEGIN');
  try{
   await client.query("SELECT pg_advisory_xact_lock(hashtext('aviator-private-event-booking'))");
   const rows=(await client.query('SELECT * FROM website.private_event_plans WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE',[[planId,input.matchId]])).rows as Row[];
   const plan=rows.find(row=>row.id===planId),imported=rows.find(row=>row.id===input.matchId);
   if(!plan||!imported||plan.deleted_at)throw new EventPlanError('Event not found.',404);
   if(plan.version!==input.version||imported.version!==input.matchVersion)throw new EventPlanError('An event changed in another window. Refresh and review the match again.',409);
   if(plan.calendar_sync?.eventId||!['Draft','Tentative'].includes(plan.status))throw new EventPlanError('This event is already linked or is no longer under review.',409);
   const match=candidate(plan,imported);
   if(!match||match.fingerprint!==input.fingerprint)throw new EventPlanError('The Google Calendar booking changed. Refresh and review the match again.',409);
   const history=(await client.query("SELECT EXISTS(SELECT 1 FROM website.private_event_proposals WHERE plan_id=$1) OR EXISTS(SELECT 1 FROM website.private_event_deposits WHERE plan_id=$1) AS used",[imported.id])).rows[0].used;
   if(imported.source_inquiry_id||imported.data.paidCents>0||history)throw new EventPlanError('The Google event already has an inquiry, proposal or payment history. Open that event plan to resolve the duplicate without losing its records.',409);
   const googleScheduleDiffers=['date','startTime','endTime'].some(key=>plan.data[key as keyof EventPlanDetails]!==match[key as keyof CalendarEventMatch]);
   const details=plan.data;
   const others=(await client.query("SELECT data,calendar_sync FROM website.private_event_plans WHERE id<>ALL($1::text[]) AND deleted_at IS NULL AND "+activeEventBookingSql+" AND (event_date BETWEEN $2::date-1 AND $2::date+1 OR calendar_sync->'source'->>'date' BETWEEN ($2::date-1)::text AND ($2::date+1)::text)",[[planId,imported.id],details.date])).rows;
   if(others.some(row=>eventRecordConflicts(details,row)))throw new EventPlanError('Another separate booking still overlaps the website event. Resolve that conflict before linking.',409);
   const linkedAt=new Date().toISOString();
   await client.query("UPDATE website.private_event_plans SET deleted_at=now(),status='Cancelled',data=data||jsonb_build_object('status','Cancelled','deletedOriginalStatus',status),calendar_sync=calendar_sync||$1::jsonb,version=version+1,updated_at=now() WHERE id=$2",[JSON.stringify({linkedToPlanId:planId,linkedAt}),imported.id]);
   // Link metadata only: never reparse, reprice or overwrite any website event details.
   await client.query("UPDATE website.private_event_plans SET calendar_sync=$1::jsonb,version=version+1,updated_at=now() WHERE id=$2",[JSON.stringify({...imported.calendar_sync,linkedFromPlanId:imported.id,linkedAt,...(googleScheduleDiffers?{status:'changed',reviewRequired:true}:{})}),planId]);
   if(plan.source_inquiry_id)await client.query("UPDATE website.form_inquiries SET reviewed_at=COALESCE(reviewed_at,now()),payload=payload||jsonb_build_object('calendarLinkedPlanId',$1::text,'calendarLinkedAt',$2::text) WHERE id=$3",[planId,linkedAt,plan.source_inquiry_id]);
   await client.query('COMMIT');return {id:planId,archivedId:imported.id,googleScheduleDiffers};
  }catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}
 });
 return {plan:await getEventPlan(result.id),archivedId:result.archivedId,googleScheduleDiffers:result.googleScheduleDiffers};
}
