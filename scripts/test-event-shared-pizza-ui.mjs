import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=await import(process.env.AVIATOR_PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(root+'/package.json'),ts=require('typescript'),mod={exports:{}};
new Function('module','exports',ts.transpileModule(readFileSync(root+'/src/lib/event-plan.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(mod,mod.exports);
const m=mod.exports,catalog=structuredClone(m.defaultCateringCatalog),stamp='2026-11-12T12:00:00Z';
const details={...m.emptyEventPlan(),title:'Staff copy fixture',date:'2026-12-16',startTime:'15:30',endTime:'18:30',status:'Confirmed',guestCount:30,contactName:'Fixture customer',contactEmail:'customer@example.invalid',items:[]};
const plan={id:'11111111-1111-4111-8111-111111111111',version:1,details,createdAt:stamp,updatedAt:stamp,sourceInquiryId:null};
const proposal={id:'22222222-2222-4222-8222-222222222222',plan_id:plan.id,number:'AVI-FIXTURE-STAFF',version:1,plan_version:1,material_hash:'fixture',termsCurrent:true,state:'sent',created_at:stamp,approved_at:stamp,sent_at:stamp,accepted_at:null,expires_at:'2026-11-24T00:53:00Z',snapshot:{details,items:details.items,selections:[],catalog,totals:m.eventTotals(details,catalog),depositCents:35000,policyText:'Fixture policies',policyVersion:'fixture-1'}};
let app,browser,page;const posts=[],errors=[];
try{
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const base='http://127.0.0.1:'+port;
 app=spawn('node',['.next/standalone/server.js'],{cwd:root,env:{...process.env,HOSTNAME:'127.0.0.1',PORT:String(port),DATABASE_URL:'',MAIL_MODE:'record',STRIPE_SECRET_KEY:''},stdio:'ignore'});
 for(let i=0;i<100;i++){try{if((await fetch(base+'/manager')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch();page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date(stamp));
 await page.route('**/api/manager/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let body={};
  if(req.method()!=='GET'){assert.equal(req.method(),'PUT');assert.equal(path,'/api/manager/event-plans/'+plan.id);const payload=req.postDataJSON();posts.push(payload);plan.details=payload.details;plan.version++;body={plan};}
  else if(path==='/api/manager/session')body={authenticated:true};
  else if(path==='/api/manager/private-events')body={catering:catalog,bookingFeeCents:35000};
  else if(path==='/api/manager/event-plans')body={plans:[plan],catering:catalog,foodCosts:{'Aviator Pizzeria Pizza Bar':{basis:'pizza',costCents:500}},defaultRoomFeeCents:35000};
  else if(path==='/api/manager/inquiries')body={inquiries:[],total:0,unreviewedCount:0};
  else if(path.endsWith('/proposals'))body={proposals:[],deposits:[],attempts:[],deliveries:[],changeRequests:[],depositLinks:[],review:{context:'fixture-context',proposalId:proposal.id,emailApproved:true}};
  else if(path.endsWith('/calendar-match'))body={matches:[],linked:null};
  else if(path==='/api/manager/event-plans/'+plan.id)body={plan,updates:[]};
  await route.fulfill({json:body});
 });
 for(const width of [1440,390])for(const choice of ['entrees:Aviator Pizzeria Pizza Bar','pizzas:Caprese']){
  plan.details=structuredClone(details);plan.version=1;const before=posts.length;
  await page.setViewportSize({width,height:1000});await page.goto(base+'/manager/private-events');await page.locator('[data-event-id="'+plan.id+'"]').getByRole('button',{name:'Edit plan',exact:true}).click();await page.getByRole('tab',{name:'Menu & Pricing',exact:true}).click();
  const builder=page.getByRole('region',{name:'À la carte menu builder'});await builder.getByLabel('À la carte menu item',{exact:true}).selectOption(choice);const styles=builder.getByRole('group',{name:'Shared Pizza Bar styles'});await styles.waitFor();
  if(choice.startsWith('entrees:'))assert.equal(await builder.getByRole('button',{name:'+ Add menu item',exact:true}).isDisabled(),true,'Pizza Bar requires a style');
  for(const name of ['Caprese','The Aviator','Hot Honey'])await styles.getByLabel(name,{exact:true}).check();assert.equal(await styles.getByLabel('Veggie',{exact:true}).isDisabled(),true,'At most three varieties');
  assert.equal(await builder.getByLabel('Agreed unit price ($)',{exact:true}).inputValue(),'7.15');assert.match(await styles.innerText(),/prepare 12 whole 14-inch pizzas total/);await styles.screenshot({path:'/tmp/shared-pizza-picker-'+width+'.png'});
  await builder.getByRole('button',{name:'+ Add menu item',exact:true}).click();assert.equal(await page.locator('.event-order-row').count(),1);
  await styles.getByLabel('Hot Honey',{exact:true}).uncheck();await styles.getByLabel('Veggie',{exact:true}).check();await builder.getByRole('button',{name:'Update pizza selection',exact:true}).click();assert.equal(await page.locator('.event-order-row').count(),1,'Style changes replace the group rather than adding another charge');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.event-workspace-header')?.textContent?.includes('Saved revision 2'));
  assert.equal(posts.length,before+1);assert.equal(plan.details.items.length,1);assert.equal(plan.details.items[0].quantity,30);assert.equal(plan.details.items[0].unitPriceCents,715);assert.deepEqual(plan.details.items[0].pizzaStyles,['Caprese','The Aviator','Veggie']);
  await page.goto(base+'/manager/private-events');await page.locator('[data-event-id="'+plan.id+'"]').getByRole('button',{name:'Edit plan',exact:true}).click();await page.getByRole('tab',{name:'Menu & Pricing',exact:true}).click();await builder.getByLabel('À la carte menu item',{exact:true}).selectOption('entrees:Aviator Pizzeria Pizza Bar');assert.equal(await styles.getByLabel('Veggie',{exact:true}).isChecked(),true,'Saved styles reopen');
  await builder.getByLabel('À la carte billing unit',{exact:true}).selectOption('pizza');assert.equal(await builder.getByRole('button',{name:'+ Add menu item',exact:true}).isDisabled(),true,'One whole pie cannot promise three distinct styles');await builder.getByLabel('À la carte quantity',{exact:true}).fill('6');assert.match(await styles.innerText(),/prepare 6 whole 14-inch pizzas total/);await builder.getByRole('button',{name:'+ Add menu item',exact:true}).click();await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.event-workspace-header')?.textContent?.includes('Saved revision 3'));assert.equal(plan.details.items.length,2);assert.equal(plan.details.items[1].quantity,6);assert.equal(plan.details.items[1].unitPriceCents,1786);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 assert.deepEqual(errors,[]);console.log('PASS shared Pizza Bar UI: all entry choices, one-to-three styles, one serving allowance and price, group replacement, saved/reopened styles, whole-pizza mode and desktop/mobile. All writes mocked.');
}finally{if(page)writeFileSync('/tmp/shared-pizza-ui-debug.txt',await page.locator('body').innerText().catch(()=>''));await browser?.close();app?.kill('SIGTERM');}
