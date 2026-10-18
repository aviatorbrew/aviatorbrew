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
const webhook=require(await compile(path.join(root,'src/app/api/stripe/webhook/route.ts'))),kitchenRoute=require(await compile(path.join(root,'src/app/api/manager/event-plans/[id]/kitchen/route.ts'))),{NextRequest}=require('next/server');
const actualFetch=globalThis.fetch,sessions=new Map(),idempotency=new Map();let stripeCalls=0;
async function kitchenResponse(id,authenticated=true){const cookie='aviator_manager='+createHmac('sha256',process.env.MANAGER_PORTAL_KEY).update('aviator-manager-session-v1').digest('hex');return kitchenRoute.GET(new NextRequest('https://aviatorbrew.com/api/manager/event-plans/'+id+'/kitchen',{headers:authenticated?{cookie}:{}}),{params:Promise.resolve({id})});}
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
 const p={...model.emptyEventPlan(),title:'Isolated test event',contactName:'Fixture Customer',contactEmail:'fixture@example.com',phone:'919-555-0100',date,startTime:'17:00',endTime:'21:00',guestCount:50,internalNotes:'DO NOT EXPOSE PAYMENT ADMIN NOTES'};
 p.flightPlan={...model.emptyFlightPlan(),packageId:'feast',appetizers:['Hush Puppies','Tater Tots','Brewer Fries'],entrees:['Aviator Pulled Pork BBQ','Aviator Chicken Tenders'],sides:['Mac & Cheese','Potato Salad'],salads:['Caesar Salad'],dietaryNeeds:'Fixture peanut allergy',foodNotes:'Fixture service notes'};return p;
}
async function approved(details=valid()){
 const plan=await plans.saveEventPlan(details),p=await proposals.createProposal(plan.id,{version:plan.version,expiresAt:expiration()});await proposals.sendProposal(plan.id,p.id,{availabilityApproved:true,capacityApproved:true});
 const email=globalThis.eventTestMail.at(-1),token=email.text.match(/#token=([a-f0-9]{64})/)[1];return {plan,p,token};
}
const acceptance=p=>({name:'Fixture Customer',agreed:true,proposalVersion:p.version,policyVersion:p.snapshot.policyVersion,userAgent:'Fixture browser',ip:'127.0.0.1'});
async function notify(session,eventId='evt_'+randomUUID(),validSignature=true){const raw=JSON.stringify({id:eventId,type:'checkout.session.completed',data:{object:session}}),t=Math.floor(Date.now()/1000),signed=createHmac('sha256',process.env.STRIPE_WEBHOOK_SECRET).update(t+'.'+raw).digest('hex');return webhook.POST(new NextRequest('https://aviatorbrew.com/api/stripe/webhook',{method:'POST',headers:{'stripe-signature':`t=${t},v1=${validSignature?signed:'0'.repeat(64)}`},body:raw}));}
try{
 const catalog=structuredClone(model.defaultCateringCatalog),original=valid();
 assert.equal(model.eventTotals(original,catalog).subtotal,190000);
 for(const guests of [0,29,71,1.5])assert.throws(()=>booking.validateCateringRequest({...original,guestCount:guests},catalog,35000));
 assert.throws(()=>booking.validateCateringRequest({...original,flightPlan:{...original.flightPlan,appetizers:['Hush Puppies']}},catalog,35000));
 assert.throws(()=>booking.validateCateringRequest({...original,flightPlan:{...original.flightPlan,appetizers:[...original.flightPlan.appetizers,'Tater Tots']}},catalog,35000));
 assert.throws(()=>booking.validateCateringRequest({...original,date:'2020-01-01'},catalog,35000));
 const disabled=structuredClone(catalog);disabled.disabledItems=['Hush Puppies'];assert.throws(()=>booking.validateCateringRequest(original,disabled,35000));
 disabled.disabledItems=[];disabled.packages[1].enabled=false;assert.throws(()=>booking.validateCateringRequest(original,disabled,35000));
 const repriced=structuredClone(catalog);repriced.packages[1].priceCents=4000;repriced.extraPrices.side=400;
 const canonical=booking.validateCateringRequest({...original,paidCents:999999,taxRateBps:0,items:[{name:'fake'}],flightPlan:{...original.flightPlan,extraSides:['French Fries'],extraSidePriceCents:0}},repriced,42000);
 assert.equal(canonical.paidCents,0);assert.equal(canonical.items.length,0);assert.equal(canonical.reservationDepositCents,42000);assert.equal(model.eventTotals(canonical,repriced).subtotal,220000);
 assert.equal(booking.eventWindowsOverlap({date:'2027-01-01',startTime:'22:00',endTime:'02:00'},{date:'2027-01-02',startTime:'01:00',endTime:'04:00'}),true);
 assert.equal(proposals.materialHash(original),proposals.materialHash(Object.fromEntries(Object.entries(original).reverse())),'Material comparisons ignore JSON object key order');
 console.log('Passed menu validation, backend pricing, disabled items, guest limits and overnight availability');
 const req={requestId:randomUUID(),humanCheck:'yes',website:'',cateringPlan:original};
 const inquiry=await inquiries.submitCateringInquiry(req);await inquiries.submitCateringInquiry(req);
 assert.equal(Number((await connection.query('SELECT count(*) FROM website.form_inquiries')).rows[0].count),1);
 assert.equal(globalThis.eventTestMail.length,2,'Duplicate inquiry does not repeat emails');
 assert.equal((await connection.query('SELECT payload FROM website.form_inquiries')).rows[0].payload.cateringPlan.paidCents,0);
 const sourcePlan=await plans.saveEventPlan(booking.validateCateringRequest(original,catalog,35000),undefined,undefined,inquiry.inquiryId);
 const draft=await proposals.createProposal(sourcePlan.id,{version:sourcePlan.version,expiresAt:expiration()});
 assert.equal((await kitchenResponse(sourcePlan.id,false)).status,401,'Kitchen sheets remain manager-only');
 assert.equal((await kitchenResponse(randomUUID())).status,404);
 const draftKitchenResponse=await kitchenResponse(sourcePlan.id);assert.equal(draftKitchenResponse.status,200,'Saved drafts print without a proposal approval or configured policies');
 const draftKitchen=await draftKitchenResponse.text();assert.ok(draftKitchen.includes('DRAFT — NOT APPROVED FOR PRODUCTION'));assert.ok(draftKitchen.includes('Fixture peanut allergy'));assert.ok(!draftKitchen.includes('fixture@example.com'));assert.ok(!draftKitchen.includes('PAYMENT ADMIN NOTES'));assert.ok(!draftKitchen.includes('$350'));assert.equal((await plans.getEventPlan(sourcePlan.id)).details.status,'Draft','Printing does not approve or confirm the event');await writeFile('/tmp/aviator-kitchen-draft.html',draftKitchen);
 assert.ok(documents.kitchenSheetHtml({...sourcePlan,details:{...sourcePlan.details,status:'Tentative'}},catalog).includes('DRAFT — NOT APPROVED FOR PRODUCTION'));
 assert.ok(documents.kitchenSheetHtml({...sourcePlan,details:{...sourcePlan.details,status:'Completed'}},catalog).includes('COMPLETED EVENT — REFERENCE COPY'));

 await assert.rejects(()=>proposals.sendProposal(sourcePlan.id,draft.id,{availabilityApproved:true,capacityApproved:true}),/polic/);
 await settings.setPrivateEventSettings({policyText:'TEST FIXTURE ONLY: approved cancellation, deposit and event policy placeholder. Never publish these terms.',policyVersion:'fixture-1'});
 const p=await proposals.createProposal(sourcePlan.id,{version:sourcePlan.version,expiresAt:expiration()});
 await assert.rejects(()=>proposals.sendProposal(sourcePlan.id,p.id,{availabilityApproved:false,capacityApproved:true}));
 await proposals.sendProposal(sourcePlan.id,p.id,{availabilityApproved:true,capacityApproved:true});
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
 const revised=await proposals.createProposal(changed.id,{version:changed.version,expiresAt:expiration()});await proposals.sendProposal(changed.id,revised.id,{availabilityApproved:true,capacityApproved:true});const revisedToken=globalThis.eventTestMail.at(-1).text.match(/#token=([a-f0-9]{64})/)[1];const keysBefore=idempotency.size;await proposals.acceptAndCheckout(revisedToken,acceptance(revised));assert.equal(idempotency.size,keysBefore,'Revisions reuse existing deposit credit without another charge');assert.equal((await plans.getEventPlan(changed.id)).details.status,'Confirmed');
 const overlap=await plans.saveEventPlan(valid(future(60)));const conflicting=await proposals.createProposal(overlap.id,{version:overlap.version,expiresAt:expiration()});await assert.rejects(()=>proposals.sendProposal(overlap.id,conflicting.id,{availabilityApproved:true,capacityApproved:true}),/available/);
 await assert.rejects(()=>plans.saveEventPlan({...overlap.details,status:'Confirmed'},overlap.id,overlap.version),/overlap/);
 const expiring=await approved(valid(future(70)));await connection.query("UPDATE website.private_event_proposals SET expires_at=now()-interval '1 second' WHERE id=$1",[expiring.p.id]);await assert.rejects(()=>proposals.customerProposal(expiring.token),/expired/);await assert.rejects(()=>proposals.acceptAndCheckout(expiring.token,acceptance(expiring.p)),/expired/);
 const failed=await approved(valid(future(75)));await proposals.acceptAndCheckout(failed.token,acceptance(failed.p));const failedSession=[...sessions.values()].at(-1);await proposals.markProposalAttempt(failedSession,'failed');assert.match((await proposals.customerProposal(failed.token)).status,/Failed/);assert.equal((await plans.getEventPlan(failed.plan.id)).details.paidCents,0);
 const canceled=await approved(valid(future(80)));await proposals.acceptAndCheckout(canceled.token,acceptance(canceled.p));const cancelSession=[...sessions.values()].at(-1),cancelPlan=await plans.getEventPlan(canceled.plan.id);await plans.saveEventPlan({...cancelPlan.details,status:'Cancelled'},cancelPlan.id,cancelPlan.version);await notify({...cancelSession,payment_status:'paid'},'evt_cancelled');assert.equal((await plans.getEventPlan(canceled.plan.id)).details.status,'Cancelled');
 const canceledKitchen=await kitchenResponse(canceled.plan.id);assert.equal(canceledKitchen.status,200);assert.ok((await canceledKitchen.text()).includes('CANCELED EVENT — DO NOT PRODUCE'));
 const unpaid=await approved(valid(future(85)));await proposals.acceptAndCheckout(unpaid.token,acceptance(unpaid.p));const unpaidSession=[...sessions.values()].at(-1);const unpaidPlan=await plans.getEventPlan(unpaid.plan.id);const changedUnpaid=await plans.saveEventPlan({...unpaidPlan.details,guestCount:52},unpaidPlan.id,unpaidPlan.version);const replacement=await proposals.createProposal(changedUnpaid.id,{version:changedUnpaid.version,expiresAt:expiration()});await proposals.sendProposal(changedUnpaid.id,replacement.id,{availabilityApproved:true,capacityApproved:true});assert.equal(sessions.get(unpaidSession.id).status,'expired','An older unpaid checkout is closed before a revised proposal becomes payable');
 const manual=await approved(valid(future(87)));await proposals.acceptAndCheckout(manual.token,acceptance(manual.p));const manualSession=[...sessions.values()].at(-1),manualPlan=await plans.getEventPlan(manual.plan.id);await plans.saveEventPlan({...manualPlan.details,paidCents:35000},manualPlan.id,manualPlan.version);assert.equal(sessions.get(manualSession.id).status,'expired','A recorded manual deposit closes an older unpaid checkout');const checkoutsBeforeCredit=idempotency.size;await proposals.acceptAndCheckout(manual.token,acceptance(manual.p));assert.equal(idempotency.size,checkoutsBeforeCredit);assert.equal((await plans.getEventPlan(manual.plan.id)).details.paidCents,35000);
 const protectedPaid=await plans.getEventPlan(sourcePlan.id);await assert.rejects(()=>plans.saveEventPlan({...protectedPaid.details,paidCents:0},protectedPaid.id,protectedPaid.version),/Verified Stripe/);
 const moved=await plans.saveEventPlan({...valid(future(110)),status:'Tentative'});await connection.query('UPDATE website.private_event_plans SET calendar_sync=$1::jsonb WHERE id=$2',[JSON.stringify({status:'changed',source:{date:future(112),startTime:'17:00',endTime:'21:00'}}),moved.id]);const movedTarget=await plans.saveEventPlan(valid(future(112))),movedProposal=await proposals.createProposal(movedTarget.id,{version:movedTarget.version,expiresAt:expiration()});await assert.rejects(()=>proposals.sendProposal(movedTarget.id,movedProposal.id,{availabilityApproved:true,capacityApproved:true}),/available/);assert.equal((await plans.getEventPlan(moved.id)).details.date,future(110),'Google conflict review never overwrites saved event data');
 const withdrawn=await approved(valid(future(92)));await proposals.acceptAndCheckout(withdrawn.token,acceptance(withdrawn.p));const withdrawnSession=[...sessions.values()].at(-1),withdrawnPlan=await plans.getEventPlan(withdrawn.plan.id);await plans.saveEventPlan({...withdrawnPlan.details,status:'Draft'},withdrawnPlan.id,withdrawnPlan.version);assert.equal((await proposals.customerProposal(withdrawn.token)).canAccept,false);await notify({...withdrawnSession,payment_status:'paid'},'evt_withdrawn');assert.equal((await plans.getEventPlan(withdrawn.plan.id)).details.status,'Draft','A withdrawn staff approval cannot be revived by a payment');
 const payload='{}' ,timestamp=Math.floor(Date.now()/1000),sig=createHmac('sha256','test').update(timestamp+'.'+payload).digest('hex');assert.ok(signature.verifyStripeSignature('test',`t=${timestamp},v1=${'0'.repeat(64)},v1=${sig}`,payload));assert.ok(!signature.verifyStripeSignature('test',`t=${timestamp-301},v1=${sig}`,payload));assert.ok(!signature.verifyStripeSignature('test',`t=NaN,v1=${sig}`,payload));
 assert.equal((await webhook.POST(new NextRequest('https://aviatorbrew.com/api/stripe/webhook',{method:'POST',body:'not-json'}))).status,400);
 console.log(`Passed changed/expired/canceled proposals, revised acceptance, paid-credit reuse, conflicting and moved Google dates, manual-payment checkout closure, protected deposit credits, failed payments and webhook security. ${stripeCalls} simulated Stripe calls; no real charges or external emails.`);
 // Leave only safe current catalog settings for the separate local browser fixture.
 await settings.setPrivateEventSettings({catering:catalog});
 const browserFixture=await approved(valid(future(95)));
 await writeFile('/tmp/aviator-event-proposal-browser-fixture.json',JSON.stringify({token:browserFixture.token,planId:browserFixture.plan.id,proposalId:browserFixture.p.id,paidToken:token,paidPlanId:sourcePlan.id}),{mode:0o600});
}finally{globalThis.fetch=actualFetch;await connection.end();process.exitCode||=0;setTimeout(()=>process.exit(process.exitCode),50).unref();}
