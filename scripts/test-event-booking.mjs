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
 const email=globalThis.eventTestMail.at(-1),token=email.text.match(/#token=([a-f0-9]{64})/)[1];return {plan,p,token};
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
 assert.equal(proposals.materialHash(original),proposals.materialHash(Object.fromEntries(Object.entries(original).reverse())),'Material comparisons ignore JSON object key order');
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
 await assert.rejects(()=>proposals.sendProposal(sourcePlan.id,p.id,{availabilityApproved:false,capacityApproved:true,emailApproved:true}));
 await proposals.sendProposal(sourcePlan.id,p.id,{availabilityApproved:true,capacityApproved:true,emailApproved:true});
 const approvedKitchen=await kitchenResponse(sourcePlan.id);assert.equal(approvedKitchen.status,200);assert.ok((await approvedKitchen.text()).includes('APPROVED PROPOSAL — TENTATIVE EVENT'));
 const token=globalThis.eventTestMail.at(-1).text.match(/#token=([a-f0-9]{64})/)[1],access=await proposals.customerProposal(token);
 assert.equal(access.status,'Proposal Sent');assert.equal(access.proposal.snapshot.totals.total,205675);assert.ok(!JSON.stringify(access).includes('DO NOT EXPOSE'));assert.ok(!('token_hash' in access.proposal));
 const savedRaw=(await connection.query('SELECT token_hash,material_hash FROM website.private_event_proposals WHERE id=$1',[p.id])).rows[0];assert.notEqual(savedRaw.token_hash,token);assert.equal(savedRaw.material_hash,proposals.materialHash((await plans.getEventPlan(sourcePlan.id)).details));
 await assert.rejects(()=>proposals.acceptAndCheckout(token,{...acceptance(p),agreed:false}));await assert.rejects(()=>proposals.acceptAndCheckout(token,{...acceptance(p),policyVersion:'wrong'}));
 await assert.rejects(()=>proposals.customerProposal('a'.repeat(64)));
 const checkout=await Promise.all(Array.from({length:4},()=>proposals.acceptAndCheckout(token,acceptance(p))));assert.equal(new Set(checkout.map(r=>r.url)).size,1);assert.equal(idempotency.size,1,'One Stripe session across concurrent retries');
 const attempt=sessions.values().next().value;assert.equal(attempt.amount_total,35000);assert.equal((await plans.getEventPlan(sourcePlan.id)).details.status,'Tentative');assert.equal((await plans.getEventPlan(sourcePlan.id)).details.paidCents,0);
 const acceptanceRow=(await connection.query('SELECT accepted_name,acceptance,accepted_at FROM website.private_event_proposals WHERE id=$1',[p.id])).rows[0];assert.equal(acceptanceRow.acceptance.policyVersion,'fixture-1');assert.ok(acceptanceRow.accepted_at);assert.equal(acceptanceRow.accepted_name,'Fixture Customer');
 assert.equal((await notify({...attempt,payment_status:'paid'},'evt_invalid',false)).status,400);assert.equal(Number((await connection.query('SELECT count(*) FROM website.private_event_deposits')).rows[0].count),0);
 assert.equal((await notify({...attempt,payment_status:'paid',amount_total:1},'evt_wrong_amount')).status,400);
 globalThis.eventTestFailMail=true;
 const paid={...attempt,payment_status:'paid'};assert.equal((await notify(paid,'evt_paid')).status,503,'Paid ledger survives notification failure');
 const paidPlan=await plans.getEventPlan(sourcePlan.id);assert.equal(paidPlan.details.status,'Confirmed');assert.equal(paidPlan.details.paidCents,35000);
 assert.ok((await (await kitchenResponse(sourcePlan.id)).text()).includes('CONFIRMED EVENT'));
 globalThis.eventTestFailMail=false;assert.equal((await notify(paid,'evt_paid_retry')).status,200);await Promise.all([notify(paid,'evt_replay_1'),notify(paid,'evt_replay_2')]);
 assert.equal((await plans.getEventPlan(sourcePlan.id)).details.paidCents,35000);assert.equal(Number((await connection.query('SELECT count(*) FROM website.private_event_deposits')).rows[0].count),1);assert.equal(Number((await connection.query("SELECT count(*) FROM website.private_event_deliveries WHERE status='sent'")).rows[0].count),2);
 const customer=await proposals.customerProposal(token);assert.equal(customer.status,'Confirmed');assert.equal(customer.remainingCents,170675);
 const pdf=await documents.proposalPdf(p);assert.equal(Buffer.from(pdf).subarray(0,5).toString(),'%PDF-');await writeFile('/tmp/aviator-test-proposal.pdf',pdf);
 const kitchen=documents.kitchenSheetHtml(await plans.getEventPlan(sourcePlan.id),catalog);assert.ok(kitchen.includes('Fixture peanut allergy'));assert.ok(kitchen.includes('No yield data'));assert.ok(!kitchen.includes('PAYMENT ADMIN NOTES'));assert.ok(!kitchen.includes('205675'));assert.ok(!kitchen.includes('fixture@example.com'));
 await settings.setPrivateEventSettings({catering:repriced});assert.equal((await proposals.customerProposal(token)).proposal.snapshot.totals.subtotal,190000,'Issued prices never change with menu configuration');
 console.log('Passed inquiries, immutable quotes, policy gates, concurrent checkout, verified payment, duplicate notifications, deposit credits, email retry, proposal PDF and manager-only draft/approved/confirmed/canceled kitchen sheets');
 // A material change after acceptance must not turn a late deposit into a confirmed changed booking.
 const late=await approved(valid(future(65)));await proposals.acceptAndCheckout(late.token,acceptance(late.p));const lateSession=[...sessions.values()].at(-1);
 const beforeChange=await plans.getEventPlan(late.plan.id);await plans.saveEventPlan({...beforeChange.details,guestCount:55},beforeChange.id,beforeChange.version);
 assert.equal((await notify({...lateSession,payment_status:'paid'},'evt_late')).status,200);const changed=await plans.getEventPlan(late.plan.id);assert.notEqual(changed.details.status,'Confirmed');assert.equal(changed.details.paidCents,35000);assert.equal((await proposals.customerProposal(late.token)).canAccept,false);
 const revised=await proposals.createProposal(changed.id,{version:changed.version,expiresAt:expiration()});await proposals.sendProposal(changed.id,revised.id,{availabilityApproved:true,capacityApproved:true,emailApproved:true});const revisedToken=globalThis.eventTestMail.at(-1).text.match(/#token=([a-f0-9]{64})/)[1];const keysBefore=idempotency.size;await proposals.acceptAndCheckout(revisedToken,acceptance(revised));assert.equal(idempotency.size,keysBefore,'Revisions reuse existing deposit credit without another charge');assert.equal((await plans.getEventPlan(changed.id)).details.status,'Confirmed');
 const overlap=await plans.saveEventPlan(valid(future(60)));const conflicting=await proposals.createProposal(overlap.id,{version:overlap.version,expiresAt:expiration()});await assert.rejects(()=>proposals.sendProposal(overlap.id,conflicting.id,{availabilityApproved:true,capacityApproved:true,emailApproved:true}),/available/);
 await assert.rejects(()=>plans.saveEventPlan({...overlap.details,status:'Confirmed'},overlap.id,overlap.version),/overlap/);
 const expiring=await approved(valid(future(70)));await connection.query("UPDATE website.private_event_proposals SET expires_at=now()-interval '1 second' WHERE id=$1",[expiring.p.id]);await assert.rejects(()=>proposals.customerProposal(expiring.token),/expired/);await assert.rejects(()=>proposals.acceptAndCheckout(expiring.token,acceptance(expiring.p)),/expired/);
 const failed=await approved(valid(future(75)));await proposals.acceptAndCheckout(failed.token,acceptance(failed.p));const failedSession=[...sessions.values()].at(-1);await proposals.markProposalAttempt(failedSession,'failed');assert.match((await proposals.customerProposal(failed.token)).status,/Failed/);assert.equal((await plans.getEventPlan(failed.plan.id)).details.paidCents,0);
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
 assert.equal((await (await inquiryList('&id='+linkedRequest.inquiryId)).json()).inquiries[0].availability.status,'available','The inquiry does not conflict with its own saved event');
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
 assert.deepEqual(await proposals.listProposals(reopened.id),deletedHistory);assert.ok(deletedHistory.proposals.some(item=>item.id===deletedQuote.id));
 assert.equal(globalThis.eventTestMail.length,deletedMail);await assert.rejects(()=>plans.saveEventPlan(reopened.details,reopened.id,reopened.version),/deleted/);
 assert.equal((await deleteRequest(reopened)).status,200,'Repeated deletion is idempotent');
 const remainingInquiry=(await (await inquiryList('&id='+linkedRequest.inquiryId)).json()).inquiries[0];assert.ok(!remainingInquiry.planId,'The preserved inquiry can start a new plan');
 const paidArchived=await plans.getEventPlan(sourcePlan.id),ledgerBefore=(await connection.query('SELECT * FROM website.private_event_deposits WHERE plan_id=$1',[paidArchived.id])).rows;
 assert.equal((await deleteRequest(paidArchived)).status,200);assert.deepEqual((await connection.query('SELECT * FROM website.private_event_deposits WHERE plan_id=$1',[paidArchived.id])).rows,ledgerBefore,'Verified payment references survive event deletion');
 const payableDelete=await approved(valid(future(170)));await proposals.acceptAndCheckout(payableDelete.token,acceptance(payableDelete.p));const payableSession=[...sessions.values()].at(-1),payablePlan=await plans.getEventPlan(payableDelete.plan.id);
 assert.equal((await deleteRequest(payablePlan)).status,200);assert.equal(payableSession.status,'expired','Deletion closes an unpaid checkout');assert.equal((await proposals.customerProposal(payableDelete.token)).canAccept,false);
 console.log('Passed inquiry availability/nearby weekend alternatives, own-event exclusion, Google moves, buffered conflicts, un-cancel with payment/menu retention, authorized idempotent event deletion, archived records, preserved inquiries/quotes/verified payments and checkout closure.');
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
 console.log('Passed confirmed inquiry filtering, preserved audit links, protected historical reports/search/pagination, alternative-date approval and conflict checks, tentative scheduling, contact-only mail, failed-send retry idempotence, unchanged quote snapshots, and unsent-only proposal deletion.');
 // Leave only safe current catalog settings for the separate local browser fixture.
 await settings.setPrivateEventSettings({catering:catalog});
 const browserFixture=await approved(valid(future(95)));
 await writeFile('/tmp/aviator-event-proposal-browser-fixture.json',JSON.stringify({token:browserFixture.token,planId:browserFixture.plan.id,proposalId:browserFixture.p.id,paidToken:token,paidPlanId:sourcePlan.id}),{mode:0o600});
}finally{globalThis.fetch=actualFetch;await connection.end();process.exitCode||=0;setTimeout(()=>process.exit(process.exitCode),50).unref();}
