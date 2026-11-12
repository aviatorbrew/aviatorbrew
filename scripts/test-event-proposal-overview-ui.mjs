import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=await import(process.env.AVIATOR_PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(root+'/package.json'),ts=require('typescript'),mod={exports:{}};
new Function('module','exports',ts.transpileModule(readFileSync(root+'/src/lib/event-plan.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(mod,mod.exports);
const m=mod.exports,catalog=structuredClone(m.defaultCateringCatalog),stamp='2026-11-12T16:25:00Z';
const details={...m.emptyEventPlan(),title:'Proposal overview fixture',date:'2026-12-16',startTime:'15:30',endTime:'18:30',status:'Confirmed',guestCount:30,paidCents:35000,contactName:'Fixture customer',contactEmail:'customer@example.invalid',items:[{id:'food',category:'Food',name:'Fixture meal',quantity:30,unitPriceCents:1000,taxable:true,notes:''}]};
const originalPlan={id:'11111111-1111-4111-8111-111111111111',version:1,details,createdAt:stamp,updatedAt:stamp,sourceInquiryId:null};
const originalProposal={id:'22222222-2222-4222-8222-222222222222',plan_id:originalPlan.id,number:'AVI-FIXTURE-OVERVIEW-2',version:2,plan_version:1,material_hash:'fixture',termsCurrent:true,state:'sent',created_at:stamp,approved_at:stamp,sent_at:stamp,accepted_at:null,expires_at:'2026-11-26T20:27:00Z',snapshot:{details:{...details,paidCents:0},items:details.items,selections:[],catalog,totals:{...m.eventTotals(details,catalog),total:64982},depositCents:35000,policyText:'Fixture policies',policyVersion:'fixture-1'}};
let app,browser,page,plan,proposal,approved=false,failApproval=false,releaseApproval,holdApproval=false,attempts=[],deliveries=[];
const writes=[],errors=[];
try{
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const base='http://127.0.0.1:'+port;
 app=spawn('node',['.next/standalone/server.js'],{cwd:root,env:{...process.env,HOSTNAME:'127.0.0.1',PORT:String(port),DATABASE_URL:'',MAIL_MODE:'record',STRIPE_SECRET_KEY:''},stdio:'ignore'});
 for(let i=0;i<100;i++){try{if((await fetch(base+'/manager')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch();page=await browser.newPage({timezoneId:'America/New_York'});page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date(stamp));
 const review=()=>({context:'fixture-review-'+proposal.version,proposalId:proposal.id,emailApproved:approved});
 await page.route('**/api/manager/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let body={};
  if(req.method()!=='GET'){
   const input=req.postDataJSON();writes.push({method:req.method(),path,input});
   if(req.method()==='PATCH'&&path.endsWith('/proposals')){
    if(holdApproval)await new Promise(resolve=>{releaseApproval=resolve;});
    if(failApproval){failApproval=false;return route.fulfill({status:503,json:{error:'Fixture approval save failed.'}});}
    approved=input.emailApproved;body={review:review()};
   }else if(req.method()==='POST'&&path.endsWith('/proposals')){
    assert.equal(input.version,plan.version);assert.equal(input.expiresAt,'2026-12-01T17:00:00.000Z');
    proposal={...structuredClone(originalProposal),id:'33333333-3333-4333-8333-333333333333',version:3,number:'AVI-FIXTURE-OVERVIEW-3',state:'draft',approved_at:null,sent_at:null,accepted_at:null,expires_at:input.expiresAt};approved=false;body={proposal};
   }else if(req.method()==='POST'&&path.endsWith('/'+proposal.id)){
    if(input.action==='manual-accept'){assert.equal(input.confirmed,true);assert.equal(input.version,proposal.version);assert.equal(input.planVersion,plan.version);proposal.accepted_at=stamp;proposal.acceptanceMethod='manual';proposal.accepted_name=input.name;body={proposal};}
    else{assert.equal(input.emailApproved,true);assert.equal(approved,true);assert.equal(input.reviewContext,review().context);if(input.action==='retry-delivery'){deliveries=[];body={delivered:true};}else{assert.equal(input.action,undefined);proposal.sent_at=stamp;proposal.approved_at=stamp;body={sent:true,proposalId:proposal.id};}}
   }else assert.fail('Unexpected mutation '+req.method()+' '+path);
  }else if(path==='/api/manager/session')body={authenticated:true};
  else if(path==='/api/manager/private-events')body={catering:catalog,bookingFeeCents:35000};
  else if(path==='/api/manager/event-plans')body={plans:[plan],catering:catalog,defaultRoomFeeCents:35000};
  else if(path==='/api/manager/inquiries')body={inquiries:[],total:0,unreviewedCount:0};
  else if(path.endsWith('/proposals'))body={proposals:[proposal],deposits:[],attempts,deliveries,changeRequests:[],depositLinks:[],review:review()};
  else if(path.endsWith('/calendar-match'))body={matches:[],linked:null};
  else if(path==='/api/manager/event-plans/'+plan.id)body={plan,updates:[]};
  await route.fulfill({json:body});
 });
 const enter=async()=>{await page.goto(base+'/manager/private-events');await page.locator('[data-event-id="'+plan.id+'"]').getByRole('button',{name:'Edit plan',exact:true}).click();await page.getByRole('tab',{name:'Proposal & Payments',exact:true}).click();await page.getByRole('region',{name:'Event payment summary',exact:true}).getByText('Deposit paid',{exact:true}).waitFor();};
 for(const width of [1440,390]){
  plan=structuredClone(originalPlan);proposal=structuredClone(originalProposal);approved=false;attempts=[];deliveries=[];const before=writes.length;
  await page.setViewportSize({width,height:1100});await enter();
  const overview=page.getByRole('region',{name:'Customer proposal',exact:true}),payments=page.getByRole('region',{name:'Event payment summary',exact:true});
  assert.match(await overview.innerText(),/Waiting for customer acceptance/);assert.match(await overview.innerText(),/Nov 26, 2026, 3:27 PM Eastern/);
  assert.deepEqual(await payments.locator('.event-payment-totals dd').allTextContents(),['$649.82','$350.00','$299.82']);assert.equal(await page.getByRole('button',{name:'Resend Deposit Link',exact:true}).count(),0,'Paid deposits do not offer an unnecessary reminder');
  assert.equal(await page.getByLabel('New proposal expires (your local time)',{exact:true}).isVisible(),false);assert.equal(await page.getByLabel('I approve sending this email.',{exact:true}).count(),0);assert.equal(await page.locator('.event-workspace-progress').count(),0,'Proposal tab has one status summary');
  assert.equal(await overview.locator('details').count(),0);assert.equal(await payments.locator('details').count(),0);assert.equal(writes.length,before,'Reading the summaries does not mutate anything');
  await page.locator('.event-proposal-overview').screenshot({path:'/tmp/aviator-simple-proposals-'+width+'.png'});
  await page.getByRole('button',{name:'Resend proposal link',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Confirm proposal email'}),send=dialog.getByRole('button',{name:'Confirm & send email',exact:true}),checkbox=dialog.getByLabel('I approve sending this email.',{exact:true});
  assert.equal(await send.isDisabled(),true);await dialog.getByLabel('Note to include in proposal email (optional)',{exact:true}).fill('A note from your event coordinator.');
  failApproval=true;await checkbox.check();await dialog.getByRole('alert').getByText('Fixture approval save failed.',{exact:true}).waitFor();assert.equal(await send.isDisabled(),true,'Failed approvals cannot send');assert.equal(writes.slice(before).filter(w=>w.method==='POST').length,0);
  holdApproval=true;await checkbox.check();await page.waitForFunction(()=>document.querySelector('.proposal-send-dialog')?.textContent.includes('Saving approval…'));assert.equal(await send.isDisabled(),true,'Wait for the saved approval');releaseApproval();holdApproval=false;await send.waitFor();await page.waitForFunction(()=>!document.querySelector('.proposal-send-dialog-actions button:last-child')?.disabled);
  await dialog.getByRole('button',{name:'Cancel — do not send',exact:true}).click();assert.equal(writes.slice(before).filter(w=>w.method==='POST').length,0,'Cancel sends nothing');
  await page.getByRole('button',{name:'Resend proposal link',exact:true}).click();assert.equal(await dialog.getByLabel('Note to include in proposal email (optional)',{exact:true}).inputValue(),'A note from your event coordinator.');await send.click();await overview.getByRole('status').filter({hasText:'Proposal email sent.'}).waitFor();assert.equal(writes.at(-1).input.emailNote,'A note from your event coordinator.');
  await page.getByRole('button',{name:'Record customer acceptance',exact:true}).click();const acceptance=page.getByRole('dialog',{name:'Record manual customer acceptance'});await acceptance.getByRole('button',{name:'Cancel',exact:true}).click();const count=writes.length;
  await page.getByRole('button',{name:'Record customer acceptance',exact:true}).click();await acceptance.getByRole('button',{name:'Confirm Manual Acceptance',exact:true}).click();await overview.getByText('Customer accepted manually',{exact:true}).waitFor();assert.equal(writes.length,count+1);assert.equal(writes.at(-1).input.action,'manual-accept');
  await page.getByRole('button',{name:'Revise proposal',exact:true}).click();const expiration=page.getByLabel('New proposal expires (your local time)',{exact:true});assert.equal(await expiration.inputValue(),'2026-11-26T11:25','New expiration uses local time');await expiration.fill('2026-12-01T12:00');assert.equal(proposal.expires_at,originalProposal.expires_at,'Editing the next draft cannot change the current link');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole('button',{name:'Create proposal draft',exact:true}).click();await overview.getByText('AVI-FIXTURE-OVERVIEW-3 · v.3',{exact:true}).waitFor();assert.equal(await expiration.isVisible(),false);assert.equal(await page.getByRole('button',{name:'Approve & Email Proposal',exact:true}).isEnabled(),true,'Fresh drafts open review before email approval');
  await page.getByRole('button',{name:'Event activity & other actions',exact:true}).click();assert.equal(await page.getByRole('tab',{name:'Activity',exact:true}).getAttribute('aria-selected'),'true');await page.getByRole('region',{name:'Other event actions',exact:true}).getByRole('button',{name:'Cancel Event',exact:true}).waitFor();
 }
 // Pending checkout is never counted as received; failed notifications can be approved in their own review.
 plan=structuredClone(originalPlan);plan.details.paidCents=0;proposal=structuredClone(originalProposal);approved=false;attempts=[{proposal_id:proposal.id,status:'open',expires_at:'2026-11-13T16:25:00Z',created_at:stamp}];deliveries=[{proposal_id:proposal.id,recipient:'events@aviatorbrew.com',subject:'Fixture team notification',status:'failed'}];
 await page.goto(base+'/manager/private-events');await page.locator('[data-event-id="'+plan.id+'"]').getByRole('button',{name:'Edit plan',exact:true}).click();await page.getByRole('tab',{name:'Proposal & Payments',exact:true}).click();const payments=page.getByRole('region',{name:'Event payment summary',exact:true});await payments.getByText('Deposit due',{exact:true}).waitFor();assert.deepEqual(await payments.locator('.event-payment-totals dd').allTextContents(),['$649.82','$0.00','$649.82']);await payments.getByText('Payment pending. It will appear in Received after confirmation.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Retry failed email delivery',exact:true}).click();const retry=page.getByRole('dialog',{name:'Confirm email retry'});assert.equal(await retry.getByRole('button',{name:'Confirm & retry delivery',exact:true}).isDisabled(),true);await retry.getByLabel('I approve sending this email.',{exact:true}).check();await page.waitForFunction(()=>!document.querySelector('.proposal-send-dialog-actions button:last-child')?.disabled);await retry.getByRole('button',{name:'Confirm & retry delivery',exact:true}).click();await page.getByRole('status').filter({hasText:'Delivery retry completed.'}).waitFor();assert.equal(writes.at(-1).input.action,'retry-delivery');
 assert.deepEqual(errors,[]);console.log('PASS simplified proposal/payment UI: desktop/mobile, single accurate quote/received/balance summary, paid/pending deposit states, separate local-time revision expiry, review approval failure/in-flight guards, optional note/cancel/resend, manual acceptance, fresh draft, failed-delivery retry and Activity actions. All writes mocked.');
}finally{releaseApproval?.();await browser?.close();app?.kill('SIGTERM');}
