import {socialAppetizerQuote} from "@/lib/event-plan";
import {pizzaOrderCount,sharedPizzaOrders,splitPizzaStyles,pizzaOrderStyles} from '@/lib/event-pizza';
export {pizzaOrderCount} from '@/lib/event-pizza';
import {emptyFlightPlan,type CateringCatalog,type EventPlanDetails,type EventOrderItem} from '@/lib/event-plan';

export const eventPanProfiles={full:{model:'S-22409',label:'full-size pan',dimensions:'21 × 13 × 3 in',capacityFlOz:343,url:'https://www.uline.com/Product/Detail/S-22409/Take-Out-Containers/Aluminum-Steam-Table-Pans-Full-Size'},half:{model:'S-22408',label:'half-size pan',dimensions:'13 × 10 × 3 in',capacityFlOz:128,url:'https://www.uline.com/Product/Detail/S-22408/Take-Out-Containers/Aluminum-Steam-Table-Pans-1-2-Size'}} as const;
export type ProductionPanSize='full'|'half'|'chef-choice'|'pizza';
export type EventProductionSettings={sideReservePercent?:number;proteinPortionLb?:Record<string,number>;aLaCarteAppetizerOz?:number;aLaCarteEntreeOz?:number;aLaCarteSideOz?:number;aLaCarteSaladOz?:number;buffetWingsPerGuest?:number;wingsPerFullTray?:number;wingsPerHalfTray?:number;cookedWingsPerLb?:number|null;pizzaDiameterInches?:number;pizzaSlicesPerPie?:number;pizzaSlicesPerGuest?:number;estimatedFullPanLb?:number;estimatedHalfPanLb?:number;estimatedSaladPanLb?:number;halfTrayFinishedLb?:Record<string,number>;itemPanSize?:Record<string,'full'|'half'>;entreeOz:number;appetizerOz:number;sideOz:number;sideWithSaladOz:number;saladOz:number;reservePercent:number;planningBatchLb:number;regularPizzaOz:number|null;glutenFreePizzaOz:number|null;trayFinishedLb:Record<string,number>};
// Suggested combined buffet allowances, not measured recipe yields or pricing rules.
export const defaultEventProductionSettings:EventProductionSettings={sideReservePercent:15,proteinPortionLb:{'Aviator Pulled Pork BBQ':.65,'Aviator Beef Brisket':.5},aLaCarteAppetizerOz:3,aLaCarteEntreeOz:8,aLaCarteSideOz:8,aLaCarteSaladOz:2,buffetWingsPerGuest:5,wingsPerFullTray:200,wingsPerHalfTray:75,cookedWingsPerLb:null,entreeOz:8,appetizerOz:3,sideOz:8,sideWithSaladOz:6,saladOz:2,reservePercent:5,planningBatchLb:5,regularPizzaOz:null,glutenFreePizzaOz:null,trayFinishedLb:{},halfTrayFinishedLb:{},itemPanSize:{},estimatedFullPanLb:10,estimatedHalfPanLb:5,estimatedSaladPanLb:5,pizzaDiameterInches:14,pizzaSlicesPerPie:8,pizzaSlicesPerGuest:3};
export function parseEventProductionSettings(raw:unknown):EventProductionSettings{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Provide kitchen production settings.');
 const s={...structuredClone(defaultEventProductionSettings),...raw} as EventProductionSettings;
 for(const key of ['entreeOz','appetizerOz','sideOz','sideWithSaladOz','saladOz'] as const)if(!Number.isFinite(s[key])||s[key]<=0||s[key]>32)throw new Error('Use combined portions greater than 0 and no more than 32 finished ounces per guest.');
 if(!Number.isFinite(s.reservePercent)||s.reservePercent<0||s.reservePercent>25||!Number.isFinite(s.planningBatchLb)||s.planningBatchLb<=0||s.planningBatchLb>50)throw new Error('Check the reserve percentage and planning batch weight.');
 for(const key of ['regularPizzaOz','glutenFreePizzaOz'] as const)if(s[key]!==null&&(!Number.isFinite(s[key])||s[key]!<=0||s[key]!>256))throw new Error('Use a measured pizza weight in ounces, or leave it blank.');
 if(!s.trayFinishedLb||typeof s.trayFinishedLb!=='object'||Array.isArray(s.trayFinishedLb)||Object.keys(s.trayFinishedLb).length>500)throw new Error('Check finished tray weights.');
 for(const [name,lb] of Object.entries(s.trayFinishedLb))if(!name.trim()||name.length>200||/[\r\n<>]/.test(name)||!Number.isFinite(lb)||lb<=0||lb>100)throw new Error('Enter actual finished food weights of 0–100 lb per full tray.');
 for(const key of ['estimatedFullPanLb','estimatedHalfPanLb','estimatedSaladPanLb'] as const)if(!Number.isFinite(s[key])||s[key]!<=0||s[key]!>100)throw new Error('Use positive planning pan-fill weights up to 100 lb.');
 if(!s.halfTrayFinishedLb||typeof s.halfTrayFinishedLb!=='object'||Array.isArray(s.halfTrayFinishedLb)||Object.keys(s.halfTrayFinishedLb).length>500)throw new Error('Check half-pan food weights.');
 for(const [name,lb] of Object.entries(s.halfTrayFinishedLb))if(!name.trim()||name.length>200||/[\r\n<>]/.test(name)||!Number.isFinite(lb)||lb<=0||lb>100)throw new Error('Check measured half-pan weights.');
 if(!s.itemPanSize||typeof s.itemPanSize!=='object'||Array.isArray(s.itemPanSize)||Object.keys(s.itemPanSize).length>500||Object.entries(s.itemPanSize).some(([name,size])=>!name.trim()||name.length>200||/[\r\n<>]/.test(name)||!['full','half'].includes(size)))throw new Error('Check food pan-size overrides.');
 if(!Number.isFinite(s.pizzaDiameterInches)||s.pizzaDiameterInches!<8||s.pizzaDiameterInches!>36||!Number.isInteger(s.pizzaSlicesPerPie)||s.pizzaSlicesPerPie!<4||s.pizzaSlicesPerPie!>16||!Number.isFinite(s.pizzaSlicesPerGuest)||s.pizzaSlicesPerGuest!<=0||s.pizzaSlicesPerGuest!>8)throw new Error('Check pizza diameter, slices per pizza and pizza portion size.');
 for(const key of ['aLaCarteAppetizerOz','aLaCarteEntreeOz','aLaCarteSideOz','aLaCarteSaladOz'] as const)if(!Number.isFinite(s[key])||s[key]!<=0||s[key]!>64)throw new Error('Use à la carte portions above zero and up to 64 ounces.');
 if(!Number.isInteger(s.buffetWingsPerGuest)||s.buffetWingsPerGuest!<1||s.buffetWingsPerGuest!>100)throw new Error('Use 1–100 buffet wing pieces per guest.');
 if(!Number.isInteger(s.wingsPerFullTray)||s.wingsPerFullTray!<1||s.wingsPerFullTray!>10000)throw new Error('Check wing pieces per full tray.');
 if(!Number.isInteger(s.wingsPerHalfTray)||s.wingsPerHalfTray!<1||s.wingsPerHalfTray!>10000)throw new Error('Check estimated wing pieces per half tray.');
 if(s.cookedWingsPerLb!==null&&(!Number.isFinite(s.cookedWingsPerLb)||s.cookedWingsPerLb!<=0||s.cookedWingsPerLb!>100))throw new Error('Enter cooked wing pieces per pound, or leave blank.');
 if(!Number.isFinite(s.sideReservePercent)||s.sideReservePercent!<0||s.sideReservePercent!>50)throw new Error('Use a side and salad reserve from 0 to 50%.');
 if(!s.proteinPortionLb||typeof s.proteinPortionLb!=='object'||Array.isArray(s.proteinPortionLb)||Object.keys(s.proteinPortionLb).length>500)throw new Error('Check protein serving weights.');
 for(const [name,lb] of Object.entries(s.proteinPortionLb))if(!name.trim()||name.length>200||/[<>\r\n]/.test(name)||!Number.isFinite(lb)||lb<=0||lb>5)throw new Error('Use protein portions greater than zero and up to 5 lb.');
 return s;
}
export function productionPanFor(name:string,category:string,c:CateringCatalog,s:EventProductionSettings){
 const salad=category==='Salads'||c.menu.salads.includes(name);
 const panSize:ProductionPanSize=category==='pizza'||name==='Aviator Pizzeria Pizza Bar'?'pizza':s.itemPanSize?.[name]||(salad?'full':category==='Sides'?'half':category==='Entrees'?'full':'half');
 const measured=panSize==='half'?s.halfTrayFinishedLb?.[name]:s.trayFinishedLb[name];
 const batchLb=measured||(panSize==='half'?s.estimatedHalfPanLb||5:panSize==='full'?(salad?s.estimatedSaladPanLb||5:s.estimatedFullPanLb||10):s.planningBatchLb);
 return {panSize,batchLb,measuredTray:Boolean(measured),fullPanLb:s.trayFinishedLb[name]||(salad?s.estimatedSaladPanLb||5:s.estimatedFullPanLb||10),halfPanLb:s.halfTrayFinishedLb?.[name]||(salad?(s.estimatedSaladPanLb||5)*128/343:s.estimatedHalfPanLb||5),fullMeasured:Boolean(s.trayFinishedLb[name]),halfMeasured:Boolean(s.halfTrayFinishedLb?.[name])};
}
export type ProductionRow={proteinServings?:number;portionLb?:number;fullPanLb?:number;halfPanLb?:number;fullMeasured?:boolean;halfMeasured?:boolean;piecesPerHalfTray?:number;piecesPerTray?:number;piecesPerLb?:number|null;panSize?:ProductionPanSize;name:string;selections:number;ounces:number;detail?:string;batchLb:number;measuredTray:boolean;count?:number;countLabel?:string};
export type ProductionGroup={reservePercent?:number;name:string;perGuestOz:number;totalOz:number;rows:ProductionRow[]};
export const productionNumber=(n:number)=>Number(n.toFixed(2)).toString();
export function productionWeight(oz:number){return `${productionNumber(oz/16)} lb (${productionNumber(oz)} oz)`;}
export function trayFills(total:number,fullCapacity:number,halfCapacity:number,preferHalf=false,unit='lb'){
 if(total<=0)return 'No trays needed.';
 const parts:string[]=[];
 let remainder=total;
 if(!preferHalf){const full=Math.floor((total+1e-9)/fullCapacity);if(full){parts.push(`${full} full tray${full===1?'':'s'} × ${productionNumber(fullCapacity)} ${unit}`);remainder=Math.max(0,total-full*fullCapacity);}}
 if(remainder>1e-8){
   if(preferHalf||remainder<=halfCapacity+1e-8){const fullHalves=Math.floor((remainder+1e-9)/halfCapacity),partial=Math.max(0,remainder-fullHalves*halfCapacity);if(fullHalves)parts.push(`${fullHalves} half tray${fullHalves===1?'':'s'} × ${productionNumber(halfCapacity)} ${unit}`);if(partial>1e-8)parts.push(`1 half tray × ${productionNumber(partial)} ${unit} (partial)`);}
   else parts.push(`1 full tray × ${productionNumber(remainder)} ${unit} (partial)`);
 }
 return parts.join(' + ');
}
export function wingTrayGuide(pieces:number,capacity:number,halfCapacity=75){return `Approx. ${productionNumber(pieces)} wing pieces · ${trayFills(pieces,capacity,halfCapacity,false,'pieces')}. Full tray: approx. ${capacity} wings. Half tray: estimated ${halfCapacity} wings; verify fit. Keep the planned piece count.`;}
export function wingOrderPortion(item:Pick<EventOrderItem,'name'|'kitchen'>,s:EventProductionSettings){
 const match=/^(?:Entree|Appetizer): Aviator Smoked Wings \/ (guest|portion|tray|piece)$/.exec(item.name);
 if(!match)return null;
 const k=item.kitchen,unit=match[1],capacity=k?.piecesPerTray||s.wingsPerFullTray||200,halfCapacity=k?.piecesPerHalfTray||s.wingsPerHalfTray||75;
 const previousGuestStandard=(unit==='guest'||unit==='portion')&&k?.piecesPerUnit===4&&(s.buffetWingsPerGuest||5)===5;
 const piecesPerUnit=previousGuestStandard?5:k?.piecesPerUnit??(unit==='piece'?1:unit==='tray'?capacity:s.buffetWingsPerGuest||5);
 const ouncesPerUnit=k?.ouncesPerUnit?(previousGuestStandard?k.ouncesPerUnit*5/4:k.ouncesPerUnit):s.cookedWingsPerLb?piecesPerUnit/s.cookedWingsPerLb*16:undefined;
 return {unit,capacity,halfCapacity,piecesPerUnit,ouncesPerUnit};
}
export function customOrderProductionGuide(item:EventOrderItem,s:EventProductionSettings,c?:CateringCatalog){
 const wing=wingOrderPortion(item,s),k=item.kitchen;
 const weight=k?.ouncesPerUnit?productionWeight(k.ouncesPerUnit*item.quantity):'';
 if(wing){const pieces=Math.ceil(wing.piecesPerUnit*item.quantity-1e-8),serving=wing.unit==='guest'||wing.unit==='portion'?`${item.quantity} servings × ${productionNumber(wing.piecesPerUnit)} wings per serving`:'';return [serving,wing.ouncesPerUnit?productionWeight(wing.ouncesPerUnit*item.quantity):'',wingTrayGuide(pieces,wing.capacity,wing.halfCapacity)].filter(Boolean).join(' · ');}
 const pizzas=pizzaOrderCount(item,s);
 if(pizzas!==null)return `${pizzas} ${s.pizzaDiameterInches||14}-inch pizza(s) · ${pizzas*(s.pizzaSlicesPerPie||8)} slices total.`;
 const match=/^(Appetizer|Entree|Side|Salad): (.+) \/ (guest|portion|tray|piece)$/.exec(item.name);
 const pans=match&&c&&k?.ouncesPerUnit?productionPanFor(match[2],{Appetizer:'Appetizers',Entree:'Entrees',Side:'Sides',Salad:'Salads'}[match[1]]||'',c,s):null;
 const trays=pans?productionBatchGuide({name:match![2],selections:1,ounces:k!.ouncesPerUnit!*item.quantity,...pans}):'';
 return [weight,trays,k?.piecesPerUnit?`${productionNumber(k.piecesPerUnit*item.quantity)} pieces`: ''].filter(Boolean).join(' · ');
}
export function customOrderProductionAmounts(item:EventOrderItem,s:EventProductionSettings,c:CateringCatalog):{orderLabel:string;makeLabel:string;foodLabel:string;styleBreakdown?:Array<{name:string;count:number}>}{
 const match=/^(Appetizer|Entree|Side|Salad|Pizza|Dessert): (.+) \/ (guest|portion|tray|piece|pizza)$/.exec(item.name),unit=match?.[3],k=item.kitchen;
 const orderLabel=`${productionNumber(item.quantity)} ${unit==='guest'?'guest servings':unit==='portion'?'individual portions':unit==='tray'?'full trays ordered':unit==='pizza'?'whole pizzas ordered':unit==='piece'?'pieces ordered':'ordered units'}`;
 const wing=wingOrderPortion(item,s);
 if(wing){const count=Math.ceil(wing.piecesPerUnit*item.quantity-1e-8);return {orderLabel,makeLabel:trayFills(count,wing.capacity,wing.halfCapacity,false,'wings'),foodLabel:`${count} wings total${unit==='guest'||unit==='portion'?` · ${productionNumber(wing.piecesPerUnit)} per serving`:''}`};}
 const pizzas=pizzaOrderCount(item,s);
 if(pizzas!==null)return {orderLabel,styleBreakdown:splitPizzaStyles(pizzas,pizzaOrderStyles(item)),makeLabel:`${pizzas} whole ${s.pizzaDiameterInches||14}-inch pizzas`,foodLabel:`${pizzas*(s.pizzaSlicesPerPie||8)} slices total${unit==='guest'||unit==='portion'?` · ${s.pizzaSlicesPerGuest||3} slices per guest serving`:''}`};
 const category=match?{Appetizer:'Appetizers',Entree:'Entrees',Side:'Sides',Salad:'Salads'}[match[1]]:null;
 if(category&&match){
   const pan=productionPanFor(match[2],category,c,s),servingOz=match[1]==='Appetizer'?s.aLaCarteAppetizerOz??3:match[1]==='Entree'?(s.proteinPortionLb?.[match[2]]?s.proteinPortionLb[match[2]]*16:s.aLaCarteEntreeOz??8):match[1]==='Side'?s.aLaCarteSideOz??8:s.aLaCarteSaladOz??2;
   const oz=k?.ouncesPerUnit??(unit==='tray'?pan.fullPanLb*16:unit==='guest'||unit==='portion'?servingOz:undefined);
   if(oz&&Number.isFinite(oz)){const total=oz*item.quantity;return {orderLabel,makeLabel:trayFills(total/16,pan.fullPanLb,pan.halfPanLb,pan.panSize==='half'),foodLabel:`${productionWeight(total)} total`};}
 }
 if(k?.piecesPerUnit||unit==='piece')return {orderLabel,makeLabel:`${productionNumber((k?.piecesPerUnit||1)*item.quantity)} pieces`,foodLabel:'Use the recorded preparation notes for portion details.'};
 return {orderLabel,makeLabel:unit==='tray'?`${item.quantity} full trays`:`${item.quantity} ordered units — see preparation notes`,foodLabel:customOrderProductionGuide(item,s,c)||'Portion yield is not specified in this order.'};
}
export function productionBatchGuide(row:ProductionRow){
 if(row.name==='Aviator Smoked Wings'&&row.count!==undefined)return wingTrayGuide(row.count,row.piecesPerTray||200,row.piecesPerHalfTray||75);
 if(row.name==='Aviator Smoked Wings')return row.ounces&&row.piecesPerLb?wingTrayGuide(Math.ceil(row.ounces/16*row.piecesPerLb-1e-8),row.piecesPerTray||200):`Approx. ${row.piecesPerTray||200} wing pieces per full tray. Cooked pieces per pound is needed to convert the weight target to a piece/tray count.`;
 if(!row.ounces)return 'Chef to confirm finished weight.';
 const lb=row.ounces/16;
 if(row.fullPanLb&&row.halfPanLb)return `${trayFills(lb,row.fullPanLb,row.halfPanLb,row.panSize==='half')}. Full pan S-22409: ${productionNumber(row.fullPanLb)} lb (${row.fullMeasured?'measured':'estimated'}); half pan S-22408: ${productionNumber(row.halfPanLb)} lb (${row.halfMeasured?'measured':'estimated'}). Tare pans; keep the planned food quantity.`;
 const batch=row.batchLb,full=Math.floor((lb+1e-9)/batch),partial=Math.max(0,lb-full*batch);
 if(row.panSize==='full'||row.panSize==='half'){
   const count=full+(partial>.00001?1:0),pan=eventPanProfiles[row.panSize];
   const fills=[full?`${full} × ${productionNumber(batch)} lb`:'',partial>.00001?`1 × ${productionNumber(partial)} lb (partial)`:''].filter(Boolean).join(' + ');
   return `${count} ${pan.label}${count===1?'':'s'} (${pan.model}): ${fills}. ${row.measuredTray?'Measured':'Estimated'} fill weight; tare each pan and stop at the listed food weight.`;
 }
 const parts=[full?`${full} full ${productionNumber(batch)} lb ${row.measuredTray?'tray(s)':'planning batch(es)'}`:'',partial>.00001?`${productionNumber(partial)} lb partial ${row.measuredTray?'tray':'batch'}`:''].filter(Boolean);
 return parts.join(' + ')+(row.measuredTray?'':' · planning weight; pan yield unverified');
}
export function eventProteinChoices(d:EventPlanDetails,c:CateringCatalog){
 const f={...emptyFlightPlan(),...d.flightPlan};
 const mains=[...f.entrees,...f.extraEntrees].filter(n=>n&&n!=='Aviator Pizzeria Pizza Bar');
 // Plain meat/seafood appetizers share the protein budget too. Mixed appetizers remain recipe portions.
 const proteinApps=[...f.appetizers,...f.extraAppetizers].filter(n=>[...c.menu.entrees,...c.menu.premiumEntrees,'Chicken Fingers','Aviator Chicken Tenders with Aviator Sauce','Shrimp Cocktail','BBQ Meatballs'].includes(n)&&n!=='Aviator Pizzeria Pizza Bar');
 return [...new Set([...mains,...proteinApps])];
}
export function eventProteinBudget(d:EventPlanDetails,c:CateringCatalog,s:EventProductionSettings){
 const names=d.flightPlan?.packageId?eventProteinChoices(d,c):[],limit=Math.floor(d.guestCount*1.1+1e-8);
 const proteinNames=new Set([...c.menu.entrees,...c.menu.premiumEntrees,'Chicken Fingers','Aviator Chicken Tenders with Aviator Sauce','Shrimp Cocktail','BBQ Meatballs'].filter(n=>n!=='Aviator Pizzeria Pizza Bar'));
 let explicitServings=0;const unverified:string[]=[];
 for(const item of d.items.filter(i=>i.category==='Food')){
   const match=/^(?:Entree|Appetizer): (.+) \/ (guest|portion|tray|piece)$/.exec(item.name);if(!match||!proteinNames.has(match[1]))continue;
   const name=match[1],unit=match[2],k=item.kitchen,portionLb=d.kitchenPlan?.proteinPortionLb?.[name]??s.proteinPortionLb?.[name]??s.entreeOz/16;
   if(name==='Aviator Smoked Wings'){
     const wing=wingOrderPortion(item,s)!;
     explicitServings+=Math.ceil(wing.piecesPerUnit*item.quantity-1e-8)/(s.buffetWingsPerGuest||5);
   }else if(k?.ouncesPerUnit)explicitServings+=k.ouncesPerUnit*item.quantity/16/portionLb;
   else if(unit==='guest'||unit==='portion')explicitServings+=item.quantity;
   else if(unit==='tray')explicitServings+=item.quantity*(s.trayFinishedLb[name]||s.estimatedFullPanLb||10)/portionLb;
   else unverified.push(item.name);
 }
 const available=Math.max(0,Math.floor(limit-explicitServings+1e-8));
 const weights=names.map(n=>d.kitchenPlan?.proteinShares?.[n]||1),sum=weights.reduce((a,b)=>a+b,0);
 const exact=weights.map(w=>available*w/sum),counts=exact.map(Math.floor),remaining=available-counts.reduce((a,b)=>a+b,0);
 const order=exact.map((v,i)=>({i,fraction:v-counts[i]})).sort((a,b)=>b.fraction-a.fraction||a.i-b.i);
 for(let i=0;i<remaining&&order.length;i++)counts[order[i].i]++;
 return {limit,explicitServings,unverified,overLimit:explicitServings>limit+1e-8,servings:names.length?available:0,rows:names.map((name,i)=>({name,servings:counts[i],portionLb:d.kitchenPlan?.proteinPortionLb?.[name]??s.proteinPortionLb?.[name]??s.entreeOz/16,share:weights[i]}))};
}
export function eventProductionPlan(d:EventPlanDetails,c:CateringCatalog,s:EventProductionSettings=defaultEventProductionSettings){
 let pizzaRoundingOz=0,pizzaCountTotal:number|null=null,pizzaServingGuests=0;
 const pizzaDiameterInches=s.pizzaDiameterInches||14,pizzaSlicesPerPie=s.pizzaSlicesPerPie||8,pizzaSlicesPerGuest=s.pizzaSlicesPerGuest||3;
 const f={...emptyFlightPlan(),...d.flightPlan},warnings:string[]=[],groups:ProductionGroup[]=[],pizzaName='Aviator Pizzeria Pizza Bar';
 const social=c.packages.find(p=>p.id===f.packageId)?.pricingMode==='appetizer-selection';
 const buffet=Boolean(f.packageId)&&!social,guests=d.guestCount,reserve=1+s.reservePercent/100;
 const protein=eventProteinBudget(d,c,s),proteinNames=new Set(protein.rows.map(r=>r.name)),sideReservePercent=d.kitchenPlan?.sideReservePercent??s.sideReservePercent??15;
 const row=(name:string,selections:number,ounces:number,category=''):ProductionRow=>({name,selections,ounces,...productionPanFor(name,category,c,s),...(name==='Aviator Smoked Wings'?{piecesPerTray:s.wingsPerFullTray||200,piecesPerHalfTray:s.wingsPerHalfTray||75,piecesPerLb:s.cookedWingsPerLb}: {})});
 function group(name:string,selections:string[],perGuestOz:number,reservePercent=s.reservePercent){
   const chosen=selections.filter(Boolean);if(!buffet||!chosen.length)return;
   const totalOz=guests*perGuestOz*(1+reservePercent/100);
   const rows=[...new Set(chosen)].map(n=>row(n,chosen.filter(v=>v===n).length,totalOz*chosen.filter(v=>v===n).length/chosen.length,name));
   const weightRows=rows.filter(r=>!proteinNames.has(r.name));
   if(weightRows.length)groups.push({name,reservePercent,perGuestOz:perGuestOz*weightRows.reduce((n,r)=>n+r.selections,0)/chosen.length,totalOz:weightRows.reduce((n,r)=>n+r.ounces,0),rows:weightRows});
 }
 group('Appetizers',[...f.appetizers,...f.extraAppetizers],s.appetizerOz);
 group('Entrees',[...f.entrees,...f.extraEntrees,...(f.pizzaExtra?[pizzaName]:[])],s.entreeOz);
 const saladSelections=[...f.salads,...f.extraSalads].filter(Boolean);
 group('Sides',[...f.sides,...f.extraSides],saladSelections.length?s.sideWithSaladOz:s.sideOz,sideReservePercent);
 group('Salads',saladSelections,s.saladOz,sideReservePercent);
 const hasWings=proteinNames.has('Aviator Smoked Wings');
 if(protein.rows.length){
   const rows=protein.rows.map(pr=>{
     const wings=pr.name==='Aviator Smoked Wings',count=pr.servings*(s.buffetWingsPerGuest||5),ounces=wings?(s.cookedWingsPerLb?count/s.cookedWingsPerLb*16:0):pr.servings*pr.portionLb*16;
     const r=row(pr.name,1,ounces,'Entrees');r.proteinServings=pr.servings;r.portionLb=pr.portionLb;
     r.detail=`${pr.servings} protein servings × ${wings?`${s.buffetWingsPerGuest||5} wings`:`${productionNumber(pr.portionLb)} lb`} per serving. Includes its share of the single 10% protein reserve; do not add another reserve.`;
     if(wings){r.count=count;r.countLabel='wing pieces';}return r;
   });
   groups.push({name:'Proteins',perGuestOz:0,totalOz:rows.reduce((n,r)=>n+r.ounces,0),rows});

 }
 if([...f.appetizers,...f.extraAppetizers].some(n=>/Brisket Crostini|Pulled Pork Nachos/.test(n)))warnings.push('Mixed protein appetizers include an unknown amount of meat. Confirm their recipe protein yield before treating the protein cap as complete.');
 const pizza=groups.flatMap(g=>g.rows).find(r=>r.name===pizzaName),pizzaRows:ProductionRow[]=[];
 if(pizza){
   const styles=[...new Set(f.pizzas.filter(Boolean))];
   let remaining=pizza.ounces;
   if(f.glutenFreeCount){
     const gf=row('Gluten-free pizza',1,s.glutenFreePizzaOz?f.glutenFreeCount*s.glutenFreePizzaOz:0,'pizza');gf.count=f.glutenFreeCount;gf.countLabel='requested gluten-free whole pizza(s)';pizzaRows.push(gf);
     if(s.glutenFreePizzaOz){remaining=Math.max(0,remaining-gf.ounces);if(gf.ounces>pizza.ounces)warnings.push('Requested gluten-free pizzas exceed the pizza weight allocation. Chef must reconcile quantities before production.');}
     else warnings.push('Gluten-free pizzas are requested. Their finished weight is unverified; deduct them from the pizza allocation after weighing. Do not add them on top of the regular pizza plan.');
   }
   const unresolvedGf=Boolean(f.glutenFreeCount&&!s.glutenFreePizzaOz);
   const entreeSelections=[...f.entrees,...f.extraEntrees,...(f.pizzaExtra?[pizzaName]:[])].filter(Boolean).length;
   pizzaServingGuests=guests*reserve*pizza.selections/Math.max(1,entreeSelections);
   const servingCount=Math.ceil(Math.max(0,pizzaServingGuests*pizzaSlicesPerGuest-f.glutenFreeCount*pizzaSlicesPerPie-1e-9)/pizzaSlicesPerPie);
   const weightCount=s.regularPizzaOz&&!unresolvedGf?Math.ceil(Math.max(0,remaining-1e-9)/s.regularPizzaOz):0;
   const regularCount=Math.max(servingCount,weightCount);
   pizzaCountTotal=regularCount+f.glutenFreeCount;
   for(const [index,name] of styles.entries()){
     const count=Math.floor(regularCount/styles.length)+(index<regularCount%styles.length?1:0);
     const r=row(name,1,regularCount?remaining*count/regularCount:0,'pizza');r.count=count;r.countLabel='whole pizza(s)';
     if(s.regularPizzaOz&&!unresolvedGf)r.ounces=count*s.regularPizzaOz;
     else r.detail=`Serving estimate: ${count*pizzaSlicesPerPie} slices. Finished weight is a target${unresolvedGf?' before gluten-free weight is deducted':''}.`;
     pizzaRows.push(r);
   }
   if(regularCount<styles.length)warnings.push('The pizza allowance produces fewer whole pizzas than selected styles. Chef must reconcile the style choices and quantities before production.');
   if(!styles.length)warnings.push('Pizza Bar is selected but no pizza styles are saved. Confirm the styles with the coordinator.');
   if(s.regularPizzaOz&&!unresolvedGf){const rounded=regularCount*s.regularPizzaOz+(s.glutenFreePizzaOz?f.glutenFreeCount*s.glutenFreePizzaOz:0);pizzaRoundingOz=Math.max(0,rounded-pizza.ounces);if(rounded>pizza.ounces+.01)warnings.push(`Whole-pizza planning adds ${productionWeight(rounded-pizza.ounces)} above the pizza allocation. Do not add another reserve or round other foods up to full trays.`);}

 }

 if(protein.overLimit)warnings.push(`PROTEIN LIMIT EXCEEDED: explicit orders contain ${productionNumber(protein.explicitServings)} servings; maximum ${protein.limit}. Review ordered quantities before production.`);
 if(protein.unverified.length)warnings.push(`Protein servings cannot be verified for: ${protein.unverified.join(', ')}. Enter portions before approving the total.`);
 const custom=sharedPizzaOrders([...(social?socialAppetizerQuote(d,c).rows:[]),...d.items].filter(i=>i.category==='Food'),s,f.pizzas);
 for(const item of custom){const styles=pizzaOrderStyles(item);if(styles.length>(pizzaOrderCount(item,s)??Infinity))warnings.push('The shared pizza allowance produces fewer whole pizzas than selected styles. Review the varieties and quantity.');if(styles.length>3)warnings.push('More than three pizza styles are listed for one serving group. Review the style choices before production.');if(/^Pizza:/.test(item.name)&&!styles.length)warnings.push('Choose one to three pizza styles for the shared Pizza Bar order.');}

 if(buffet&&!groups.some(g=>g.name==='Entrees')&&!protein.rows.length)warnings.push('No entree selections are saved. This buffet plan is incomplete.');
 if(!guests)warnings.push('Guest count is missing. Set the guaranteed guest count before planning food.');
 return {guests,groups,pizza,pizzaRows,warnings,custom,totalOz:groups.reduce((n,g)=>n+g.totalOz,0),reservePercent:s.reservePercent,pizzaRoundingOz,pizzaCountTotal,pizzaServingGuests,pizzaDiameterInches,pizzaSlicesPerPie,pizzaSlicesPerGuest,buffet,hasWings,protein,sideReservePercent};
}
