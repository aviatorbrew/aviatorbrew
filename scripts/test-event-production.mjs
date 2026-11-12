import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import ts from 'typescript';
const url=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const modelUrl=url(await readFile(new URL('../src/lib/event-plan.ts',import.meta.url),'utf8')),m=await import(modelUrl);
const productionUrl=url((await readFile(new URL('../src/lib/event-production.ts',import.meta.url),'utf8')).replaceAll('@/lib/event-plan',modelUrl)),p=await import(productionUrl);
const kitchenUrl=url((await readFile(new URL('../src/lib/event-kitchen-sheet.ts',import.meta.url),'utf8')).replaceAll('@/lib/event-plan',modelUrl).replaceAll('@/lib/event-production',productionUrl)),k=await import(kitchenUrl);
const catalog=structuredClone(m.defaultCateringCatalog),settings=structuredClone(p.defaultEventProductionSettings);
const d={...m.emptyEventPlan(),title:'Kitchen fixture event',contactEmail:'do-not-print@example.invalid',internalNotes:'PRIVATE PAYMENT NOTES',date:'2026-11-06',startTime:'17:00',endTime:'21:00',foodTime:'18:30',status:'Confirmed',guestCount:70,flightPlan:{...m.emptyFlightPlan(),packageId:'social',appetizers:['Hush Puppies','Loaded Tots'],entrees:['Aviator Pulled Pork BBQ','Aviator Beef Brisket'],sides:['Mac & Cheese','Spinach Caprese Salad']}};
const before=structuredClone(d),production=p.eventProductionPlan(d,catalog,settings),proteins=production.groups.find(g=>g.name==='Proteins');
assert.equal(production.protein.limit,77);assert.equal(production.protein.servings,77);
assert.deepEqual(proteins.rows.map(r=>r.proteinServings),[39,38]);
assert.equal(proteins.rows[0].ounces,39*.65*16);assert.equal(proteins.rows[1].ounces,38*.5*16);
assert.equal(production.groups.find(g=>g.name==='Sides').totalOz,70*8*1.15);
const override={...d,kitchenPlan:{proteinShares:{'Aviator Pulled Pork BBQ':2},proteinPortionLb:{'Aviator Beef Brisket':.6},sideReservePercent:20}};
const adjusted=p.eventProductionPlan(override,catalog,settings);
assert.deepEqual(adjusted.protein.rows.map(r=>r.servings),[51,26]);assert.equal(adjusted.protein.rows[1].portionLb,.6);assert.equal(adjusted.groups.find(g=>g.name==='Sides').totalOz,70*8*1.2);
assert.deepEqual(m.parseEventPlan(override,catalog).kitchenPlan,override.kitchenPlan,'Event overrides persist');
assert.throws(()=>m.parseEventPlan(override,catalog,false),'Public inquiries cannot set internal kitchen allowances');
for(const bad of [{proteinShares:{'Aviator Pulled Pork BBQ':0}},{proteinPortionLb:{'Aviator Beef Brisket':6}},{sideReservePercent:51}])assert.throws(()=>m.parseEventPlan({...d,kitchenPlan:bad},catalog));
for(const guests of [1,9,10,20,40,60,70,100])for(const names of [['Aviator Pulled Pork BBQ'],['Aviator Pulled Pork BBQ','Aviator Beef Brisket'],['Aviator Pulled Pork BBQ','Aviator Beef Brisket','Aviator Smoked Wings']]){
 const plan=p.eventProductionPlan({...d,guestCount:guests,flightPlan:{...d.flightPlan,entrees:names}},catalog,settings);
 const total=plan.protein.rows.reduce((sum,r)=>sum+r.servings,0);assert.ok(total>=guests);assert.ok(total<=guests*1.1+1e-8);assert.equal(total,Math.floor(guests*1.1+1e-8));assert.ok(plan.protein.rows.every(r=>Number.isInteger(r.servings)));
}
const repeated=p.eventProductionPlan({...d,flightPlan:{...d.flightPlan,extraEntrees:['Aviator Pulled Pork BBQ']}},catalog,settings);assert.deepEqual(repeated.protein,production.protein,'Duplicate choices do not multiply protein servings');
const wingDetails={...d,flightPlan:{...d.flightPlan,entrees:['Aviator Smoked Wings']}},wingPlan=p.eventProductionPlan(wingDetails,catalog,settings),wing=wingPlan.groups.find(g=>g.name==='Proteins').rows[0];
assert.equal(wing.count,385,'77 protein servings × 5 wings; reserve included once');assert.equal(wing.ounces,0);
assert.match(p.productionBatchGuide(wing),/1 full tray × 200 pieces \+ 1 full tray × 185 pieces \(partial\)/);
assert.equal(p.eventProductionPlan(wingDetails,catalog,{...settings,buffetWingsPerGuest:3}).groups.find(g=>g.name==='Proteins').rows[0].count,231);
const mixed=p.eventProductionPlan({...d,flightPlan:{...d.flightPlan,entrees:['Aviator Smoked Wings','Aviator Pulled Pork BBQ']}},catalog,settings);assert.equal(mixed.protein.servings,77);assert.equal(mixed.groups.find(g=>g.name==='Proteins').rows[0].count,195,'Wings share the protein budget with BBQ');
assert.match(p.customOrderProductionGuide({name:'Entree: Aviator Smoked Wings / piece',quantity:250,kitchen:{piecesPerUnit:1,piecesPerTray:200}},settings,catalog),/1 full tray × 200 pieces \+ 1 half tray × 50 pieces \(partial\)/);
assert.match(p.trayFills(12,10,5),/1 full tray × 10 lb \+ 1 half tray × 2 lb/);
assert.match(p.trayFills(18,10,5,true),/3 half trays × 5 lb \+ 1 half tray × 3 lb/);
const mac=production.groups.find(g=>g.name==='Sides').rows.find(r=>r.name==='Mac & Cheese');assert.equal(mac.panSize,'half');assert.match(p.productionBatchGuide({...mac,ounces:18*16}),/3 half trays × 5 lb \+ 1 half tray × 3 lb/);
assert.match(p.customOrderProductionGuide({name:'Side: Mac & Cheese / guest',quantity:36,kitchen:{ouncesPerUnit:8}},settings,catalog),/3 half trays × 5 lb \+ 1 half tray × 3 lb/);
const measured=p.productionPanFor('Mac & Cheese','Sides',catalog,{...settings,halfTrayFinishedLb:{'Mac & Cheese':6}});assert.match(p.productionBatchGuide({...mac,...measured,ounces:18*16}),/3 half trays × 6 lb/);
const withSalad=p.eventProductionPlan({...d,flightPlan:{...d.flightPlan,salads:['Caesar Salad']}},catalog,settings);assert.equal(withSalad.groups.find(g=>g.name==='Sides').perGuestOz,6);assert.equal(withSalad.groups.find(g=>g.name==='Salads').perGuestOz,2);
const pizzaDetails={...d,flightPlan:{...d.flightPlan,entrees:['Aviator Pizzeria Pizza Bar','Aviator Pulled Pork BBQ'],pizzas:['The Aviator','Caprese','Hot Honey'],pizzaNotes:'NO BALSAMIC <script>bad()</script>',glutenFreeCount:2}},pizza=p.eventProductionPlan(pizzaDetails,catalog,settings);
assert.equal(pizza.pizzaCountTotal,14);assert.equal(pizza.pizzaRows.reduce((sum,r)=>sum+r.count,0),14);assert.equal(pizza.pizzaRows.find(r=>r.name==='Gluten-free pizza').count,2);assert.ok(pizza.warnings.some(w=>w.includes('Do not add them on top')));
const pizzaKnown=p.eventProductionPlan(pizzaDetails,catalog,{...settings,regularPizzaOz:32,glutenFreePizzaOz:16});assert.equal(pizzaKnown.pizzaCountTotal,14);assert.equal(pizzaKnown.pizzaRoundingOz,122);
const noFood=p.eventProductionPlan({...d,flightPlan:{...m.emptyFlightPlan(),cateringMode:'meeting'}},catalog,settings);assert.equal(noFood.totalOz,0);assert.equal(noFood.protein.servings,0);
for(const bad of [{reservePercent:-1},{reservePercent:26},{entreeOz:0},{sideOz:Infinity},{regularPizzaOz:0},{glutenFreePizzaOz:NaN},{trayFinishedLb:{'Mac & Cheese':-1}},{halfTrayFinishedLb:{'Mac & Cheese':-1}},{itemPanSize:{'Mac & Cheese':'third'}},{pizzaSlicesPerPie:8.5},{buffetWingsPerGuest:0},{wingsPerFullTray:0},{wingsPerHalfTray:0},{cookedWingsPerLb:0},{aLaCarteEntreeOz:0},{proteinPortionLb:{bbq:6}},{sideReservePercent:51}])assert.throws(()=>p.parseEventProductionSettings({...settings,...bad}));
assert.deepEqual(p.parseEventProductionSettings(settings),settings);assert.deepEqual(d,before);
const sheet=k.kitchenProductionSheetHtml({id:'fixture',version:1,details:d},catalog,true,settings);
assert.ok(sheet.includes('77 buffet servings'));assert.ok(sheet.includes('39 protein servings'));assert.ok(sheet.includes('0.65 lb'));assert.ok(sheet.includes('half tray'));assert.ok(sheet.includes('Production guide v.1.7'));assert.ok(!sheet.includes(d.contactEmail));assert.ok(!sheet.includes(d.internalNotes));
const pizzaSheet=k.kitchenProductionSheetHtml({id:'pizza',version:1,details:pizzaDetails},catalog,true,settings);assert.ok(pizzaSheet.includes('NO BALSAMIC &lt;script&gt;'));assert.ok(!pizzaSheet.includes('<script>bad'));assert.ok(pizzaSheet.includes('MAKE 14 WHOLE PIZZAS'));
assert.ok(k.kitchenProductionSheetHtml({id:'fixture',version:1,details:{...d,status:'Cancelled'}},catalog,false,settings).includes('DO NOT PRODUCE'));
await writeFile('/tmp/aviator-kitchen-production-fixture.html',sheet);await writeFile('/tmp/aviator-kitchen-production-fixture.json',JSON.stringify({plan:{id:'gcal-'+('c'.repeat(64)),version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceInquiryId:null,details:d},catalog,production:settings}));
console.log('PASS kitchen planning: shared protein budget ≥ guests and ≤ guests +10%, BBQ/brisket portions, share/portion overrides, larger side reserve, full/half/partial trays, wing counts, pizza/GF rounding, validation, escaping, privacy and preserved source records.');

