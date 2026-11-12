import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=await import(process.env.AVIATOR_PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(root+'/package.json'),ts=require('typescript'),mod={exports:{}};
new Function('module','exports',ts.transpileModule(readFileSync(root+'/src/lib/event-plan.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(mod,mod.exports);
const m=mod.exports,catalog=structuredClone(m.defaultCateringCatalog),stamp='2026-11-12T12:00:00Z';
const details={...m.emptyEventPlan(),title:'Proposal note fixture',date:'2026-12-16',startTime:'15:30',endTime:'18:30',guestCount:70,contactName:'Fixture customer',contactEmail:'customer@example.invalid',items:[{id:'food',category:'Food',name:'Fixture meal',quantity:70,unitPriceCents:4000,taxable:true,notes:''}]};
const plan={id:'11111111-1111-4111-8111-111111111111',version:1,details,createdAt:stamp,updatedAt:stamp,sourceInquiryId:null};
const proposal={id:'22222222-2222-4222-8222-222222222222',plan_id:plan.id,number:'AVI-FIXTURE-NOTE',version:1,plan_version:1,material_hash:'fixture',termsCurrent:true,state:'draft',created_at:stamp,approved_at:null,sent_at:null,accepted_at:null,expires_at:'2026-11-24T00:53:00Z',snapshot:{details,items:details.items,selections:[],catalog,totals:m.eventTotals(details,catalog),depositCents:35000,policyText:'Fixture policies',policyVersion:'fixture-1'}};
let app,browser,page,failNext=false;const posts=[],errors=[],note='Hi Fixture,\nThanks for choosing Aviator & friends.\n<img src=x onerror="alert(1)">';
try{
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const base='http://127.0.0.1:'+port;
 app=spawn('node',['.next/standalone/server.js'],{cwd:root,env:{...process.env,HOSTNAME:'127.0.0.1',PORT:String(port),DATABASE_URL:'',MAIL_MODE:'record',STRIPE_SECRET_KEY:''},stdio:'ignore'});
 for(let i=0;i<100;i++){try{if((await fetch(base+'/manager')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch();page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date(stamp));
 await page.route('**/api/manager/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let body={};
  if(req.method()!=='GET'){
   assert.equal(path,`/api/manager/event-plans/${plan.id}/proposals/${proposal.id}`);const payload=req.postDataJSON();assert.equal(payload.action,undefined);assert.equal(payload.emailApproved,true);assert.equal(payload.reviewContext,'fixture-context');posts.push(payload);
   if(failNext){failNext=false;return route.fulfill({status:503,json:{error:'Fixture delivery failed.'}});}
   proposal.sent_at=stamp;proposal.approved_at=stamp;proposal.state='sent';body={sent:true,proposalId:proposal.id};
  }
  else if(path==='/api/manager/session')body={authenticated:true};
  else if(path==='/api/manager/private-events')body={catering:catalog,bookingFeeCents:35000};
  else if(path==='/api/manager/event-plans')body={plans:[plan],catering:catalog,defaultRoomFeeCents:35000};
  else if(path==='/api/manager/inquiries')body={inquiries:[],total:0,unreviewedCount:0};
  else if(path.endsWith('/proposals'))body={proposals:[proposal],deposits:[],attempts:[],deliveries:[],changeRequests:[],depositLinks:[],review:{context:'fixture-context',proposalId:proposal.id,emailApproved:true}};
  else if(path.endsWith('/calendar-match'))body={matches:[],linked:null};
  else if(path==='/api/manager/event-plans/'+plan.id)body={plan,updates:[]};
  await route.fulfill({json:body});
 });
 for(const width of [1440,390]){
  proposal.sent_at=null;proposal.approved_at=null;proposal.state='draft';const before=posts.length;
  await page.setViewportSize({width,height:1000});await page.goto(base+'/manager/private-events');await page.locator('[data-event-id="'+plan.id+'"]').getByRole('button',{name:'Edit plan',exact:true}).click();await page.getByRole('tab',{name:'Proposal & Payments',exact:true}).click();
  const open=()=>page.getByRole('button',{name:'Approve & Email Proposal',exact:true}).click(),dialog=page.getByRole('dialog',{name:'Confirm proposal email'}),input=dialog.getByLabel('Note to include in proposal email (optional)',{exact:true});
  await open();await input.fill(note);assert.equal(await input.getAttribute('maxlength'),'2000');
  const preview=dialog.getByRole('region',{name:'Email note preview'});assert.equal(await preview.locator('p').innerText(),note);assert.equal(await preview.locator('img').count(),0,'Preview renders the note as text');
  assert.equal(await preview.locator('p').evaluate(e=>getComputedStyle(e).whiteSpace),'pre-wrap');assert.ok((await input.boundingBox()).height>=100);
  await dialog.getByRole('button',{name:'Cancel — do not send',exact:true}).click();assert.equal(posts.length,before);
  await open();assert.equal(await input.inputValue(),note,'Cancel preserves the unsent note');failNext=true;
  await dialog.getByRole('button',{name:'Confirm & send email',exact:true}).click();await page.getByRole('alert').filter({hasText:'Fixture delivery failed.'}).waitFor();assert.equal(posts.length,before+1);assert.equal(posts.at(-1).emailNote,note);
  await open();assert.equal(await input.inputValue(),note,'Failed delivery preserves the note for review');await dialog.getByRole('button',{name:'Confirm & send email',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Proposal email sent.'}).waitFor();assert.equal(posts.length,before+2);assert.equal(posts.at(-1).emailNote,note);
  await page.getByRole('button',{name:'Resend proposal link',exact:true}).click();assert.equal(await input.inputValue(),'','Successful sends clear the outgoing note');await input.fill('Updated message for this resend.');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth),false,'Dialog fits the viewport');
  await dialog.getByRole('button',{name:'Confirm & send email',exact:true}).click();await page.getByRole('status').filter({hasText:'Proposal email sent.'}).waitFor();assert.equal(posts.length,before+3);assert.equal(posts.at(-1).emailNote,'Updated message for this resend.');
 }
 assert.deepEqual(errors,[]);console.log('PASS proposal email note UI: desktop/mobile, multiline safe preview, roomy input, optional note, cancel/failure preservation, approved payload, resend and clearing after success; mocked mail only.');
}finally{await browser?.close();app?.kill('SIGTERM');}
