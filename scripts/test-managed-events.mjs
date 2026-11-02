import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const compile = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const temp = await mkdtemp(path.join(os.tmpdir(), 'aviator-managed-events-'));
const originalFile = process.env.MANAGED_EVENTS_DATA_FILE;
process.env.MANAGED_EVENTS_DATA_FILE = path.join(temp, 'events.json');
globalThis.__managedEventsTest = {database:false};
try {
  const eastern = compile(await readFile(new URL('../src/lib/eastern-time.ts', import.meta.url), 'utf8'));
  const source = (await readFile(new URL('../src/lib/managed-events.ts', import.meta.url), 'utf8'))
    .replace('import { databaseConfigured, withDatabase } from "@/lib/database";', 'const databaseConfigured = () => globalThis.__managedEventsTest.database; const withDatabase = async fn => fn({query: (...args) => globalThis.__managedEventsTest.query(...args)});')
    .replace('"@/lib/eastern-time"', JSON.stringify(eastern));
  const events = await import(compile(source));
  const base = {title:'Holiday ordering',date:'2026-11-01',startTime:'11:00',endTime:'17:00',location:'Aviator Hangar Bar',description:'Choose a pickup date online.',ticketUrl:'https://aviatorbrew.com/feast',published:true};
  const season = await events.createManagedEvent({...base,endDate:'2027-01-02',linkLabel:'Build your feast'});
  const read = options => events.getPublishedEvents({fromDate:'2026-12-01',throughDate:'2026-12-31',...options});
  assert.equal((await read()).length,1,'An ongoing range remains visible after its start date');
  assert.equal((await read())[0].id,season.id,'A season is one listing, not daily duplicates');
  assert.equal((await read())[0].linkLabel,'Build your feast');
  assert.equal((await read({fromDate:'2027-01-02',throughDate:'2027-01-02'})).length,1,'Inclusive last day');
  assert.equal((await read({fromDate:'2027-01-03',throughDate:'2027-02-01'})).length,0,'Ended range disappears');
  assert.equal((await read({fromDate:'2026-10-01',throughDate:'2026-10-31'})).length,0,'Future range stays outside the requested window');
  for (const endDate of ['2026-10-31','2027-02-30','bad']) await assert.rejects(events.createManagedEvent({...base,endDate}),/end date/);
  await assert.rejects(events.createManagedEvent({...base,endDate:'2027-01-02',recurrenceFrequency:'weekly'}),/continuous date range/);
  await events.updateManagedEvent(season.id,{published:false});
  assert.equal((await read()).length,0);
  await events.updateManagedEvent(season.id,{published:true});
  assert.equal((await read())[0].endDate,'2027-01-02','Toggling publication retains the date range');
  await events.updateManagedEvent(season.id,{endDate:'',linkLabel:''});
  assert.equal((await read()).length,0,'Clearing the range restores a single-date event');
  assert.equal((await events.getManagedEvents())[0].linkLabel,undefined);
  await events.createManagedEvent({...base,title:'Friday event',date:'2026-11-06',recurrenceFrequency:'weekly',recurrenceEndDate:'2026-11-27'});
  assert.deepEqual((await read({fromDate:'2026-11-02',throughDate:'2026-11-30'})).map(e=>e.date),['2026-11-06','2026-11-13','2026-11-20','2026-11-27'],'Existing weekly recurrence is unchanged');
  await events.createManagedEvent({...base,title:'Music',eventType:'live_music',date:'2026-11-06'});
  assert.equal((await events.getPublishedLiveMusicEvents({fromDate:'2026-11-02',throughDate:'2026-11-30'})).length,1,'Event categories remain separate');
  await rm(process.env.MANAGED_EVENTS_DATA_FILE);

  const rows = [];
  globalThis.__managedEventsTest = {database:true,query:async (sql,params=[])=>{
    if(sql.startsWith('SELECT')) return {rows:rows.filter(r=>!params.length||r.event_type===params[0])};
    if(sql.includes('INSERT INTO website.events')) {
      const [slug,title,event_type,starts_at,ends_at,location,description,details,published] = params;
      rows.push({slug,title,event_type,starts_at,ends_at,location,description,details:JSON.parse(details),published});
      return {rows:[]};
    }
    throw new Error('Unexpected database operation');
  }};
  await events.createManagedEvent({...base,endDate:'2027-01-02',linkLabel:'Build your feast'});
  assert.equal(rows[0].starts_at,'2026-11-01T11:00:00-05:00');
  assert.equal(rows[0].ends_at,'2027-01-02T17:00:00-05:00','Database end timestamp follows the final date');
  assert.equal((await read())[0].endDate,'2027-01-02','Database reads preserve the range');
  assert.equal((await read())[0].linkLabel,'Build your feast');
  console.log('PASS managed events: ongoing ranges, boundaries, validation, publication, editable CTA, unchanged recurrence/categories and database timestamp/JSON round trip.');
} finally {
  if(originalFile === undefined) delete process.env.MANAGED_EVENTS_DATA_FILE;
  else process.env.MANAGED_EVENTS_DATA_FILE = originalFile;
  delete globalThis.__managedEventsTest;
  await rm(temp,{recursive:true,force:true});
}
