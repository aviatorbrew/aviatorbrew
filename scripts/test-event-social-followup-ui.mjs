import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createRequire} from 'node:module';
import {readFileSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.AVIATOR_PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(root+'/package.json'),ts=require('typescript'),mod={exports:{}};
new Function('module','exports',ts.transpileModule(readFileSync(root+'/src/lib/event-plan.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(mod,mod.exports);
const m=mod.exports,catalog=structuredClone(m.defaultCateringCatalog),names=['Hush Puppies','Tater Tots','Shrimp Cocktail'];
const foodCosts=Object.fromEntries(names.map((name,i)=>[name,{basis:'lb',costCents:560*(i+1)}]));
catalog.appetizerPricing=Object.fromEntries(names.map((name,i)=>[name,{unitPriceCents:375*(i+1),kitchen:{ouncesPerUnit:3}}]));
const fixtureDir=mkdtempSync(path.join(tmpdir(),'aviator-social-ui-')),settingsFile=path.join(fixtureDir,'settings.json');
writeFileSync(settingsFile,JSON.stringify({catering:catalog,foodCosts}));
const stamp='2026-11-14T16:00:00Z',original={id:'11111111-1111-4111-8111-111111111111',version:1,createdAt:stamp,updatedAt:stamp,sourceInquiryId:null,details:{...m.emptyEventPlan(),title:'Reception UI fixture',date:'2026-12-16',startTime:'17:00',endTime:'19:00',guestCount:50,contactName:'Fixture Customer',contactEmail:'fixture@example.invalid',phone:'919-555-0100',status:'Tentative'}};
let app,browser,page,plan,proposal,keepCalls=0,declineCalls=0;const errors=[];
try{
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const base='http://127.0.0.1:'+port;
 app=spawn('node',['.next/standalone/server.js'],{cwd:root,env:{...process.env,HOSTNAME:'127.0.0.1',PORT:String(port),DATABASE_URL:'',PRIVATE_EVENT_SETTINGS_DATA_FILE:settingsFile,MAIL_MODE:'record',STRIPE_SECRET_KEY:'',EVENT_PROPOSAL_REMINDERS_DISABLED:'true'},stdio:'ignore'});
 for(let i=0;i<100;i++){try{if((await fetch(base+'/manager')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch();
 page=await browser.newPage({timezoneId:'America/New_York',reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
 await page.clock.setFixedTime(new Date(stamp));
 await page.route('**/api/manager/**',async route=>{
  const req=route.request(),url=new URL(req.url()),pathname=url.pathname;let body={};
  if(req.method()==='PUT'){assert.equal(pathname,'/api/manager/event-plans/'+plan.id);plan={...plan,version:plan.version+1,details:req.postDataJSON().details};body={plan};}
  else if(req.method()==='POST'){assert.equal(req.postDataJSON().action,'keep-hold');keepCalls++;proposal.reminder.status='stopped';body={kept:true};}
  else if(pathname==='/api/manager/session')body={authenticated:true};
  else if(pathname==='/api/manager/private-events')body={catering:catalog,foodCosts,bookingFeeCents:35000};
  else if(pathname==='/api/manager/event-plans')body={plans:[plan],catering:catalog,foodCosts,defaultRoomFeeCents:35000};
  else if(pathname.endsWith('/proposals'))body={proposals:proposal?[proposal]:[],deposits:[],attempts:[],deliveries:[],changeRequests:[],depositLinks:[],review:{context:'fixture',proposalId:proposal?.id,emailApproved:true}};
  else if(pathname==='/api/manager/event-plans/'+plan.id)body={plan,updates:[]};
  else if(pathname.endsWith('/calendar-match'))body={matches:[],linked:null};
  else if(pathname==='/api/manager/inquiries')body={inquiries:[],total:0,unreviewedCount:0};
  await route.fulfill({json:body});
 });
 for(const width of [1440,390]){
  plan=structuredClone(original);proposal=null;await page.setViewportSize({width,height:1000});await page.goto(base+'/manager/private-events');
  await page.locator('[data-event-id="'+plan.id+'"]').getByRole('button',{name:'Edit plan',exact:true}).click();
  await page.getByLabel('Appetizers out',{exact:true}).fill('17:30');
  await page.getByRole('tab',{name:'Menu & Pricing',exact:true}).click();
  assert.equal(await page.getByLabel('Menu guest count',{exact:true}).inputValue(),'50');
  await page.getByLabel('Menu guest count',{exact:true}).fill('40');
  await page.getByRole('combobox',{name:'Food & beverage plan',exact:true}).selectOption('appetizers-social');
  for(let i=0;i<3;i++)await page.getByRole('combobox',{name:'Appetizer '+(i+1),exact:true}).selectOption(names[i]);
  const setup=page.getByRole('region',{name:'Appetizers and socializing setup'});await setup.getByText('Food price per guest: $22.50',{exact:true}).waitFor();
  await setup.getByLabel('Override food price per guest ($) — optional',{exact:true}).fill('25');
  await setup.getByText('Food price per guest: $25.00',{exact:true}).waitFor();
  await page.getByRole('tab',{name:'Details',exact:true}).click();assert.equal(await page.getByLabel('Guest count',{exact:true}).inputValue(),'40');
  assert.equal(await page.getByLabel('Appetizers out',{exact:true}).inputValue(),'17:30');
  assert.ok(!(await page.getByLabel('Bar setup',{exact:true}).locator('option').allTextContents()).some(s=>/ticket/i.test(s)));
  await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByText('Event saved · revision 2. No email was sent.',{exact:true}).waitFor();
  assert.equal(plan.details.guestCount,40);assert.equal(plan.details.flightPlan.appetizerTime,'17:30');assert.equal(plan.details.flightPlan.appetizerPriceOverrideCents,2500);
  proposal={id:'22222222-2222-4222-8222-222222222222',plan_id:plan.id,version:1,plan_version:plan.version,number:'AVI-UI-RECEPTION-1',material_hash:'fixture',termsCurrent:true,state:'sent',created_at:stamp,approved_at:stamp,sent_at:stamp,accepted_at:null,expires_at:'2026-11-15T16:00:00Z',reminder:{status:'sent',sent_at:stamp,release_at:'2026-11-15T16:00:00Z',released_at:null},snapshot:{details:plan.details,catalog,items:m.eventOrderItems(plan.details,catalog),totals:m.eventTotals(plan.details,catalog),selections:m.flightPlanSelections(plan.details,catalog),depositCents:35000,policyText:'Fixture policies',policyVersion:'fixture'}};
  await page.reload();await page.locator('[data-event-id="'+plan.id+'"]').getByRole('button',{name:'Edit plan',exact:true}).click();await page.getByRole('tab',{name:'Proposal & Payments',exact:true}).click();await page.getByRole('button',{name:'Keep date held',exact:true}).click();await page.getByText('Automatic release stopped. The date remains held for your customer conversation.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  // The public package shows selection prices without internal cost data.
  await page.goto(base+'/private-events');await page.locator('.catering-package-card').filter({hasText:'Appetizers & Socializing'}).click();
  await page.locator('.catering-builder-navigation').getByRole('button',{name:'Continue to Menu Selection',exact:true}).click();
  for(let i=0;i<3;i++)await page.getByRole('combobox',{name:'Appetizers selection '+(i+1),exact:true}).selectOption(names[i]);
  const estimate=page.getByRole('complementary',{name:'Your catering estimate'});await estimate.getByText('$1,125.00',{exact:true}).waitFor();
  assert.equal(await page.getByRole('combobox',{name:/Entrées selection [12]/}).count(),0);
  await page.getByLabel('Host-approved bar budget ($) — optional',{exact:true}).fill('1000');
  await estimate.getByText('$1,125.00',{exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Hosted bar selection',exact:true}).selectOption('beer-wine');
  await page.screenshot({path:path.join(fixtureDir,'public-menu-'+width+'.png')});await page.getByRole('button',{name:'Continue to Event Details',exact:true}).click();await page.getByLabel('Appetizers out',{exact:true}).fill('17:30');
  assert.equal(await page.getByText('Drink tickets',{exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(fixtureDir,'public-'+width+'.png')});
  // An emailed decline link only opens a confirmation, never changes a booking.
  proposal.reminder.status='sent';
  await page.route('**/api/event-proposals',async route=>{const body=route.request().postDataJSON();if(body.action){assert.equal(body.action,'decline');declineCalls++;await route.fulfill({json:{declined:true,notified:true}});}else await route.fulfill({json:{proposal,status:'Proposal Sent',canAccept:true,canDecline:true,canRequestChanges:true,changeRequests:[],payments:[],recordedPaidCents:0,remainingCents:proposal.snapshot.totals.total}});});
  const before=declineCalls;await page.goto(base+'/event-proposal?view=decline#token='+('a'.repeat(64)));await page.getByRole('group',{name:'Confirm proposal decline',exact:true}).waitFor();
  assert.equal(declineCalls,before);await page.getByRole('button',{name:'Keep reviewing',exact:true}).click();assert.equal(declineCalls,before);
  await page.getByRole('button',{name:'Decline proposal',exact:true}).click();await page.getByRole('button',{name:'Yes, decline and release date',exact:true}).click();
  await page.getByText('Proposal declined. Your tentative date has been released.',{exact:false}).waitFor();assert.equal(declineCalls,before+1);
  await page.unroute('**/api/event-proposals');
 }
 assert.equal(keepCalls,2);assert.deepEqual(errors,[]);
 console.log('PASS desktop/mobile: shared guest count, saved appetizer time, automatic reception pricing and override, hosted tabs, separate public food estimate, staff hold and explicit customer decline confirmation. Screenshots: '+fixtureDir);
}catch(error){if(page){await page.screenshot({path:path.join(fixtureDir,'failure.png')});writeFileSync(path.join(fixtureDir,'failure.html'),await page.content());console.error('UI diagnostics: '+fixtureDir);}throw error;}finally{await browser?.close();app?.kill('SIGTERM');}
