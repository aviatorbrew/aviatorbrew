import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {Client} from 'pg';
import {parseCalendar,applyCalendarSnapshot,isScheduledTime} from './ready-room-calendar-sync.mjs';

async function main(){
  if(process.argv.includes('--scheduled')&&!isScheduledTime()){console.log('Outside 8 a.m., noon or 3 p.m. Eastern; skipped.');return;}
  const fileIndex=process.argv.indexOf('--file');
  let body;
  if(fileIndex>=0)body=await readFile(process.argv[fileIndex+1],'utf8');
  else {
    const url=new URL(process.env.READY_ROOM_CALENDAR_ICS_URL||'');
    if(url.protocol!=='https:'||url.hostname!=='calendar.google.com'||!url.pathname.includes('/calendar/ical/'))throw Error('Configure a Google Calendar private iCal URL.');
    const response=await fetch(url,{signal:AbortSignal.timeout(45000),redirect:'error',headers:{'Cache-Control':'no-cache'}});
    if(!response.ok)throw Error('Calendar feed returned HTTP '+response.status+'; no events changed.');
    body=await response.text();if(body.length>20_000_000)throw Error('Calendar feed exceeds the size limit.');
  }
  const snapshot=await parseCalendar(body);
  const source=await readFile(new URL('../src/lib/event-plan.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const {emptyEventPlan}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
  const client=new Client({connectionString:process.env.DATABASE_URL,ssl:/sslmode=require/.test(process.env.DATABASE_URL||'')||process.env.POSTGRES_SSL==='true'?{rejectUnauthorized:false}:undefined,connectionTimeoutMillis:15000});
  await client.connect();
  try {console.log(JSON.stringify(await applyCalendarSnapshot(client,snapshot,emptyEventPlan,{dryRun:process.argv.includes('--dry-run')})));}
  finally {await client.end();}
}
if(import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Ready Room calendar sync failed; no partial changes were committed. Check calendar access and database connectivity.');process.exitCode=1;});
