import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile,writeFile,mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash,createHmac,randomUUID } from 'node:crypto';
import ts from 'typescript';
import pg from 'pg';

const root=path.resolve(import.meta.dirname,'..'),require=createRequire(path.join(root,'package.json'));
const database=process.env.EVENT_TEST_DATABASE_URL;
if(!database||!['localhost','127.0.0.1'].includes(new URL(database).hostname)||!new URL(database).pathname.startsWith('/aviator_event_test_'))throw new Error('Set EVENT_TEST_DATABASE_URL to a disposable local aviator_event_test_* database. Never use production.');
const connection=new pg.Client({connectionString:database});await connection.connect();
assert.equal(Number((await connection.query("SELECT count(*) FROM pg_tables WHERE schemaname='website'")).rows[0].count),0,'Use a fresh test database');
Object.assign(process.env,{DATABASE_URL:database,POSTGRES_SSL:'false',MAIL_MODE:'record',STRIPE_SECRET_KEY:'sk_test_fixture_only',STRIPE_WEBHOOK_SECRET:'whsec_fixture_only',MANAGER_PORTAL_KEY:'kitchen_test_fixture_only',NEXT_PUBLIC_SITE_URL:'https://aviatorbrew.com'});
globalThis.eventTestMail=[];globalThis.eventTestFailMail=false;
const temp=await mkdtemp(path.join(tmpdir(),'aviator-booking-modules-')),modules=new Map();
async function compile(file){
 if(modules.has(file))return modules.get(file);
 const destination=path.join(temp,createHash('sha256').update(file).digest('hex')+'.cjs');modules.set(file,destination);
 if(file.endsWith('/mail.ts')){await writeFile(destination,`exports.isMailConfigured=()=>true;exports.verifySmtpOnStart=()=>{};exports.sendMail=async message=>{if(globalThis.eventTestFailMail)return false;globalThis.eventTestMail.push(message);return true;};`);return destination;}
 let source=ts.transpileModule(await readFile(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const specs=[...new Set([...source.matchAll(/require\("([^\"]+)"\)/g)].map(m=>m[1]))];
 for(const spec of specs){let resolved=spec;if(spec.startsWith('@/'))resolved=await compile(path.join(root,'src',spec.slice(2))+'.ts');else if(!spec.startsWith('node:'))resolved=require.resolve(spec);source=source.replaceAll(`require(${JSON.stringify(spec)})`,`require(${JSON.stringify(resolved)})`);}
 await writeFile(destination,source);return destination;
}
const model=require(await compile(path.join(root,'src/lib/event-plan.ts'))),booking=require(await compile(path.join(root,'src/lib/event-booking.ts'))),proposals=require(await compile(path.join(root,'src/lib/event-proposals.ts'))),settings=require(await compile(path.join(root,'src/lib/private-event-settings.ts'))),plans=require(await compile(path.join(root,'src/lib/event-plans.ts'))),inquiries=require(await compile(path.join(root,'src/lib/event-inquiries.ts'))),documents=require(await compile(path.join(root,'src/lib/event-documents.ts'))),signature=require(await compile(path.join(root,'src/lib/stripe-webhook-signature.ts')));
const webhook=require(await compile(path.join(root,'src/app/api/stripe/webhook/route.ts'))),kitchenRoute=require(await compile(path.join(root,'src/app/api/manager/event-plans/[id]/kitchen/route.ts'))),inquiryRoute=require(await compile(path.join(root,'src/app/api/manager/inquiries/route.ts'))),{NextRequest}=require('next/server');
const planRoute=require(await compile(path.join(root,'src/app/api/manager/event-plans/[id]/route.ts'))),availability=require(await compile(path.join(root,'src/lib/event-inquiry-availability.ts')));
const proposalCollection=require(await compile(path.join(root,'src/app/api/manager/event-plans/[id]/proposals/route.ts')));
const reportRoute=require(await compile(path.join(root,'src/app/api/manager/event-reports/route.ts'))),alternativeRoute=require(await compile(path.join(root,'src/app/api/manager/inquiries/[id]/alternative/route.ts'))),proposalRoute=require(await compile(path.join(root,'src/app/api/manager/event-plans/[id]/proposals/[proposalId]/route.ts')));
const actualFetch=globalThis.fetch,sessions=new Map(),idempotency=new Map();let stripeCalls=0;
async function kitchenResponse(id,authenticated=true){const cookie='aviator_manager='+createHmac('sha256',process.env.MANAGER_PORTAL_KEY).update('aviator-manager-session-v1').digest('hex');return kitchenRoute.GET(new NextRequest('https://aviatorbrew.com/api/manager/event-plans/'+id+'/kitchen',{headers:authenticated?{cookie}:{}}),{params:Promise.resolve({id})});}
async function inquiryList(query='',authenticated=true){const cookie='aviator_manager='+createHmac('sha256',process.env.MANAGER_PORTAL_KEY).update('aviator-manager-session-v1').digest('hex');return inquiryRoute.GET(new NextRequest('https://aviatorbrew.com/api/manager/inquiries?kind=event'+query,{headers:authenticated?{cookie}:{}}));}
globalThis.fetch=async (url,input={})=>{
 assert.ok(String(url).startsWith('https://api.stripe.com/v1/checkout/sessions'),'Tests must not make other external requests');stripeCalls++;
 if(input.method==='POST'&&String(url).endsWith('/expire')){const id=String(url).split('/').at(-2),session=sessions.get(id);if(!session||session.payment_status==='paid')return Response.json({error:'not expirable'},{status:400});session.status='expired';return Response.json(session);}
 if(input.method==='POST'){
  const params=new URLSearchParams(input.body),key=input.headers['Idempotency-Key'];assert.ok(key);assert.equal(params.get('payment_method_types[0]'),'card');
  if(idempotency.has(key)){const old=idempotency.get(key);assert.equal(old.body,params.toString(),'Stripe idempotency parameters stay identical');return Response.json(old.session);}
  const id='cs_test_'+randomUUID().replaceAll('-',''),session={id,url:'https://checkout.stripe.com/c/pay/'+id,expires_at:Number(params.get('expires_at')),status:'open',payment_status:'unpaid',amount_total:Number(params.get('line_items[0][price_data][unit_amount]')),currency:'usd',payment_intent:'pi_'+randomUUID().replaceAll('-',''),metadata:Object.fromEntries([...params.entries()].filter(([k])=>k.startsWith('metadata[')).map(([k,v])=>[k.slice(9,-1),v]))};
  sessions.set(id,session);idempotency.set(key,{body:params.toString(),session});return Response.json(session);
 }
 const session=sessions.get(String(url).split('/').at(-1));return session?Response.json(session):Response.json({error:'missing'},{status:404});
};
const future=days=>new Date(Date.now()+days*86400000).toISOString().slice(0,10),expiration=()=>new Date(Date.now()+14*86400000).toISOString();
function valid(date=future(60)){
 const p={...model.emptyEventPlan(),title:'Isolated test event',contactName:'Fixture Customer',contactEmail:'fixture@example.com',phone:'919-555-0100',date,startTime:'17:00',foodTime:'18:00',endTime:'21:00',guestCount:50,internalNotes:'DO NOT EXPOSE PAYMENT ADMIN NOTES'};
 p.flightPlan={...model.emptyFlightPlan(),packageId:'feast',appetizers:['Hush Puppies','Tater Tots','Brewer Fries'],entrees:['Aviator Pulled Pork BBQ','Aviator Chicken Tenders'],sides:['Mac & Cheese','Potato Salad'],salads:['Caesar Salad'],dietaryNeeds:'Fixture peanut allergy',foodNotes:'Fixture service notes'};return p;
}
async function approved(details=valid()){
 const plan=await plans.saveEventPlan(details),p=await proposals.createProposal(plan.id,{version:plan.version,expiresAt:expiration()});await proposals.sendProposal(plan.id,p.id,{availabilityApproved:true,capacityApproved:true,emailApproved:true});
 const email=globalThis.eventTestMail.at(-1);assert.equal(email.cc,'events@aviatorbrew.com','Every proposal copies the events team');const token=email.text.match(/#token=([a-f0-9]{64})/)[1];return {plan,p,token};
}
const acceptance=p=>({name:'Fixture Customer',agreed:true,proposalVersion:p.version,policyVersion:p.snapshot.policyVersion,userAgent:'Fixture browser',ip:'127.0.0.1'});
async function notify(session,eventId='evt_'+randomUUID(),validSignature=true){const raw=JSON.stringify({id:eventId,type:'checkout.session.completed',data:{object:session}}),t=Math.floor(Date.now()/1000),signed=createHmac('sha256',process.env.STRIPE_WEBHOOK_SECRET).update(t+'.'+raw).digest('hex');return webhook.POST(new NextRequest('https://aviatorbrew.com/api/stripe/webhook',{method:'POST',headers:{'stripe-signature':`t=${t},v1=${validSignature?signed:'0'.repeat(64)}`},body:raw}));}
try{
 const catalog=structuredClone(model.defaultCateringCatalog),original=valid();
 const inquiryEmail=require(await compile(path.join(root,'src/lib/event-inquiry-email.ts')));
 const customerCopy=inquiryEmail.buildEventInquiryEmail(original,catalog,'123','customer');
 const teamCopy=inquiryEmail.buildEventInquiryEmail(original,catalog,'123','internal');
 for(const copy of [customerCopy,teamCopy]){
  assert.ok(copy.html.includes('cid:aviator-logo'));
  for(const heading of ['Event details','Contact information','Your buffet menu','Estimated pricing','What happens next'])assert.ok(copy.html.includes(heading));
  assert.ok(copy.html.includes('<ul')&&copy.html.includes('<ol'));
  assert.ok(copy.html.includes('Food out time')&&copy.text.includes('Food out time: 6:00 PM'));
  assert.ok(copy.html.includes('$1,900.00')&&copy.html.includes('$2,056.75'));
  assert.ok(copy.text.includes('not confirmed')&&copy.text.includes('pay your deposit online'));
  assert.ok(!copy.html.includes('DO NOT EXPOSE PAYMENT ADMIN NOTES'));
 }
 assert.ok(teamCopy.html.includes('https://aviatorbrew.com/manager/private-events?inquiry=123'));
 assert.ok(teamCopy.text.includes('Review Request in Manager Portal'.toUpperCase()));
 assert.ok(!customerCopy.html.includes('/manager/')&&!customerCopy.text.includes('/manager/'));
 const unsafe=inquiryEmail.buildEventInquiryEmail({...original,title:'<script>alert(1)</script>',contactName:'<img src=x onerror=alert(2)>',notes:'<a href="javascript:alert(3)">Unsafe</a>',flightPlan:{...original.flightPlan,appetizers:['Hush Puppies','Hush Puppies','Brewer Fries']}},catalog,'123','customer');
 assert.ok(!unsafe.html.includes('<script>')&&!unsafe.html.includes('<img src=x')&&!unsafe.html.includes('<a href="javascript:'));
 assert.ok(unsafe.html.includes('&lt;script&gt;')&&unsafe.html.includes('Hush Puppies × 2'));
 const emailCatalog=structuredClone(catalog);emailCatalog.packages[1].priceCents=4150;
 assert.ok(inquiryEmail.buildEventInquiryEmail(original,emailCatalog,'123','customer').html.includes('$2,075.00'),'Emails use current backend prices');
 await writeFile('/tmp/aviator-event-inquiry-email-customer.html',customerCopy.html);
 await writeFile('/tmp/aviator-event-inquiry-email-team.html',teamCopy.html);
 console.log('Passed branded HTML/plain inquiry emails, accurate prices, food lists, duplicate selections, safe escaping, internal-only manager links and private-note protection');
 assert.equal(model.eventTotals(original,catalog).subtotal,190000);
 for(const guests of [0,29,71,1.5])assert.throws(()=>booking.validateCateringRequest({...original,guestCount:guests},catalog,35000));
 assert.throws(()=>booking.validateCateringRequest({...original,flightPlan:{...original.flightPlan,appetizers:['Hush Puppies']}},catalog,35000));
 assert.throws(()=>booking.validateCateringRequest({...original,flightPlan:{...original.flightPlan,appetizers:[...original.flightPlan.appetizers,'Tater Tots']}},catalog,35000));
 assert.throws(()=>booking.validateCateringRequest({...original,date:'2020-01-01'},catalog,35000));
 const disabled=structuredClone(catalog);disabled.disabledItems=['Hush Puppies'];assert.throws(()=>booking.validateCateringRequest(original,disabled,35000));
 disabled.disabledItems=[];disabled.packages[1].enabled=false;assert.throws(()=>booking.validateCateringRequest(original,disabled,35000));
 const repriced=structuredClone(catalog);repriced.packages[1].priceCents=4000;repriced.extraPrices.side=400;
 const canonical=booking.validateCateringRequest({...original,paidCents:999999,taxRateBps:0,items:[{name:'fake'}],flightPlan:{...original.flightPlan,extraSides:['French Fries'],extraSidePriceCents:0}},repriced,42000);
 assert.equal(canonical.foodTime,'18:00','Food out time survives backend validation');assert.throws(()=>booking.validateCateringRequest({...original,foodTime:'25:00'},catalog,35000));assert.equal(canonical.paidCents,0);assert.equal(canonical.items.length,0);assert.equal(canonical.reservationDepositCents,42000);assert.equal(model.eventTotals(canonical,repriced).subtotal,220000);
 assert.equal(booking.eventWindowsOverlap({date:'2027-01-01',startTime:'22:00',endTime:'02:00'},{date:'2027-01-02',startTime:'01:00',endTime:'04:00'}),true);
 assert.equal(booking.eventRecordConflicts({date:'2027-01-03',startTime:'17:00',endTime:'21:00'},{data:{...original,date:'2027-01-01'},calendar_sync:{status:'changed',linkedFromPlanId:'google-duplicate',source:{date:'2027-01-03',startTime:'17:00',endTime:'21:00'}}}),false,'Linked Google changes are review metadata, never a second booking');
 assert.equal(proposals.materialHash(original),proposals.materialHash(Object.fromEntries(Object.entries(original).reverse())),'Material comparisons ignore JSON object key order');
 const catalogVisibility=require(await compile(path.join(root,'src/lib/catering-catalog.ts')));
 const publicCatalog=catalogVisibility.availableCatalog(catalog);
 for(const name of ['Chicken Fingers','Loaded Tots']){
   assert.ok(catalog.menu.appetizers.includes(name));assert.ok(catalog.managerOnlyItems.includes(name));assert.ok(!JSON.stringify(publicCatalog).includes(name),'Manager-only names are not serialized to customers');
   assert.throws(()=>booking.validateCateringRequest({...original,flightPlan:{...original.flightPlan,appetizers:[name,...original.flightPlan.appetizers.slice(1)]}},catalog,35000));
   assert.throws(()=>booking.validateCateringRequest({...original,flightPlan:{...original.flightPlan,extraAppetizers:[name]}},catalog,35000),'Customers cannot submit manager-only extras directly');
 }
 const staffFood={...original,flightPlan:{...original.flightPlan,appetizers:['Chicken Fingers','Loaded Tots','Hush Puppies'],extraAppetizers:['Chicken Fingers','Loaded Tots']}};
 const staffParsed=model.parseEventPlan(staffFood,catalog);assert.equal(model.eventTotals(staffParsed,catalog).subtotal,190000+50*300*2);
 assert.ok(!model.eventOrderItems(staffParsed,catalog).some(row=>row.name.startsWith('Premium appetizer')));
 const premiumFood={...original,flightPlan:{...original.flightPlan,appetizers:['Pulled Pork Nachos','BBQ Meatballs','Hush Puppies'],extraAppetizers:['Pulled Pork Nachos','BBQ Meatballs']}};
 const premiumParsed=booking.validateCateringRequest(premiumFood,catalog,35000);assert.equal(model.eventTotals(premiumParsed,catalog).subtotal,190000+50*(300*2+(300+300)*2));
 assert.equal(model.eventOrderItems(premiumParsed,catalog).filter(row=>row.name.startsWith('Premium appetizer upgrade:')).length,4);
 const changedAppPrices=structuredClone(catalog);changedAppPrices.extraPrices.appetizer=425;changedAppPrices.extraPrices.premiumAppetizer=350;
 assert.equal(model.eventTotals(staffParsed,changedAppPrices).subtotal,190000+50*425*2,'Manager-only dishes use the configured regular extra-app price');
 assert.equal(model.eventTotals(premiumParsed,changedAppPrices).subtotal,190000+50*(350*2+(425+350)*2),'Premium items use configured extra and premium prices');
 const legacyCatalog=structuredClone(catalog);delete legacyCatalog.managerOnlyItems;assert.deepEqual(catalogVisibility.parseCateringCatalog(legacyCatalog).managerOnlyItems,[]);
 assert.throws(()=>catalogVisibility.parseCateringCatalog({...catalog,managerOnlyItems:'Chicken Fingers'}));assert.throws(()=>catalogVisibility.parseCateringCatalog({...catalog,managerOnlyItems:null}));
 await writeFile('/tmp/aviator-public-catering-menu-hidden-apps.pdf',await documents.cateringMenuPdf(catalog,'Visibility fixture'));
 console.log('Passed manager-only appetizer visibility, blocked direct customer submissions, normal included/extra pricing, new premium appetizer upgrades/extras, backend-controlled prices and legacy settings compatibility');
 const customExtraFood={...original,flightPlan:{...original.flightPlan,extraAppetizers:['Hush Puppies','Shrimp Cocktail'],extraEntrees:['Aviator Pulled Pork BBQ','Aviator Beef Brisket'],extraAppetizerPriceCents:225,extraEntreePriceCents:450,extraPremiumEntreePriceCents:650}};
 const customExtraParsed=model.parseEventPlan(customExtraFood,catalog),customExtraSnapshot=booking.proposalSnapshot(customExtraParsed,catalog,35000,'Fixture policies','fixture');
 assert.equal(model.eventTotals(customExtraParsed,catalog).subtotal,190000+50*(225*2+300+450+650));
 assert.equal(customExtraSnapshot.totals.subtotal,model.eventTotals(customExtraParsed,catalog).subtotal);
 assert.equal(customExtraSnapshot.items.find(i=>i.name==='Additional appetizer: Hush Puppies').unitPriceCents,225);
 assert.equal(customExtraSnapshot.items.find(i=>i.name==='Additional premium entree: Aviator Beef Brisket').unitPriceCents,650);
 assert.notEqual(proposals.materialHash(customExtraParsed),proposals.materialHash({...customExtraParsed,flightPlan:{...customExtraParsed.flightPlan,extraEntreePriceCents:475}}),'Price edits require a revised proposal');
 const forcedDefaults=booking.validateCateringRequest({...customExtraFood,flightPlan:{...customExtraFood.flightPlan,extraAppetizerPriceCents:0,extraEntreePriceCents:0,extraPremiumEntreePriceCents:0}},catalog,35000);
 assert.equal(model.eventTotals(forcedDefaults,catalog).subtotal,190000+50*(300*2+300+500+700),'Public requests cannot override manager extra prices');
 for(const key of ['extraAppetizerPriceCents','extraEntreePriceCents','extraPremiumEntreePriceCents'])assert.ok(!Object.hasOwn(forcedDefaults.flightPlan,key),'Public inquiries do not store manager price overrides');
 assert.ok(plans.eventSummaryHtml({id:'fixture-custom-prices',version:1,details:customExtraParsed},false,'',false,catalog).includes('$2.25'),'Printable order summary uses staff prices');
 await writeFile('/tmp/aviator-custom-extra-prices-proposal.pdf',await documents.proposalPdf({id:'fixture-custom-prices',number:'AVI-CUSTOM-PRICES',version:1,snapshot:customExtraSnapshot,expires_at:new Date(Date.now()+86400000).toISOString(),accepted_at:null}));
 console.log('Passed manager extra appetizer/regular/premium entree prices, immutable snapshots, material revision detection, public price-tampering prevention, printable summary and proposal PDF');
 const substitutions={...original,flightPlan:{...original.flightPlan,sides:['Greek Salad','Chicken Cobb Salad']}};const substituted=model.parseEventPlan(substitutions,catalog);assert.equal(model.eventTotals(substituted,catalog).subtotal,190000);assert.throws(()=>booking.validateCateringRequest(substitutions,catalog,35000),'Public inquiries cannot request manager salad substitutions');
 const discountedEvent=model.parseEventPlan({...substitutions,managerDiscount:{amountCents:10000,reason:'One-time courtesy adjustment'}},catalog),discountSnapshot=booking.proposalSnapshot(discountedEvent,catalog,35000,'Fixture policies','fixture');assert.equal(discountSnapshot.totals.subtotal,190000);assert.equal(discountSnapshot.totals.discount,10000);assert.equal(discountSnapshot.totals.total,194850);assert.equal(discountSnapshot.items.length,1);assert.ok(discountSnapshot.selections.find(([label])=>label==='Sides')[1].includes('salad substituted for side'));assert.equal(discountSnapshot.details.managerDiscount.reason,'One-time courtesy adjustment');
 assert.notEqual(proposals.materialHash(original),proposals.materialHash(substituted));assert.notEqual(proposals.materialHash(substituted),proposals.materialHash(discountedEvent));assert.notEqual(proposals.materialHash(discountedEvent),proposals.materialHash({...discountedEvent,managerDiscount:{amountCents:10100,reason:'One-time courtesy adjustment'}}));assert.equal(proposals.materialHash(model.parseEventPlan({...original,managerDiscount:{amountCents:0,reason:''}},catalog)),proposals.materialHash(model.parseEventPlan(original,catalog)),'Zero discount preserves legacy proposal terms');
 const forgedDiscount=booking.validateCateringRequest({...original,managerDiscount:{amountCents:190000,reason:'Tampered'}},catalog,35000);assert.ok(!Object.hasOwn(forgedDiscount,'managerDiscount'));assert.equal(model.eventTotals(forgedDiscount,catalog).total,205675);const discountCopy=structuredClone(discountSnapshot);discountedEvent.managerDiscount.amountCents=20000;discountedEvent.flightPlan.sides[0]='Caesar Salad';assert.deepEqual(discountSnapshot,discountCopy,'Issued discount/menu snapshots cannot change with edits');
 const discountSummary=plans.eventSummaryHtml({id:'fixture-discount',version:1,details:discountSnapshot.details},true,'',false,catalog);assert.ok(discountSummary.includes('One-time event discount'));assert.ok(discountSummary.includes('-$100.00'));assert.ok(discountSummary.includes('salad substituted for side'));const discountKitchen=documents.kitchenSheetHtml({id:'fixture-discount',version:1,details:discountSnapshot.details},catalog);assert.ok(discountKitchen.includes('Greek Salad'));assert.ok(!discountKitchen.includes('One-time courtesy adjustment')&&!discountKitchen.includes('$100'));
 await writeFile('/tmp/aviator-event-discount-proposal.pdf',await documents.proposalPdf({id:'fixture-discount',number:'AVI-DISCOUNT',version:1,snapshot:discountSnapshot,expires_at:new Date(Date.now()+86400000).toISOString(),accepted_at:null}));
 console.log('Passed manager-only salad replacements and one-time discount: public tampering blocked, authoritative totals/taxes, immutable proposal versions, changed terms require reacceptance, summary/proposal PDF and kitchen privacy.');
 console.log('Passed menu validation, backend pricing, disabled items, guest limits and overnight availability');
 const req={requestId:randomUUID(),humanCheck:'yes',website:'',cateringPlan:original};
 const inquiry=await inquiries.submitCateringInquiry(req);await inquiries.submitCateringInquiry(req);
 assert.equal((await inquiryList('',false)).status,401,'Inquiry counts require manager authorization');
 assert.equal((await (await inquiryList()).json()).unreviewedCount,1);
 const filteredCount=await (await inquiryList('&q=does-not-match-any-inquiry&limit=1')).json();assert.equal(filteredCount.inquiries.length,0);assert.equal(filteredCount.unreviewedCount,1,'Unreviewed count covers all dates and records, independent of visible filters');
 assert.equal(Number((await connection.query('SELECT count(*) FROM website.form_inquiries')).rows[0].count),1);
 assert.equal(globalThis.eventTestMail.length,2,'Duplicate inquiry does not repeat emails');
 assert.ok(globalThis.eventTestMail[0].html.includes('/manager/private-events?inquiry='+inquiry.inquiryId));
 assert.ok(globalThis.eventTestMail[1].html.includes('Your event request is in!'));
 assert.ok(!globalThis.eventTestMail[1].html.includes('/manager/'),'Customer copy excludes internal manager links');
 assert.equal((await connection.query('SELECT payload FROM website.form_inquiries')).rows[0].payload.cateringPlan.paidCents,0);
 assert.equal((await connection.query('SELECT payload FROM website.form_inquiries')).rows[0].payload.cateringPlan.foodTime,'18:00','Inquiry preserves food out time for manager planning');
 const sourcePlan=await plans.saveEventPlan(booking.validateCateringRequest(original,catalog,35000),undefined,undefined,inquiry.inquiryId);
 assert.equal((await (await inquiryList()).json()).unreviewedCount,0,'A saved event plan takes its source inquiry out of the unreviewed count');
 const draft=await proposals.createProposal(sourcePlan.id,{version:sourcePlan.version,expiresAt:expiration()});
 assert.equal((await kitchenResponse(sourcePlan.id,false)).status,401,'Kitchen sheets remain manager-only');
 assert.equal((await kitchenResponse(randomUUID())).status,404);
 const draftKitchenResponse=await kitchenResponse(sourcePlan.id);assert.equal(draftKitchenResponse.status,200,'Saved drafts print without a proposal approval or configured policies');
 const draftKitchen=await draftKitchenResponse.text();assert.ok(draftKitchen.includes('DRAFT — NOT APPROVED FOR PRODUCTION'));assert.ok(draftKitchen.includes('Fixture peanut allergy'));assert.ok(!draftKitchen.includes('fixture@example.com'));assert.ok(!draftKitchen.includes('PAYMENT ADMIN NOTES'));assert.ok(!draftKitchen.includes('$350'));assert.equal((await plans.getEventPlan(sourcePlan.id)).details.status,'Draft','Printing does not approve or confirm the event');await writeFile('/tmp/aviator-kitchen-draft.html',draftKitchen);
 assert.ok(documents.kitchenSheetHtml({...sourcePlan,details:{...sourcePlan.details,status:'Tentative'}},catalog).includes('DRAFT — NOT APPROVED FOR PRODUCTION'));
 const emailInput={requestId:randomUUID(),version:sourcePlan.version,subject:'Fixture approved update',message:'Fixture customer update',includeSummary:true};
 const mailBeforeApproval=globalThis.eventTestMail.length;
 await assert.rejects(()=>plans.emailEventUpdate(sourcePlan,emailInput),/approve.*email/);
 assert.equal(globalThis.eventTestMail.length,mailBeforeApproval,'No customer update is sent without approval');
 const approvedUpdate=await plans.emailEventUpdate(sourcePlan,{...emailInput,emailApproved:true});assert.equal(approvedUpdate.sent.length,1);
 await plans.emailEventUpdate(sourcePlan,{...emailInput,emailApproved:true});assert.equal(globalThis.eventTestMail.length,mailBeforeApproval+1,'Approved update retry does not duplicate delivery');

 assert.ok(documents.kitchenSheetHtml({...sourcePlan,details:{...sourcePlan.details,status:'Completed'}},catalog).includes('COMPLETED EVENT — REFERENCE COPY'));

 await assert.rejects(()=>proposals.sendProposal(sourcePlan.id,draft.id,{availabilityApproved:true,capacityApproved:true,emailApproved:true}),/polic/);
 await settings.setPrivateEventSettings({policyText:'TEST FIXTURE ONLY: approved cancellation, deposit and event policy placeholder. Never publish these terms.',policyVersion:'fixture-1'});
 const p=await proposals.createProposal(sourcePlan.id,{version:sourcePlan.version,expiresAt:expiration()});
 await assert.rejects(()=>proposals.sendProposal(sourcePlan.id,p.id,{availabilityApproved:true,capacityApproved:true}),/approve.*email/);
 const reviewCookie='aviator_manager='+createHmac('sha256',process.env.MANAGER_PORTAL_KEY).update('aviator-manager-session-v1').digest('hex');
 const reviewPatch=(id,body,authenticated=true)=>proposalCollection.PATCH(new NextRequest('https://aviatorbrew.com/api/manager/event-plans/'+id+'/proposals',{method:'PATCH',headers:{'content-type':'application/json',...(authenticated?{cookie:reviewCookie}:{})},body:JSON.stringify(body)}),{params:Promise.resolve({id})});
 let approval=(await proposals.listProposals(sourcePlan.id)).review;assert.equal(approval.emailApproved,false);
 const allApproved={...approval,availabilityApproved:false,capacityApproved:false,emailApproved:true},reviewMailBefore=globalThis.eventTestMail.length;
 assert.equal((await reviewPatch(sourcePlan.id,allApproved,false)).status,401);
 assert.equal((await reviewPatch(sourcePlan.id,{...allApproved,emailApproved:'yes'})).status,400);
 assert.equal((await reviewPatch(sourcePlan.id,{...allApproved,context:'stale'})).status,409);
 assert.equal((await reviewPatch(sourcePlan.id,allApproved)).status,200);
 assert.equal((await proposals.listProposals(sourcePlan.id)).review.emailApproved,true);
 assert.equal((await plans.getEventPlan(sourcePlan.id)).version,sourcePlan.version,'Approval saving does not change the event revision');
 assert.equal(globalThis.eventTestMail.length,reviewMailBefore,'Checking approvals does not send email');
 await proposals.saveProposalReview(sourcePlan.id,{...allApproved,emailApproved:false});
 await assert.rejects(()=>proposals.sendProposal(sourcePlan.id,p.id,{availabilityApproved:true,capacityApproved:true,emailApproved:true,reviewContext:approval.context}),/approvals changed/);
 await proposals.saveProposalReview(sourcePlan.id,allApproved);
 await proposals.sendProposal(sourcePlan.id,p.id,{emailApproved:true,reviewContext:approval.context});
 assert.equal((await proposals.listProposals(sourcePlan.id)).review.emailApproved,true,'Approvals survive sending and the automatic tentative status');
 assert.ok(globalThis.eventTestMail.at(-1).html.includes('<strong>Proposal expires:</strong>'));assert.ok(globalThis.eventTestMail.at(-1).html.includes('Eastern'));assert.ok(globalThis.eventTestMail.at(-1).text.includes('Proposal expires:'));assert.equal((await proposals.listProposals(sourcePlan.id)).review.availabilityApproved,false);assert.equal((await proposals.listProposals(sourcePlan.id)).review.capacityApproved,false);
 const approvedKitchen=await kitchenResponse(sourcePlan.id);assert.equal(approvedKitchen.status,200);assert.ok((await approvedKitchen.text()).includes('APPROVED PROPOSAL — TENTATIVE EVENT'));
 const token=globalThis.eventTestMail.at(-1).text.match(/#token=([a-f0-9]{64})/)[1],access=await proposals.customerProposal(token);
 assert.equal(access.status,'Proposal Sent');assert.equal(access.proposal.snapshot.totals.total,205675);assert.ok(!JSON.stringify(access).includes('DO NOT EXPOSE'));assert.ok(!('token_hash' in access.proposal));
 const savedRaw=(await connection.query('SELECT token_hash,material_hash FROM website.private_event_proposals WHERE id=$1',[p.id])).rows[0];assert.notEqual(savedRaw.token_hash,token);assert.equal(savedRaw.material_hash,proposals.materialHash((await plans.getEventPlan(sourcePlan.id)).details));
 await assert.rejects(()=>proposals.acceptAndCheckout(token,{...acceptance(p),agreed:false}));await assert.rejects(()=>proposals.acceptAndCheckout(token,{...acceptance(p),policyVersion:'wrong'}));
 await assert.rejects(()=>proposals.customerProposal('a'.repeat(64)));
 const checkout=await Promise.all(Array.from({length:4},()=>proposals.acceptAndCheckout(token,acceptance(p))));assert.equal(new Set(checkout.map(r=>r.url)).size,1);assert.equal(idempotency.size,1,'One Stripe session across concurrent retries');
 const attempt=sessions.values().next().value;assert.equal(attempt.amount_total,35000);assert.equal((await plans.getEventPlan(sourcePlan.id)).details.status,'Confirmed');assert.equal((await plans.getEventPlan(sourcePlan.id)).details.paidCents,0);
 const acceptanceRow=(await connection.query('SELECT accepted_name,acceptance,accepted_at FROM website.private_event_proposals WHERE id=$1',[p.id])).rows[0];assert.equal(acceptanceRow.acceptance.policyVersion,'fixture-1');assert.ok(acceptanceRow.accepted_at);assert.equal(acceptanceRow.accepted_name,'Fixture Customer');
 const pendingLedger=await proposals.listProposals(sourcePlan.id);assert.equal(pendingLedger.attempts[0].status,'open');assert.equal(pendingLedger.deposits.length,0);assert.equal(pendingLedger.attempts[0].proposal_id,p.id);assert.ok(!('checkout_url' in pendingLedger.attempts[0]));
 assert.equal((await notify({...attempt,payment_status:'paid'},'evt_invalid',false)).status,400);assert.equal(Number((await connection.query('SELECT count(*) FROM website.private_event_deposits')).rows[0].count),0);
 assert.equal((await notify({...attempt,payment_status:'paid',amount_total:1},'evt_wrong_amount')).status,400);
 globalThis.eventTestFailMail=true;
 const paid={...attempt,payment_status:'paid'};assert.equal((await notify(paid,'evt_paid')).status,503,'Paid ledger survives notification failure');
 const paidPlan=await plans.getEventPlan(sourcePlan.id);assert.equal(paidPlan.details.status,'Confirmed');assert.equal(paidPlan.details.paidCents,35000);
 assert.ok((await (await kitchenResponse(sourcePlan.id)).text()).includes('CONFIRMED EVENT'));
 globalThis.eventTestFailMail=false;assert.equal((await notify(paid,'evt_paid_retry')).status,200);await Promise.all([notify(paid,'evt_replay_1'),notify(paid,'evt_replay_2')]);
 assert.equal((await plans.getEventPlan(sourcePlan.id)).details.paidCents,35000);assert.equal(Number((await connection.query('SELECT count(*) FROM website.private_event_deposits')).rows[0].count),1);assert.equal(Number((await connection.query("SELECT count(*) FROM website.private_event_deliveries WHERE status='sent'")).rows[0].count),1);
 const paidLedger=await proposals.listProposals(sourcePlan.id);assert.equal(paidLedger.attempts[0].status,'paid');assert.equal(paidLedger.deposits[0].proposal_id,p.id);assert.equal(paidLedger.deposits[0].amount_cents,35000);
 const customer=await proposals.customerProposal(token);assert.equal(customer.status,'Confirmed');assert.equal(customer.remainingCents,170675);
 const pdf=await documents.proposalPdf(p);assert.equal(Buffer.from(pdf).subarray(0,5).toString(),'%PDF-');await writeFile('/tmp/aviator-test-proposal.pdf',pdf);
 const kitchen=documents.kitchenSheetHtml(await plans.getEventPlan(sourcePlan.id),catalog);assert.ok(kitchen.includes('Fixture peanut allergy'));assert.ok(kitchen.includes('No yield data'));assert.ok(!kitchen.includes('PAYMENT ADMIN NOTES'));assert.ok(!kitchen.includes('205675'));assert.ok(!kitchen.includes('fixture@example.com'));
 await settings.setPrivateEventSettings({catering:repriced});assert.equal((await proposals.customerProposal(token)).proposal.snapshot.totals.subtotal,190000,'Issued prices never change with menu configuration');
 console.log('Passed inquiries, immutable quotes, policy gates, concurrent checkout, verified payment, duplicate notifications, deposit credits, email retry, proposal PDF and manager-only draft/approved/confirmed/canceled kitchen sheets');
 // A material change after acceptance must not turn a late deposit into a confirmed changed booking.
 const late=await approved(valid(future(65)));await proposals.acceptAndCheckout(late.token,acceptance(late.p));const lateSession=[...sessions.values()].at(-1);
 const beforeChange=await plans.getEventPlan(late.plan.id);await plans.saveEventPlan({...beforeChange.details,guestCount:55},beforeChange.id,beforeChange.version);
 assert.equal((await notify({...lateSession,payment_status:'paid'},'evt_late')).status,200);const changed=await plans.getEventPlan(late.plan.id);assert.equal(changed.details.status,'Confirmed','Previously accepted reservation remains confirmed while changed terms require reacceptance');assert.equal((await proposals.getManagerProposal(late.plan.id,late.p.id)).state,'paid_review');assert.equal(changed.details.paidCents,35000);assert.equal((await proposals.customerProposal(late.token)).canAccept,false);
 const revised=await proposals.createProposal(changed.id,{version:changed.version,expiresAt:expiration()});await proposals.sendProposal(changed.id,revised.id,{availabilityApproved:true,capacityApproved:true,emailApproved:true});const revisedToken=globalThis.eventTestMail.at(-1).text.match(/#token=([a-f0-9]{64})/)[1];const keysBefore=idempotency.size;await proposals.acceptAndCheckout(revisedToken,acceptance(revised));assert.equal(idempotency.size,keysBefore,'Revisions reuse existing deposit credit without another charge');assert.equal((await plans.getEventPlan(changed.id)).details.status,'Confirmed');
 const overlap=await plans.saveEventPlan(valid(future(60)));const conflicting=await proposals.createProposal(overlap.id,{version:overlap.version,expiresAt:expiration()});await assert.rejects(()=>proposals.sendProposal(overlap.id,conflicting.id,{availabilityApproved:true,capacityApproved:true,emailApproved:true}),/available/);
 await assert.rejects(()=>plans.saveEventPlan({...overlap.details,status:'Confirmed'},overlap.id,overlap.version),/overlap/);
 const expiring=await approved(valid(future(70)));await connection.query("UPDATE website.private_event_proposals SET expires_at=now()-interval '1 second' WHERE id=$1",[expiring.p.id]);await assert.rejects(()=>proposals.customerProposal(expiring.token),/expired/);await assert.rejects(()=>proposals.acceptAndCheckout(expiring.token,acceptance(expiring.p)),/expired/);
 const failed=await approved(valid(future(75)));await proposals.acceptAndCheckout(failed.token,acceptance(failed.p));const failedSession=[...sessions.values()].at(-1);await proposals.markProposalAttempt(failedSession,'failed');assert.equal((await proposals.customerProposal(failed.token)).status,'Confirmed');assert.equal((await proposals.listProposals(failed.plan.id)).attempts[0].status,'failed');assert.equal((await plans.getEventPlan(failed.plan.id)).details.paidCents,0);
 const canceled=await approved(valid(future(80)));await proposals.acceptAndCheckout(canceled.token,acceptance(canceled.p));const cancelSession=[...sessions.values()].at(-1),cancelPlan=await plans.getEventPlan(canceled.plan.id);await plans.saveEventPlan({...cancelPlan.details,status:'Cancelled'},cancelPlan.id,cancelPlan.version);await notify({...cancelSession,payment_status:'paid'},'evt_cancelled');assert.equal((await plans.getEventPlan(canceled.plan.id)).details.status,'Cancelled');
 const canceledKitchen=await kitchenResponse(canceled.plan.id);assert.equal(canceledKitchen.status,200);assert.ok((await canceledKitchen.text()).includes('CANCELED EVENT — DO NOT PRODUCE'));
 const unpaid=await approved(valid(future(85)));await proposals.acceptAndCheckout(unpaid.token,acceptance(unpaid.p));const unpaidSession=[...sessions.values()].at(-1);const unpaidPlan=await plans.getEventPlan(unpaid.plan.id);const changedUnpaid=await plans.saveEventPlan({...unpaidPlan.details,guestCount:52},unpaidPlan.id,unpaidPlan.version);const replacement=await proposals.createProposal(changedUnpaid.id,{version:changedUnpaid.version,expiresAt:expiration()});await proposals.sendProposal(changedUnpaid.id,replacement.id,{availabilityApproved:true,capacityApproved:true,emailApproved:true});assert.equal(sessions.get(unpaidSession.id).status,'expired','An older unpaid checkout is closed before a revised proposal becomes payable');
 const manual=await approved(valid(future(87)));await proposals.acceptAndCheckout(manual.token,acceptance(manual.p));const manualSession=[...sessions.values()].at(-1),manualPlan=await plans.getEventPlan(manual.plan.id);await plans.saveEventPlan({...manualPlan.details,paidCents:35000},manualPlan.id,manualPlan.version);assert.equal(sessions.get(manualSession.id).status,'expired','A recorded manual deposit closes an older unpaid checkout');const checkoutsBeforeCredit=idempotency.size;await proposals.acceptAndCheckout(manual.token,acceptance(manual.p));assert.equal(idempotency.size,checkoutsBeforeCredit);assert.equal((await plans.getEventPlan(manual.plan.id)).details.paidCents,35000);
 const protectedPaid=await plans.getEventPlan(sourcePlan.id);await assert.rejects(()=>plans.saveEventPlan({...protectedPaid.details,paidCents:0},protectedPaid.id,protectedPaid.version),/Verified Stripe/);
 const moved=await plans.saveEventPlan({...valid(future(110)),status:'Tentative'});await connection.query('UPDATE website.private_event_plans SET calendar_sync=$1::jsonb WHERE id=$2',[JSON.stringify({status:'changed',source:{date:future(112),startTime:'17:00',endTime:'21:00'}}),moved.id]);const movedTarget=await plans.saveEventPlan(valid(future(112))),movedProposal=await proposals.createProposal(movedTarget.id,{version:movedTarget.version,expiresAt:expiration()});await assert.rejects(()=>proposals.sendProposal(movedTarget.id,movedProposal.id,{availabilityApproved:true,capacityApproved:true,emailApproved:true}),/available/);assert.equal((await plans.getEventPlan(moved.id)).details.date,future(110),'Google conflict review never overwrites saved event data');
 const withdrawn=await approved(valid(future(92)));await proposals.acceptAndCheckout(withdrawn.token,acceptance(withdrawn.p));const withdrawnSession=[...sessions.values()].at(-1),withdrawnPlan=await plans.getEventPlan(withdrawn.plan.id);await plans.saveEventPlan({...withdrawnPlan.details,status:'Draft'},withdrawnPlan.id,withdrawnPlan.version);assert.equal((await proposals.customerProposal(withdrawn.token)).canAccept,false);await notify({...withdrawnSession,payment_status:'paid'},'evt_withdrawn');assert.equal((await plans.getEventPlan(withdrawn.plan.id)).details.status,'Draft','A withdrawn staff approval cannot be revived by a payment');
 const payload='{}' ,timestamp=Math.floor(Date.now()/1000),sig=createHmac('sha256','test').update(timestamp+'.'+payload).digest('hex');assert.ok(signature.verifyStripeSignature('test',`t=${timestamp},v1=${'0'.repeat(64)},v1=${sig}`,payload));assert.ok(!signature.verifyStripeSignature('test',`t=${timestamp-301},v1=${sig}`,payload));assert.ok(!signature.verifyStripeSignature('test',`t=NaN,v1=${sig}`,payload));
 assert.equal((await webhook.POST(new NextRequest('https://aviatorbrew.com/api/stripe/webhook',{method:'POST',body:'not-json'}))).status,400);
 console.log(`Passed changed/expired/canceled proposals, revised acceptance, paid-credit reuse, conflicting and moved Google dates, manual-payment checkout closure, protected deposit credits, failed payments and webhook security. ${stripeCalls} simulated Stripe calls; no real charges or external emails.`);
 // Manual approval uses the existing authorized save path and sends no customer email.
 const manualMailBefore=globalThis.eventTestMail.length,manualStripeBefore=stripeCalls;
 const cashDraft=await plans.saveEventPlan(valid(future(120)));
 const cashEvent=await plans.saveEventPlan({...cashDraft.details,status:'Confirmed',paidCents:35000},cashDraft.id,cashDraft.version);
 assert.equal(cashEvent.details.status,'Confirmed');assert.equal(cashEvent.details.paidCents,35000);assert.equal(globalThis.eventTestMail.length,manualMailBefore);assert.equal(stripeCalls,manualStripeBefore);
 const cashConflict=await plans.saveEventPlan(valid(future(120)));await assert.rejects(()=>plans.saveEventPlan({...cashConflict.details,status:'Confirmed'},cashConflict.id,cashConflict.version),/overlap/);
 // Deleting only the source inquiry retains the saved event, proposal snapshots and deposits.
 const inquiryCookie='aviator_manager='+createHmac('sha256',process.env.MANAGER_PORTAL_KEY).update('aviator-manager-session-v1').digest('hex');
 const deleteUrl='https://aviatorbrew.com/api/manager/inquiries?kind=event&id='+inquiry.inquiryId;
 assert.equal((await inquiryRoute.DELETE(new NextRequest(deleteUrl,{method:'DELETE'}))).status,401);
 const deletionPlanBefore=await plans.getEventPlan(sourcePlan.id),historyBefore=await proposals.listProposals(sourcePlan.id),deleteMailBefore=globalThis.eventTestMail.length;
 assert.equal((await inquiryRoute.DELETE(new NextRequest(deleteUrl,{method:'DELETE',headers:{cookie:inquiryCookie}}))).status,200);
 const deletionPlanAfter=await plans.getEventPlan(sourcePlan.id);assert.equal(deletionPlanAfter.sourceInquiryId,null);assert.deepEqual(deletionPlanAfter.details,deletionPlanBefore.details);assert.deepEqual(await proposals.listProposals(sourcePlan.id),historyBefore);assert.equal(globalThis.eventTestMail.length,deleteMailBefore);
 console.log('Passed explicit customer-email approval, duplicate-send protection, direct manual event approval without mail/checkout, conflict checks and inquiry-only deletion preserving events/proposals/payments.');
 // Availability labels and alternatives use the same buffered calendar conflicts as booking approval.
 const requestId='900001',scheduleInput={id:requestId,payload:{cateringPlan:valid(future(120))}};
 let available=(await availability.inquiryAvailability([scheduleInput])).get(requestId);
 assert.equal(available.status,'unavailable');assert.ok(available.alternatives.length>0);
 const alternatives=availability.inquiryAlternativeDates(future(120));
 assert.ok(available.alternatives.every(item=>alternatives.includes(item.date)));
 const nextDayBooking=await plans.saveEventPlan({...valid(future(121)),status:'Confirmed'});
 available=(await availability.inquiryAvailability([scheduleInput])).get(requestId);assert.ok(!available.alternatives.some(item=>item.date===nextDayBooking.details.date),'Occupied alternatives are omitted');
 assert.ok(available.alternatives.every(item=>item.startTime==='17:00'&&item.endTime==='21:00'));
 assert.equal((await availability.inquiryAvailability([{id:'900002',payload:{eventDate:future(120)}}])).get('900002').status,'incomplete');
 assert.equal((await availability.inquiryAvailability([{id:'900003',payload:{eventDate:future(120),eventTime:'5:00 PM',endTime:'9:00 PM'}}])).get('900003').status,'unavailable');
 assert.equal((await availability.inquiryAvailability([{id:'900004',payload:{eventDate:future(120),eventTime:'21:45',endTime:'22:30'}}])).get('900004').status,'unavailable','Setup and cleanup buffers are included');
 assert.equal((await availability.inquiryAvailability([{id:'900005',payload:{cateringPlan:valid(future(112))}}])).get('900005').status,'unavailable','Moved Google source dates still block availability');
 const linkedRequest=await inquiries.submitCateringInquiry({requestId:randomUUID(),humanCheck:'yes',website:'',cateringPlan:valid(future(160))});
 const linked=await plans.saveEventPlan({...valid(future(160)),status:'Confirmed',paidCents:35000},undefined,undefined,linkedRequest.inquiryId);
 assert.equal((await (await inquiryList('&id='+linkedRequest.inquiryId)).json()).inquiries[0].availability.status,'available','The inquiry does not conflict with its own saved event');assert.equal((await (await inquiryList('&id='+linkedRequest.inquiryId)).json()).inquiries[0].reviewed,true,'Existing linked events automatically show Reviewed');
 // Un-cancelling retains the menu/payments and checks availability before placing a tentative hold.
 const cancelled=await plans.saveEventPlan({...linked.details,status:'Cancelled'},linked.id,linked.version);
 const reopenMail=globalThis.eventTestMail.length;
 const reopened=await plans.saveEventPlan({...cancelled.details,status:'Tentative'},cancelled.id,cancelled.version);
 assert.deepEqual(reopened.details,{...cancelled.details,status:'Tentative'});assert.equal(globalThis.eventTestMail.length,reopenMail);
 const blockedCancel=await plans.saveEventPlan({...cashConflict.details,status:'Cancelled'},cashConflict.id,cashConflict.version);
 await assert.rejects(()=>plans.saveEventPlan({...blockedCancel.details,status:'Tentative'},blockedCancel.id,blockedCancel.version),/overlap/);
 // Delete archives rather than destroying event, proposal or payment records.
 const deleteRequest=(plan,authenticated=true,version=plan.version)=>planRoute.DELETE(new NextRequest('https://aviatorbrew.com/api/manager/event-plans/'+plan.id,{method:'DELETE',headers:{'content-type':'application/json',...(authenticated?{cookie:inquiryCookie}:{})},body:JSON.stringify({version})}),{params:Promise.resolve({id:plan.id})});
 assert.equal((await deleteRequest(reopened,false)).status,401);
 assert.equal((await deleteRequest(reopened,true,reopened.version-1)).status,409);
 const deletedQuote=await proposals.createProposal(reopened.id,{version:reopened.version,expiresAt:expiration()}),deletedHistory=await proposals.listProposals(reopened.id),deletedMail=globalThis.eventTestMail.length;
 assert.equal((await deleteRequest(reopened)).status,200);assert.equal(await plans.getEventPlan(reopened.id),null);
 assert.ok(!(await plans.listEventPlans(reopened.details.date.slice(0,7))).some(item=>item.id===reopened.id));
 const retained=(await connection.query('SELECT * FROM website.private_event_plans WHERE id=$1',[reopened.id])).rows[0];
 assert.ok(retained.deleted_at);assert.equal(retained.status,'Cancelled');assert.equal(retained.data.paidCents,35000);assert.equal(String(retained.data.deletedSourceInquiryId),linkedRequest.inquiryId);assert.equal(retained.source_inquiry_id,null);
 const archivedHistory=await proposals.listProposals(reopened.id);for(const key of ['proposals','deposits','deliveries']){const stored=rows=>key==='proposals'?rows.map(({termsCurrent,...quote})=>quote):rows;assert.deepEqual(stored(archivedHistory[key]),stored(deletedHistory[key]));}assert.equal(archivedHistory.review.emailApproved,false);assert.ok(deletedHistory.proposals.some(item=>item.id===deletedQuote.id));
 assert.equal(globalThis.eventTestMail.length,deletedMail);await assert.rejects(()=>plans.saveEventPlan(reopened.details,reopened.id,reopened.version),/deleted/);
 assert.equal((await deleteRequest(reopened)).status,200,'Repeated deletion is idempotent');
 const remainingInquiry=(await (await inquiryList('&id='+linkedRequest.inquiryId)).json()).inquiries[0];assert.ok(!remainingInquiry.planId,'The preserved inquiry can start a new plan');
 const paidArchived=await plans.getEventPlan(sourcePlan.id),ledgerBefore=(await connection.query('SELECT * FROM website.private_event_deposits WHERE plan_id=$1',[paidArchived.id])).rows;
 assert.equal((await deleteRequest(paidArchived)).status,200);assert.deepEqual((await connection.query('SELECT * FROM website.private_event_deposits WHERE plan_id=$1',[paidArchived.id])).rows,ledgerBefore,'Verified payment references survive event deletion');
 const payableDelete=await approved(valid(future(170)));await proposals.acceptAndCheckout(payableDelete.token,acceptance(payableDelete.p));const payableSession=[...sessions.values()].at(-1),payablePlan=await plans.getEventPlan(payableDelete.plan.id);
 assert.equal((await deleteRequest(payablePlan)).status,200);assert.equal(payableSession.status,'expired','Deletion closes an unpaid checkout');assert.equal((await proposals.customerProposal(payableDelete.token)).canAccept,false);
 console.log('Passed inquiry availability/nearby weekend alternatives, own-event exclusion, Google moves, buffered conflicts, un-cancel with payment/menu retention, authorized idempotent event deletion, archived records, preserved inquiries/quotes/verified payments and checkout closure.');
 // Starting a plan marks only the inquiry reviewed; it does not book or email anyone.
 const reviewedFixture=(await connection.query("INSERT INTO website.form_inquiries(kind,name,email,payload,source) VALUES('event','Reviewed inquiry fixture','reviewed@example.invalid','{}'::jsonb,'test') RETURNING id")).rows[0];
 const reviewedId=String(reviewedFixture.id),reviewedBefore=(await (await inquiryList('&id='+reviewedId)).json()).inquiries[0],countBeforeReview=(await (await inquiryList()).json()).unreviewedCount,mailBeforeReview=globalThis.eventTestMail.length;
 assert.equal(reviewedBefore.reviewed,false);assert.equal(reviewedBefore.reviewedAt,null);
 const reviewInquiry=(authenticated=true,kind='event',body={action:'review'})=>inquiryRoute.PATCH(new NextRequest('https://aviatorbrew.com/api/manager/inquiries?kind='+kind+'&id='+reviewedId,{method:'PATCH',headers:{'content-type':'application/json',...(authenticated?{cookie:inquiryCookie}:{})},body:JSON.stringify(body)}));
 assert.equal((await reviewInquiry(false)).status,401);assert.equal((await reviewInquiry(true,'catering')).status,400);assert.equal((await reviewInquiry(true,'event',{action:'confirm'})).status,400);
 const reviewResult=await (await reviewInquiry()).json();assert.equal(reviewResult.reviewed,true);assert.equal(reviewResult.unreviewedCount,countBeforeReview-1);assert.ok(reviewResult.reviewedAt);
 assert.equal((await (await reviewInquiry()).json()).reviewedAt,reviewResult.reviewedAt,'Starting the same plan twice preserves the first review time');
 const reviewedAfter=(await (await inquiryList('&id='+reviewedId)).json()).inquiries[0];assert.equal(reviewedAfter.reviewed,true);assert.equal(reviewedAfter.planId,undefined);assert.equal(globalThis.eventTestMail.length,mailBeforeReview);
 assert.equal(model.eventDisplayName({contactName:'Morgan Roberts',title:'Amedisys Hospice Christmas Party'}),'Morgan Roberts: Amedisys Hospice Christmas Party');
 assert.equal(model.eventDisplayName({contactName:'Morgan Roberts',title:'Private event — Morgan Roberts'}),'Morgan Roberts: Private event');
 assert.equal(model.eventDisplayName({contactName:'Morgan Roberts',title:'Morgan Roberts: Celebration'}),'Morgan Roberts: Celebration');
 // Inquiry pagination must include every row, including tied submission timestamps.
 await connection.query("INSERT INTO website.form_inquiries (kind,name,email,payload,source,created_at) SELECT 'event','Inquiry pagination fixture','pagination@example.invalid','{}'::jsonb,'test', '2025-01-01'::timestamptz FROM generate_series(1,7)");
 const inquiryPage1=await (await inquiryList('&q=Inquiry%20pagination%20fixture&limit=5')).json(),inquiryPage2=await (await inquiryList('&q=Inquiry%20pagination%20fixture&limit=5&offset=5')).json();
 assert.equal(inquiryPage1.total,7);assert.equal(inquiryPage1.inquiries.length,5);assert.equal(inquiryPage2.inquiries.length,2);assert.equal(inquiryPage2.offset,5);assert.equal(new Set([...inquiryPage1.inquiries,...inquiryPage2.inquiries].map(item=>item.id)).size,7);
 assert.equal((await (await inquiryList('&q=Inquiry%20pagination%20fixture&limit=5&offset=-1')).json()).offset,0);
 assert.equal((await inquiryList('&offset=5',false)).status,401);
 // Confirmed inquiries leave the working list without losing the original record.
 const reportInquiry=await inquiries.submitCateringInquiry({requestId:randomUUID(),humanCheck:'yes',website:'',cateringPlan:{...valid(future(200)),title:'Confirmed inquiry report fixture'}});
 const reportPlan=await plans.saveEventPlan({...valid(future(200)),title:'Confirmed inquiry report fixture',status:'Confirmed'},undefined,undefined,reportInquiry.inquiryId);
 assert.ok(!(await (await inquiryList()).json()).inquiries.some(item=>item.id===reportInquiry.inquiryId));
 assert.equal((await (await inquiryList('&id='+reportInquiry.inquiryId)).json()).inquiries[0].id,reportInquiry.inquiryId,'Direct audit links retain the original inquiry');
 const past=await plans.saveEventPlan({...valid('2020-06-10'),title:'Historical report fixture',status:'Completed',internalNotes:'Searchable archived office detail',paidCents:35000});
 const easternDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),yesterdayDate=new Date(new Date(easternDate+'T12:00:00Z').getTime()-86400000).toISOString().slice(0,10),nextMonthDate=new Date(Date.UTC(Number(easternDate.slice(0,4)),Number(easternDate.slice(5,7)),1)).toISOString().slice(0,10);
 const timelineToday=await plans.saveEventPlan({...valid(easternDate),title:'Manager timeline fixture today'}),timelinePast=await plans.saveEventPlan({...valid(yesterdayDate),title:'Manager timeline fixture past'}),timelineNext=await plans.saveEventPlan({...valid(nextMonthDate),title:'Manager timeline fixture next month'});
 const upcoming=await plans.listManagerEvents();assert.ok(upcoming.some(p=>p.id===timelineToday.id),'Today remains visible');assert.ok(upcoming.some(p=>p.id===timelineNext.id),'Later months are included');assert.ok(!upcoming.some(p=>p.id===timelinePast.id),'Past events are absent by default');
 assert.equal((await plans.listManagerEvents('Manager timeline fixture')).length,3);assert.ok((await plans.listManagerEvents(yesterdayDate)).some(p=>p.id===timelinePast.id));await assert.rejects(()=>plans.listManagerEvents('x'.repeat(201)),/under 200/);
 const reportRequest=(query='',authenticated=true)=>reportRoute.GET(new NextRequest('https://aviatorbrew.com/api/manager/event-reports?'+query,{headers:authenticated?{cookie:inquiryCookie}:{}}));
 assert.equal((await reportRequest('',false)).status,401);
 const pastSearch=await (await reportRequest('q=archived+office+detail&start=2020-01-01&end=2020-12-31&status=Completed')).json();assert.equal(pastSearch.total,1);assert.equal(pastSearch.events[0].id,past.id);assert.equal(pastSearch.events[0].details.foodTime,'18:00');assert.equal(pastSearch.events[0].details.paidCents,35000);
 assert.equal((await reportRequest('start=2020-02-31')).status,400);assert.equal((await reportRequest('start=2026-10-10&end=2020-01-01')).status,400);
 assert.ok(!(await plans.searchEventReports({includeDeleted:false})).events.some(item=>item.id===paidArchived.id));
 assert.ok((await plans.searchEventReports({includeDeleted:true})).events.some(item=>item.id===paidArchived.id&&item.deletedAt));
 const paged={...valid('2019-01-10'),title:'Paginated report fixture',status:'Completed'},pageIds=Array.from({length:51},()=>randomUUID());
 await connection.query("INSERT INTO website.private_event_plans(id,title,event_date,status,data) SELECT id,$2,$3,'Completed',$4::jsonb FROM unnest($1::text[]) id",[pageIds,paged.title,paged.date,JSON.stringify(paged)]);
 const page1=await plans.searchEventReports({q:paged.title}),page2=await plans.searchEventReports({q:paged.title,offset:50});assert.equal(page1.total,51);assert.equal(page1.events.length,50);assert.equal(page2.events.length,1);assert.equal(new Set([...page1.events,...page2.events].map(item=>item.id)).size,51);
 // Alternative-date offers need explicit email approval and save a tentative hold atomically.
 await plans.saveEventPlan({...valid(future(220)),status:'Confirmed'});
 const alternativeInquiry=await inquiries.submitCateringInquiry({requestId:randomUUID(),humanCheck:'yes',website:'',cateringPlan:valid(future(220))});
 const alternativePlan=await plans.saveEventPlan({...valid(future(220)),paidCents:10000,guestEmails:['other-guest@example.invalid']},undefined,undefined,alternativeInquiry.inquiryId),alternativeQuote=await proposals.createProposal(alternativePlan.id,{version:alternativePlan.version,expiresAt:expiration()});
 const alternativeInput=async()=>{const row=(await (await inquiryList('&id='+alternativeInquiry.inquiryId)).json()).inquiries[0];return {date:row.availability.alternatives[0].date,requestId:randomUUID(),subject:'Fixture alternative date',message:'Would this alternate date work? Please reply. This event is tentative, not confirmed.',expectedEmail:alternativePlan.details.contactEmail,emailApproved:true};};
 let offer=await alternativeInput();
 const offerRequest=(body,authenticated=true)=>alternativeRoute.POST(new NextRequest('https://aviatorbrew.com/api/manager/inquiries/'+alternativeInquiry.inquiryId+'/alternative',{method:'POST',headers:{'content-type':'application/json',...(authenticated?{cookie:inquiryCookie}:{})},body:JSON.stringify(body)}),{params:Promise.resolve({id:alternativeInquiry.inquiryId})});
 const beforeOfferMail=globalThis.eventTestMail.length;
 assert.equal((await offerRequest(offer,false)).status,401);assert.equal((await offerRequest({...offer,emailApproved:false})).status,403);assert.equal(globalThis.eventTestMail.length,beforeOfferMail);
 await plans.saveEventPlan({...valid(offer.date),status:'Confirmed'});assert.equal((await offerRequest(offer)).status,409,'Availability is rechecked before any date change');assert.equal((await plans.getEventPlan(alternativePlan.id)).details.date,alternativePlan.details.date);
 offer=await alternativeInput();assert.equal((await offerRequest({...offer,expectedEmail:'wrong@example.invalid'})).status,409);
 globalThis.eventTestFailMail=true;const failedOffer=await (await offerRequest(offer)).json();globalThis.eventTestFailMail=false;
 assert.equal(failedOffer.failed.length,1);assert.equal(failedOffer.plan.details.status,'Tentative');assert.equal(failedOffer.plan.details.date,offer.date);assert.equal(failedOffer.plan.details.paidCents,10000);assert.deepEqual(failedOffer.plan.details.flightPlan,alternativePlan.details.flightPlan);
 const retryOffer=await (await offerRequest(offer)).json();assert.equal(retryOffer.sent.length,1);assert.equal(retryOffer.plan.version,failedOffer.plan.version);assert.equal(globalThis.eventTestMail.at(-1).to,alternativePlan.details.contactEmail,'Only the approved contact receives the offer');
 const sentOfferMail=globalThis.eventTestMail.length;await offerRequest(offer);assert.equal(globalThis.eventTestMail.length,sentOfferMail,'Duplicate requests do not resend email or move the event again');
 const updatedInquiry=(await connection.query('SELECT payload FROM website.form_inquiries WHERE id=$1',[alternativeInquiry.inquiryId])).rows[0].payload;assert.equal(updatedInquiry.eventDate,offer.date);assert.equal(updatedInquiry.cateringPlan.date,offer.date);assert.equal(updatedInquiry.eventDateHistory.length,1);
 assert.equal((await proposals.getManagerProposal(alternativePlan.id,alternativeQuote.id)).snapshot.details.date,alternativePlan.details.date,'Issued snapshots do not change with the new date');
 const rescheduleCurrent=await plans.getEventPlan(alternativePlan.id);await plans.saveEventPlan({...rescheduleCurrent.details,date:future(220),status:'Draft'},rescheduleCurrent.id,rescheduleCurrent.version);
 const secondAlternatives=(await (await inquiryList('&id='+alternativeInquiry.inquiryId)).json()).inquiries[0].availability.alternatives;
 const secondOffer={...offer,date:secondAlternatives.find(item=>item.date!==offer.date).date,requestId:randomUUID()};assert.equal((await offerRequest(secondOffer)).status,200);
 const beforeReplayMail=globalThis.eventTestMail.length;assert.equal((await offerRequest(offer)).status,409);assert.equal(globalThis.eventTestMail.length,beforeReplayMail);assert.equal((await plans.getEventPlan(alternativePlan.id)).details.date,secondOffer.date,'An obsolete request cannot move the event back');
 const unsavedInquiry=await inquiries.submitCateringInquiry({requestId:randomUUID(),humanCheck:'yes',website:'',cateringPlan:valid(future(220))});
 const unsavedDate=(await (await inquiryList('&id='+unsavedInquiry.inquiryId)).json()).inquiries[0].availability.alternatives[0].date;
 const unsavedOfferResponse=await alternativeRoute.POST(new NextRequest('https://aviatorbrew.com/api/manager/inquiries/'+unsavedInquiry.inquiryId+'/alternative',{method:'POST',headers:{'content-type':'application/json',cookie:inquiryCookie},body:JSON.stringify({...offer,date:unsavedDate,requestId:randomUUID()})}),{params:Promise.resolve({id:unsavedInquiry.inquiryId})});assert.equal(unsavedOfferResponse.status,200);const newTentative=(await unsavedOfferResponse.json()).plan;assert.equal(newTentative.sourceInquiryId,unsavedInquiry.inquiryId);assert.equal(newTentative.details.status,'Tentative');assert.equal(newTentative.details.foodTime,'18:00');
 // Only proposals never approved/sent/accepted and without delivery or payment history can be deleted.
 const deleteDraft=(planId,proposal,authenticated=true)=>proposalRoute.DELETE(new NextRequest(`https://aviatorbrew.com/api/manager/event-plans/${planId}/proposals/${proposal.id}`,{method:'DELETE',headers:{'content-type':'application/json',...(authenticated?{cookie:inquiryCookie}:{})},body:JSON.stringify({version:proposal.version})}),{params:Promise.resolve({id:planId,proposalId:proposal.id})});
 assert.equal((await deleteDraft(alternativePlan.id,alternativeQuote,false)).status,401);assert.equal((await deleteDraft(alternativePlan.id,alternativeQuote)).status,200);assert.equal(await proposals.getManagerProposal(alternativePlan.id,alternativeQuote.id),null);
 assert.equal((await deleteDraft(reportPlan.id,await proposals.createProposal(reportPlan.id,{version:reportPlan.version,expiresAt:expiration()}))).status,200);
 assert.equal((await deleteDraft(payableDelete.plan.id,payableDelete.p)).status,409,'Sent proposals are retained even after their event is deleted');
 const failingSentPlan=await plans.saveEventPlan(valid(future(240))),failingSentProposal=await proposals.createProposal(failingSentPlan.id,{version:failingSentPlan.version,expiresAt:expiration()});globalThis.eventTestFailMail=true;
 await assert.rejects(()=>proposals.sendProposal(failingSentPlan.id,failingSentProposal.id,{availabilityApproved:true,capacityApproved:true,emailApproved:true}),/email was not delivered/);globalThis.eventTestFailMail=false;assert.equal((await deleteDraft(failingSentPlan.id,failingSentProposal)).status,409,'In-flight or failed approved sends cannot race draft deletion');
 await connection.query("UPDATE website.private_event_proposals SET state='superseded',approved_at=NULL,token_hash=NULL WHERE id=$1",[failingSentProposal.id]);assert.equal((await deleteDraft(failingSentPlan.id,failingSentProposal)).status,409,'Withdrawing approval and superseding an attempted send cannot enable deletion');
 // Stored review belongs to the current terms and exact proposal, not an event revision number.
 let reviewPlan=await plans.saveEventPlan(valid(future(260)));
 const approveReview=async()=>{const r=(await proposals.listProposals(reviewPlan.id)).review;return proposals.saveProposalReview(reviewPlan.id,{...r,availabilityApproved:true,capacityApproved:true,emailApproved:true});};
 await approveReview();const firstReviewDraft=await proposals.createProposal(reviewPlan.id,{version:reviewPlan.version,expiresAt:expiration()});
 assert.equal((await proposals.listProposals(reviewPlan.id)).review.emailApproved,false,'A new draft clears all review approvals');
 const firstReview=await approveReview();
 reviewPlan=await plans.saveEventPlan({...reviewPlan.details,internalNotes:'Changed internal office note'},reviewPlan.id,reviewPlan.version);
 assert.equal((await proposals.listProposals(reviewPlan.id)).review.emailApproved,true,'Internal notes do not change the reviewed customer terms');
 reviewPlan=await plans.saveEventPlan(reviewPlan.details,reviewPlan.id,reviewPlan.version);
 assert.equal((await proposals.listProposals(reviewPlan.id)).review.capacityApproved,true,'Saving unchanged terms preserves approvals');
 reviewPlan=await plans.saveEventPlan({...reviewPlan.details,guestCount:51},reviewPlan.id,reviewPlan.version);
 assert.equal((await proposals.listProposals(reviewPlan.id)).review.emailApproved,false);
 await assert.rejects(()=>proposals.saveProposalReview(reviewPlan.id,firstReview),/changed/);
 reviewPlan=await plans.saveEventPlan({...reviewPlan.details,guestCount:50},reviewPlan.id,reviewPlan.version);
 assert.equal((await proposals.listProposals(reviewPlan.id)).review.emailApproved,false,'Reverting terms cannot restore an old approval');
 for(const change of [{contactEmail:'revised@example.invalid'},{paidCents:1000},{date:future(261)},{status:'Cancelled'},{status:'Tentative'}]){
   await approveReview();reviewPlan=await plans.saveEventPlan({...reviewPlan.details,...change},reviewPlan.id,reviewPlan.version);
   const r=(await proposals.listProposals(reviewPlan.id)).review;assert.equal(r.emailApproved,false);assert.equal(r.availabilityApproved,false);assert.equal(r.capacityApproved,false);
 }
 const secondReviewDraft=await proposals.createProposal(reviewPlan.id,{version:reviewPlan.version,expiresAt:expiration()});const secondReview=await approveReview();
 await assert.rejects(()=>proposals.sendProposal(reviewPlan.id,firstReviewDraft.id,{availabilityApproved:true,capacityApproved:true,emailApproved:true,reviewContext:secondReview.context}),/approvals changed/);
 await proposals.deleteProposalDraft(reviewPlan.id,secondReviewDraft.id,secondReviewDraft.version);
 assert.equal((await proposals.listProposals(reviewPlan.id)).review.emailApproved,false,'Deleting a draft does not restore approval of an older version');
 console.log('Passed authorized persistent staff approvals, unchanged-term refresh/save/send persistence, explicit revocation, stale-context blocking, exact proposal binding, new-draft/deletion/material-change reset and internal-note preservation.');
 console.log('Passed confirmed inquiry filtering, preserved audit links, protected historical reports/search/pagination, alternative-date approval and conflict checks, tentative scheduling, contact-only mail, failed-send retry idempotence, unchanged quote snapshots, and unsent-only proposal deletion.');
 // Linking a Google duplicate is an explicit manager action, never an availability bypass.
 const calendarMatches=require(await compile(path.join(root,'src/lib/event-calendar-matches.ts')));
 const calendarMatchRoute=require(await compile(path.join(root,'src/app/api/manager/event-plans/[id]/calendar-match/route.ts')));
 const calendarSync=await import('./ready-room-calendar-sync.mjs');
 const calendarFixture=async(date,title='Amedisys x-mas party',startTime='18:00')=>{
   const id=randomUUID(),source={id:'fixture-google-'+id,title,date,startTime,endTime:'21:00',description:'Preserved Google notes',url:'https://calendar.google.com/fixture',location:catalog.venue,cancelled:false,recurring:false};
   const data={...model.emptyEventPlan(),title,date,startTime,endTime:'21:00',status:'Confirmed',internalNotes:'Preserved original calendar notes'};
   await connection.query('INSERT INTO website.private_event_plans(id,title,event_date,status,data,calendar_sync) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)',[id,title,date,'Confirmed',JSON.stringify(data),JSON.stringify({calendarId:calendarSync.calendarId,eventId:source.id,status:'active',source,checkedAt:new Date().toISOString()})]);
   return {id,source};
 };
 const managerCookie='aviator_manager='+createHmac('sha256',process.env.MANAGER_PORTAL_KEY).update('aviator-manager-session-v1').digest('hex');
 const matchRequest=(id,body,authenticated=true)=>new NextRequest('https://aviatorbrew.com/api/manager/event-plans/'+id+'/calendar-match',{method:body?'POST':'GET',headers:{...(authenticated?{cookie:managerCookie}:{}),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const linkFixturePlan=await plans.saveEventPlan({...valid(future(320)),title:'Amedisys Hospice Christmas Party',notes:'Authoritative website event notes',barDetails:'Website bar instructions',paidCents:15000}),googleFixture=await calendarFixture(future(321));
 const beforeLinkDraft=await proposals.createProposal(linkFixturePlan.id,{version:linkFixturePlan.version,expiresAt:expiration()});
 const websiteReview=(await proposals.listProposals(linkFixturePlan.id)).review;await proposals.saveProposalReview(linkFixturePlan.id,{...websiteReview,emailApproved:true});
 const linkContext={params:Promise.resolve({id:linkFixturePlan.id})};
 assert.equal((await calendarMatchRoute.GET(matchRequest(linkFixturePlan.id,undefined,false),linkContext)).status,401);
 const matches=(await (await calendarMatchRoute.GET(matchRequest(linkFixturePlan.id),linkContext)).json()).matches;assert.equal(matches.length,1);assert.equal(matches[0].id,googleFixture.id);
 const linkInput={sameEvent:true,version:linkFixturePlan.version,matchId:matches[0].id,matchVersion:matches[0].version,fingerprint:matches[0].fingerprint};
 assert.equal((await calendarMatchRoute.POST(matchRequest(linkFixturePlan.id,linkInput,false),linkContext)).status,401);
 assert.equal((await calendarMatchRoute.POST(matchRequest(linkFixturePlan.id,{...linkInput,sameEvent:false}),linkContext)).status,403);
 assert.equal((await calendarMatchRoute.POST(matchRequest(linkFixturePlan.id,{...linkInput,version:999}),linkContext)).status,409);
 assert.equal((await calendarMatchRoute.POST(matchRequest(linkFixturePlan.id,{...linkInput,fingerprint:'stale'}),linkContext)).status,409);
 const mailBeforeLink=globalThis.eventTestMail.length;
 const linkedResponse=await calendarMatchRoute.POST(matchRequest(linkFixturePlan.id,linkInput),linkContext);assert.equal(linkedResponse.status,200);
 const linkedBody=await linkedResponse.json(),linkedPlan=linkedBody.plan;assert.equal(linkedBody.googleScheduleDiffers,true);assert.deepEqual(linkedPlan.details,linkFixturePlan.details,'Every website event detail, including status and schedule, must remain unchanged');
 assert.deepEqual(linkedPlan.details.flightPlan,linkFixturePlan.details.flightPlan);assert.equal(linkedPlan.details.contactEmail,linkFixturePlan.details.contactEmail);assert.equal(linkedPlan.details.internalNotes,linkFixturePlan.details.internalNotes);assert.equal(globalThis.eventTestMail.length,mailBeforeLink,'Linking must not send any customer email');
 assert.equal(await plans.getEventPlan(googleFixture.id),null);const archivedGoogle=await plans.getEventReport(googleFixture.id);assert.ok(archivedGoogle.deletedAt);assert.equal(archivedGoogle.calendarSync.linkedToPlanId,linkedPlan.id);assert.equal(archivedGoogle.details.internalNotes,'Preserved original calendar notes');
 const linkedProposals=await proposals.listProposals(linkedPlan.id);assert.equal(linkedProposals.proposals[0].termsCurrent,true);assert.equal(linkedProposals.review.emailApproved,true);assert.equal(linkedProposals.proposals[0].snapshot.details.date,beforeLinkDraft.snapshot.details.date,'Issued snapshots must never change');
 assert.equal((await calendarMatches.getCalendarEventMatches(linkedPlan.id)).matches.length,0);
 await assert.rejects(()=>plans.saveEventPlan({...valid(linkedPlan.details.date),status:'Confirmed'}),/overlap/,'A linked draft retains a calendar hold at the website date/time');
 const heldAvailability=await availability.inquiryAvailability([{id:'900001',payload:{cateringPlan:valid(linkedPlan.details.date)}},{id:'900002',payload:{cateringPlan:valid(googleFixture.source.date)}}]);assert.equal(heldAvailability.get('900001').status,'unavailable');assert.equal(heldAvailability.get('900002').status,'available');
 const blockedDraft=await plans.saveEventPlan({...valid(linkedPlan.details.date),title:'A separate conflicting proposal'}),blockedDraftQuote=await proposals.createProposal(blockedDraft.id,{version:blockedDraft.version,expiresAt:expiration()});
 await assert.rejects(()=>proposals.sendProposal(blockedDraft.id,blockedDraftQuote.id,{emailApproved:true}),/no longer available/,'Another proposal cannot book over the linked draft hold');
 const releasedGoogleDate=await plans.saveEventPlan({...valid(googleFixture.source.date),status:'Confirmed'});assert.ok(releasedGoogleDate,'The old Google schedule must not reserve a second date');
 assert.equal((await calendarMatchRoute.POST(matchRequest(linkFixturePlan.id,linkInput),linkContext)).status,409,'A repeated link cannot archive another event');
 const syncNow=new Date(),syncSnapshot={events:new Map([[googleFixture.source.id,googleFixture.source]]),from:new Date(syncNow-32*86400000),to:new Date(syncNow.getTime()+730*86400000),importFrom:booking.easternToday(),importTo:future(730)};
 await calendarSync.applyCalendarSnapshot(connection,syncSnapshot,model.emptyEventPlan);
 assert.equal(Number((await connection.query("SELECT count(*) FROM website.private_event_plans WHERE calendar_sync->>'eventId'=$1 AND deleted_at IS NULL",[googleFixture.source.id])).rows[0].count),1,'Scheduled sync cannot recreate the duplicate');
 assert.equal((await plans.getEventPlan(linkedPlan.id)).calendarSync.status,'changed');assert.deepEqual((await plans.getEventPlan(linkedPlan.id)).details,linkFixturePlan.details,'Google sync never overwrites website details');
 // Matching the exact schedule preserves staff review and allows the normal send checks to run.
 const exactPlan=await plans.saveEventPlan({...valid(future(330)),title:'Amedisys website event'}),exactGoogle=await calendarFixture(future(330),'Amedisys Google event','17:00');
 const exactDraft=await proposals.createProposal(exactPlan.id,{version:exactPlan.version,expiresAt:expiration()}),exactReview=(await proposals.listProposals(exactPlan.id)).review;
 await proposals.saveProposalReview(exactPlan.id,{...exactReview,emailApproved:true});
 const exactMatch=(await calendarMatches.getCalendarEventMatches(exactPlan.id)).matches.find(m=>m.id===exactGoogle.id);
 const exactResult=await calendarMatches.linkCalendarEvent(exactPlan.id,{sameEvent:true,version:exactPlan.version,matchId:exactMatch.id,matchVersion:exactMatch.version,fingerprint:exactMatch.fingerprint});assert.equal(exactResult.googleScheduleDiffers,false);
 const afterExact=await proposals.listProposals(exactPlan.id);assert.equal(afterExact.proposals[0].termsCurrent,true);assert.equal(afterExact.review.emailApproved,true);
 await proposals.sendProposal(exactPlan.id,exactDraft.id,{emailApproved:true,reviewContext:afterExact.review.context});
 // A separate overlapping booking remains a conflict and rolls the entire link back.
 const conflictPlan=await plans.saveEventPlan({...valid(future(340)),title:'Amedisys fixture'}),conflictGoogle=await calendarFixture(future(340));await calendarFixture(future(340),'Unrelated separate booking');
 const conflictMatch=(await calendarMatches.getCalendarEventMatches(conflictPlan.id)).matches.find(m=>m.id===conflictGoogle.id);
 await assert.rejects(()=>calendarMatches.linkCalendarEvent(conflictPlan.id,{sameEvent:true,version:conflictPlan.version,matchId:conflictMatch.id,matchVersion:conflictMatch.version,fingerprint:conflictMatch.fingerprint}),/separate booking/);
 assert.ok(await plans.getEventPlan(conflictGoogle.id));assert.equal((await plans.getEventPlan(conflictPlan.id)).calendarSync?.eventId,undefined);
 const protectedPlan=await plans.saveEventPlan({...valid(future(350)),title:'Amedisys protected fixture'}),protectedGoogle=await calendarFixture(future(350));
 const protectedInitial=await plans.getEventPlan(protectedGoogle.id),protectedImported=await plans.saveEventPlan({...protectedInitial.details,contactName:'Fixture Customer',contactEmail:'fixture@example.invalid'},protectedInitial.id,protectedInitial.version);await proposals.createProposal(protectedImported.id,{version:protectedImported.version,expiresAt:expiration()});
 const protectedMatch=(await calendarMatches.getCalendarEventMatches(protectedPlan.id)).matches.find(m=>m.id===protectedGoogle.id);
 await assert.rejects(()=>calendarMatches.linkCalendarEvent(protectedPlan.id,{sameEvent:true,version:protectedPlan.version,matchId:protectedMatch.id,matchVersion:protectedMatch.version,fingerprint:protectedMatch.fingerprint}),/proposal or payment history/);
 assert.ok(await plans.getEventPlan(protectedGoogle.id));
 console.log('Passed authenticated explicit Google duplicate matching/linking, stale-review protection, authoritative website details and schedule, preserved menus/contact/prices/notes/status/quote snapshots/history, silent linking, website-only calendar holds, approval preservation, normal sending after linking, sync identity and real-conflict rollback.');
 // Leave only safe current catalog settings for the separate local browser fixture.
 await settings.setPrivateEventSettings({catering:catalog});
 const managerAppEvent=await approved({...staffFood,date:future(365)}),managerAppCustomer=await proposals.customerProposal(managerAppEvent.token);
 assert.deepEqual(managerAppCustomer.proposal.snapshot.details.flightPlan.appetizers,staffFood.flightPlan.appetizers,'Selected dishes remain on the actual customer quote');
 assert.ok(!managerAppCustomer.proposal.snapshot.catalog.menu.appetizers.includes('Chicken Fingers'),'Unused manager choices stay private in customer proposal data');
 assert.equal(managerAppCustomer.proposal.snapshot.totals.subtotal,190000+50*300*2);
 const managerAppSaved=await plans.getEventPlan(managerAppEvent.plan.id),managerAppKitchen=documents.kitchenSheetHtml(managerAppSaved,catalog,true);
 assert.ok(managerAppKitchen.includes('Chicken Fingers')&&managerAppKitchen.includes('Loaded Tots'),'Kitchen production sheets retain the staff-selected foods');
 assert.ok((await settings.getPrivateEventSettings()).catering.managerOnlyItems.includes('Loaded Tots'),'Manager visibility settings round-trip through the existing backend');
 const customPriceEvent=await approved({...customExtraParsed,date:future(366)}),savedCustomPriceEvent=await plans.getEventPlan(customPriceEvent.plan.id);
 assert.equal(savedCustomPriceEvent.details.flightPlan.extraAppetizerPriceCents,225);assert.equal(savedCustomPriceEvent.details.flightPlan.extraEntreePriceCents,450);assert.equal(savedCustomPriceEvent.details.flightPlan.extraPremiumEntreePriceCents,650);
 const originalPriceProposal=await proposals.getManagerProposal(customPriceEvent.plan.id,customPriceEvent.p.id),changedPriceEvent=await plans.saveEventPlan({...savedCustomPriceEvent.details,flightPlan:{...savedCustomPriceEvent.details.flightPlan,extraEntreePriceCents:475}},savedCustomPriceEvent.id,savedCustomPriceEvent.version);
 assert.equal((await proposals.listProposals(savedCustomPriceEvent.id)).proposals[0].termsCurrent,false,'Saved price edits invalidate sending the old proposal');
 const revisedPriceProposal=await proposals.createProposal(savedCustomPriceEvent.id,{version:changedPriceEvent.version,expiresAt:new Date(Date.now()+7*86400000).toISOString()});
 assert.equal(revisedPriceProposal.snapshot.totals.subtotal,originalPriceProposal.snapshot.totals.subtotal+50*25);
 assert.equal((await proposals.getManagerProposal(savedCustomPriceEvent.id,customPriceEvent.p.id)).snapshot.details.flightPlan.extraEntreePriceCents,450,'Issued quote retains its original staff price');
 { // Customer approval of paid revisions, exact-version change requests and notification history.
 const paidReview=await approved({...valid(future(400)),paidCents:35000});
 const paidEmail=globalThis.eventTestMail.at(-1);assert.ok(paidEmail.html.includes('Review & Approve Proposal'));assert.ok(paidEmail.html.includes('No additional deposit payment'));assert.ok(paidEmail.html.includes('Request a Change'));assert.ok(paidEmail.html.includes('/event-proposal?view=changes#token='));assert.ok(!paidEmail.html.includes('/manager/'));
 const callsBeforePaidApproval=stripeCalls;await proposals.acceptAndCheckout(paidReview.token,acceptance(paidReview.p));assert.equal(stripeCalls,callsBeforePaidApproval,'Paid approval creates no new checkout');
 const acceptedFirst=await proposals.getManagerProposal(paidReview.plan.id,paidReview.p.id);assert.ok(acceptedFirst.accepted_at);assert.equal(acceptedFirst.version,1);
 let paidPlan=await plans.getEventPlan(paidReview.plan.id);paidPlan=await plans.saveEventPlan({...paidPlan.details,flightPlan:{...paidPlan.details.flightPlan,appetizers:['Hush Puppies','Hush Puppies','Tater Tots']}},paidPlan.id,paidPlan.version);
 const requestedRevision=await proposals.createProposal(paidPlan.id,{version:paidPlan.version,expiresAt:expiration()});await proposals.sendProposal(paidPlan.id,requestedRevision.id,{availabilityApproved:true,capacityApproved:true,emailApproved:true});const requestedToken=globalThis.eventTestMail.at(-1).text.match(/#token=([a-f0-9]{64})/)[1];
 assert.equal((await proposals.customerProposal(requestedToken)).recordedPaidCents,35000);assert.equal((await proposals.customerProposal(requestedToken)).canAccept,true);
 const changeInput={requestId:randomUUID(),proposalVersion:requestedRevision.version,name:'Fixture Customer',message:'Please change the side to collard greens.\nKeep our existing deposit.',userAgent:'Fixture change browser',ip:'127.0.0.1'};
 const mailBeforeChange=globalThis.eventTestMail.length,changeResults=await Promise.all([proposals.requestProposalChange(requestedToken,changeInput),proposals.requestProposalChange(requestedToken,changeInput)]);
 assert.equal(changeResults[0].requestId,changeResults[1].requestId);assert.equal(globalThis.eventTestMail.length,mailBeforeChange+1,'Duplicate request sends one staff notification');assert.equal(globalThis.eventTestMail.at(-1).to,'events@aviatorbrew.com');assert.ok(globalThis.eventTestMail.at(-1).text.includes(changeInput.message));assert.ok(globalThis.eventTestMail.at(-1).text.includes('/manager/private-events?event='));
 const changeView=await proposals.customerProposal(requestedToken);assert.equal(changeView.canAccept,false);assert.equal(changeView.changeRequests.length,1);assert.equal(changeView.changeRequests[0].message,changeInput.message);assert.ok(changeView.status.includes('Changes requested'));assert.equal(changeView.recordedPaidCents,35000);
 const changeManager=await proposals.listProposals(paidPlan.id);assert.equal(changeManager.changeRequests[0].notification_status,'sent');assert.equal(changeManager.changeRequests[0].proposal_id,requestedRevision.id);assert.equal((await plans.getEventPlan(paidPlan.id)).details.flightPlan.sides[0],'Mac & Cheese','Requests never silently edit menus');
 assert.equal((await proposals.getManagerProposal(paidPlan.id,paidReview.p.id)).accepted_at,acceptedFirst.accepted_at,'Old customer acceptance remains associated with its version');
 await assert.rejects(()=>proposals.acceptAndCheckout(requestedToken,acceptance(requestedRevision)));await assert.rejects(()=>proposals.sendProposal(paidPlan.id,requestedRevision.id,{emailApproved:true}));
 for(const input of [{...changeInput,proposalVersion:999},{...changeInput,message:''},{...changeInput,name:'A'},{...changeInput,requestId:'bad'},{...changeInput,message:'x'.repeat(3001)},{...changeInput,message:'Different message with reused id'}])await assert.rejects(()=>proposals.requestProposalChange(requestedToken,input));
 await assert.rejects(()=>proposals.requestProposalChange('0'.repeat(64),changeInput));
 const requestMetadata=(await connection.query('SELECT metadata FROM website.private_event_proposal_changes WHERE id=$1',[changeResults[0].requestId])).rows[0].metadata;assert.equal(requestMetadata.proposalVersion,requestedRevision.version);assert.ok(requestMetadata.ipHash&&!JSON.stringify(requestMetadata).includes('127.0.0.1'));
 paidPlan=await plans.getEventPlan(paidPlan.id);paidPlan=await plans.saveEventPlan({...paidPlan.details,flightPlan:{...paidPlan.details.flightPlan,sides:['Collard Greens','Potato Salad']}},paidPlan.id,paidPlan.version);
 const approvedRevision=await proposals.createProposal(paidPlan.id,{version:paidPlan.version,expiresAt:expiration()});await proposals.sendProposal(paidPlan.id,approvedRevision.id,{availabilityApproved:true,capacityApproved:true,emailApproved:true});const approvedToken=globalThis.eventTestMail.at(-1).text.match(/#token=([a-f0-9]{64})/)[1];
 await assert.rejects(()=>proposals.requestProposalChange(requestedToken,{...changeInput,requestId:randomUUID()}));const callsBeforeRevision=stripeCalls;await proposals.acceptAndCheckout(approvedToken,acceptance(approvedRevision));assert.equal(stripeCalls,callsBeforeRevision);assert.equal((await proposals.customerProposal(approvedToken)).status,'Confirmed');
 assert.equal((await proposals.getManagerProposal(paidPlan.id,approvedRevision.id)).version,3);assert.equal((await proposals.listProposals(paidPlan.id)).changeRequests.length,1);
 globalThis.eventTestFailMail=true;const failedChange={requestId:randomUUID(),proposalVersion:approvedRevision.version,name:'Fixture Customer',message:'Could we adjust the food service time?'};const failedResult=await proposals.requestProposalChange(approvedToken,failedChange);assert.equal(failedResult.notified,false);assert.equal((await proposals.listProposals(paidPlan.id)).changeRequests[0].notification_status,'failed');globalThis.eventTestFailMail=false;
 const retriedChange=await proposals.requestProposalChange(approvedToken,failedChange);assert.equal(retriedChange.requestId,failedResult.requestId);assert.equal(retriedChange.notified,true);assert.equal((await proposals.listProposals(paidPlan.id)).changeRequests.length,2);
 const unpaidChanges=await approved(valid(future(401))),unpaidCheckout=await proposals.acceptAndCheckout(unpaidChanges.token,acceptance(unpaidChanges.p)),unpaidSession=sessions.get(unpaidCheckout.url.split('/').at(-1));
 await proposals.requestProposalChange(unpaidChanges.token,{requestId:randomUUID(),proposalVersion:unpaidChanges.p.version,name:'Fixture Customer',message:'Please revise the food choices before confirming.'});unpaidSession.payment_status='paid';assert.equal((await notify(unpaidSession)).status,200);assert.equal((await plans.getEventPlan(unpaidChanges.plan.id)).details.status,'Confirmed','Payment preserves the previously accepted reservation while requested changes remain unapproved');assert.equal((await proposals.getManagerProposal(unpaidChanges.plan.id,unpaidChanges.p.id)).state,'changes_requested');assert.equal((await proposals.customerProposal(unpaidChanges.token)).recordedPaidCents,35000);
 const requestApi=require(await compile(path.join(root,'src/app/api/event-proposals/route.ts')));const apiResult=await requestApi.POST(new NextRequest('https://aviatorbrew.com/api/event-proposals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'request-change',token:approvedToken,...failedChange})}));assert.equal(apiResult.status,200);assert.equal((await apiResult.json()).requestId,failedResult.requestId);
 await connection.query("UPDATE website.private_event_proposals SET expires_at=now()-interval '1 minute' WHERE id=$1",[unpaidChanges.p.id]);await assert.rejects(()=>proposals.requestProposalChange(unpaidChanges.token,{requestId:randomUUID(),proposalVersion:unpaidChanges.p.version,name:'Fixture Customer',message:'Expired link'}));
 console.log('Passed paid revision approval without checkout, exact-version acceptance, secure change links/forms, stored messages and metadata, manager request history, staff-only notification, concurrent idempotence, failed-email retry, revised proposals, expired/stale/invalid requests, request API and preserved late-payment credits without false confirmation.');
 }
 { // Manual proposal acceptance records evidence without email, payment or booking side effects.
 const statusModule=require(await compile(path.join(root,'src/lib/event-proposal-status.ts')));
 const manualPlan=await plans.saveEventPlan(valid(future(500))),manualDraft=await proposals.createProposal(manualPlan.id,{version:manualPlan.version,expiresAt:expiration()});
 const input={version:manualDraft.version,planVersion:manualPlan.version,name:'Fixture Customer',note:'Accepted by phone. STAFF NOTE <script>private</script>',confirmed:true};
 const request=(body,authenticated=true)=>new NextRequest('https://aviatorbrew.com/api/manager/event-plans/'+manualPlan.id+'/proposals/'+manualDraft.id,{method:'POST',headers:{'content-type':'application/json',...(authenticated?{cookie:managerCookie}:{})},body:JSON.stringify({action:'manual-accept',...body})});
 const context={params:Promise.resolve({id:manualPlan.id,proposalId:manualDraft.id})};
 assert.equal((await proposalRoute.POST(request(input,false),context)).status,401);
 assert.equal((await proposalRoute.POST(request({...input,confirmed:false}),context)).status,400);
 const mailCount=globalThis.eventTestMail.length,checkoutCount=stripeCalls;
 const accepted=await Promise.all([proposals.manuallyAcceptProposal(manualPlan.id,manualDraft.id,input),proposals.manuallyAcceptProposal(manualPlan.id,manualDraft.id,input)]);
 assert.equal(accepted[0].accepted_at,accepted[1].accepted_at);assert.equal(accepted[0].acceptanceMethod,'manual');assert.equal(accepted[0].manualAcceptanceNote,input.note);
 assert.equal(statusModule.proposalStatus(accepted[0]).label,'Manual Accepted');
 assert.equal(globalThis.eventTestMail.length,mailCount);assert.equal(stripeCalls,checkoutCount);assert.deepEqual(await plans.getEventPlan(manualPlan.id),manualPlan,'Manual acceptance changes no event details, booking status, version or payments');
 assert.equal((await proposalRoute.POST(request(input),context)).status,200,'Recording acceptance requires manager authorization but no customer-email approval');
 const audit=(await connection.query('SELECT acceptance FROM website.private_event_proposals WHERE id=$1',[manualDraft.id])).rows[0].acceptance;assert.equal(audit.method,'manual');assert.equal(audit.proposalVersion,manualDraft.version);assert.equal(audit.policyVersion,manualDraft.snapshot.policyVersion);assert.equal(audit.recordedBy,'manager-session');
 for(const bad of [{...input,name:'X'},{...input,note:'x'.repeat(2001)},{...input,version:99},{...input,planVersion:99},{...input,name:'Different customer'},{...input,note:'Changed evidence'}])await assert.rejects(()=>proposals.manuallyAcceptProposal(manualPlan.id,manualDraft.id,bad));
 await assert.rejects(()=>proposals.deleteProposalDraft(manualPlan.id,manualDraft.id,manualDraft.version));
 assert.equal((await proposals.listProposals(manualPlan.id)).proposals[0].acceptanceMethod,'manual');
 await proposals.sendProposal(manualPlan.id,manualDraft.id,{availabilityApproved:true,capacityApproved:true,emailApproved:true});const manualToken=globalThis.eventTestMail.at(-1).text.match(/#token=([a-f0-9]{64})/)[1],customerManual=await proposals.customerProposal(manualToken);
 assert.equal(customerManual.proposal.acceptanceMethod,'manual');assert.ok(!JSON.stringify(customerManual).includes('STAFF NOTE'));assert.ok(!Object.hasOwn(customerManual.proposal,'manualAcceptanceNote'));assert.ok(!Object.hasOwn(customerManual.proposal,'acceptance'));
 await writeFile('/tmp/aviator-manual-acceptance-proposal.pdf',await documents.proposalPdf(customerManual.proposal));
 assert.equal((await plans.getEventPlan(manualPlan.id)).details.status,'Confirmed');assert.equal((await plans.getEventPlan(manualPlan.id)).details.paidCents,0);
 const livePlan=await plans.getEventPlan(manualPlan.id),next=await proposals.createProposal(livePlan.id,{version:livePlan.version,expiresAt:expiration()});assert.equal(statusModule.proposalStatus(next).label,'Draft');await assert.rejects(()=>proposals.manuallyAcceptProposal(manualPlan.id,manualDraft.id,{...input,planVersion:livePlan.version}));
 const online=await approved(valid(future(501)));await proposals.acceptAndCheckout(online.token,acceptance(online.p));assert.equal((await plans.getEventPlan(online.plan.id)).details.status,'Confirmed');const onlineCurrent=await plans.getEventPlan(online.plan.id),onlineAccepted=await proposals.getManagerProposal(online.plan.id,online.p.id);assert.equal(onlineAccepted.acceptanceMethod,'customer');assert.equal(statusModule.proposalStatus(onlineAccepted).label,'Customer Accepted');await assert.rejects(()=>proposals.manuallyAcceptProposal(online.plan.id,online.p.id,{...input,version:online.p.version,planVersion:onlineCurrent.version}));
 for(const [offset,state] of [[502,'cancelled'],[503,'declined'],[504,'changes_requested'],[505,'superseded'],[506,'expired'],[507,'stale'],[508,'closed'],[509,'policies']]){
  const plan=await plans.saveEventPlan(valid(future(offset))),p=await proposals.createProposal(plan.id,{version:plan.version,expiresAt:expiration()});
  if(state==='expired')await connection.query("UPDATE website.private_event_proposals SET expires_at=now()-interval '1 minute' WHERE id=$1",[p.id]);
  else if(state==='stale')await plans.saveEventPlan({...plan.details,guestCount:51},plan.id,plan.version);
  else if(state==='closed')await plans.saveEventPlan({...plan.details,status:'Cancelled'},plan.id,plan.version);
  else if(state==='policies')await connection.query("UPDATE website.private_event_proposals SET snapshot=jsonb_set(snapshot,'{policyText}','\"\"'::jsonb) WHERE id=$1",[p.id]);
  else await connection.query('UPDATE website.private_event_proposals SET state=$1 WHERE id=$2',[state,p.id]);
  await assert.rejects(()=>proposals.manuallyAcceptProposal(plan.id,p.id,{...input,version:p.version,planVersion:plan.version}));
 }
 const base={state:'draft',accepted_at:null,sent_at:null,approved_at:null,expires_at:expiration()};
 for(const [p,label] of [[base,'Draft'],[{...base,approved_at:new Date().toISOString()},'Approved — Not Sent'],[{...base,sent_at:new Date().toISOString()},'Sent'],[{...base,state:'changes_requested'},'Changes Requested'],[{...base,state:'declined'},'Declined'],[{...base,state:'cancelled'},'Cancelled'],[{...base,state:'superseded'},'Superseded'],[{...base,expires_at:'2020-01-01'},'Expired'],[{...base,expires_at:'2020-01-01',accepted_at:new Date().toISOString(),acceptanceMethod:'manual'},'Manual Accepted']])assert.equal(statusModule.proposalStatus(p).label,label);
 console.log('Passed authenticated exact-version manual acceptance, explicit confirmation, concurrent/idempotent records, immutable evidence, no email/payment/booking side effects, preserved customer acceptance, rejected stale/closed/expired/changed/old/no-policy proposals, protected staff notes, manual PDF evidence and all proposal status labels.');
 }
 { // Emailed acceptance confirms separately from payment; reconcile old accepted records silently.
 const mailBefore=globalThis.eventTestMail.length,stripeBefore=stripeCalls;
 const sent=await approved(valid(future(520))),sentPlan=await plans.getEventPlan(sent.plan.id);
 await proposals.manuallyAcceptProposal(sentPlan.id,sent.p.id,{version:sent.p.version,planVersion:sentPlan.version,name:'Fixture Customer',confirmed:true});assert.equal((await plans.getEventPlan(sentPlan.id)).details.status,'Confirmed');assert.equal((await plans.getEventPlan(sentPlan.id)).details.paidCents,0);
 const older=await approved(valid(future(521)));await connection.query("UPDATE website.private_event_proposals SET accepted_at=now(),accepted_name='Fixture Customer',state='accepted' WHERE id=$1",[older.p.id]);const historyBefore=await proposals.getManagerProposal(older.plan.id,older.p.id),paymentBefore=(await proposals.listProposals(older.plan.id)).deposits;
 const reconcileRequest=(auth=true)=>new NextRequest('https://aviatorbrew.com/api/manager/event-plans/'+older.plan.id+'/proposals/'+older.p.id,{method:'POST',headers:auth?{cookie:managerCookie}:{},body:JSON.stringify({action:'confirm-accepted',version:older.p.version})}),context={params:Promise.resolve({id:older.plan.id,proposalId:older.p.id})};assert.equal((await proposalRoute.POST(reconcileRequest(false),context)).status,401);assert.equal((await proposalRoute.POST(reconcileRequest(),context)).status,200);const confirmed=await plans.getEventPlan(older.plan.id);assert.equal(confirmed.details.status,'Confirmed');assert.equal(confirmed.details.paidCents,0);assert.equal((await proposals.confirmAcceptedEvent(older.plan.id,older.p.id,older.p.version)).updated,false);assert.equal((await plans.getEventPlan(older.plan.id)).version,confirmed.version);assert.deepEqual(await proposals.getManagerProposal(older.plan.id,older.p.id),historyBefore);assert.deepEqual((await proposals.listProposals(older.plan.id)).deposits,paymentBefore);
 await assert.rejects(()=>proposals.confirmAcceptedEvent(older.plan.id,older.p.id,99),/Refresh/);
 const unaccepted=await approved(valid(future(522)));assert.equal((await proposals.confirmAcceptedEvent(unaccepted.plan.id,unaccepted.p.id)).updated,false);assert.equal((await plans.getEventPlan(unaccepted.plan.id)).details.status,'Tentative');
 const oldClosed=await approved(valid(future(523))),closedPlan=await plans.getEventPlan(oldClosed.plan.id);await connection.query("UPDATE website.private_event_proposals SET accepted_at=now(),state='accepted' WHERE id=$1",[oldClosed.p.id]);await plans.saveEventPlan({...closedPlan.details,status:'Cancelled'},closedPlan.id,closedPlan.version);assert.equal((await proposals.confirmAcceptedEvent(oldClosed.plan.id,oldClosed.p.id)).updated,false);
 const conflicting=await approved(valid(future(524)));await connection.query("UPDATE website.private_event_proposals SET accepted_at=now(),state='accepted' WHERE id=$1",[conflicting.p.id]);const conflictData={...valid(future(524)),status:'Confirmed'};await connection.query("INSERT INTO website.private_event_plans(id,title,event_date,status,data) VALUES($1,$2,$3,'Confirmed',$4::jsonb)",[randomUUID(),conflictData.title,conflictData.date,JSON.stringify(conflictData)]);await assert.rejects(()=>proposals.confirmAcceptedEvent(conflicting.plan.id,conflicting.p.id),/available/);assert.equal((await plans.getEventPlan(conflicting.plan.id)).details.status,'Tentative');
 const stale=await approved(valid(future(525)));await connection.query("UPDATE website.private_event_proposals SET accepted_at=now(),state='accepted' WHERE id=$1",[stale.p.id]);const stalePlan=await plans.getEventPlan(stale.plan.id);await plans.saveEventPlan({...stalePlan.details,guestCount:60},stalePlan.id,stalePlan.version);assert.equal((await proposals.confirmAcceptedEvent(stale.plan.id,stale.p.id)).updated,false);
 assert.equal(stripeCalls,stripeBefore);assert.equal(globalThis.eventTestMail.length,mailBefore+6,'Only explicitly simulated proposal emails were sent; status updates send none');
 console.log('PASS emailed/manual/online acceptance confirms unpaid reservations, unsent/unaccepted/stale/cancelled guards, calendar conflicts, authenticated silent reconciliation, immutable acceptance/payment records and idempotent status/version updates.');
 }
 { // Manager meetings use existing custom orders, with no buffet or invented included services.
 for(const [index,cateringMode] of ['meeting','drinks','custom'].entries()){
  const details={...valid(future(600+index)),guestCount:12,flightPlan:{...model.emptyFlightPlan(),cateringMode,eventType:'General business meeting',organization:'Fixture business',foodNotes:'Boardroom seating. Guest-paid drinks. Off-menu food only as agreed.',barMode:'Guest-paid bar',billingName:'Meeting coordinator',av:['Big-screen setup','Microphone']},notes:'Meeting agenda; confirm the room layout',items:cateringMode==='custom'?[{id:'off-menu',category:'Food',name:'Custom off-menu platter',quantity:2,unitPriceCents:4500,taxable:true,notes:'Serve at 10 AM'}]:[]};
  const mailBefore=globalThis.eventTestMail.length,saved=await plans.saveEventPlan(details),loaded=await plans.getEventPlan(saved.id);assert.equal(globalThis.eventTestMail.length,mailBefore);assert.equal(loaded.details.flightPlan.cateringMode,cateringMode);assert.equal(loaded.details.flightPlan.foodNotes,details.flightPlan.foodNotes);assert.equal(loaded.details.flightPlan.organization,'Fixture business');assert.equal(loaded.details.guestCount,12);assert.equal(model.eventTotals(loaded.details,catalog).subtotal,cateringMode==='custom'?9000:0);
  const proposal=await proposals.createProposal(saved.id,{version:saved.version,expiresAt:expiration()});assert.equal(proposal.snapshot.details.flightPlan.cateringMode,cateringMode);assert.ok(proposal.snapshot.selections.some(([key,value])=>key==='Service plan'&&value));assert.ok(proposal.snapshot.selections.some(([key,value])=>key==='Event type'&&value==='General business meeting'));assert.ok(!proposal.snapshot.items.some(row=>row.id==='package-base'));
  await proposals.sendProposal(saved.id,proposal.id,{availabilityApproved:true,capacityApproved:true,emailApproved:true});const token=globalThis.eventTestMail.at(-1).text.match(/#token=([a-f0-9]{64})/)[1];const view=await proposals.customerProposal(token);assert.equal(view.canAccept,true,'A meeting below the buffet minimum can use the existing proposal workflow');
  const kitchen=documents.kitchenSheetHtml(loaded,catalog);assert.ok(kitchen.includes('Event service plan'));assert.ok(kitchen.includes('Boardroom seating'));if(cateringMode!=='custom')assert.ok(kitchen.includes('No food planned'));assert.ok(!kitchen.includes('fixture@example.com'));
  if(cateringMode==='custom')await writeFile('/tmp/aviator-custom-meeting-proposal.pdf',await documents.proposalPdf(proposal));
  if(cateringMode==='meeting')await writeFile('/tmp/aviator-no-food-meeting-proposal.pdf',await documents.proposalPdf(proposal));
  assert.throws(()=>booking.validateCateringRequest(details,catalog,35000),'Customer buffet inquiries still require an available package');
 }
 const strippedMode=booking.validateCateringRequest({...original,flightPlan:{...original.flightPlan,cateringMode:'meeting'}},catalog,35000);assert.ok(!Object.hasOwn(strippedMode.flightPlan,'cateringMode'),'Manager-only service modes cannot change customer buffet orders');
 const tooLarge=await plans.saveEventPlan({...valid(future(604)),guestCount:catalog.maximumGuests+1,flightPlan:{...model.emptyFlightPlan(),cateringMode:'meeting'}}),tooLargeProposal=await proposals.createProposal(tooLarge.id,{version:tooLarge.version,expiresAt:expiration()});await assert.rejects(()=>proposals.sendProposal(tooLarge.id,tooLargeProposal.id,{emailApproved:true}),/capacity/,'Venue capacity still applies to meetings');
 console.log('Passed saved/reopened no-food meetings, drinks-only and off-menu service plans; complete event/AV/billing/organization/notes; no automatic package charges; existing custom prices/taxes; 12-guest custom proposals without buffet minimum; capacity guard; customer inquiry separation; accurate meeting PDF/kitchen/summary output. No real email or payment.');
 }
 { // Appetizer events quote their exact custom quantities and individually agreed prices.
 const appModel=require(await compile(path.join(root,'src/lib/event-appetizer-order.ts'))),app=(id,name,quantity,unitPriceCents,unit='guest')=>appModel.appetizerOrderItem({id,name,quantity,unitPriceCents,unit},catalog);
 const beforeMail=globalThis.eventTestMail.length,beforeStripe=stripeCalls,details={...valid(future(760)),guestCount:12,flightPlan:{...model.emptyFlightPlan(),cateringMode:'appetizers',eventType:'General business meeting',appetizerTime:'17:30'},items:[app('regular','Hush Puppies',12,325),app('premium','Shrimp Cocktail',12,650),app('trays','Chicken Fingers',2,6000,'tray')],internalNotes:'STAFF ONLY APP NOTES'};
 const saved=await plans.saveEventPlan(details),loaded=await plans.getEventPlan(saved.id);assert.equal(loaded.details.flightPlan.cateringMode,'appetizers');assert.deepEqual(loaded.details.items,details.items);assert.equal(model.eventTotals(loaded.details,catalog).subtotal,23700);
 const draft=await proposals.createProposal(saved.id,{version:saved.version,expiresAt:expiration()});assert.equal(globalThis.eventTestMail.length,beforeMail);assert.equal(stripeCalls,beforeStripe);assert.equal(draft.snapshot.items.length,3);assert.equal(draft.snapshot.totals.subtotal,23700);assert.ok(draft.snapshot.selections.some(([key,value])=>key==='Service plan'&&value.includes('Appetizers')));assert.equal(draft.snapshot.items.some(i=>i.id==='package-base'),false);
 const kitchen=documents.kitchenSheetHtml(loaded,catalog),summary=plans.eventSummaryHtml(loaded,true,'',false);for(const name of ['Appetizer: Hush Puppies / guest','Appetizer: Shrimp Cocktail / guest','Appetizer: Chicken Fingers / tray']){assert.ok(kitchen.includes(name));assert.ok(summary.includes(name));}assert.ok(!kitchen.includes('No food planned'));assert.ok(!kitchen.includes('STAFF ONLY APP NOTES'));await writeFile('/tmp/aviator-appetizer-event-proposal.pdf',await documents.proposalPdf(draft));
 await assert.rejects(()=>proposals.sendProposal(saved.id,draft.id,{emailApproved:false}));assert.equal(globalThis.eventTestMail.length,beforeMail);await proposals.sendProposal(saved.id,draft.id,{availabilityApproved:true,capacityApproved:true,emailApproved:true});const token=globalThis.eventTestMail.at(-1).text.match(/#token=([a-f0-9]{64})/)[1],view=await proposals.customerProposal(token);assert.equal(view.proposal.snapshot.totals.subtotal,23700);assert.equal(view.canAccept,true);assert.equal(globalThis.eventTestMail.at(-1).cc,'events@aviatorbrew.com');
 const current=await plans.getEventPlan(saved.id),changed=await plans.saveEventPlan({...current.details,items:current.details.items.map(i=>i.id==='regular'?{...i,quantity:20,unitPriceCents:375}:i)},current.id,current.version);assert.equal((await proposals.customerProposal(token)).canAccept,false,'Changed appetizer quantity/price needs a revised proposal');const revised=await proposals.createProposal(saved.id,{version:changed.version,expiresAt:expiration()});assert.equal(revised.snapshot.totals.subtotal,27300);assert.equal((await proposals.getManagerProposal(saved.id,draft.id)).snapshot.totals.subtotal,23700);assert.equal(revised.accepted_at,null);assert.equal(stripeCalls,beforeStripe);assert.throws(()=>booking.validateCateringRequest(details,catalog,35000),'Appetizer event mode stays manager-only');
 console.log('PASS appetizer events: saved/reopened selections, guest/tray/custom per-app prices, taxes, no buffet minimum/base, internal kitchen and customer summary/PDF, unsent draft, approval gate, simulated proposal delivery, customer exact quote, revised terms and preserved prior prices. No real mail or charges.');
 }
 { // Deposit reminders use stable expiring proposal access and the existing checkout ledger.
  const eventMail=require(await compile(path.join(root,'src/lib/event-mail.ts')));
  await eventMail.sendEventMail({to:'fixture-cc@example.invalid',subject:'Fixture event CC',text:'Fixture only',cc:'coordinator@example.invalid'});assert.equal(globalThis.eventTestMail.at(-1).cc,'coordinator@example.invalid, events@aviatorbrew.com');
  await eventMail.sendEventMail({to:'events@aviatorbrew.com',subject:'Fixture internal event',text:'Fixture only'});assert.equal(globalThis.eventTestMail.at(-1).cc,undefined,'Internal messages do not CC the same mailbox twice');
  const reminder=await approved(valid(future(720)));
  async function reminderReview(id){const r=(await proposals.listProposals(id)).review;return proposals.saveProposalReview(id,{...r,emailApproved:true});}
  const review=await reminderReview(reminder.plan.id),input={emailApproved:true,reviewContext:review.context,requestId:randomUUID()},context={params:Promise.resolve({id:reminder.plan.id,proposalId:reminder.p.id})};
  const request=(b,auth=true)=>new NextRequest('https://aviatorbrew.com/api/manager/event-plans/'+reminder.plan.id+'/proposals/'+reminder.p.id,{method:'POST',headers:auth?{cookie:'aviator_manager='+createHmac('sha256',process.env.MANAGER_PORTAL_KEY).update('aviator-manager-session-v1').digest('hex')}:{},body:JSON.stringify({action:'resend-deposit',...b})});
  const mailBefore=globalThis.eventTestMail.length,providerBefore=stripeCalls;
  assert.equal((await proposalRoute.POST(request(input,false),context)).status,401);assert.equal((await proposalRoute.POST(request({...input,emailApproved:false}),context)).status,403);assert.equal((await proposalRoute.POST(request({...input,reviewContext:'stale'}),context)).status,409);
  assert.equal(globalThis.eventTestMail.length,mailBefore);
  const original=(await connection.query('SELECT token_hash,sent_at,accepted_at,acceptance,snapshot FROM website.private_event_proposals WHERE id=$1',[reminder.p.id])).rows[0];
  const sends=await Promise.allSettled([proposals.sendDepositLink(reminder.plan.id,reminder.p.id,input),proposals.sendDepositLink(reminder.plan.id,reminder.p.id,input)]);assert.ok(sends.some(r=>r.status==='fulfilled'));assert.equal(globalThis.eventTestMail.length,mailBefore+1,'Concurrent duplicate sends produce one reminder');assert.equal(stripeCalls,providerBefore,'Emailing a payment link never creates a charge or checkout');
  assert.equal((await proposals.sendDepositLink(reminder.plan.id,reminder.p.id,input)).alreadySent,true);assert.equal(globalThis.eventTestMail.length,mailBefore+1);
  const email=globalThis.eventTestMail.at(-1),newToken=email.text.match(/view=deposit#token=([a-f0-9]{64})/)[1];
  assert.equal(email.to,'fixture@example.com');assert.equal(email.cc,'events@aviatorbrew.com');assert.ok(email.subject.includes('$350.00'));assert.ok(email.html.includes('DEPOSIT DUE NOW'));assert.ok(email.html.includes('REVIEW &amp; PAY $350.00 DEPOSIT'));assert.ok(email.html.includes('Copy this secure link'));assert.ok(!email.html.includes('/manager')&&!email.html.includes('<img'));
  assert.deepEqual((await connection.query('SELECT token_hash,sent_at,accepted_at,acceptance,snapshot FROM website.private_event_proposals WHERE id=$1',[reminder.p.id])).rows[0],original,'Reminder preserves issued proposal, acceptance and original email link');
  assert.equal((await proposals.customerProposal(reminder.token)).proposal.id,reminder.p.id);assert.equal((await proposals.customerProposal(newToken)).proposal.id,reminder.p.id);
  const metadata=await proposals.listProposals(reminder.plan.id);assert.equal(metadata.depositLinks[0].status,'sent');assert.ok(metadata.depositLinks[0].sent_at);assert.ok(!JSON.stringify(metadata).includes(newToken));assert.ok(!JSON.stringify(metadata.depositLinks).includes('token_hash'));
  const keys=idempotency.size,payment=await proposals.acceptAndCheckout(newToken,acceptance(reminder.p));const paymentAgain=await proposals.acceptAndCheckout(reminder.token,acceptance(reminder.p));assert.equal(payment.url,paymentAgain.url);assert.equal(idempotency.size,keys+1,'Old and new links share a single checkout');
  const acceptanceBefore=(await connection.query('SELECT accepted_at,acceptance FROM website.private_event_proposals WHERE id=$1',[reminder.p.id])).rows[0];
  await proposals.sendDepositLink(reminder.plan.id,reminder.p.id,{...input,requestId:randomUUID()});assert.ok(globalThis.eventTestMail.at(-1).html.includes('PAY YOUR $350.00 DEPOSIT'));assert.deepEqual((await connection.query('SELECT accepted_at,acceptance FROM website.private_event_proposals WHERE id=$1',[reminder.p.id])).rows[0],acceptanceBefore);assert.equal((await proposals.customerProposal(newToken)).proposal.id,reminder.p.id,'Earlier reminder links keep working');
  const expiredSession=[...sessions.values()].at(-1);expiredSession.status='expired';await connection.query("UPDATE website.private_event_checkout_attempts SET expires_at=now()-interval '1 minute' WHERE proposal_id=$1",[reminder.p.id]);const count=idempotency.size;await proposals.acceptAndCheckout(newToken,acceptance(reminder.p));assert.equal(idempotency.size,count+1,'Expired checkout can be retried through the stable reminder link');
  const paidSession={...[...sessions.values()].at(-1),payment_status:'paid'};assert.equal((await notify(paidSession)).status,200);const paidView=await proposals.customerProposal(newToken);assert.equal(paidView.recordedPaidCents,35000);const paidMail=globalThis.eventTestMail.at(-1);assert.equal(paidMail.cc,'events@aviatorbrew.com','Customer booking/payment confirmation copies the events team');const afterPaidMail=globalThis.eventTestMail.length;const paidReview=await reminderReview(reminder.plan.id);await assert.rejects(()=>proposals.sendDepositLink(reminder.plan.id,reminder.p.id,{...input,reviewContext:paidReview.context,requestId:randomUUID()}),/already paid/);assert.equal(globalThis.eventTestMail.length,afterPaidMail);
  const partial=await approved({...valid(future(721)),paidCents:10000}),partialReview=await reminderReview(partial.plan.id);await proposals.sendDepositLink(partial.plan.id,partial.p.id,{emailApproved:true,reviewContext:partialReview.context,requestId:randomUUID()});assert.ok(globalThis.eventTestMail.at(-1).html.includes('$250.00'),'Reminder shows the outstanding configured deposit after manual credit');const partialToken=globalThis.eventTestMail.at(-1).text.match(/#token=([a-f0-9]{64})/)[1];
  const draftPlan=await plans.saveEventPlan(valid(future(722))),draft=await proposals.createProposal(draftPlan.id,{version:draftPlan.version,expiresAt:expiration()}),draftReview=await reminderReview(draftPlan.id);await assert.rejects(()=>proposals.sendDepositLink(draftPlan.id,draft.id,{emailApproved:true,reviewContext:draftReview.context,requestId:randomUUID()}),/send the proposal/);
  const failing=await approved(valid(future(723))),failingReview=await reminderReview(failing.plan.id),failingInput={emailApproved:true,reviewContext:failingReview.context,requestId:randomUUID()};globalThis.eventTestFailMail=true;await assert.rejects(()=>proposals.sendDepositLink(failing.plan.id,failing.p.id,failingInput),/not delivered/);globalThis.eventTestFailMail=false;assert.equal((await proposals.listProposals(failing.plan.id)).depositLinks[0].status,'failed');assert.equal((await proposals.customerProposal(failing.token)).proposal.id,failing.p.id,'Failed reminder cannot break the original link');
  await proposals.sendDepositLink(failing.plan.id,failing.p.id,{...failingInput,requestId:randomUUID()});const closingToken=globalThis.eventTestMail.at(-1).text.match(/#token=([a-f0-9]{64})/)[1];
  const changedPlan=await plans.getEventPlan(failing.plan.id);await plans.saveEventPlan({...changedPlan.details,guestCount:51},changedPlan.id,changedPlan.version);const changedReview=await reminderReview(failing.plan.id);await assert.rejects(()=>proposals.sendDepositLink(failing.plan.id,failing.p.id,{...failingInput,reviewContext:changedReview.context,requestId:randomUUID()}),/terms changed/);assert.equal((await proposals.customerProposal(closingToken)).canAccept,false);
  await connection.query("UPDATE website.private_event_proposals SET expires_at=now()-interval '1 minute' WHERE id=$1",[partial.p.id]);await assert.rejects(()=>proposals.customerProposal(partialToken));
  const expiredReview=await reminderReview(partial.plan.id);await assert.rejects(()=>proposals.sendDepositLink(partial.plan.id,partial.p.id,{emailApproved:true,reviewContext:expiredReview.context,requestId:randomUUID()}),/unexpired/);
  await connection.query("UPDATE website.private_event_proposals SET state='superseded' WHERE id=$1",[failing.p.id]);await assert.rejects(()=>proposals.customerProposal(closingToken));
  for(const message of globalThis.eventTestMail.filter(m=>m.fromName==='Aviator Events'&&m.to.toLowerCase()!=='events@aviatorbrew.com'))assert.ok(message.cc?.includes('events@aviatorbrew.com'),'All private-event customer correspondence copies the events team');
  console.log('Passed deposit reminder authorization/approval, amount and CC, persistent delivery status, concurrent send deduplication, original-link/acceptance preservation, secure additional links, shared idempotent checkout, expired-checkout retry, paid/partial-credit guards, unsent/changed/expired/closed blocking, failed-send recovery, and customer-confirmation copies. No real email or payment.');
 }
 {const initial=await approved(valid(future(810)));await proposals.acceptAndCheckout(initial.token,acceptance(initial.p));const acceptedBefore=await proposals.customerProposal(initial.token),oldSnapshot=structuredClone(acceptedBefore.proposal.snapshot);assert.ok(acceptedBefore.proposal.accepted_at);
 const saved=await plans.getEventPlan(initial.plan.id),changed=await plans.saveEventPlan({...saved.details,flightPlan:{...saved.details.flightPlan,sides:['Greek Salad','Spinach Caprese Salad']},managerDiscount:{amountCents:10000,reason:'One-time coordinator courtesy'}},saved.id,saved.version);assert.equal(changed.details.managerDiscount.amountCents,10000);assert.equal((await proposals.customerProposal(initial.token)).canAccept,false);assert.deepEqual((await proposals.customerProposal(initial.token)).proposal.snapshot,oldSnapshot);
 const revised=await proposals.createProposal(changed.id,{version:changed.version,expiresAt:expiration()});assert.equal(revised.accepted_at,null);assert.equal(revised.snapshot.totals.discount,10000);assert.ok(revised.snapshot.totals.total<oldSnapshot.totals.total);assert.ok(revised.snapshot.selections.find(([label])=>label==='Sides')[1].includes('salad substituted for side'));assert.equal((await plans.getEventPlan(changed.id)).details.paidCents,saved.details.paidCents);
 console.log('PASS saved manager salad substitution and discount invalidate old acceptance eligibility, preserve the accepted quote and payment credit, and create an unaccepted revised proposal. All email/Stripe simulated.');}
 const browserFixture=await approved(valid(future(95)));
 await writeFile('/tmp/aviator-event-proposal-browser-fixture.json',JSON.stringify({token:browserFixture.token,planId:browserFixture.plan.id,proposalId:browserFixture.p.id,paidToken:token,paidPlanId:sourcePlan.id}),{mode:0o600});
}finally{globalThis.fetch=actualFetch;await connection.end();process.exitCode||=0;setTimeout(()=>process.exit(process.exitCode),50).unref();}
