import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHmac,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import ts from 'typescript';
const database=process.env.VETERANS_SPECIAL_TEST_DATABASE_URL;
assert.ok(database&&new URL(database).hostname==='127.0.0.1'&&new URL(database).pathname.startsWith('/aviator_veterans_test_'),'Use a disposable local Veterans special test database.');
const root=fileURLToPath(new URL('../',import.meta.url)),pool=new pg.Pool({connectionString:database}),scratch=await mkdtemp(tmpdir()+'/aviator-veterans-special-'),secret=randomUUID();
assert.equal(Number((await pool.query('SELECT count(*) n FROM website.events')).rows[0].n),0);
const compile=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const skin=await import(compile(await readFile(root+'src/lib/site-skins.ts','utf8'))),{parseSpecialMenu}=await import(compile(await readFile(root+'src/lib/special-menu.ts','utf8')));
await pool.query("INSERT INTO website.settings(key,value) VALUES('site_theme',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[JSON.stringify({...skin.defaultSiteTheme,automaticSeasonal:true,communityEnabled:false,expiresAt:''})]);
await writeFile(scratch+'/events.json','[]');
const payload=JSON.parse(await readFile(root+'scripts/content/veterans-day-special-2026.json','utf8')),meals=parseSpecialMenu(payload.description).filter(b=>b.kind==='meal');
assert.deepEqual(meals.map(m=>m.price),['$17.76','$16.95','$17.95','$24.95']);assert.equal(meals.length,4);
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const base='http://127.0.0.1:'+port;
const {chromium}=await import(process.env.AVIATOR_PLAYWRIGHT_MODULE||'playwright');
let browser,app,page,logs='';const errors=[];
try{
 app=spawn('node',['.next/standalone/server.js'],{cwd:root,env:{...process.env,HOSTNAME:'127.0.0.1',PORT:String(port),DATABASE_URL:database,POSTGRES_URL:'',MANAGER_PORTAL_KEY:secret,MANAGER_AUTH_DATA_FILE:scratch+'/auth.json',MANAGED_EVENTS_DATA_FILE:scratch+'/events.json',MAIL_MODE:'record',STRIPE_SECRET_KEY:'',STRIPE_WEBHOOK_SECRET:''},stdio:['ignore','pipe','pipe']});app.stdout.on('data',d=>logs+=d);app.stderr.on('data',d=>logs+=d);
 for(let i=0;i<150;i++){try{if((await fetch(base+'/api/site-theme')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.equal((await fetch(base+'/api/manager/events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)})).status,401);
 browser=await chromium.launch();const context=await browser.newContext({reducedMotion:'reduce'});await context.addCookies([{name:'aviator_manager',value:createHmac('sha256',secret).update('aviator-manager-session-v1').digest('hex'),url:base}]);
 await context.route('**/api/**',async route=>{const r=route.request(),path=new URL(r.url()).pathname;if(!['GET','HEAD'].includes(r.method())&&path!=='/api/manager/events'){await route.fulfill({status:503,json:{error:'Unrelated mutations are disabled in this test.'}});return;}await route.continue();});
 const created=await context.request.post(base+'/api/manager/events',{data:payload});assert.equal(created.status(),200);const event=(await created.json()).events[0];assert.equal(event.dateOnly,true);assert.equal(event.description,payload.description);
 // Invalidate a prior local run's theme cache before checking the homepage CTA.
 assert.equal((await context.request.patch(base+'/api/manager/site-theme',{data:{automaticSeasonal:true,manualOverrideUntil:'',communityEnabled:false}})).status(),200);
 page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/');await page.getByRole('link',{name:'See Veterans Day meal specials',exact:false}).last().waitFor();
 assert.equal(await page.getByRole('link',{name:'See Veterans Day meal specials',exact:false}).last().getAttribute('href'),'/events/veterans-day');
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1050});await page.goto(base+'/events/veterans-day');await page.getByRole('heading',{name:'Veterans Day MRE Inspired Meals!',exact:true}).waitFor();
  assert.equal(await page.locator('.veterans-meal').count(),4);for(let i=0;i<4;i++){const card=page.locator('.veterans-meal').nth(i);assert.equal(await card.locator('h3').innerText(),meals[i].name);assert.equal(await card.locator('strong').innerText(),meals[i].price);assert.equal(await card.locator('p').innerText(),meals[i].description);}
  assert.equal(await page.locator('.veterans-special-date').innerText(),'Wednesday, November 11, 2026');
  await page.waitForFunction(()=>{const img=document.querySelector('.veterans-special-art img');return img?.complete&&img.naturalWidth>0;});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.locator('.veterans-special-meals').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),width===390?1:2);
  assert.equal(await page.getByRole('link',{name:'Get directions',exact:false}).first().getAttribute('href'),'https://maps.google.com/?q=688%20Brewing%20Drive%2C%20Fuquay-Varina%2C%20NC%2027526');
  await page.screenshot({path:'/tmp/aviator-veterans-special-'+width+'.png',fullPage:true});
 }
 const html=await (await fetch(base+'/events/veterans-day',{headers:{'user-agent':'facebookexternalhit/1.1'}})).text();assert.ok(html.includes('property="og:image"'));assert.ok(html.includes('veterans-day-v3.webp'));
 await page.goto(base+'/events');const listing=page.locator('.special-events-section .managed-event-card').first();await listing.getByRole('heading',{name:payload.title,exact:true}).waitFor();assert.equal(await listing.locator('.managed-event-time-block').count(),0);
 await page.goto(base+'/manager/events');await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByRole('checkbox',{name:'Show date only (no serving times advertised)',exact:true}).waitFor();assert.equal(await page.getByRole('checkbox',{name:'Show date only (no serving times advertised)',exact:true}).isChecked(),true);assert.equal(await page.locator('input[name="startTime"]').count(),0);
 await page.locator('textarea[name="description"]').fill(payload.description.replace('$17.76','$18.76'));await page.getByRole('button',{name:'Save event changes',exact:true}).click();await page.getByText('Event details updated.',{exact:true}).waitFor();
 await page.goto(base+'/events/veterans-day');await page.locator('.veterans-meal').first().getByText('$18.76',{exact:true}).waitFor();assert.equal(await page.locator('.veterans-meal').nth(1).locator('strong').innerText(),'$16.95');
 assert.equal((await context.request.patch(base+'/api/manager/events',{data:{id:event.id,published:false}})).status(),200);assert.equal((await context.request.get(base+'/events/veterans-day')).status(),404);
 assert.equal((await context.request.get(base+'/api/manager/events')).status(),200);assert.deepEqual(errors,[]);
 console.log('PASS actual customer copy/prices, four meal cards, desktop/mobile grid and no overflow, directions/artwork/social preview, homepage CTA, date-only listing and manager editing, backend price edits reflected immediately, unpublished menu hidden, anonymous writes denied. Isolated local database; no email, orders or charges.');
}finally{await writeFile('/tmp/aviator-veterans-special-server.log',logs);if(page)await writeFile('/tmp/aviator-veterans-special-debug.txt',await page.locator('body').innerText().catch(()=>''));await browser?.close();app?.kill('SIGTERM');await pool.end();await rm(scratch,{recursive:true,force:true});}
