import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const compile = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const rows = [{slug:'older',title:'Existing release',published:true,starts_at:new Date('2026-11-10T23:00:00Z'),created_at:new Date('2026-01-01T12:00:00Z'),updated_at:new Date('2026-01-01T12:00:00Z'),data:{id:'older',beerName:'Existing release',releaseDate:'2026-11-10',releaseTime:'18:00',sellSheetUrl:'/existing.pdf'}}];
globalThis.__releaseTestQuery = async (sql,params=[]) => {
  if(sql.trim().startsWith('SELECT')) return {rows};
  if(sql.includes('INSERT INTO website.content_blocks')) {
    const [,slug,,title,,json,published,starts_at] = params, data=JSON.parse(json), i=rows.findIndex(r=>r.slug===slug);
    const row={slug,title,data,published,starts_at,created_at:i>=0?rows[i].created_at:new Date(data.createdAt),updated_at:new Date()};
    if(i>=0) rows[i]=row; else rows.push(row);
    return {rows:[]};
  }
  throw Error('Unexpected database operation');
};
try {
  const eastern=compile(await readFile(new URL('../src/lib/eastern-time.ts',import.meta.url),'utf8'));
  const source=(await readFile(new URL('../src/lib/beer-release-alert.ts',import.meta.url),'utf8'))
    .replace('import { databaseConfigured, withDatabase } from "@/lib/database";','const databaseConfigured=()=>true; const withDatabase=async fn=>fn({query:(...args)=>globalThis.__releaseTestQuery(...args)});')
    .replace('"@/lib/eastern-time"',JSON.stringify(eastern));
  const m=await import(compile(source));
  const release=await m.createBeerReleaseAlert({enabled:true,beerName:'Breaking Brews',releaseDate:'2026-11-06',releaseTime:'18:00',description:'Collaboration details\n\nThe story behind the beer.',storyUrl:'https://www.youtube.com/watch?v=abc123DEF45'});
  assert.equal((await m.getPublishedBeerReleaseAlerts())[0].id,release.id,'Newest announcement leads, rather than oldest release date');
  assert.equal((await m.getPublishedBeerReleaseAlerts())[0].description,'Collaboration details\n\nThe story behind the beer.');
  assert.equal((await m.getPublishedBeerReleaseAlerts())[0].storyUrl,'https://www.youtube.com/watch?v=abc123DEF45');
  assert.equal(rows.find(r=>r.slug===release.id).starts_at,'2026-11-06T18:00:00-05:00','Release time is 6 p.m. Eastern');
  await m.saveBeerReleaseAlert({id:'older',specials:'Updated existing release'});
  assert.equal((await m.getPublishedBeerReleaseAlerts())[0].id,release.id,'Editing an existing release does not promote it');
  assert.equal((await m.getBeerReleaseAlerts()).find(r=>r.id==='older').sellSheetUrl,'/existing.pdf','Existing sell sheets are retained');
  for(const storyUrl of ['javascript:alert(1)','http://youtube.com/watch?v=abc123DEF45','https://youtube.com.evil.invalid/watch?v=abc123DEF45','https://other.invalid/video','https://user@youtube.com/watch?v=abc123DEF45']) await assert.rejects(m.saveBeerReleaseAlert({id:release.id,storyUrl}),/YouTube story link/);
  await m.saveBeerReleaseAlert({id:release.id,storyUrl:'https://youtu.be/abc123DEF45'});
  assert.equal((await m.getPublishedBeerReleaseAlerts())[0].description,release.description,'Partial edits retain details');
  await m.saveBeerReleaseAlert({id:release.id,storyUrl:'',enabled:false});
  assert.equal((await m.getPublishedBeerReleaseAlerts()).length,1,'Unpublished releases stay hidden');
  assert.equal((await m.getBeerReleaseAlerts()).find(r=>r.id===release.id).storyUrl,'','Story links can be removed');
  console.log('PASS release alerts: newest-first, stable edits, details and YouTube link storage, URL validation, existing assets, unpublished records and 6 p.m. Eastern.');
} finally {delete globalThis.__releaseTestQuery;}
