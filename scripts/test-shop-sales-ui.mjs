import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=await import(process.env.AVIATOR_PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(root+'/package.json'),ts=require('typescript'),mod={exports:{}};
new Function('module','exports',ts.transpileModule(readFileSync(root+'/src/lib/shop-sales-documents.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(mod,mod.exports);
const documents=mod.exports,fixtures=JSON.parse(readFileSync('/tmp/aviator-shop-sales-fixtures.json','utf8'));let app,browser,page,failNext=false,slowMonth='';const errors=[],mutations=[],queries=[];
try{
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const base='http://127.0.0.1:'+port;
 app=spawn('node',['.next/standalone/server.js'],{cwd:root,env:{...process.env,HOSTNAME:'127.0.0.1',PORT:String(port),DATABASE_URL:'',MAIL_MODE:'record',STRIPE_SECRET_KEY:''},stdio:'ignore'});
 for(let i=0;i<100;i++){try{if((await fetch(base+'/manager')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch();const context=await browser.newContext();await context.addInitScript(()=>{window.print=()=>{window.reportPrintCount=(window.reportPrintCount||0)+1;};});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-11-13T15:00:00Z'));
 await context.route('**/api/manager/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;
  if(req.method()!=='GET'){mutations.push(path);assert.fail('Reports must never mutate data');}
  if(path==='/api/manager/session')return route.fulfill({json:{authenticated:true}});
  if(path!=='/api/manager/shop-sales')return route.fulfill({json:{}});
  const month=url.searchParams.get('month'),format=url.searchParams.get('format');queries.push({month,format});
  if(failNext){failNext=false;return route.fulfill({status:400,json:{error:'Fixture report unavailable. Please retry.'}});}
  if(slowMonth===month)await new Promise(resolve=>setTimeout(resolve,400));
  const report=month==='2026-11'?fixtures.november:month==='2026-12'?fixtures.december:fixtures.empty;
  if(format==='print')return route.fulfill({contentType:'text/html',body:documents.shopSalesPrintHtml(report)});
  if(format?.endsWith('-csv'))return route.fulfill({contentType:'text/csv',headers:{'content-disposition':`attachment; filename="aviator-shop-${format.slice(0,-4)}-${month}.csv"`},body:documents.shopSalesCsv(report,format.slice(0,-4))});
  return route.fulfill({json:report});
 });
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1100});await page.goto(base+'/manager/shop-sales?month=2026-11');await page.getByRole('heading',{name:'November 2026 sales',exact:true}).waitFor();
  if(!await page.getByRole('link',{name:'Shop Sales',exact:true}).isVisible())await page.getByText('Products & Sales',{exact:true}).click();await page.getByRole('link',{name:'Shop Sales',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Shop Sales',exact:true}).getAttribute('href'),'/manager/shop-sales');await page.getByText('Products & Sales',{exact:true}).click();
  const report=page.getByRole('region',{name:'Monthly shop sales'});
  assert.deepEqual(await report.locator('.shop-sales-totals dd').allTextContents(),['$135.00','$7.50','Not recorded','$147.94']);await report.getByRole('heading',{name:'Review before filing',exact:true}).waitFor();assert.match(await report.getByRole('region',{name:'Report basis and tax review'}).innerText(),/2 paid order\(s\)/);
  const items=report.getByRole('table',{name:'Items sold',exact:true});await items.getByRole('row').filter({hasText:'Original Shirt'}).waitFor();assert.match(await items.innerText(),/Bonus glass/);assert.equal(await items.locator('svg').count(),0);assert.match(await items.innerText(),/<svg onload=bad\(\)>/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Mobile report keeps tables inside scroll containers');assert.ok((await items.locator('tbody th').first().boundingBox()).width>=160,'Item names remain readable on small screens');if(width===390)assert.ok(await items.locator('..').evaluate(e=>e.scrollWidth>e.clientWidth),'Wide tables scroll instead of crushing names');
  await report.screenshot({path:'/tmp/aviator-shop-sales-'+width+'.png'});
  for(const kind of ['Summary','Items','Orders']){const pending=page.waitForEvent('download');await report.getByRole('link',{name:kind+' CSV',exact:true}).click();const download=await pending;assert.equal(download.suggestedFilename(),'aviator-shop-'+kind.toLowerCase()+'-2026-11.csv');const file=await download.path(),csv=readFileSync(file,'utf8');assert.ok(csv.includes('2026-11'));if(kind==='Summary'){assert.ok(csv.includes('"147.94"'));assert.ok(csv.includes('Known recorded tax portion USD')&&csv.includes('"5.44"'));}if(kind==='Items')assert.ok(csv.includes('"\'=SUM(1,1)"'));}
  const opened=page.waitForEvent('popup');await report.getByRole('link',{name:'Print report / Save PDF',exact:true}).click();const print=await opened;await print.waitForLoadState('domcontentloaded');await print.getByRole('heading',{name:'Shop Sales — November 2026',exact:true}).waitFor();await print.getByRole('button',{name:'Print report / Save PDF',exact:true}).click();assert.equal(await print.evaluate(()=>window.reportPrintCount),1);await print.emulateMedia({media:'print'});assert.equal(await print.getByRole('navigation',{name:'Report printing'}).isVisible(),false);if(width===1440){const pdf=await print.pdf({preferCSSPageSize:true,path:'/tmp/aviator-shop-sales-report.pdf'}),text=spawnSync('pdftotext',['-','-'],{input:pdf});assert.equal(text.status,0);for(const value of ['November 2026','$147.94','Not recorded','Original Shirt','Paid order ledger'])assert.ok(text.stdout.toString().includes(value),value);}await print.close();
  const month=page.getByLabel('Report month',{exact:true});await month.fill('2026-12');assert.equal(await report.getByRole('link',{name:'Summary CSV',exact:true}).count(),0,'Changing month removes stale totals and exports');await report.getByRole('button',{name:'View report',exact:true}).click();await page.getByRole('heading',{name:'December 2026 sales',exact:true}).waitFor();assert.match(await report.innerText(),/502 paid orders/);assert.equal(await report.getByRole('table',{name:'Paid order ledger',exact:true}).locator('tbody tr').count(),50);await report.getByRole('button',{name:'Next orders',exact:true}).click();assert.match(await report.innerText(),/51–100 of 502 orders/);assert.ok((await report.getByRole('link',{name:'Orders CSV',exact:true}).getAttribute('href')).includes('month=2026-12'));
  await month.fill('2026-09');await report.getByRole('button',{name:'View report',exact:true}).click();await report.getByText('No paid shop sales for this month.',{exact:true}).waitFor();assert.deepEqual(await report.locator('.shop-sales-totals dd').allTextContents(),['$0.00','$0.00','$0.00','$0.00']);
  failNext=true;await month.fill('2026-11');await report.getByRole('button',{name:'View report',exact:true}).click();await report.getByRole('alert').getByText('Fixture report unavailable. Please retry.',{exact:true}).waitFor();assert.equal(await report.getByRole('link',{name:'Summary CSV',exact:true}).count(),0);await report.getByRole('button',{name:'View report',exact:true}).click();await report.getByRole('heading',{name:'November 2026 sales',exact:true}).waitFor();
  slowMonth='2026-12';await month.fill('2026-12');await report.getByRole('button',{name:'View report',exact:true}).click();await month.fill('2026-09');await report.getByRole('button',{name:'View report',exact:true}).click();await report.getByRole('heading',{name:'September 2026 sales',exact:true}).waitFor();await new Promise(resolve=>setTimeout(resolve,500));assert.equal(await report.getByRole('heading',{name:'September 2026 sales',exact:true}).isVisible(),true,'A late response cannot replace the selected month');slowMonth='';
 }
 assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);console.log('PASS Shop Sales UI: new manager menu section, month selection, accurate totals/items and tax review, complete-month CSV/print/PDF, 50-row ledger pagination, empty/error/retry/race states, desktop/mobile and no mutations.');
}finally{await browser?.close();app?.kill('SIGTERM');}
