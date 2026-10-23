import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleUrl=source=>`data:text/javascript;base64,${Buffer.from(compile(source)).toString('base64')}`;
const planUrl=moduleUrl(await readFile(new URL('../src/lib/event-plan.ts',import.meta.url),'utf8'));
const {emptyEventPlan,emptyFlightPlan,parseEventPlan,eventTotals,eventOrderItems,changeEventPackage,readyRoomMenu,readyRoomPackages}=await import(planUrl);
const input={...emptyEventPlan(),title:'Birthday dinner',date:'2026-11-14',startTime:'17:00',endTime:'21:00',guestCount:30,contactEmail:'',items:[{id:'dinner',name:'Dinner',category:'Food',quantity:20,unitPriceCents:4500,taxable:true,notes:'Vegetarian option included'},{id:'room',name:'Existing custom room charge',category:'Room',quantity:1,unitPriceCents:50000,taxable:false,notes:''}],taxRateBps:725,pfbTaxRateBps:0,paidCents:50000};
const first=parseEventPlan(input);
assert.deepEqual(eventTotals(first),{subtotal:140000,tax:6525,salesTax:6525,pfbTax:0,total:146525,paid:50000,balance:96525});
const changed=parseEventPlan({...input,items:input.items.map(row=>row.id==='dinner'?{...row,quantity:18,unitPriceCents:4200}:row)});
assert.equal(eventTotals(changed).balance,81081);
assert.equal(eventTotals({...first,paidCents:150000}).balance,-3475);
assert.equal(parseEventPlan({...input,contactEmail:'Guest@Example.com',guestEmails:['OTHER@example.com','other@example.com']}).guestEmails.length,1);
assert.equal(parseEventPlan(input).contactEmail,'');
for(const change of [{date:'2026-02-30'},{startTime:'25:00'},{contactEmail:'a@example.com\nBcc: bad@example.com'},{guestEmails:['not-an-email']},{taxRateBps:NaN},{pfbTaxRateBps:-1},{paidCents:-1},{items:[{...input.items[0],quantity:1.5}]},{items:[{...input.items[0],unitPriceCents:-100}]},{items:[input.items[0],input.items[0]]},{items:Array(101).fill(input.items[0])}])assert.throws(()=>parseEventPlan({...input,...change}));
const legacy={...input};delete legacy.flightPlan;delete legacy.pfbTaxRateBps;delete legacy.reservationDepositCents;
assert.equal(eventTotals(parseEventPlan(legacy)).balance,96525,'Existing manual orders keep their prices and tax');
assert.equal(emptyEventPlan(35000).items.length,0,'Reservation deposit must not be a room charge');
assert.equal(emptyEventPlan(35000).paidCents,0,'Do not claim an unreceived deposit was paid');
for(const pkg of readyRoomPackages){
  const flightPlan={...emptyFlightPlan(),packageId:pkg.id,appetizers:readyRoomMenu.appetizers.slice(0,pkg.appetizers),entrees:(pkg.id==='dinner'?readyRoomMenu.premiumEntrees:readyRoomMenu.entrees).slice(0,2),sides:readyRoomMenu.sides.slice(0,2),salads:readyRoomMenu.salads.slice(0,pkg.salads)};
  if(flightPlan.entrees.includes('Aviator Pizzeria Pizza Bar'))flightPlan.pizzas=['Hot Honey','Just the Cheese'];
  const details=parseEventPlan({...emptyEventPlan(),title:'Package test',date:'2026-11-14',guestCount:30,flightPlan,paidCents:35000});
  const totals=eventTotals(details),base=pkg.priceCents*30;
  assert.equal(totals.subtotal,base);assert.equal(totals.salesTax,Math.round(base*.0725));assert.equal(totals.pfbTax,Math.round(base*.01));assert.equal(totals.balance,totals.total-35000);
  assert.equal(eventOrderItems(details).length,1,'Included foods and specialty pizzas do not incur duplicate charges');
  assert.equal(eventTotals({...details,guestCount:40}).subtotal,pkg.priceCents*40,'Guest count recalculates package');
  for(const f of [{...flightPlan,appetizers:flightPlan.appetizers.slice(1)},{...flightPlan,sides:['Unknown side','Mac & Cheese']},{...flightPlan,entrees:['Unknown food','Aviator Pulled Pork BBQ']},{...flightPlan,extraHours:1.5},{...flightPlan,dessert:'yes'},{...flightPlan,extraEntrees:['Unknown entree']}])assert.throws(()=>parseEventPlan({...details,flightPlan:f}));
  assert.throws(()=>parseEventPlan({...details,guestCount:29}));
  const upgraded=parseEventPlan({...details,flightPlan:{...flightPlan,appetizers:['Shrimp Cocktail',...flightPlan.appetizers.slice(1)]}});
  assert.equal(eventTotals(upgraded).subtotal,base+30*300,'Shrimp is a $3 premium upgrade in every package');
  const extraShrimp=parseEventPlan({...upgraded,flightPlan:{...upgraded.flightPlan,extraAppetizers:['Shrimp Cocktail']}});
  assert.equal(eventTotals(extraShrimp).subtotal,base+30*(300+300+300),'An extra shrimp selection adds both the extra-app price and its premium upgrade');
  const extra={...flightPlan,extraAppetizers:['Shrimp Cocktail'],extraEntrees:['Country Fried Chicken Cutlet'],extraHours:2,dessert:true,coffee:true};
  const repeated={...flightPlan,appetizers:Array(pkg.appetizers).fill("Hush Puppies"),extraAppetizers:["Hush Puppies","Hush Puppies"]};
  const repeatedPlan=parseEventPlan({...details,flightPlan:repeated});
  assert.equal(repeatedPlan.flightPlan.appetizers.length,pkg.appetizers);
  assert.equal(eventTotals(repeatedPlan).subtotal,base+30*300*2,"Included duplicates stay included; extra appetizer portions are charged individually");
  const extraSides={...flightPlan,extraSides:['French Fries'],extraSalads:['Spinach Caprese Salad'],extraSidePriceCents:300,extraSaladPriceCents:400};
  const repeatedFoods={...flightPlan,entrees:['Aviator Pulled Pork BBQ','Aviator Pulled Pork BBQ'],sides:['Mac & Cheese','Mac & Cheese'],pizzas:[],extraEntrees:['Aviator Pulled Pork BBQ','Aviator Pulled Pork BBQ'],extraSides:['Mac & Cheese','Mac & Cheese'],extraSidePriceCents:300};
  const repeatFoodPlan=parseEventPlan({...details,flightPlan:repeatedFoods});
  assert.equal(eventTotals(repeatFoodPlan).subtotal,base+30*(500+300)*2,'Repeated included foods stay included; each extra entree and side is charged');
  assert.deepEqual(repeatFoodPlan.flightPlan.entrees,repeatedFoods.entrees);assert.deepEqual(repeatFoodPlan.flightPlan.sides,repeatedFoods.sides);
  const withSides=parseEventPlan({...details,flightPlan:extraSides});
  assert.equal(eventTotals(withSides).subtotal,base+30*700,'Additional sides and salads use their recorded per-guest prices');
  assert.equal(eventTotals({...withSides,guestCount:40}).subtotal,pkg.priceCents*40+40*700);
  assert.equal(eventTotals(parseEventPlan({...withSides,flightPlan:{...extraSides,extraSidePriceCents:0}})).subtotal,base+30*400,'An explicitly entered complimentary side remains free');
  for(const values of [{extraSidePriceCents:null},{extraSaladPriceCents:null},{extraSidePriceCents:-1},{extraSidePriceCents:1.5},{extraSides:['Unknown side']},{extraSalads:['Unknown salad']},{extraSides:Array(13).fill('French Fries')}])assert.throws(()=>parseEventPlan({...details,flightPlan:{...extraSides,...values}}));
  const oldFlightPlan={...flightPlan};for(const key of ['extraSides','extraSalads','extraSidePriceCents','extraSaladPriceCents'])delete oldFlightPlan[key];assert.equal(eventTotals(parseEventPlan({...details,flightPlan:oldFlightPlan})).subtotal,base,'Older saved plans keep their existing totals');
  const withExtras=parseEventPlan({...details,flightPlan:extra});
  assert.equal(eventTotals(withExtras).subtotal,base+30*(300+300+500+600+300)+20000);
}
// Manager per-event appetizer and entree prices preserve defaults, duplicates and premium rules.
for (const pkg of readyRoomPackages) {
 const f={...emptyFlightPlan(),packageId:pkg.id,appetizers:Array(pkg.appetizers).fill('Hush Puppies'),entrees:['Aviator Pulled Pork BBQ','Aviator Chicken Tenders'],sides:['Mac & Cheese','Potato Salad'],salads:pkg.salads?['Caesar Salad']:[],extraAppetizers:['Hush Puppies','Shrimp Cocktail'],extraEntrees:['Aviator Pulled Pork BBQ','Aviator Pulled Pork BBQ','Aviator Beef Brisket'],extraAppetizerPriceCents:225,extraEntreePriceCents:450,extraPremiumEntreePriceCents:650};
 const p=parseEventPlan({...emptyEventPlan(),title:'Manager extra prices',date:'2027-04-10',guestCount:50,flightPlan:f});
 assert.equal(eventTotals(p).subtotal,pkg.priceCents*50+50*(225*2+300+450*2+650));
 assert.equal(eventTotals({...p,guestCount:60}).subtotal,pkg.priceCents*60+60*(225*2+300+450*2+650));
 assert.equal(eventOrderItems(p).find(row=>row.name==='Additional premium entree: Aviator Beef Brisket').unitPriceCents,650);
 const free=parseEventPlan({...p,flightPlan:{...f,extraAppetizerPriceCents:0,extraEntreePriceCents:0,extraPremiumEntreePriceCents:0}});
 assert.equal(eventTotals(free).subtotal,pkg.priceCents*50+50*300,'Zero-price extras retain only the configured premium appetizer upgrade');
 const old={...f};for(const key of ['extraAppetizerPriceCents','extraEntreePriceCents','extraPremiumEntreePriceCents'])delete old[key];
 const parsedOld=parseEventPlan({...p,flightPlan:old});
 for(const key of ['extraAppetizerPriceCents','extraEntreePriceCents','extraPremiumEntreePriceCents'])assert.ok(!Object.hasOwn(parsedOld.flightPlan,key),'Legacy proposal terms do not acquire new price overrides');
 assert.equal(eventTotals(parsedOld).subtotal,pkg.priceCents*50+50*(300*2+300+500*2+700));
 for(const key of ['extraAppetizerPriceCents','extraEntreePriceCents','extraPremiumEntreePriceCents'])for(const value of [null,-1,1.5,'300',NaN,Infinity,10000001])assert.throws(()=>parseEventPlan({...p,flightPlan:{...f,[key]:value}}));
 const pizza=parseEventPlan({...p,flightPlan:{...f,pizzaExtra:true,pizzas:['Caprese']}});
 assert.equal(eventTotals(pizza).subtotal,eventTotals(p).subtotal+50*450,'Additional Pizza Bar uses the recorded regular entree price');
}
// Premium replacement versus additional pricing, including Dinner's included premium allowance.
for (const pkg of readyRoomPackages) {
  const premiumFlight={...emptyFlightPlan(),packageId:pkg.id,appetizers:Array(pkg.appetizers).fill('Hush Puppies'),entrees:['Aviator Beef Brisket','Aviator Pulled Pork BBQ'],sides:['Mac & Cheese','Potato Salad'],salads:pkg.salads?['Caesar Salad']:[]};
  const p=parseEventPlan({...emptyEventPlan(),title:'Premium pricing',date:'2026-11-14',guestCount:55,flightPlan:premiumFlight});
  const base=pkg.priceCents*55, upgrade=pkg.id==='dinner'?0:55*200;
  assert.equal(eventTotals(p).subtotal,base+upgrade,'Included premium replacement adds $2, except Dinner');
  const extra=parseEventPlan({...p,flightPlan:{...premiumFlight,extraEntrees:['Aviator Beef Brisket','Aviator Pulled Pork BBQ']}});
  assert.equal(eventTotals(extra).subtotal,base+upgrade+55*(700+500),'Extra premium is $7 total and extra regular is $5');
  assert.equal(eventOrderItems(extra).find(row=>row.name==='Additional premium entree: Aviator Beef Brisket').unitPriceCents,700);
  const repeat=parseEventPlan({...p,flightPlan:{...premiumFlight,entrees:['Aviator Beef Brisket','Aviator Beef Brisket'],extraEntrees:['Aviator Beef Brisket','Aviator Beef Brisket']}});
  assert.equal(eventTotals(repeat).subtotal,base+upgrade*2+55*700*2,'Repeated premium replacements and extras each have their own charge');
}
assert.ok(!readyRoomMenu.premiumEntrees.includes('Aviator Pulled Pork BBQ'));
assert.ok(!readyRoomMenu.premiumEntrees.includes('Country Fried Chicken Cutlet'));
assert.equal(new Set([...readyRoomMenu.entrees,...readyRoomMenu.premiumEntrees]).size,readyRoomMenu.entrees.length+readyRoomMenu.premiumEntrees.length,'Regular and premium lists must not duplicate foods');
for(const pkg of readyRoomPackages){
 const f={...emptyFlightPlan(),packageId:pkg.id,appetizers:Array(pkg.appetizers).fill('Brewer Fries'),entrees:['Aviator Pulled Pork BBQ','Aviator Pulled Pork BBQ'],sides:['Mac & Cheese','Potato Salad'],salads:pkg.salads?['Caesar Salad']:[]};
 const base={...emptyEventPlan(),title:'Revised appetizer menu',date:'2026-11-14',guestCount:55,flightPlan:f};
 const regular=parseEventPlan(base);assert.equal(eventTotals(regular).subtotal,pkg.priceCents*55);
 const crostini=parseEventPlan({...base,flightPlan:{...f,appetizers:['Brisket Crostini',...f.appetizers.slice(1)],extraAppetizers:['Brisket Crostini']}});
 assert.equal(eventTotals(crostini).subtotal,pkg.priceCents*55+55*(300+300+300),'Included crostini premium plus extra crostini premium and extra appetizer');
}
for(const name of ['Brewer Fries','Sweet Potato Fries','Tater Tots'])assert.ok(readyRoomMenu.appetizers.includes(name));
assert.ok(!readyRoomMenu.appetizers.includes('Loaded Tots'));assert.ok(!readyRoomMenu.appetizers.includes('Brisket Crostini'));
assert.ok(!readyRoomMenu.appetizers.includes('Aviator Chicken Tenders with Aviator Sauce'));assert.ok(readyRoomMenu.entrees.includes('Aviator Chicken Tenders'));
const dinner={...emptyFlightPlan(),packageId:'dinner',appetizers:['Hush Puppies','Hush Puppies','Loaded Tots'],entrees:['Herb-Roasted Chicken','Bourbon-Glazed Chicken'],sides:readyRoomMenu.sides.slice(0,2),salads:['Greek Salad']};
const social=changeEventPackage(dinner,'social');assert.equal(social.appetizers.length,2);assert.equal(social.salads.length,0);assert.deepEqual(social.entrees,dinner.entrees,'Premium selections remain available as paid replacements when changing packages');
const pizza={...dinner,extraEntrees:['Herb-Roasted Chicken','Herb-Roasted Chicken'],extraSides:['French Fries','French Fries'],extraSidePriceCents:300,extraSalads:['Caesar Salad'],extraSaladPriceCents:400,pizzaExtra:true,pizzas:['Caprese']};
const pizzaPlan=parseEventPlan({...emptyEventPlan(),title:'<script>event</script>',date:'2026-11-14',guestCount:30,flightPlan:{...pizza,dietaryNeeds:'Peanut allergy',barMode:'Drink tickets',ticketCount:60,decorNotes:'Blue balloons'},internalNotes:'STAFF SECRET'});
assert.equal(eventTotals(pizzaPlan).subtotal,30*(4400+500+700*2+300*2+400));
assert.throws(()=>parseEventPlan({...pizzaPlan,flightPlan:{...pizza,pizzas:[]}}));
assert.throws(()=>parseEventPlan({...pizzaPlan,flightPlan:{...pizza,pizzas:readyRoomMenu.pizzas.slice(0,4)}}));
assert.throws(()=>parseEventPlan({...pizzaPlan,flightPlan:{...pizza,pizzaExtra:false}}));
assert.throws(()=>parseEventPlan({...pizzaPlan,flightPlan:{...pizza,entrees:['Aviator Pizzeria Pizza Bar','Herb-Roasted Chicken']}}));
const quote=parseEventPlan({...emptyEventPlan(),title:'Aviator Feast - 55 guests',date:'2026-11-14',guestCount:55,flightPlan:{...emptyFlightPlan(),packageId:'feast',appetizers:['Hush Puppies','Aviator Chicken Tenders with Aviator Sauce','Aviator Chicken Tenders with Aviator Sauce'],entrees:['Aviator Pulled Pork BBQ','Aviator Pulled Pork BBQ'],extraEntrees:['Bacon-Wrapped Meatloaf','Bacon-Wrapped Meatloaf','Aviator Smoked Wings','Aviator Smoked Wings'],sides:['Mac & Cheese','Mac & Cheese'],extraSides:['Mac & Cheese','Mac & Cheese','Potato Salad','Potato Salad','Tater Tots','Tater Tots'],salads:['Caesar Salad']}});
assert.deepEqual(eventTotals(quote),{subtotal:418000,salesTax:30305,pfbTax:4180,tax:34485,total:452485,paid:0,balance:452485});
assert.equal(readyRoomMenu.entrees.includes('Aviator Beef Brisket'),false);assert.equal(readyRoomMenu.premiumEntrees.includes('Aviator Beef Brisket'),true);assert.equal(readyRoomMenu.appetizers.includes('Shrimp Cocktail'),false);assert.equal(readyRoomMenu.premiumAppetizers.includes('Shrimp Cocktail'),true);
const summarySource=(await readFile(new URL('../src/lib/event-plans.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
const summaryModule=await import(moduleUrl(`import {defaultCateringCatalog,eventDateLabel,eventOrderItems,eventTotals,flightPlanSelections,money,parseEventPlan,timeLabel} from ${JSON.stringify(planUrl)};\n${summarySource}`));
const plan={id:'test',version:2,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceInquiryId:null,details:pizzaPlan};
for(const flight of [true,false]){
  const html=summaryModule.eventSummaryHtml(plan,true,'',flight);
  for(const text of ['Herb-Roasted Chicken','Hush Puppies × 2','Herb-Roasted Chicken × 2','French Fries × 2','Additional side: French Fries','Additional salad: Caesar Salad','Greek Salad','Peanut allergy','Caprese','Blue balloons','Drink tickets','60','7.25%','PFB tax (1%)','$350.00','&lt;script&gt;event&lt;/script&gt;'])assert.ok(html.includes(text),text);
  assert.ok(!html.includes('STAFF SECRET'));assert.ok(!html.includes('<script>event</script>'));
  assert.equal(html.includes('Customer printed name / signature'),flight);
}
for(const cateringMode of ['meeting','drinks','custom']){
 const meeting=parseEventPlan({...emptyEventPlan(),title:'General business meeting',date:'2027-04-10',startTime:'09:00',endTime:'11:00',guestCount:12,flightPlan:{...emptyFlightPlan(),cateringMode,eventType:'General business meeting',organization:'Fixture company',foodNotes:'Boardroom layout; no buffet; drinks at actual prices.',barMode:'Guest-paid bar',av:['Big-screen setup','Microphone']},notes:'Meeting agenda and setup instructions'});
 assert.equal(meeting.flightPlan.cateringMode,cateringMode);assert.equal(eventTotals(meeting).subtotal,0,'Custom service choices never add an automatic catering charge');assert.equal(eventOrderItems(meeting).length,0);
 const withItems=parseEventPlan({...meeting,items:[{id:'custom-food',category:'Food',name:'Off-menu platter',quantity:2,unitPriceCents:4500,taxable:true,notes:'Fixture order'},{id:'drinks',category:'Drinks',name:'Drink service',quantity:12,unitPriceCents:600,taxable:true,notes:''}]});
 assert.equal(eventTotals(withItems).subtotal,16200);assert.equal(withItems.flightPlan.foodNotes,meeting.flightPlan.foodNotes);assert.equal(withItems.flightPlan.eventType,'General business meeting');assert.deepEqual(withItems.flightPlan.av,['Big-screen setup','Microphone']);
 const html=summaryModule.eventSummaryHtml({id:'meeting-fixture',version:1,updatedAt:new Date().toISOString(),details:meeting},true);assert.ok(html.includes('Meeting &amp;')||html.includes('Meeting & service plan'));assert.ok(html.includes('General business meeting'));assert.ok(html.includes('Fixture company'));assert.ok(html.includes('Boardroom layout'));assert.ok(!html.includes('Package choices include buffet service'));
 assert.throws(()=>parseEventPlan({...meeting,flightPlan:{...meeting.flightPlan,cateringMode:'unknown'}}));assert.throws(()=>parseEventPlan({...meeting,flightPlan:{...meeting.flightPlan,cateringMode:null}}));
 assert.throws(()=>parseEventPlan({...pizzaPlan,flightPlan:{...pizzaPlan.flightPlan,cateringMode}}),'Buffet and no-package service plans cannot be combined');
}
assert.ok(!Object.hasOwn(parseEventPlan(input).flightPlan,'cateringMode'),'Legacy records do not gain a service-plan field');
console.log('Event planning passed: package choices, premium menus, extras, guest recalculation, separate taxes, deposit credits, legacy orders, printable Flight Plan and summary, private notes and validation.');