const explicit={...d,items:[{id:'explicit-wing',category:'Food',name:'Entree: Aviator Smoked Wings / piece',quantity:200,unitPriceCents:200,taxable:true,notes:'',kitchen:{piecesPerUnit:1}}]};
const reserved=p.eventProductionPlan(explicit,catalog,settings);assert.equal(reserved.protein.explicitServings,40);assert.equal(reserved.protein.servings,37);assert.equal(reserved.protein.overLimit,false);
const excessive=p.eventProductionPlan({...explicit,items:[{...explicit.items[0],quantity:400}]},catalog,settings);assert.equal(excessive.protein.servings,0);assert.equal(excessive.protein.overLimit,true);assert.equal(excessive.custom[0].quantity,400,'Never silently reduce an explicit customer order');
console.log('PASS explicit protein orders reserve servings within the shared cap; excessive orders require review.');

const proposalSource=await readFile(new URL('../src/lib/event-proposals.ts',import.meta.url),'utf8');
const hashes=await import(url("import {createHash} from 'node:crypto';\n"+proposalSource.split('\n').filter(line=>line.startsWith('function stable(')||line.startsWith('export function materialHash(')).join('\n')));
assert.equal(hashes.materialHash(d),hashes.materialHash(override),'Internal kitchen planning does not expire existing customer proposal terms');
assert.notEqual(hashes.materialHash(d),hashes.materialHash({...d,guestCount:71}),'Changed customer terms still require a revision');

