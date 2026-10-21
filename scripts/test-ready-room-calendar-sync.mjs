import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {parseCalendar,eventPlanId,sourceState,newEventDetails,applyCalendarSnapshot,isScheduledTime} from './ready-room-calendar-sync.mjs';
const compiled=ts.transpileModule(await readFile(new URL('../src/lib/event-plan.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const model=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const now=new Date('2026-10-17T12:00:00Z');
const wrap=events=>`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:Event-ReadyRoom\r\n${events}\r\nEND:VCALENDAR\r\n`;
const event=(id,extra='')=>`BEGIN:VEVENT\r\nUID:${id}@google.com\r\nDTSTART;TZID=America/New_York:20261025T090000\r\nDTEND;TZID=America/New_York:20261025T100000\r\nSUMMARY:Test event\r\nDESCRIPTION:55 people\r\n${extra}\r\nEND:VEVENT`;
for(const date of ['2026-10-17T12:00Z','2026-10-17T16:00Z','2026-10-17T19:00Z','2026-12-17T13:00Z','2026-12-17T17:00Z','2026-12-17T20:00Z'])assert.ok(isScheduledTime(new Date(date)),date);
for(const date of ['2026-10-17T13:00Z','2026-10-17T17:00Z','2026-10-17T20:00Z','2026-12-17T12:00Z','2026-12-17T16:00Z','2026-12-17T19:00Z'])assert.ok(!isScheduledTime(new Date(date)),date);
await assert.rejects(()=>parseCalendar('<html>Error</html>',now));
await assert.rejects(()=>parseCalendar(wrap(event('one')).replace('END:VCALENDAR',''),now));
await assert.rejects(()=>parseCalendar(wrap(event('one')).replace('Event-ReadyRoom','Wrong calendar'),now));
const recurring=await parseCalendar(wrap(event('weekly','RRULE:FREQ=WEEKLY;COUNT=3')),now);
assert.equal(recurring.events.size,3);assert.ok([...recurring.events.values()].every(e=>e.startTime==='09:00'),'Recurring local time must survive DST');
assert.ok(recurring.events.has('weekly_20261025T130000Z'));assert.ok(recurring.events.has('weekly_20261101T140000Z'));
const excluded=await parseCalendar(wrap(event('weekly','RRULE:FREQ=WEEKLY;COUNT=3\r\nEXDATE;TZID=America/New_York:20261101T090000')),now);
assert.equal(excluded.events.size,2);
const allDay=await parseCalendar(wrap('BEGIN:VEVENT\r\nUID:allday@google.com\r\nDTSTART;VALUE=DATE:20261101\r\nDTEND;VALUE=DATE:20261102\r\nSUMMARY:All-day event\r\nEND:VEVENT'),now);
assert.equal(allDay.events.get('allday').date,'2026-11-01');assert.equal(allDay.events.get('allday').startTime,'');
const snapshot=await parseCalendar(wrap(event('one')),now),source=snapshot.events.get('one');
const details=model.parseEventPlan(newEventDetails(source,model.emptyEventPlan));assert.equal(details.paidCents,0);assert.equal(details.guestCount,55);assert.equal(details.flightPlan.packageId,'');
assert.equal(newEventDetails({...source,description:'30-40 people; deposit paid $500'},model.emptyEventPlan).guestCount,0);
assert.equal(newEventDetails({...source,description:'30 - 40 people'},model.emptyEventPlan).guestCount,0);
const saved={id:eventPlanId('one'),data:{...details,title:'Manager title',paidCents:70000,items:[{id:'food',name:'Manual food order',quantity:55,unitPriceCents:3800,taxable:true,category:'Food',notes:''}]},calendar_sync:{}};
const original=structuredClone(saved.data);
assert.equal(sourceState(saved,source,now.toISOString()).status,'changed');assert.deepEqual(saved.data,original);
assert.equal(sourceState(saved,null,now.toISOString()).status,'removed');
assert.equal(sourceState(saved,{...source,cancelled:true},now.toISOString()).status,'cancelled');
function database(rows){
 let entries=structuredClone(rows),before;
 return {rows:()=>entries,query:async(sql,args=[])=>{
  if(sql==='BEGIN'){before=structuredClone(entries);return {rows:[]};}
  if(sql==='ROLLBACK'){entries=before;return {rows:[]};}
  if(sql==='COMMIT'||sql.includes('pg_advisory')||sql.startsWith('INSERT INTO website.settings'))return {rows:[]};
  if(sql.startsWith('SELECT id,data'))return {rows:entries};
  if(sql.startsWith('UPDATE website.private_event_plans')){assert.ok(sql.includes('SET calendar_sync='));assert.ok(!sql.includes('SET data='));entries.find(e=>e.id===args[1]).calendar_sync=JSON.parse(args[0]);return {rowCount:1};}
  if(sql.startsWith('INSERT INTO website.private_event_plans')){if(entries.some(e=>e.id===args[0]))return {rowCount:0};entries.push({id:args[0],data:JSON.parse(args[4]),calendar_sync:JSON.parse(args[5])});return {rowCount:1};}
  throw Error('Unexpected query: '+sql);
 }};
}
const db=database([saved]);let report=await applyCalendarSnapshot(db,snapshot,model.emptyEventPlan,{now});assert.equal(report.added,0);assert.deepEqual(db.rows()[0].data,original);
const missing=await parseCalendar(wrap(event('two')),now);report=await applyCalendarSnapshot(db,missing,model.emptyEventPlan,{now});assert.equal(report.added,1);assert.equal(report.removed,1);assert.deepEqual(db.rows()[0].data,original);assert.equal(db.rows()[0].calendar_sync.status,'removed');
report=await applyCalendarSnapshot(db,missing,model.emptyEventPlan,{now});assert.equal(report.added,0);assert.equal(db.rows().length,2,'Repeated sync must not duplicate events');
await applyCalendarSnapshot(db,snapshot,model.emptyEventPlan,{now});assert.equal(db.rows()[0].calendar_sync.status,'changed','Reappearing Google event clears deletion flag');assert.deepEqual(db.rows()[0].data,original);
const prior=structuredClone(db.rows());await applyCalendarSnapshot(db,await parseCalendar(wrap(event('three')),now),model.emptyEventPlan,{now,dryRun:true});assert.deepEqual(db.rows(),prior,'Dry run rolls back all writes');
// A staff-confirmed match keeps the website plan as the single calendar owner.
const linked={id:'website-plan-fixture',data:{...details,title:'Customer: Test celebration',paidCents:35000},calendar_sync:{calendarId:'6gltnsnhbqvekua18jof6ip7o8@group.calendar.google.com',eventId:'one',linkedFromPlanId:eventPlanId('one'),linkedAt:now.toISOString(),source}};
const archived={...saved,calendar_sync:{eventId:'one',linkedToPlanId:linked.id,linkedAt:now.toISOString()}};
const linkedDb=database([archived,linked]),linkedOriginal=structuredClone(linked.data);
report=await applyCalendarSnapshot(linkedDb,snapshot,model.emptyEventPlan,{now});
assert.equal(report.added,0);assert.equal(report.existing,1);assert.equal(linkedDb.rows().length,2);
assert.equal(linkedDb.rows()[1].calendar_sync.status,'active','Different customer and Google titles alone do not create a false change warning');
assert.equal(linkedDb.rows()[1].calendar_sync.linkedFromPlanId,archived.id);assert.deepEqual(linkedDb.rows()[1].data,linkedOriginal);
const moved={...snapshot,events:new Map([['one',{...source,date:'2026-10-26'}]])};
await applyCalendarSnapshot(linkedDb,moved,model.emptyEventPlan,{now});assert.equal(linkedDb.rows()[1].calendar_sync.status,'changed');assert.equal(linkedDb.rows()[1].data.date,details.date);
await applyCalendarSnapshot(linkedDb,{...snapshot,events:new Map()},model.emptyEventPlan,{now});assert.equal(linkedDb.rows()[1].calendar_sync.status,'removed');assert.ok(linkedDb.rows()[1].calendar_sync.linkedFromPlanId);assert.equal(linkedDb.rows()[0].calendar_sync.linkedToPlanId,linked.id);
const mappedDb=database([linked]);report=await applyCalendarSnapshot(mappedDb,snapshot,model.emptyEventPlan,{now});assert.equal(report.added,0,'Google identity remains attached even when the owner has a website UUID rather than a generated Google ID');
console.log('Calendar sync passed: Eastern schedule/DST, recurring events, exclusions, all-day dates, identity, malformed-feed rejection, saved-order/payment preservation, deletion detection, reappearance, idempotency and dry-run rollback.');
