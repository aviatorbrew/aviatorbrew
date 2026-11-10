import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHmac,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import ts from 'typescript';
import pg from 'pg';
const database=process.env.SITE_SKIN_TEST_DATABASE_URL;assert.ok(database,'Use a disposable local SITE_SKIN_TEST_DATABASE_URL.');const target=new URL(database);assert.ok(['127.0.0.1','localhost'].includes(target.hostname)&&target.pathname.includes('_test_'),'A disposable local test database is required.');const pool=new pg.Pool({connectionString:database});
async function getSaved(){const r=await pool.query("SELECT value FROM website.settings WHERE key='site_theme'");return r.rows[0].value;}
const {chromium}=await import(process.env.AVIATOR_PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),source=await readFile(root+'src/lib/site-skins.ts','utf8');
const m=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const scratch=await mkdtemp(tmpdir()+'/aviator-skin-ui-'),file=scratch+'/site-theme.json',secret=randomUUID(),initial={...structuredClone(m.defaultSiteTheme),skin:'dead-show',expiresAt:new Date(Date.now()+86400000).toISOString()};await pool.query("INSERT INTO website.settings(key,value) VALUES('site_theme',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[JSON.stringify(initial)]);
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const base='http://127.0.0.1:'+port;
async function checkSharing(expected){
 const response=await fetch(base+'/',{headers:{'user-agent':'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'}});assert.equal(response.status,200);const html=await response.text(),head=html.match(/<head>[\s\S]*?<\/head>/)?.[0];assert.ok(head,'Crawler metadata is in head without JavaScript');assert.equal(new URL(head.match(/<meta property="og:url" content="([^"]+)"/)?.[1]).href,'https://aviatorbrew.com/'); const images=[...head.matchAll(/<meta property="og:image" content="([^"]+)"/g)];assert.equal(images.length,1);const image=new URL(images[0][1].replaceAll('&amp;','&'));assert.equal(image.origin,'https://aviatorbrew.com');assert.equal(image.pathname,expected);assert.ok(head.includes('name="twitter:card" content="summary_large_image"'));const asset=await fetch(base+image.pathname+image.search);assert.equal(asset.status,200);assert.ok(asset.headers.get('content-type').startsWith('image/'));if(expected.includes('bring-out')){assert.ok(head.includes('Bring Out Yer Dead'));assert.ok(head.includes('4 p.m.–7 p.m.'));assert.ok(head.includes('Open at 11 a.m. for pre-gaming!'));assert.ok(head.includes('property="og:image:width" content="1080"'));assert.ok((await asset.arrayBuffer()).byteLength>200000);}
}

let browser,page,app,appLog="";const errors=[],mutations=[];
try{
 app=spawn('node',['.next/standalone/server.js'],{cwd:root,env:{...process.env,HOSTNAME:'127.0.0.1',PORT:String(port),DATABASE_URL:database,POSTGRES_URL:'',SITE_THEME_DATA_FILE:file,MANAGER_PORTAL_KEY:secret,MANAGER_AUTH_DATA_FILE:scratch+'/auth.json',MAIL_MODE:'record',STRIPE_SECRET_KEY:'',STRIPE_WEBHOOK_SECRET:''},stdio:['ignore','pipe','pipe']});app.stdout.on('data',d=>appLog+=d);app.stderr.on('data',d=>appLog+=d);
 for(let i=0;i<150;i++){try{if((await fetch(base+'/api/site-theme')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const unchanged=await getSaved();assert.equal((await fetch(base+'/api/manager/site-theme')).status,401);assert.equal((await fetch(base+'/api/manager/site-theme',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({skin:'classic'})})).status,401);assert.deepEqual(await getSaved(),unchanged);
 browser=await chromium.launch();const context=await browser.newContext({reducedMotion:'reduce'});await context.addCookies([{name:'aviator_manager',value:createHmac('sha256',secret).update('aviator-manager-session-v1').digest('hex'),url:base}]);
 await context.route('**/api/**',async route=>{const r=route.request(),path=new URL(r.url()).pathname;if(r.method()!=='GET'&&r.method()!=='HEAD'){if((path==='/api/manager/site-theme'&&r.method()==='PATCH')||path==='/api/skin-social'||path==='/api/manager/skin-comments')mutations.push(path);else {await route.fulfill({json:{ok:true}});return;}}await route.continue();});
 page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error'&&/hydrat|same key|unique.*key/i.test(e.text()))errors.push(e.text());});
 assert.equal((await context.request.patch(base+'/api/manager/site-theme',{data:initial})).status(),200);
 await checkSharing(initial.promotion.imageUrl);
 for(const width of [1440,1024,390]){
  await page.setViewportSize({width,height:1000});await page.goto(base+'/');await page.getByRole('heading',{name:'Bring Out Yer Dead',exact:true}).waitFor();assert.equal(await page.locator('.site-presentation').getAttribute('data-site-skin'),'dead-show');await page.getByText('Open at 11 a.m. for pre-gaming!',{exact:true}).last().waitFor();assert.ok((await page.locator('.skin-show-date').innerText()).includes('4 p.m. – 7 p.m.'));assert.equal(await page.locator('.skin-show-poster img').evaluate(img=>img.complete&&img.naturalWidth>0),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'/tmp/aviator-dead-show-home-'+width+'.png'});
  if(width===390){await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('button',{name:'Events'}).click();await page.getByRole('link',{name:'Brewery Events',exact:true}).last().waitFor({state:'visible'});await page.getByRole('button',{name:'Close menu',exact:true}).click();}
 }
 await page.goto(base+'/events');assert.equal(await page.locator('.site-presentation').getAttribute('data-site-skin'),'dead-show');await page.locator('.skin-ribbon').waitFor();
 await page.goto(base+'/manager/site-skins');await page.getByRole('heading',{name:'Website skin & featured promotion',exact:true}).waitFor();assert.equal(await page.locator('.site-presentation').getAttribute('data-site-skin'),'classic');assert.equal(await page.locator('.skin-ribbon').count(),0);assert.equal(await page.getByRole('radio',{name:/Grateful Dead Night/}).isChecked(),true);await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'/tmp/aviator-site-skins-manager.png',fullPage:true});
 await page.getByRole('radio',{name:/Grateful Dead Night/}).focus();await page.keyboard.press('ArrowRight');assert.equal(await page.getByRole('radio',{name:/Holiday Gathering/}).isChecked(),true);await page.getByRole('button',{name:'Save & activate skin',exact:true}).click();await page.getByText('Live now: Holiday Gathering',{exact:true}).waitFor();assert.equal((await getSaved()).skin,'holiday');
 await page.getByRole('button',{name:'Turn off skins & rotation',exact:true}).click();await page.getByText('Live now: Standard Aviator',{exact:true}).waitFor();let saved=(await getSaved());assert.equal(saved.skin,'classic');assert.deepEqual(saved.promotion,initial.promotion);
 await page.goto(base+'/');await page.getByRole('heading',{name:'Your next adventure is brewing.',exact:true}).waitFor();assert.equal(await page.locator('.skin-show-hero').count(),0);assert.equal(await page.locator('.skin-ribbon').count(),0);await checkSharing('/api/branding/logo');
 await page.goto(base+'/manager/site-skins');await page.getByRole('radio',{name:/After Dark/}).check();await page.getByRole('button',{name:'Save & activate skin',exact:true}).click();await page.getByText('Live now: After Dark',{exact:true}).waitFor();await page.goto(base+'/');await page.getByRole('heading',{name:'Bring Out Yer Dead',exact:true}).waitFor();assert.equal(await page.locator('.site-presentation').getAttribute('data-site-skin'),'after-dark');
 const short={...initial,expiresAt:new Date(Date.now()+10000).toISOString()};const res=await context.request.patch(base+'/api/manager/site-theme',{data:short});assert.equal(res.status(),200);await page.goto(base+'/');await page.getByRole('heading',{name:'Bring Out Yer Dead',exact:true}).waitFor();await page.getByRole('heading',{name:'Your next adventure is brewing.',exact:true}).waitFor({timeout:15000});assert.equal(await page.locator('.skin-ribbon').count(),0);assert.equal(await page.locator('.site-presentation').getAttribute('data-site-skin'),'classic');await checkSharing('/api/branding/logo');

 await page.goto(base+'/manager/site-skins');
 await page.getByRole('heading',{name:'Website skin & featured promotion',exact:true}).waitFor();
 assert.equal(await page.locator('.site-skin-thumb').count(),6);
 await page.getByRole('button',{name:'Enable / resume automatic rotation',exact:true}).click();
 await page.getByText('Live now: Veterans Day',{exact:true}).waitFor();
 assert.equal((await getSaved()).automaticSeasonal,true);
 await page.getByRole('radio',{name:/Thanksgiving/}).check();
 await page.getByRole('button',{name:'Save & activate skin',exact:true}).click();
 await page.getByText('Live now: Thanksgiving',{exact:true}).waitFor();
 assert.ok(Date.parse((await getSaved()).manualOverrideUntil)>Date.now());
 await page.getByRole('button',{name:'Enable / resume automatic rotation',exact:true}).click();
 await page.getByText('Live now: Veterans Day',{exact:true}).waitFor();
 await page.screenshot({path:'/tmp/aviator-seasonal-manager.png',fullPage:true});
 for(const width of [1440,1024,390]){
  await page.setViewportSize({width,height:1000});await page.goto(base+'/');
  await page.getByRole('heading',{name:'Honoring all who served.',exact:true}).waitFor();
  await page.getByRole('button',{name:/Like this artwork/}).waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('.skin-community-tools button').disabled);
  assert.equal(await page.locator('.site-presentation').getAttribute('data-site-skin'),'veterans-day');
  assert.equal(await page.locator('.skin-show-poster img').evaluate(img=>img.complete&&img.naturalWidth>0),true);
  assert.equal(await page.locator('.skin-poster-frame img').evaluate(img=>getComputedStyle(img).objectFit),'contain');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'/tmp/aviator-seasonal-home-'+width+'.png',fullPage:true});
 }
 await checkSharing('/images/skins/veterans-day-v2.webp');
 await page.getByRole('button',{name:/Like this artwork/}).click();
 await page.getByRole('button',{name:/Liked · 1/}).waitFor();
 await page.reload();await page.getByRole('button',{name:/Liked · 1/}).waitFor();
 await page.getByRole('button',{name:/Comments/}).click();
 await page.getByLabel('Your comment',{exact:true}).fill('Beautiful artwork. Thank you to our veterans!');
 await page.getByLabel('Name (optional · public)',{exact:true}).fill('Local Guest');
 await page.getByLabel('Email (optional · private)',{exact:true}).fill('private-local@example.test');
 await page.getByRole('button',{name:'Submit comment for review',exact:true}).click();
 await page.getByText('Thank you! Your comment is awaiting manager review before it appears.',{exact:true}).waitFor();
 assert.equal(await page.locator('.skin-public-comments article').count(),0);
 await page.goto(base+'/manager/skin-comments');
 await page.getByRole('heading',{name:'Image comments · 1 awaiting review',exact:true}).waitFor();
 await page.getByText('Private email: private-local@example.test · Policy v1.0',{exact:true}).waitFor();
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Approve & publish',exact:true}).click();
 await page.getByText('Comment approved and published.',{exact:true}).waitFor();
 await page.getByRole('combobox',{name:/^Status/}).selectOption('approved');
 await page.getByText('APPROVED: Local Guest',{exact:true}).waitFor();
 await page.screenshot({path:'/tmp/aviator-seasonal-comment-review.png',fullPage:true});
 await page.goto(base+'/');await page.getByRole('button',{name:/Comments/}).click();
 await page.locator('.skin-public-comments').getByText('Beautiful artwork. Thank you to our veterans!',{exact:true}).waitFor();
 assert.equal((await page.locator('body').innerText()).includes('private-local@example.test'),false);
 const publicData=await (await context.request.get(base+'/api/skin-social')).json();
 assert.ok(!JSON.stringify(publicData).includes('private-local@example.test'));
 await page.getByLabel('Your comment',{exact:true}).fill('Buy now at https://spam.example.test');
 await page.getByRole('button',{name:'Submit comment for review',exact:true}).click();
 await page.getByText('Your comment could not be published because it did not meet our community guidelines.',{exact:true}).waitFor();
 await page.goto(base+'/manager/skin-comments');await page.getByRole('combobox',{name:/^Status/}).selectOption('removed');
 await page.getByText('Buy now at https://spam.example.test',{exact:true}).waitFor();
 await page.getByText(/Automatic audit:.*Advertising \/ promotional links/).first().waitFor();
 await page.getByRole('button',{name:'Restore to review queue',exact:true}).click();
 await page.getByText('Comment returned to the review queue.',{exact:true}).waitFor();
 await page.getByRole('combobox',{name:/^Status/}).selectOption('pending');await page.getByText('Buy now at https://spam.example.test',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Remove comment',exact:true}).click();
 await page.getByText('Comment removed from the public website. Audit history kept.',{exact:true}).waitFor();
 await page.goto(base+'/manager/site-skins');await page.getByRole('button',{name:'Pause rotation & use standard design',exact:true}).click();
 await page.getByText('Live now: Standard Aviator',{exact:true}).waitFor();assert.equal((await getSaved()).automaticSeasonal,false);
 console.log('PASS six artwork previews, Eastern annual rotation, manual override/resume/pause, seasonal artwork desktop/tablet/mobile layout, persistent like, queued comment, private email, manager approval/publication, automatic ad removal, restore/remove audit and anonymous privacy.');
 assert.ok(mutations.length>=3);assert.deepEqual(errors,[]);console.log('PASS real local settings API and browser: anonymous writes denied, source poster loads, Nov 7 4–7 and 11am promotion, desktop/tablet/mobile no overflow, mobile navigation, themed events, plain manager portal, keyboard/radio selection, holiday/after-dark switching, immediate off and original homepage restore, saved promotion preserved and automatic live expiry without reload. Facebook-crawler metadata appears in head without JavaScript, uses the full poster, and restores the logo on off/expiry. Only isolated test-database skin settings changed; no customer emails, orders or charges.');
}finally{await writeFile('/tmp/aviator-site-skins-server.log',appLog);if(page){await page.screenshot({path:'/tmp/aviator-site-skins-debug.png',fullPage:true}).catch(()=>{});await writeFile('/tmp/aviator-site-skins-debug.txt',await page.locator('body').innerText().catch(()=>''));}await browser?.close();app?.kill('SIGTERM');await pool.end();await rm(scratch,{recursive:true,force:true});}