const guestWings={...m.emptyEventPlan(),title:'Known wing servings',date:'2026-12-16',status:'Confirmed',guestCount:70,items:[{id:'guest-wings',category:'Food',name:'Entree: Aviator Smoked Wings / guest',quantity:70,unitPriceCents:800,taxable:true,notes:''}]};
const guestPlan=p.eventProductionPlan(guestWings,catalog,settings),guide=p.customOrderProductionGuide(guestWings.items[0],settings,catalog);
assert.equal(guestPlan.protein.explicitServings,70);assert.deepEqual(guestPlan.protein.unverified,[]);assert.deepEqual(guestPlan.warnings,[]);assert.match(guide,/70 servings × 5 wings per serving/);assert.match(guide,/350 wing pieces/);assert.match(guide,/1 full tray × 200 pieces \+ 1 full tray × 150 pieces \(partial\)/);
const knownSheet=k.kitchenProductionSheetHtml({id:'guest-wings',version:1,details:guestWings},catalog,true,settings);assert.ok(!knownSheet.includes('Chef checks before production'));assert.ok(!knownSheet.includes('cannot be verified'));assert.ok(knownSheet.includes('350 wings total'));
const perItem={...guestWings.items[0],quantity:40,kitchen:{piecesPerUnit:6,piecesPerTray:150,piecesPerHalfTray:60}};assert.equal(p.eventProductionPlan({...guestWings,items:[perItem]},catalog,settings).protein.explicitServings,48);assert.match(p.customOrderProductionGuide(perItem,settings,catalog),/240 wing pieces/);
assert.equal(p.wingOrderPortion({...guestWings.items[0],name:'Entree: Aviator Smoked Wings / portion'},settings).piecesPerUnit,5);assert.equal(p.wingOrderPortion(guestWings.items[0],{...settings,buffetWingsPerGuest:5}).piecesPerUnit,5);
const budgeted=p.eventProductionPlan({...guestWings,flightPlan:{...m.emptyFlightPlan(),packageId:'social',entrees:['Aviator Smoked Wings']}},catalog,settings);assert.equal(budgeted.protein.explicitServings,70);assert.equal(budgeted.protein.servings,7);assert.equal(budgeted.groups.find(g=>g.name==='Proteins').rows[0].count,35);assert.deepEqual(budgeted.warnings,[]);
const unknownProtein=p.eventProductionPlan({...guestWings,items:[{...guestWings.items[0],name:'Entree: Aviator Pulled Pork BBQ / piece'}]},catalog,settings);assert.ok(unknownProtein.protein.unverified.length);assert.ok(unknownProtein.warnings.some(w=>w.includes('cannot be verified')),'Real missing yields still require review');
console.log('PASS known wing guest orders: five pieces per guest without pound conversion, legacy saved orders, full/half/partial trays, saved overrides, remaining protein budget and no false kitchen warnings.');

