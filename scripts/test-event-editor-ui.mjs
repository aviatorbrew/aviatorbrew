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
  if(r.method()==='PATCH'){await route.fulfill({json:{inquiry:{...inquiry,reviewed:true}}});return;}
  assert.equal(r.method(),'GET','Viewing menus must not review or mutate inquiry');queries.push(u.search);
  if(u.searchParams.has('eventDate')&&submissionError){await route.fulfill({status:503,json:{error:'Fixture inquiry service unavailable'}});return;}
  const found=u.searchParams.get('id')===inquiry.id||u.searchParams.get('eventDate')===p.eventDate?[{...inquiry,...(saved.sourceInquiryId===inquiry.id?{planId:saved.id}:{})}]:[];
  b={inquiries:found,total:found.length,unreviewedCount:1};
 }
 else if(path==='/api/manager/event-plans'){if(r.method()==='POST'){const data=r.postDataJSON();assert.equal(data.sourceInquiryId,inquiry.id);saved={...saved,sourceInquiryId:inquiry.id,details:data.details};b={plan:saved};}else b={plans:[saved,other],catering:catalog,defaultRoomFeeCents:35000};}
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
const row=()=>page.locator('[data-event-id="'+source.id+'"]'),editor=()=>page.locator('.event-plan-editor'),nav=()=>page.getByRole('navigation',{name:'Private event workflow'});
for(const width of [1440,390]){
 saved=structuredClone(source);mutations=[];queries=[];submissionError=false;
 await page.setViewportSize({width,height:1000});await page.goto(base+'/manager/private-events');await row().waitFor();
 assert.equal(await page.locator('.event-calendar').isVisible(),false);
 await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.locator('.event-calendar').waitFor();
 await page.getByRole('button',{name:'List',exact:true}).click();await row().waitFor();
 await row().getByRole('button',{name:'Edit plan',exact:true}).click();await editor().waitFor();
 assert.equal(await row().isVisible(),false,'Editor has its own workspace');
 const eventName=page.getByLabel('Event name',{exact:true});await eventName.waitFor();
 assert.equal(await editor().locator('details.event-menu-section').count(),0,'Primary details are always expanded');
 const menus=editor().getByRole('region',{name:'Website menu submissions',exact:true});await menus.getByText('Menu Fixture Guest: wedding rehearsal dinner',{exact:true}).waitFor();await menus.getByText('View submitted menu',{exact:true}).click();await menus.getByText('50 × Dessert display at $6.00 = $300.00',{exact:false}).waitFor();assert.ok(queries.some(q=>new URLSearchParams(q).get('eventDate')==='2026-11-19'));
 await eventName.fill('Edited fixture rehearsal');await page.getByLabel('Contact name',{exact:true}).fill('Fixture host');
 const tab=name=>page.getByRole('tab',{name,exact:true});
 await tab('Menu & Pricing').click();await page.getByRole('combobox',{name:/Food & beverage plan/}).waitFor();assert.equal(await eventName.isVisible(),false);
 await page.getByRole('button',{name:'+ Add order item',exact:true}).click();
 await tab('Details').click();await page.getByRole('button',{name:'Save changes',exact:true}).click();
 assert.equal(await tab('Menu & Pricing').getAttribute('aria-selected'),'true','Invalid hidden field opens its tab');
 assert.equal(await page.getByLabel('Item / menu selection',{exact:true}).evaluate(e=>e===document.activeElement),true);
 assert.deepEqual(mutations,[],'Incomplete order cannot save');
 await page.getByRole('button',{name:'Remove order row 1',exact:true}).click();
 const picker=page.getByRole('region',{name:'À la carte menu builder'});
 await picker.getByLabel('À la carte menu item',{exact:true}).selectOption('appetizers:Hush Puppies');
 assert.equal(await picker.getByRole('button',{name:'+ Add menu item',exact:true}).isDisabled(),true,'Price must be agreed before adding');
 await picker.getByLabel('À la carte billing unit',{exact:true}).selectOption('tray');await picker.getByLabel('À la carte quantity',{exact:true}).fill('2');await picker.getByLabel('Agreed unit price ($)',{exact:true}).fill('25');await picker.getByLabel('À la carte preparation notes',{exact:true}).fill('Sauce on the side');await picker.getByRole('button',{name:'+ Add menu item',exact:true}).click();
 await picker.getByLabel('Search menu items',{exact:true}).fill('steak');await picker.getByLabel('À la carte menu item',{exact:true}).selectOption({label:'Grilled Flat Iron Steak with Collard Green Chimichurri'});await picker.getByLabel('À la carte billing unit',{exact:true}).selectOption('guest');await picker.getByLabel('À la carte quantity',{exact:true}).fill('10');await picker.getByLabel('Agreed unit price ($)',{exact:true}).fill('17.76');await picker.getByRole('button',{name:'+ Add menu item',exact:true}).click();

 await tab('Proposal & Payments').click();await page.getByRole('button',{name:'Create proposal draft',exact:true}).waitFor();
 await page.getByRole('button',{name:'Edit missing event details',exact:true}).click();await eventName.waitFor();assert.equal(await tab('Details').getAttribute('aria-selected'),'true');
 await tab('Details').focus();await page.keyboard.press('End');assert.equal(await tab('Activity').getAttribute('aria-selected'),'true');await page.getByRole('heading',{name:'Guest email history',exact:true}).waitFor();
 await page.keyboard.press('Home');assert.equal(await tab('Details').getAttribute('aria-selected'),'true');assert.equal(await eventName.inputValue(),'Edited fixture rehearsal');

 await nav().getByRole('button',{name:/Inquiries/}).click();await page.locator('.event-inquiry-archive').waitFor();
 await nav().getByRole('button',{name:/Current event/}).click();assert.equal(await eventName.inputValue(),'Edited fixture rehearsal','Navigation preserves unsaved work');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.event-workspace-header')?.textContent?.includes('Saved revision 2'));
 assert.equal(saved.details.title,'Edited fixture rehearsal');assert.equal(saved.details.flightPlan.cateringMode,'alacarte');assert.equal(saved.details.flightPlan.packageId,'');assert.equal(saved.details.items.length,2);assert.equal(saved.details.items[1].unitPriceCents,1776);assert.equal(saved.details.items[1].quantity,10);assert.match(saved.details.items[0].notes,/Sauce on the side/);
 await menus.getByRole('button',{name:'Review website inquiry',exact:true}).click();const inquiryRow=page.locator('[data-inquiry-id="'+inquiry.id+'"]');await inquiryRow.waitFor();await page.waitForFunction(id=>document.activeElement?.getAttribute('data-inquiry-id')===id,inquiry.id);assert.ok((await inquiryRow.innerText()).includes('Caprese Skewers'));
 assert.deepEqual(mutations,[{method:'PUT',path:'/api/manager/event-plans/'+source.id}]);
 await nav().getByRole('button',{name:/Current event/}).click();
 await editor().screenshot({path:'/tmp/aviator-event-workspace-'+width+'.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.getByRole('group',{name:'Workspace actions'}).getByRole('button',{name:'Close event',exact:true}).click();await row().waitFor();
 submissionError=true;await row().getByRole('button',{name:'Edit plan',exact:true}).click();await editor().getByRole('alert').filter({hasText:'Could not check website menu submissions'}).waitFor();await eventName.waitFor();assert.equal(await eventName.inputValue(),'Edited fixture rehearsal');assert.equal(await editor().count(),1);
 // Starting an inquiry fills the same workspace; saving and reopening keep one linked plan.
 submissionError=false;await page.goto(base+'/manager/private-events?inquiry='+inquiry.id);
 await page.getByRole('button',{name:'Start event plan',exact:true}).click();await eventName.waitFor();
 assert.equal(await page.getByLabel('Contact name',{exact:true}).inputValue(),inquiry.name);
 await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.event-workspace-header')?.textContent?.includes('Saved revision'));
 await page.getByRole('button',{name:'View original inquiry',exact:true}).click();
 await page.getByRole('button',{name:'Open event plan',exact:true}).click();await eventName.waitFor();
 assert.equal(mutations.filter(m=>m.method==='POST'&&m.path==='/api/manager/event-plans').length,1,'Linked inquiry reopens without a duplicate creation');

}
assert.deepEqual(errors,[]);console.log('PASS event workspace: list/calendar switch, standalone editor, always-open details, unsaved edits survive inquiry navigation, save, original inquiry review, close/reopen, inquiry errors and desktop/mobile layout. All mutations mocked; no emails, payments or customer records changed.');
}finally{if(page){writeFileSync('/tmp/submitted-menu-ui-debug.txt',await page.locator('body').innerText().catch(()=>''));await page.screenshot({path:'/tmp/submitted-menu-ui-debug.png',fullPage:true}).catch(()=>{});}await browser?.close();app?.kill('SIGTERM');}
