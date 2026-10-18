import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require=createRequire(import.meta.url),{NextRequest}=require('next/server');
const counters={guest:0,manager:0,messages:0,cancels:0,proposals:0,retries:0,campaigns:0,mail:0};
const manager={isManager:request=>request.headers.get('x-fixture-manager')==='yes'};
const tours={
 createTourSignup:async()=>({signup:{id:'fixture-tour'}}),notifyManagerOfSignup:async()=>{counters.manager++;return true;},notifyGuestOfSignup:async()=>{counters.guest++;return true;},getTourManagerData:async()=>({signups:[],scheduledTours:[]}),
 isTourEmailConfigured:()=>true,sendTourGuestMessage:async()=>{counters.messages++;return{accepted:true,recipient:'fixture@example.com'};},cancelTourAndReschedule:async()=>{counters.cancels++;return{affected:1,notified:1};},getTourSummary:async()=>null,
};
const aliases={
 '@/lib/manager-auth':manager,'@/lib/tours':tours,
 '@/lib/event-plans':{getEventPlan:async()=>({id:'fixture-plan'})},
 '@/lib/event-proposals':{ProposalError:class extends Error{constructor(message,status=400){super(message);this.status=status;}},getManagerProposal:async()=>({id:'fixture-proposal'}),sendProposal:async()=>{counters.proposals++;return{ok:true};},deliverProposalMessages:async()=>{counters.retries++;return true;}},
 '@/lib/mail':{isMailConfigured:()=>true,sendMail:async()=>{counters.mail++;return true;}},
 '@/lib/newsletter':{getConfirmedNewsletterSubscribers:async()=>[{email:'fixture@example.com'}],getNewsletterSubscribers:async()=>[{email:'fixture@example.com',status:'confirmed'}]},
 '@/lib/newsletter-campaigns':{recordNewsletterCampaign:async()=>{counters.campaigns++;},getNewsletterCampaigns:async()=>[]},
 '@/lib/newsletter-email':{buildNewsletterMessage:()=>({text:'Fixture message',html:'<p>Fixture message</p>'}),newsletterMusicForNextTwoWeeks:()=>[]},
 '@/lib/flight-crew-welcome':{getFlightCrewWelcome:async()=>({})},
 '@/lib/managed-beers':{getPortalBeers:async()=>[]},'@/lib/managed-events':{getPublishedEvents:async()=>[]},'@/lib/managed-locations':{getAllLocations:async()=>[]},'@/lib/live-music':{getLiveMusicSchedule:async()=>({schedule:{shows:[]}})},'@/lib/menu-files':{latestPublicMenu:async()=>null},'@/lib/beer-release-alert':{getPublishedBeerReleaseAlerts:async()=>[]},'@/lib/keg-inventory':{getUploadedKegInventory:async()=>null},'@/lib/coupons':{getCouponOffers:async()=>[]},'@/lib/shop':{getShopCatalog:async()=>({products:[]})},
};
async function moduleAt(relative){const code=ts.transpileModule(await readFile(new URL('../'+relative,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const module={exports:{}};new Function('require','module','exports',code)(name=>{if(name.startsWith('@/'))return aliases[name]||{};return require(name);},module,module.exports);return module.exports;}
function request(path,body,method='POST',authenticated=true){return new NextRequest('https://fixture.invalid'+path,{method,headers:{'content-type':'application/json',...(authenticated?{'x-fixture-manager':'yes'}:{})},body:JSON.stringify(body)});}
const actualFetch=globalThis.fetch;globalThis.fetch=()=>{throw new Error('External requests are forbidden in approval tests');};
try{
 const tourEmail=await moduleAt('src/app/api/manager/tours/email/route.ts'),tourAdmin=await moduleAt('src/app/api/manager/tours/route.ts'),proposal=await moduleAt('src/app/api/manager/event-plans/[id]/proposals/[proposalId]/route.ts'),newsletter=await moduleAt('src/app/api/manager/newsletter/route.ts');
 const guest={signupId:'fixture-tour',subject:'Fixture subject',message:'Fixture message'};
 assert.equal((await tourEmail.POST(request('/api/manager/tours/email',guest))).status,403);assert.equal(counters.messages,0);
 assert.equal((await tourEmail.POST(request('/api/manager/tours/email',{...guest,emailApproved:true},'POST',false))).status,401);
 assert.equal((await tourEmail.POST(request('/api/manager/tours/email',{...guest,emailApproved:true}))).status,200);assert.equal(counters.messages,1);
 const signup={name:'Fixture',email:'fixture@example.com',tickets:1};
 const silent=await tourAdmin.POST(request('/api/manager/tours',signup));assert.equal(silent.status,200);assert.equal((await silent.json()).customerNotified,false);assert.equal(counters.guest,0);assert.equal(counters.manager,1);
 assert.equal((await tourAdmin.POST(request('/api/manager/tours',{...signup,emailApproved:true}))).status,200);assert.equal(counters.guest,1);
 const cancellation={date:'2027-01-02',time:'4:00 PM',message:'Fixture cancellation'};
 assert.equal((await tourAdmin.PATCH(request('/api/manager/tours',cancellation,'PATCH'))).status,403);assert.equal(counters.cancels,0);
 assert.equal((await tourAdmin.PATCH(request('/api/manager/tours',{...cancellation,emailApproved:true},'PATCH'))).status,200);assert.equal(counters.cancels,1);
 const context={params:Promise.resolve({id:'fixture-plan',proposalId:'fixture-proposal'})};
 assert.equal((await proposal.POST(request('/api/manager/event-plans/fixture/proposals/fixture',{availabilityApproved:true,capacityApproved:true}),context)).status,403);assert.equal(counters.proposals,0);
 assert.equal((await proposal.POST(request('/api/manager/event-plans/fixture/proposals/fixture',{action:'retry-delivery'}),context)).status,403);assert.equal(counters.retries,0);
 assert.equal((await proposal.POST(request('/api/manager/event-plans/fixture/proposals/fixture',{emailApproved:true,availabilityApproved:true,capacityApproved:true}),context)).status,200);assert.equal(counters.proposals,1);
 assert.equal((await proposal.POST(request('/api/manager/event-plans/fixture/proposals/fixture',{action:'retry-delivery',emailApproved:true}),context)).status,200);assert.equal(counters.retries,1);
 const campaign={action:'send-all',draft:{subject:'Fixture',heading:'Fixture',message:'Fixture',sections:{}}};
 assert.equal((await newsletter.POST(request('/api/manager/newsletter',campaign))).status,403);assert.equal(counters.mail,0);
 assert.equal((await newsletter.POST(request('/api/manager/newsletter',{...campaign,emailApproved:true}))).status,200);assert.equal(counters.mail,1);assert.equal(counters.campaigns,1);
 console.log('Manager email approval passed: unapproved customer messages, proposals, confirmation retries, tour cancellation notices and campaigns are blocked; manual tour signup is silent by default; approved fixture paths work. No external mail, network requests or database writes.');
}finally{globalThis.fetch=actualFetch;}