assert.equal(settings.pizzaDiameterInches,14);assert.equal(settings.pizzaSlicesPerGuest,3);
const styleGuide=p.customOrderProductionGuide({name:'Pizza: Caprese / pizza',quantity:2,kitchen:{pizzasPerUnit:1}},settings,catalog);assert.match(styleGuide,/2 14-inch pizza\(s\) · 16 slices/);assert.ok(!styleGuide.includes('Confirm style'));

assert.equal(p.pizzaOrderCount({name:'Pizza: Caprese / guest',quantity:70},settings),27);assert.equal(p.pizzaOrderCount({name:'Pizza: Caprese / pizza',quantity:3},settings),3);assert.match(p.customOrderProductionGuide({name:'Pizza: Caprese / pizza',quantity:3},settings,catalog),/3 14-inch pizza/);
await writeFile('/tmp/aviator-known-wings-kitchen.html',knownSheet);

const priorWing={...guestWings.items[0],kitchen:{piecesPerUnit:4,ouncesPerUnit:6.4}};assert.equal(p.wingOrderPortion(priorWing,settings).piecesPerUnit,5);assert.equal(p.wingOrderPortion(priorWing,settings).ouncesPerUnit,8);assert.equal(priorWing.kitchen.piecesPerUnit,4,'Updating guide standards does not rewrite a saved order');assert.equal(p.pizzaOrderCount({name:'Pizza: Caprese / guest',quantity:70,kitchen:{pizzasPerUnit:.25}},settings),27,'Prior two-slice standard follows the new three-slice instruction');

const pizzaGuests={...guestWings,guestCount:30,title:'30-guest quantity fixture',items:[{...guestWings.items[0],id:'pizza',name:'Pizza: Caprese / guest',quantity:30},{...guestWings.items[0],quantity:30},{...guestWings.items[0],id:'side',name:'Side: Mac & Cheese / guest',quantity:30,kitchen:{ouncesPerUnit:8}}]};
const amounts=p.customOrderProductionAmounts(pizzaGuests.items[0],settings,catalog);assert.equal(amounts.orderLabel,'30 guest servings');assert.equal(amounts.makeLabel,'12 whole 14-inch pizzas');assert.match(amounts.foodLabel,/96 slices total/);
const wingAmounts=p.customOrderProductionAmounts(pizzaGuests.items[1],settings,catalog);assert.match(wingAmounts.makeLabel,/1 full tray × 150 wings/);assert.match(wingAmounts.foodLabel,/150 wings total/);
const sideAmounts=p.customOrderProductionAmounts(pizzaGuests.items[2],settings,catalog);assert.equal(sideAmounts.makeLabel,'3 half trays × 5 lb');assert.match(sideAmounts.foodLabel,/15 lb/);
const explicitPies=p.customOrderProductionAmounts({...pizzaGuests.items[0],name:'Pizza: Caprese / pizza',quantity:3},settings,catalog);assert.equal(explicitPies.orderLabel,'3 whole pizzas ordered');assert.equal(explicitPies.makeLabel,'3 whole 14-inch pizzas');
const quantitySheet=k.kitchenProductionSheetHtml({id:'quantities',version:1,details:pizzaGuests},catalog,true,settings);assert.ok(quantitySheet.includes('Guests: 30'));assert.ok(quantitySheet.includes('Quantity to make'));assert.ok(quantitySheet.includes('30 guest servings'));assert.ok(quantitySheet.includes('12 whole 14-inch pizzas'));assert.ok(!quantitySheet.includes('<td>30</td>'));assert.ok(!quantitySheet.includes('30 whole 14-inch pizzas'));
await writeFile('/tmp/aviator-kitchen-quantities.html',quantitySheet);assert.equal(pizzaGuests.items[0].quantity,30,'Printed production quantities do not modify agreed billing quantities');
console.log('PASS kitchen quantity columns: prominent guest count, labeled servings, whole-pizza conversion, full/half tray fills, food totals, explicit orders and preserved quote quantities.');
