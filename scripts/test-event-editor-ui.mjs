import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.AVIATOR_PLAYWRIGHT_MODULE||'playwright');
import {spawn} from 'node:child_process';import {createServer} from 'node:net';import {readFileSync,writeFileSync} from 'node:fs';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(root+'/package.json'),ts=require('typescript'),mod={exports:{}};new Function('module','exports',ts.transpileModule(readFileSync(root+'/src/lib/event-plan.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(mod,mod.exports);const m=mod.exports,catalog=structuredClone(m.defaultCateringCatalog),stamp=new Date().toISOString();let app,browser,page,base=process.env.EVENT_EDITOR_UI_ORIGIN;
try{if(!base){const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));base='http://127.0.0.1:'+port;app=spawn('node',['.next/standalone/server.js'],{cwd:root,env:{...process.env,HOSTNAME:'127.0.0.1',PORT:String(port),DATABASE_URL:'',MAIL_MODE:'record',STRIPE_SECRET_KEY:'',STRIPE_WEBHOOK_SECRET:''},stdio:'ignore'});for(let i=0;i<100;i++){try{if((await fetch(base+'/manager')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}}
browser=await chromium.launch();page=await browser.newPage();const errors=[];page.setDefaultTimeout(18000);page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error'&&/same key|unique.*key|hydrat|NotFoundError/i.test(e.text()))errors.push(e.text());});
await page.clock.setFixedTime(new Date('2026-11-03T15:00:00Z'));
// An imported calendar booking has no customer menu. Its inquiry is a separate record.
const actual={plan:{id:'gcal-'+('d'.repeat(64)),version:1,createdAt:stamp,updatedAt:stamp,sourceInquiryId:null,calendarSync:{eventId:'fixture-google-event',calendarId:'fixture-calendar',status:'active'},details:{...m.emptyEventPlan(),title:'Fixture rehearsal',date:'2026-11-19',startTime:'17:00',endTime:'21:00',status:'Confirmed'}}};
const audit={inquiries:[{id:'160',name:'Menu Fixture Guest',created_at:stamp,payload:{name:'Menu Fixture Guest',email:'menu-fixture@example.invalid',eventDate:'2026-11-19',eventTime:'17:30',eventType:'wedding rehearsal dinner',guestCount:'50',location:'Ready Room',cateringPlan:{...m.emptyEventPlan(),date:'2026-11-19',guestCount:50},orderSummary:'Package: The Aviator Feast · 50 guests\nAppetizers: Caprese Skewers, Hush Puppies, Chicken Fingers\nEntrees: Flat Iron Steak, Herb-Roasted Chicken\nSides: Mac & Cheese, Tater Tots\nSalad: Caesar Salad\n50 × Dessert display at $6.00 = $300.00\nEstimated subtotal: $2,300.00',message:'Guest-paid bar tabs.'}}]};
const submitted=audit.inquiries[0],p=submitted.payload;
const inquiry={id:String(submitted.id),kind:'event',createdAt:submitted.created_at,name:'Menu Fixture Guest',email:'menu-fixture@example.invalid',phone:'',guestCount:p.guestCount,eventDate:p.eventDate,eventTime:p.eventTime,eventType:p.eventType,location:p.location||'',estimatedSubtotal:p.estimatedSubtotal||'',estimatedTax:'',estimatedTotal:'',cateringMenu:'',menuScanSource:'',orderSummary:p.orderSummary,message:p.message,payload:{...p,name:'Menu Fixture Guest',email:'menu-fixture@example.invalid'},reviewed:false,bookingStage:'Inquiry Received'};
const source=structuredClone(actual.plan),other={...structuredClone(source),id:'99999999-9999-4999-8999-999999999999',details:{...structuredClone(source.details),title:'Other fixture event',date:'2026-11-20'}};
let saved,mutations=[],queries=[],submissionError=false;
await page.clock.setFixedTime(new Date('2026-11-03T15:00:00Z'));
await page.route('**/api/manager/**',async route=>{
 const r=route.request(),u=new URL(r.url()),path=u.pathname;let b={};
 if(r.method()!=='GET')mutations.push({method:r.method(),path});
 if(path==='/api/manager/session')b={authenticated:true};
 else if(path==='/api/manager/private-events')b={catering:catalog,bookingFeeCents:35000,policyText:'Fixture only',policyVersion:'fixture-1'};
 else if(path==='/api/manager/inquiries'){
  assert.equal(r.method(),'GET','Viewing menus must not review or mutate inquiry');queries.push(u.search);
  if(u.searchParams.has('eventDate')&&submissionError){await route.fulfill({status:503,json:{error:'Fixture inquiry service unavailable'}});return;}
  const found=u.searchParams.get('id')===inquiry.id||u.searchParams.get('eventDate')===p.eventDate?[inquiry]:[];
  b={inquiries:found,total:found.length,unreviewedCount:1};
 }
 else if(path==='/api/manager/event-plans')b={plans:[saved,other],catering:catalog,defaultRoomFeeCents:35000};
 else if(path.endsWith('/calendar-match'))b={matches:[],linked:null};
 else if(path.endsWith('/proposals')){assert.equal(r.method(),'GET');b={proposals:[],deposits:[],attempts:[],deliveries:[],changeRequests:[],depositLinks:[],review:{context:'fixture-review',proposalId:null,emailApproved:false}};}
 else if(path==='/api/manager/event-plans/'+source.id){
  if(r.method()==='PUT'){const data=r.postDataJSON();saved={...saved,version:saved.version+1,details:data.details};b={plan:saved};}
  else{assert.equal(r.method(),'GET');b={plan:saved,updates:[]};}
 }
 else if(path==='/api/manager/event-plans/'+other.id)b={plan:other,updates:[]};
 else assert.equal(r.method(),'GET','No customer emails or payment actions allowed');
 await route.fulfill({json:b});
});
const row=()=>page.locator('[data-event-id="'+source.id+'"]'),editor=()=>row().locator('.event-plan-editor'),close=()=>page.getByRole('button',{name:'Close event editor',exact:true});
for(const width of [1440,390]){
 saved=structuredClone(source);mutations=[];queries=[];submissionError=false;
 await page.setViewportSize({width,height:1000});await page.goto(base+'/manager/private-events');await row().waitFor();
 const overview=await row().locator('.event-plan-overview').elementHandle(),heading=await row().locator('.event-plan-row-title').elementHandle();
 await row().getByRole('button',{name:'Edit plan',exact:true}).click();await editor().waitFor();await page.waitForFunction(()=>document.activeElement?.classList.contains('event-plan-editor'));
 assert.equal(await overview.evaluate(e=>e.isConnected),true,'Expanding keeps the same overview node');assert.equal(await heading.evaluate(e=>e.isConnected),true,'Event identity is not replaced when editing');
 assert.equal(await row().locator('.event-plan-toggle').getAttribute('aria-expanded'),'true');await row().locator('.event-plan-overview').getByText(m.eventDateLabel(saved.details.date),{exact:true}).waitFor();
 const menus=editor().getByRole('region',{name:'Website menu submissions',exact:true});await menus.getByText('Menu Fixture Guest: wedding rehearsal dinner',{exact:true}).waitFor();await menus.getByText('View submitted menu',{exact:true}).click();await menus.getByText('50 × Dessert display at $6.00 = $300.00',{exact:false}).waitFor();assert.ok((await menus.innerText()).includes('Chicken Fingers'));assert.ok((await menus.innerText()).includes('Herb-Roasted Chicken'));assert.ok(queries.some(q=>new URLSearchParams(q).get('eventDate')==='2026-11-19'));
 const panels=editor().locator('details.event-editor-section');assert.equal(await panels.count(),4);
 for(const panel of await panels.all()){await panel.locator(':scope>summary').click();assert.equal(await panel.evaluate(e=>e.open),true);await row().locator('.event-plan-overview').getByText(m.eventDateLabel(saved.details.date),{exact:true}).waitFor();}
 const eventName=page.getByLabel('Event name',{exact:true});await eventName.fill('Edited fixture rehearsal');await page.getByLabel('Contact name',{exact:true}).fill('Fixture host');await page.waitForTimeout(200);assert.deepEqual(await panels.evaluateAll(es=>es.map(e=>e.open)),[true,true,true,true]);assert.equal(await eventName.inputValue(),'Edited fixture rehearsal');assert.equal(await page.getByLabel('Date',{exact:true}).inputValue(),'2026-11-19');
 await editor().getByRole('button',{name:'Save event — no email',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-event-id] .event-plan-toggle')?.textContent?.includes('Edited fixture rehearsal'));await page.waitForTimeout(300);assert.deepEqual(await panels.evaluateAll(es=>es.map(e=>e.open)),[true,true,true,true],'Saving does not collapse the form or other sections');assert.equal(await editor().locator('#event-plan-details').count(),1,'Only one event form remains after reconciliation');
 await editor().getByRole('button',{name:'Refresh acceptance & payment status',exact:true}).click();await editor().getByText('Acceptance and payment status refreshed.',{exact:true}).waitFor();await page.waitForTimeout(200);assert.deepEqual(await panels.evaluateAll(es=>es.map(e=>e.open)),[true,true,true,true],'Refreshing preserves expanded fields');assert.equal(await overview.evaluate(e=>e.isConnected),true);
 await menus.getByRole('button',{name:'Review website inquiry',exact:true}).click();const inquiryRow=page.locator('[data-inquiry-id="'+inquiry.id+'"]');await inquiryRow.waitFor();await page.waitForFunction(id=>document.activeElement?.getAttribute('data-inquiry-id')===id,inquiry.id);assert.equal(await page.locator('.event-inquiry-archive').evaluate(e=>e.open),true);assert.ok((await inquiryRow.innerText()).includes('Caprese Skewers'));assert.equal(await eventName.inputValue(),'Edited fixture rehearsal','Reviewing inquiry leaves current event edits intact');assert.deepEqual(mutations,[{method:'PUT',path:'/api/manager/event-plans/'+source.id}]);
 await row().screenshot({path:'/tmp/aviator-stable-nov19-expanded-'+width+'.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 for(const panel of await panels.all())await panel.locator(':scope>summary').click();assert.deepEqual(await panels.evaluateAll(es=>es.map(e=>e.open)),[false,false,false,false]);await row().locator('.event-plan-overview').getByText(m.eventDateLabel(saved.details.date),{exact:true}).waitFor();await close().click();assert.equal(await overview.evaluate(e=>e.isConnected),true);assert.equal(await heading.evaluate(e=>e.isConnected),true);
 // Inquiry-service errors cannot remove or close event details.
 submissionError=true;await row().getByRole('button',{name:'Edit plan',exact:true}).click();await editor().getByRole('alert').filter({hasText:'Could not check website menu submissions'}).waitFor();await editor().locator('details.event-menu-section>summary').click();await eventName.waitFor({state:'visible'});assert.equal(await eventName.inputValue(),'Edited fixture rehearsal');assert.equal(await page.locator('.event-plan-editor').count(),1);
}
assert.deepEqual(errors,[]);console.log('PASS event editor regression: persistent header/overview across opening, editing, saving, refreshing and closing; imported event with no menu renders; four independent sections retain open state; original same-date website menu visible, exact-date query, review shortcut focuses original inquiry without changing review state or event; inquiry errors keep event details visible; desktop/mobile no overflow. All mutations mocked; no emails, payments or customer records changed.');
}finally{if(page){writeFileSync('/tmp/submitted-menu-ui-debug.txt',await page.locator('body').innerText().catch(()=>''));await page.screenshot({path:'/tmp/submitted-menu-ui-debug.png',fullPage:true}).catch(()=>{});}await browser?.close();app?.kill('SIGTERM');}
