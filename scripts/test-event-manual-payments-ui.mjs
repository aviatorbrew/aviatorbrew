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
const details={...m.emptyEventPlan(),title:'Staff copy fixture',date:'2026-12-16',startTime:'15:30',endTime:'18:30',status:'Confirmed',paidCents:45000,guestCount:70,contactName:'Fixture customer',contactEmail:'customer@example.invalid',items:[{id:'food',category:'Food',name:'Fixture meal',quantity:70,unitPriceCents:4000,taxable:true,notes:''}]};
const plan={id:'11111111-1111-4111-8111-111111111111',version:1,details,createdAt:stamp,updatedAt:stamp,sourceInquiryId:null};
const proposal={id:'22222222-2222-4222-8222-222222222222',plan_id:plan.id,number:'AVI-FIXTURE-STAFF',version:1,plan_version:1,material_hash:'fixture',termsCurrent:true,state:'sent',created_at:stamp,approved_at:stamp,sent_at:stamp,accepted_at:null,expires_at:'2026-11-24T00:53:00Z',snapshot:{details:{...details,paidCents:0},items:details.items,selections:[],catalog,totals:m.eventTotals({...details,paidCents:0},catalog),depositCents:35000,policyText:'Fixture policies',policyVersion:'fixture-1'}};
let app,browser,page;const posts=[],errors=[];
try{
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const base='http://127.0.0.1:'+port;
 app=spawn('node',['.next/standalone/server.js'],{cwd:root,env:{...process.env,HOSTNAME:'127.0.0.1',PORT:String(port),DATABASE_URL:'',MAIL_MODE:'record',STRIPE_SECRET_KEY:''},stdio:'ignore'});
 for(let i=0;i<100;i++){try{if((await fetch(base+'/manager')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch();page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date(stamp));
 await page.route('**/api/manager/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let body={};
  if(req.method()==='PUT'&&path==='/api/manager/event-plans/'+plan.id){const payload=req.postDataJSON();assert.equal(payload.details.paidCents,50000);posts.push(payload);plan.details=payload.details;plan.version++;body={plan};}
  else if(req.method()!=='GET'){assert.equal(path,`/api/manager/event-plans/${plan.id}/proposals/${proposal.id}`);const payload=req.postDataJSON();assert.equal(payload.action,'resend-deposit');assert.equal(payload.recipientEmail,'lianna@aviatorbrew.com');assert.equal(payload.emailApproved,true);assert.ok(payload.requestId);posts.push(payload);body={sent:true,proposalId:proposal.id,recipient:payload.recipientEmail};}
  else if(path==='/api/manager/session')body={authenticated:true};
  else if(path==='/api/manager/private-events')body={catering:catalog,bookingFeeCents:35000};
  else if(path==='/api/manager/event-plans')body={plans:[plan],catering:catalog,defaultRoomFeeCents:35000};
  else if(path==='/api/manager/inquiries')body={inquiries:[],total:0,unreviewedCount:0};
  else if(path.endsWith('/proposals'))body={proposals:[proposal],deposits:[{session_id:'cs_fixture',payment_intent:'pi_fixture',proposal_id:proposal.id,amount_cents:35000,paid_at:stamp}],attempts:[],deliveries:[],changeRequests:[],depositLinks:[],review:{context:'fixture-context',proposalId:proposal.id,emailApproved:true}};
  else if(path.endsWith('/calendar-match'))body={matches:[],linked:null};
  else if(path==='/api/manager/event-plans/'+plan.id)body={plan,updates:[]};
  await route.fulfill({json:body});
 });
 for(const width of [1440,390]){
  plan.details={...details,paidCents:45000};plan.version=1;const before=posts.length;
  await page.setViewportSize({width,height:1000});await page.goto(base+'/manager/private-events');await page.locator('[data-event-id="'+plan.id+'"]').getByRole('button',{name:'Edit plan',exact:true}).click();await page.getByRole('tab',{name:'Proposal & Payments',exact:true}).click();
  const entry=page.getByLabel('Total manual payments received ($)',{exact:true});await entry.waitFor();assert.equal(await entry.inputValue(),'100');assert.equal(await entry.evaluate(e=>e.form?.id),'event-plan-details');assert.equal(await entry.evaluate(e=>Boolean(e.closest('.event-proposal-manager'))),true);
  await entry.fill('150');assert.match(await page.getByRole('group',{name:'Manual payments received',exact:true}).innerText(),/Unsaved total credit: \$500.00/);
  await page.getByRole('button',{name:'Save payment credit',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.event-workspace-header')?.textContent.includes('Saved revision 2'));assert.equal(posts.length,before+1);assert.equal(plan.details.paidCents,50000);
  await page.getByRole('region',{name:'Event payment summary',exact:true}).getByText('Manual: $150.00 · Stripe: $350.00',{exact:true}).waitFor();await page.getByRole('tab',{name:'Menu & Pricing',exact:true}).click();assert.equal(await entry.isVisible(),false);await page.getByRole('tab',{name:'Proposal & Payments',exact:true}).click();assert.equal(await entry.inputValue(),'150');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 await page.route('**/api/event-proposals',route=>route.fulfill({json:{proposal,status:'Confirmed',canAccept:true,canRequestChanges:true,changeRequests:[],payments:[{amount_cents:35000,session_id:'cs_fixture',payment_intent:'pi_fixture',paid_at:stamp}],recordedPaidCents:50000,manualPaidCents:15000,verifiedPaidCents:35000,remainingCents:proposal.snapshot.totals.total-50000}}));
 await page.goto(base+'/event-proposal#token='+('a'.repeat(64)));const summary=page.getByRole('region',{name:'Payments credited to your event'});await summary.waitFor();assert.match(await summary.innerText(),/Manual payments received: \$150.00/);assert.match(await summary.innerText(),/Verified Stripe payments: \$350.00/);assert.match(await summary.innerText(),/Total payments received: \$500.00/);assert.match(await summary.innerText(),/Deposit still due: \$0.00/);
 assert.deepEqual(errors,[]);console.log('PASS manual payment UI: entry within customer proposals/payments, Stripe credit preserved, correct combined save, external form association, desktop/mobile and live customer payment breakdown. All writes mocked.');
}finally{await browser?.close();app?.kill('SIGTERM');}
