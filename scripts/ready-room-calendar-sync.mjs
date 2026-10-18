import {createHash} from 'node:crypto';
import ical from 'node-ical';

export const calendarId='6gltnsnhbqvekua18jof6ip7o8@group.calendar.google.com';
export const calendarName='Event-ReadyRoom';
export const timezone='America/New_York';
const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'});
const timeFormat=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export const eventPlanId=id=>'gcal-'+createHash('sha256').update(calendarId+'\n'+id).digest('hex');
const text=value=>String(value?.val??value??'');
export function isScheduledTime(now=new Date()) {return [8,12,15].includes(Number(timeFormat.format(now).slice(0,2)));}
export function syncWindow(now=new Date()) {
  const to=new Date(now);to.setUTCFullYear(to.getUTCFullYear()+2);
  return {from:new Date(now.getTime()-32*86400000),to,importFrom:dayFormat.format(now),importTo:dayFormat.format(to)};
}
export async function parseCalendar(body,now=new Date()) {
  if(!/^BEGIN:VCALENDAR\r?\n/.test(body)||!body.trimEnd().endsWith('END:VCALENDAR'))throw Error('Incomplete calendar feed; no events changed.');
  const parsed=await ical.async.parseICS(body);
  if(text(parsed.vcalendar?.['WR-CALNAME'])!==calendarName)throw Error('Unexpected calendar name; no events changed.');
  const window=syncWindow(now),events=new Map();
  for(const event of Object.values(parsed)) {
    if(event.type!=='VEVENT')continue;
    if(!event.uid||!(event.start instanceof Date)||!Number.isFinite(event.start.getTime()))throw Error('Calendar event has an invalid identity or date; no events changed.');
    const baseId=String(event.uid).replace(/@google\.com$/,'');
    const instances=event.rrule?ical.expandRecurringEvent(event,{from:window.from,to:window.to,expandOngoing:true}):[{start:event.start,end:event.end||event.start,event,isFullDay:event.datetype==='date',isRecurring:false}];
    for(const instance of instances) {
      const source=instance.event,original=source.recurrenceid||instance.start;
      const suffix=instance.isRecurring?'_'+(instance.isFullDay?original.toISOString().slice(0,10).replace(/-/g,''):original.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')):'';
      const id=baseId+suffix;
      const date=instance.isFullDay?instance.start.toISOString().slice(0,10):dayFormat.format(instance.start);
      events.set(id,{id,title:text(source.summary||event.summary)||'Untitled Google event',date,startTime:instance.isFullDay?'':timeFormat.format(instance.start),endTime:instance.isFullDay?'':timeFormat.format(instance.end),endDate:instance.isFullDay?instance.end.toISOString().slice(0,10):dayFormat.format(instance.end),description:text(source.description??event.description),location:text(source.location??event.location),cancelled:text(source.status||event.status).toUpperCase()==='CANCELLED',recurring:Boolean(instance.isRecurring),url:'https://calendar.google.com/calendar/u/0/r/eventedit/'+Buffer.from(id+' '+calendarId).toString('base64url')});
    }
  }
  return {events,...window};
}
export function newEventDetails(source,emptyEventPlan) {
  const notes=source.description;
  // Exact counts only: a range such as 30-40 is left for staff to confirm.
  const match=notes.match(/(?:^|[^\d-])(\d{1,3})\s*(?:people|guests|persons)\b/i);
  const guests=match&&!/\d\s*[-–]\s*$/.test(notes.slice(0,match.index+match[0].indexOf(match[1])))?Number(match[1]):0;
  return {...emptyEventPlan(),title:source.title.slice(0,200),date:source.date,startTime:source.startTime,endTime:source.endTime,location:(source.location||emptyEventPlan().location).slice(0,300),guestCount:guests,status:/tentative|pending/i.test(source.title)?'Tentative':'Confirmed',internalNotes:`Imported from Google Calendar: ${calendarName}\nGoogle event ID: ${source.id}\nGoogle Calendar: ${source.url}\nOriginal booking notes:\n${notes}`.slice(0,5000)};
}
export function sourceState(row,source,now) {
  const previous=row.calendar_sync||{};
  if(!source)return {...previous,calendarId,eventId:previous.eventId||row.data.internalNotes?.match(/Google event ID: ([^\n]+)/)?.[1],status:'removed',checkedAt:now,removedAt:previous.removedAt||now};
  const scheduleDiff=['title','date','startTime','endTime'].some(key=>String(row.data[key]||'')!==String(source[key]||''));
  const previousSource=previous.source;
  const detailDiff=Boolean(previousSource&&['description','location'].some(key=>previousSource[key]!==source[key]));
  return {calendarId,eventId:source.id,status:source.cancelled?'cancelled':scheduleDiff||detailDiff||previous.reviewRequired?'changed':'active',reviewRequired:scheduleDiff||detailDiff||Boolean(previous.reviewRequired),source,checkedAt:now,lastSeenAt:now};
}
export async function applyCalendarSnapshot(client,snapshot,emptyEventPlan,{dryRun=false,now=new Date()}={}) {
  const timestamp=now.toISOString();
  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('aviator-ready-room-calendar-sync'))");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('aviator-private-event-booking'))");
    const rows=(await client.query("SELECT id,data,calendar_sync FROM website.private_event_plans WHERE calendar_sync->>'calendarId'=$1 OR (id LIKE 'gcal-%' AND data->>'internalNotes' LIKE 'Imported from Google Calendar: Event-ReadyRoom%')",[calendarId])).rows;
    const existing=new Map(rows.map(row=>[row.id,row]));
    const counts={added:0,existing:rows.length,removed:0,cancelled:0,changed:0};
    for(const row of rows) {
      const id=row.calendar_sync?.eventId||row.data.internalNotes?.match(/Google event ID: ([^\n]+)/)?.[1];
      if(!id)throw Error('Imported event is missing its Google identity; no events changed.');
      const source=snapshot.events.get(id);
      // Recurrences are expanded within a bounded window; expiration is not deletion.
      if(!source&&row.calendar_sync?.source?.recurring&&(row.calendar_sync.source.date<dayFormat.format(snapshot.from)||row.calendar_sync.source.date>snapshot.importTo))continue;
      const state=sourceState(row,source,timestamp);
      if(state.status in counts)counts[state.status]++;
      // Deliberately update metadata only. Staff-entered data, payment, status and version never change.
      await client.query('UPDATE website.private_event_plans SET calendar_sync=$1::jsonb WHERE id=$2',[JSON.stringify(state),row.id]);
    }
    for(const source of snapshot.events.values()) {
      const id=eventPlanId(source.id);
      if(existing.has(id)||source.cancelled||source.date<snapshot.importFrom||source.date>snapshot.importTo)continue;
      const data=newEventDetails(source,emptyEventPlan);
      const state=sourceState({data},source,timestamp);
      const result=await client.query('INSERT INTO website.private_event_plans(id,title,event_date,status,data,calendar_sync) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb) ON CONFLICT(id) DO NOTHING',[id,data.title,data.date,data.status,JSON.stringify(data),JSON.stringify(state)]);
      counts.added+=result.rowCount;
    }
    const status={calendarName,checkedAt:timestamp,timezone,schedule:'8 a.m., noon and 3 p.m. Eastern',...counts};
    await client.query("INSERT INTO website.settings(key,value) VALUES('private_event_calendar_sync',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",[JSON.stringify(status)]);
    await client.query(dryRun?'ROLLBACK':'COMMIT');
    return status;
  }catch(error){await client.query('ROLLBACK');throw error;}
}
