import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {readFileSync} from 'node:fs';
import {PDFDocument} from 'pdf-lib';
const {chromium}=await import(process.env.AVIATOR_PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),{plan,proposal,catalog,stamp}=JSON.parse(readFileSync('/tmp/aviator-event-receipt-fixture.json','utf8'));
const receiptPath=`/api/manager/event-plans/${plan.id}/receipt`,letter=readFileSync('/tmp/aviator-event-receipt-letter.html','utf8'),ticket=readFileSync('/tmp/aviator-event-receipt-ticket.html','utf8');
let app,browser,page;const errors=[],mutations=[],reads=[];
try{
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const base='http://127.0.0.1:'+port;
 app=spawn('node',['.next/standalone/server.js'],{cwd:root,env:{...process.env,HOSTNAME:'127.0.0.1',PORT:String(port),DATABASE_URL:'',MAIL_MODE:'record',STRIPE_SECRET_KEY:''},stdio:'ignore'});
 for(let i=0;i<100;i++){try{if((await fetch(base+'/manager')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch();const context=await browser.newContext();await context.addInitScript(()=>{window.print=()=>{window.receiptPrintCount=(window.receiptPrintCount||0)+1;};});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date(stamp));
 await context.route('**/api/branding/logo',route=>route.fulfill({contentType:'image/png',body:readFileSync(root+'/public/images/aviator-logo.png')}));
 await context.route('**/api/manager/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;let body={};
  if(req.method()!=='GET'){mutations.push({method:req.method(),path});assert.fail('Printing must not mutate anything');}
  if(path===receiptPath){reads.push(url.search);return route.fulfill({contentType:'text/html',body:url.searchParams.get('paper')==='ticket'?ticket:letter});}
  if(path==='/api/manager/session')body={authenticated:true};
  else if(path==='/api/manager/private-events')body={catering:catalog,bookingFeeCents:35000};
  else if(path==='/api/manager/event-plans')body={plans:[plan],catering:catalog,defaultRoomFeeCents:35000};
  else if(path==='/api/manager/inquiries')body={inquiries:[],total:0,unreviewedCount:0};
  else if(path.endsWith('/proposals'))body={proposals:[proposal],deposits:[{proposal_id:proposal.id,amount_cents:10000,session_id:'cs_fixture',payment_intent:'pi_fixture',paid_at:stamp}],attempts:[],deliveries:[],changeRequests:[],depositLinks:[],review:{context:'fixture-review',proposalId:proposal.id,emailApproved:true}};
  else if(path.endsWith('/calendar-match'))body={matches:[],linked:null};
  else if(path==='/api/manager/event-plans/'+plan.id)body={plan,updates:[]};
  await route.fulfill({json:body});
 });
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.goto(base+'/manager/private-events');await page.locator('[data-event-id="'+plan.id+'"]').getByRole('button',{name:'Edit plan',exact:true}).click();await page.getByRole('tab',{name:'Proposal & Payments',exact:true}).click();
  const payments=page.getByRole('region',{name:'Event payment summary',exact:true}),link=payments.getByRole('link',{name:'Preview & Print Receipt',exact:true});await link.waitFor();assert.equal(await link.getAttribute('href'),receiptPath);assert.equal(await link.getAttribute('target'),'_blank');
  const input=payments.getByLabel('Total manual payments received ($)',{exact:true});await input.fill('351');assert.equal(await payments.getByRole('button',{name:'Preview & Print Receipt',exact:true}).isDisabled(),true,'Unsaved credit must be saved before printing');await input.fill('350');await link.waitFor();
  const opened=page.waitForEvent('popup');await link.click();const preview=await opened;preview.on('pageerror',e=>errors.push(e.message));await preview.waitForLoadState('domcontentloaded');await preview.setViewportSize({width,height:1000});
  await preview.getByRole('heading',{name:'Private Event Receipt',exact:true}).waitFor();assert.match(await preview.locator('.totals').innerText(),/Event total\s*\$641.83/);assert.match(await preview.locator('.totals').innerText(),/Total payments received\s*\$450.00/);assert.match(await preview.locator('.totals').innerText(),/Balance due\s*\$191.83/);
  await preview.getByRole('button',{name:'Print Receipt / Save PDF',exact:true}).click();assert.equal(await preview.evaluate(()=>window.receiptPrintCount),1);assert.equal(await preview.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await preview.emulateMedia({media:'print'});assert.equal(await preview.getByRole('navigation',{name:'Receipt printing'}).isVisible(),false);assert.equal(await preview.locator('thead').evaluate(e=>getComputedStyle(e).display),'table-header-group');
  if(width===1440){const pdf=await preview.pdf({preferCSSPageSize:true,path:'/tmp/aviator-event-receipt-letter.pdf'}),text=spawnSync('pdftotext',['-','-'],{input:pdf});assert.equal(text.status,0);assert.equal((await PDFDocument.load(pdf)).getPageCount(),1,'A typical receipt fits one letter page');for(const value of ['Private Event Receipt','Pizza Bar / guest','$641.83','$450.00','$191.83','POS check #'])assert.ok(text.stdout.toString().includes(value),value);}
  await preview.emulateMedia({media:'screen'});await preview.getByRole('link',{name:'Receipt (80 mm)',exact:true}).click();await preview.waitForLoadState('domcontentloaded');assert.ok(preview.url().endsWith('?paper=ticket'));assert.ok(await preview.locator('body').evaluate(e=>e.getBoundingClientRect().width<=273));assert.equal(await preview.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await preview.getByRole('button',{name:'Print Receipt / Save PDF',exact:true}).click();assert.equal(await preview.evaluate(()=>window.receiptPrintCount),1);if(width===1440){await preview.emulateMedia({media:'print'});await preview.pdf({preferCSSPageSize:true,path:'/tmp/aviator-event-receipt-ticket.pdf'});await preview.emulateMedia({media:'screen'});}
  await preview.screenshot({path:'/tmp/aviator-event-receipt-'+width+'.png',fullPage:true});await preview.close();
 }
 proposal.termsCurrent=false;await page.reload();await page.locator('[data-event-id="'+plan.id+'"]').getByRole('button',{name:'Edit plan',exact:true}).click();await page.getByRole('tab',{name:'Proposal & Payments',exact:true}).click();await page.getByRole('button',{name:'Preview & Print Receipt',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Preview & Print Receipt',exact:true}).isDisabled(),true,'Changed quotes require a revised proposal');
 assert.ok(reads.length>=4);assert.deepEqual(mutations,[]);assert.deepEqual(errors,[]);console.log('PASS receipt UI: Payments placement, unsaved/stale guards, preview in a new tab, manual plus Stripe receipt totals, letter/PDF and 80-mm print layouts, desktop/mobile, print-button execution, hidden print controls, no private data and zero mutations.');
}finally{await browser?.close();app?.kill('SIGTERM');}
