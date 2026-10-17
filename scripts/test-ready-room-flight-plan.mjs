import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const pdf=JSON.parse(readFileSync(0,'utf8'));
function form(){
 const fields=Object.fromEntries(Object.entries(pdf.fields).map(([name,f])=>[name,{name,value:f.value??'',readonly:Boolean(f.flags&1)}]));
 const alerts=[];
 const context=vm.createContext({getField:name=>fields[name]||null,app:{alert(message){alerts.push(message);}},event:{}});
 function run(code,event){const before=context.event;context.event=event;try{vm.runInContext(code,context,{timeout:1000});}finally{context.event=before;}}
 function calculate(){for(const name of pdf.order){const field=fields[name],event={target:field,source:null,value:field.value,type:'Calculate'};run(pdf.fields[name].actions.C,event);field.value=event.value;}}
 context.calculateNow=calculate;
 function edit(name,value){const field=fields[name];assert.ok(field,name);assert.ok(!field.readonly,`${name} should be editable`);const event={target:field,value,rc:true,type:'Validate'};if(pdf.fields[name].actions.V)run(pdf.fields[name].actions.V,event);assert.ok(event.rc,`Rejected ${name}: ${value}`);field.value=value;if(pdf.fields[name].actions.U)run(pdf.fields[name].actions.U,{target:field,type:'MouseUp'});calculate();}
 function selectPackage(kind){edit('package_'+kind,'Yes');}
 for(const code of pdf.documentScripts)run(code,{type:'Open'});
 function keystroke(name,change,options={}){const field=fields[name];const event={target:field,value:field.value,change,selStart:0,selEnd:String(field.value).length,willCommit:false,rc:true,fieldFull:false,...options};run(pdf.fields[name].actions.K,event);return event;}
 return {fields,alerts,keystroke,edit,selectPackage,calculate,get:name=>Number(fields[name].value||0),text:name=>String(fields[name].value)};
}
function seed(kind='brewery_social',guests=40){const f=form();f.edit('guest_count',String(guests));f.selectPackage(kind);f.edit('app_hush_puppies','2');f.edit('entree_pulled_pork','2');f.edit('side_mac_and_cheese','2');return f;}
const base=seed();assert.equal(base.get('summary_package_subtotal'),1280);assert.equal(base.get('summary_food_extras'),0);assert.equal(base.get('summary_balance'),1035.6);
for(const [pkg,rate,apps,salads]of[['brewery_social',32,2,0],['aviator_feast',38,3,1],['ready_room_dinner',44,3,1]]){
 const f=seed(pkg);f.edit('app_hush_puppies',String(apps));f.edit('salad_caesar_salad',String(salads||''));assert.equal(f.get('summary_food_extras'),0);assert.equal(f.get('summary_package_rate'),rate);
 f.edit('app_hush_puppies',String(apps+1));f.edit('entree_pulled_pork','3');f.edit('side_mac_and_cheese','3');f.edit('salad_caesar_salad',String(salads+1));assert.equal(f.get('summary_food_extras'),40*(3+5+3+3));
 f.edit('guest_count','55');assert.equal(f.get('summary_food_extras'),55*14);assert.equal(f.get('summary_package_subtotal'),55*rate);
 f.edit('side_mac_and_cheese','2');assert.equal(f.get('summary_food_extras'),55*11,'Changing a side recalculates immediately');f.edit('salad_caesar_salad',String(salads||''));assert.equal(f.get('summary_food_extras'),55*8,'Changing a salad recalculates immediately');
 f.edit('extra_app','1');f.edit('extra_entree','1');assert.equal(f.get('summary_food_extras'),55*8,'Manual extras do not double-count menu overages');f.edit('extra_app','2');assert.equal(f.get('summary_food_extras'),55*11);
}
const over=seed();over.edit('app_hush_puppies','3');over.edit('entree_pulled_pork','3');over.edit('side_mac_and_cheese','3');assert.equal(over.get('summary_food_extras'),440);assert.equal(over.get('summary_subtotal'),1720);assert.equal(over.get('summary_tax'),124.7);assert.equal(over.get('summary_pfb_tax'),17.2);assert.equal(over.get('summary_balance'),1511.9);assert.ok(over.text('summary_selection_extras').includes('$11.00 / guest'));
over.selectPackage('aviator_feast');assert.equal(over.text('package_brewery_social'),'Off');assert.equal(over.get('summary_package_rate'),38);assert.equal(over.get('summary_food_extras'),320);over.selectPackage('ready_room_dinner');assert.equal(over.text('package_aviator_feast'),'Off');assert.equal(over.get('summary_package_rate'),44);assert.equal(over.get('summary_food_extras'),320);
// Individual digits and repeated quantities both count as menu selections.
const marks=form();marks.edit('guest_count','40');marks.selectPackage('brewery_social');for(const name of ['app_hush_puppies','app_tater_tots','app_chips_salsa','entree_pulled_pork','entree_tenders','entree_wings','side_mac_and_cheese','side_collard_greens','side_french_fries'])marks.edit(name,'1');assert.equal(marks.get('summary_food_extras'),440);
marks.edit('side_french_fries','');assert.equal(marks.get('summary_food_extras'),320);marks.edit('app_chips_salsa','');assert.equal(marks.get('summary_food_extras'),200);
const premium=seed('ready_room_dinner');premium.edit('entree_pulled_pork','');premium.edit('premium_flat_iron','2');assert.equal(premium.get('summary_food_extras'),0);premium.edit('premium_bourbon_chicken','1');assert.equal(premium.get('summary_food_extras'),280);
assert.equal(pdf.fields.entree_brisket,undefined,'Beef brisket only appears in premium entrees');assert.ok(pdf.fields.premium_brisket);assert.ok(pdf.fields.premium_app_shrimp_cocktail);
for(const [pkg,apps]of[['brewery_social',2],['aviator_feast',3],['ready_room_dinner',3]]){
 const f=seed(pkg);f.edit('app_hush_puppies',String(apps-1));f.edit('premium_app_shrimp_cocktail','1');assert.equal(f.get('summary_food_extras'),120,'One included premium appetizer adds $3 per guest');f.edit('app_hush_puppies',String((apps-2)||''));f.edit('premium_app_shrimp_cocktail','2');assert.equal(f.get('summary_food_extras'),240);f.edit('premium_app_shrimp_cocktail','3');assert.equal(f.get('summary_food_extras'),480,'Extra shrimp includes the premium upgrade plus any excess selection charge');
}
// Crostini has the same premium pricing as shrimp in every package.
for(const [pkg,apps]of[['brewery_social',2],['aviator_feast',3],['ready_room_dinner',3]]){
 const f=seed(pkg);f.edit('app_hush_puppies',String(apps-1));f.edit('premium_app_brisket_crostini','1');assert.equal(f.get('summary_food_extras'),120);
 f.edit('premium_app_brisket_crostini','2');assert.equal(f.get('summary_food_extras'),360,'Extra crostini includes $3 appetizer plus $3 premium per guest');
 f.edit('premium_app_brisket_crostini','');f.edit('app_brewer_fries','1');assert.equal(f.get('summary_food_extras'),0);
 f.edit('app_sweet_potato_fries','1');assert.equal(f.get('summary_food_extras'),120,'New regular appetizers count toward allowance and overages');
}
for(const name of ['app_loaded_tots','app_chicken_tenders','app_brisket_crostini'])assert.equal(pdf.fields[name],undefined,'Old appetizer fields removed or reclassified');
assert.ok(pdf.fields.entree_tenders,'Chicken tenders remain an entree');
// Compare PDF calculations with the manager model's explicit included/extra choices.
const ts=(await import('typescript')).default;
const modelSource=ts.transpileModule(readFileSync(new URL('../src/lib/event-plan.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const model=await import('data:text/javascript;base64,'+Buffer.from(modelSource).toString('base64'));
for(const [pdfPackage,pkgId]of[['brewery_social','social'],['aviator_feast','feast'],['ready_room_dinner','dinner']]){
 const pkg=model.readyRoomPackages.find(p=>p.id===pkgId);
 for(const [included,extra,premiumExtraCount]of[
  [['Aviator Pulled Pork BBQ','Aviator Beef Brisket'],[],null],
  [['Aviator Pulled Pork BBQ','Aviator Pulled Pork BBQ'],['Aviator Beef Brisket'],null],
  [['Aviator Beef Brisket','Aviator Beef Brisket'],['Aviator Beef Brisket'],null],
  [['Aviator Beef Brisket','Aviator Beef Brisket'],['Aviator Pulled Pork BBQ','Aviator Pulled Pork BBQ'],0],
  [['Aviator Beef Brisket','Aviator Pulled Pork BBQ'],['Aviator Pulled Pork BBQ'],0],
  [['Aviator Pulled Pork BBQ','Aviator Beef Brisket'],['Aviator Beef Brisket'],1],
 ]){
  const f=seed(pdfPackage,55);f.edit('app_hush_puppies',String(pkg.appetizers));f.edit('salad_caesar_salad',String(pkg.salads||''));
  const all=[...included,...extra];f.edit('entree_pulled_pork',String(all.filter(n=>n==='Aviator Pulled Pork BBQ').length||''));f.edit('premium_brisket',String(all.filter(n=>n==='Aviator Beef Brisket').length||''));
  if(premiumExtraCount!==null)f.edit('extra_premium_entree',String(premiumExtraCount));
  const plan=model.parseEventPlan({...model.emptyEventPlan(),title:'PDF premium comparison',date:'2026-11-14',guestCount:55,flightPlan:{...model.emptyFlightPlan(),packageId:pkgId,appetizers:Array(pkg.appetizers).fill('Hush Puppies'),entrees:included,extraEntrees:extra,sides:['Mac & Cheese','Mac & Cheese'],salads:pkg.salads?['Caesar Salad']:[]}});
  const expected=model.eventTotals(plan);
  assert.equal(f.get('summary_subtotal'),expected.subtotal/100,`${pkgId}: premium replacements/extras must match manager`);
  assert.equal(f.get('summary_tax'),expected.salesTax/100);assert.equal(f.get('summary_pfb_tax'),expected.pfbTax/100);
 }
}
for(const name of ['entree_flat_iron','premium_country_chicken','premium_pulled_pork'])assert.equal(pdf.fields[name],undefined,'No regular/premium duplicates');
// Pizza mirrored across pages counts once, including an explicitly identified extra entree.
const pizza=seed();pizza.edit('entree_pulled_pork','1');pizza.edit('entree_pizza_bar','1');pizza.edit('pizza_included_entree','1');pizza.edit('pizza_hot_honey','X');assert.equal(pizza.get('summary_food_extras'),0);assert.equal(pizza.get('summary_specialty_pizza'),0);
pizza.edit('pizza_included_entree','');pizza.edit('entree_pulled_pork','2');pizza.edit('pizza_extra_entree','1');assert.equal(pizza.get('summary_specialty_pizza'),200);assert.equal(pizza.get('summary_food_extras'),0);pizza.edit('extra_entree','1');assert.equal(pizza.get('summary_specialty_pizza'),200);assert.equal(pizza.get('summary_food_extras'),0);
pizza.edit('entree_pizza_bar','2');pizza.edit('pizza_included_entree','1');assert.equal(pizza.get('summary_specialty_pizza'),200);assert.equal(pizza.get('summary_food_extras'),200);pizza.edit('pizza_extra_entree','2');pizza.edit('pizza_included_entree','');pizza.edit('extra_entree','2');assert.equal(pizza.get('summary_specialty_pizza'),400);assert.equal(pizza.get('summary_food_extras'),0);
const services=seed();services.edit('extra_side','2');services.edit('extra_salad','1');services.edit('extra_dessert','X');services.edit('extra_coffee','X');assert.equal(services.get('summary_food_extras'),40*(6+3+6+3));services.edit('extra_hour','2');assert.equal(services.get('summary_event_hours'),200);services.edit('hosted_tab_cap','500');services.edit('drink_ticket_count','20');assert.equal(services.get('summary_bar'),0);services.edit('summary_bar','200');services.edit('summary_other','50');assert.equal(services.get('summary_subtotal'),2450);services.edit('summary_deposit','700');assert.equal(services.get('summary_balance'),1952.13);
const menuFields=Object.keys(pdf.fields).filter(name=>(pdf.fields[name].page===1&&/^(app_|entree_|premium_|side_|salad_)/.test(name))||['pizza_included_entree','pizza_extra_entree'].includes(name));
assert.ok(!menuFields.includes('entree_time'));const schedule=form();schedule.edit('entree_time','6:30 PM');assert.equal(schedule.text('entree_time'),'6:30 PM');
const invalidMenuValues=['0','X','x','a','-1','1.5','10','99','100','1 ',' 1',' ','９'];
for(const name of menuFields){
 const f=form();for(const value of ['1','2','3','4','5','6','7','8','9',''])f.edit(name,value);
 f.edit(name,'4');for(const value of invalidMenuValues){const count=f.alerts.length;assert.throws(()=>f.edit(name,value),`${name}: ${value} must be rejected`);assert.equal(f.alerts.length,count+1);assert.equal(f.alerts.at(-1),'Enter a number from 1-9.');assert.equal(f.text(name),'4','Invalid edits preserve the previous quantity');}
 assert.equal(f.keystroke(name,'9').rc,true,'Replacing a selected digit is allowed');
 assert.equal(f.keystroke(name,'').rc,true,'Clearing a selection is allowed');
 for(const change of invalidMenuValues){const count=f.alerts.length;assert.equal(f.keystroke(name,change).rc,false);assert.equal(f.alerts.length,count+1);assert.equal(f.alerts.at(-1),'Enter a number from 1-9.');}
 assert.equal(f.keystroke(name,'2',{selStart:1,selEnd:1}).rc,false,'Appending a second digit is rejected');
 assert.equal(f.keystroke(name,'1',{value:'',selStart:0,selEnd:0,fieldFull:true,changeEx:'10'}).rc,false,'Reject a multi-digit paste even when the viewer crops it to one character');
 assert.equal(f.keystroke(name,'9',{value:'',selStart:0,selEnd:0,fieldFull:true,changeEx:'9'}).rc,true);
 assert.equal(f.keystroke(name,'',{willCommit:true,value:'X'}).rc,false,'Commit-time keystroke validation also rejects invalid values');
}
assert.throws(()=>seed().edit('guest_count','forty'));assert.throws(()=>seed().edit('summary_food_extras','0'));
const cleared=seed();cleared.edit('app_hush_puppies','3');cleared.edit('package_brewery_social','Off');assert.equal(cleared.get('summary_food_extras'),0);assert.equal(cleared.get('summary_package_subtotal'),0);cleared.selectPackage('brewery_social');cleared.edit('guest_count','');assert.equal(cleared.text('summary_food_extras'),'');cleared.edit('guest_count','40');assert.equal(cleared.get('summary_food_extras'),120);
// Updated-menu 55-guest Feast example; legacy Campbell order is preserved in manager-model tests.
const sample=form();sample.edit('event_name','Aviator Feast - 55 Guest Pricing Example');sample.edit('guest_count','55');sample.selectPackage('aviator_feast');
for(const [name,quantity]of[['app_hush_puppies',1],['app_brewer_fries',2],['entree_pulled_pork',2],['entree_meatloaf',2],['entree_wings',2],['side_mac_and_cheese',4],['side_potato_salad',2],['side_tater_tots',2],['salad_caesar_salad',1]])sample.edit(name,String(quantity));
sample.edit('summary_deposit','0');assert.equal(sample.get('summary_package_subtotal'),2090);assert.equal(sample.get('summary_food_extras'),2090);assert.equal(sample.get('summary_subtotal'),4180);assert.equal(sample.get('summary_tax'),303.05);assert.equal(sample.get('summary_pfb_tax'),41.8);assert.equal(sample.get('summary_balance'),4524.85);sample.edit('summary_deposit','350');assert.equal(sample.get('summary_balance'),4174.85);sample.edit('summary_deposit','0');
console.log(JSON.stringify({message:'PDF passed: all packages, selection overages, repeated quantities, package and guest changes, extra sides and salads, Pizza Bar deduplication, manual extras, tax rounding, deposit credits, 1-9 menu quantities, invalid-entry alerts, typing/paste validation and clearing fields.',exampleValues:Object.fromEntries(Object.entries(sample.fields).map(([name,f])=>[name,f.value]))}));
