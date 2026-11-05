import {emptyFlightPlan,type CateringCatalog,type EventPlanDetails} from '@/lib/event-plan';

export type EventProductionSettings={entreeOz:number;appetizerOz:number;sideOz:number;sideWithSaladOz:number;saladOz:number;reservePercent:number;planningBatchLb:number;regularPizzaOz:number|null;glutenFreePizzaOz:number|null;trayFinishedLb:Record<string,number>};
// Suggested combined buffet allowances, not measured recipe yields or pricing rules.
export const defaultEventProductionSettings:EventProductionSettings={entreeOz:8,appetizerOz:3,sideOz:8,sideWithSaladOz:6,saladOz:2,reservePercent:5,planningBatchLb:5,regularPizzaOz:null,glutenFreePizzaOz:null,trayFinishedLb:{}};
export function parseEventProductionSettings(raw:unknown):EventProductionSettings{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Provide kitchen production settings.');
 const s={...structuredClone(defaultEventProductionSettings),...raw} as EventProductionSettings;
 for(const key of ['entreeOz','appetizerOz','sideOz','sideWithSaladOz','saladOz'] as const)if(!Number.isFinite(s[key])||s[key]<=0||s[key]>32)throw new Error('Use combined portions greater than 0 and no more than 32 finished ounces per guest.');
 if(!Number.isFinite(s.reservePercent)||s.reservePercent<0||s.reservePercent>25||!Number.isFinite(s.planningBatchLb)||s.planningBatchLb<=0||s.planningBatchLb>50)throw new Error('Check the reserve percentage and planning batch weight.');
 for(const key of ['regularPizzaOz','glutenFreePizzaOz'] as const)if(s[key]!==null&&(!Number.isFinite(s[key])||s[key]!<=0||s[key]!>256))throw new Error('Use a measured pizza weight in ounces, or leave it blank.');
 if(!s.trayFinishedLb||typeof s.trayFinishedLb!=='object'||Array.isArray(s.trayFinishedLb)||Object.keys(s.trayFinishedLb).length>500)throw new Error('Check finished tray weights.');
 for(const [name,lb] of Object.entries(s.trayFinishedLb))if(!name.trim()||name.length>200||/[\r\n<>]/.test(name)||!Number.isFinite(lb)||lb<=0||lb>100)throw new Error('Enter actual finished food weights of 0–100 lb per full tray.');
 return s;
}
export type ProductionRow={name:string;selections:number;ounces:number;detail?:string;batchLb:number;measuredTray:boolean;count?:number;countLabel?:string};
export type ProductionGroup={name:string;perGuestOz:number;totalOz:number;rows:ProductionRow[]};
export const productionNumber=(n:number)=>Number(n.toFixed(2)).toString();
export function productionWeight(oz:number){return `${productionNumber(oz/16)} lb (${productionNumber(oz)} oz)`;}
export function productionBatchGuide(row:ProductionRow){
 if(!row.ounces)return 'Chef to confirm finished weight.';
 const lb=row.ounces/16,batch=row.batchLb,full=Math.floor((lb+1e-9)/batch),partial=Math.max(0,lb-full*batch);
 const parts=[full?`${full} full ${productionNumber(batch)} lb ${row.measuredTray?'tray(s)':'planning batch(es)'}`:'',partial>.00001?`${productionNumber(partial)} lb partial ${row.measuredTray?'tray':'batch'}`:''].filter(Boolean);
 return parts.join(' + ')+(row.measuredTray?'':' · planning weight; pan yield unverified');
}
export function eventProductionPlan(d:EventPlanDetails,c:CateringCatalog,s:EventProductionSettings=defaultEventProductionSettings){
 let pizzaRoundingOz=0;
 const f={...emptyFlightPlan(),...d.flightPlan},warnings:string[]=[],groups:ProductionGroup[]=[],pizzaName='Aviator Pizzeria Pizza Bar';
 const buffet=Boolean(f.packageId),guests=d.guestCount,reserve=1+s.reservePercent/100;
 const row=(name:string,selections:number,ounces:number):ProductionRow=>({name,selections,ounces,batchLb:s.trayFinishedLb[name]||s.planningBatchLb,measuredTray:Boolean(s.trayFinishedLb[name])});
 function group(name:string,selections:string[],perGuestOz:number){
   const chosen=selections.filter(Boolean);if(!buffet||!chosen.length)return;
   const totalOz=guests*perGuestOz*reserve;
   const rows=[...new Set(chosen)].map(n=>row(n,chosen.filter(v=>v===n).length,totalOz*chosen.filter(v=>v===n).length/chosen.length));
   groups.push({name,perGuestOz,totalOz,rows});
 }
 group('Appetizers',[...f.appetizers,...f.extraAppetizers],s.appetizerOz);
 group('Entrees',[...f.entrees,...f.extraEntrees,...(f.pizzaExtra?[pizzaName]:[])],s.entreeOz);
 const saladSelections=[...f.salads,...f.extraSalads].filter(Boolean);
 group('Sides',[...f.sides,...f.extraSides],saladSelections.length?s.sideWithSaladOz:s.sideOz);
 group('Salads',saladSelections,s.saladOz);
 const pizza=groups.flatMap(g=>g.rows).find(r=>r.name===pizzaName),pizzaRows:ProductionRow[]=[];
 if(pizza){
   const styles=[...new Set(f.pizzas.filter(Boolean))];
   let remaining=pizza.ounces;
   if(f.glutenFreeCount){
     const gf=row('Gluten-free pizza',1,s.glutenFreePizzaOz?f.glutenFreeCount*s.glutenFreePizzaOz:0);gf.count=f.glutenFreeCount;gf.countLabel='requested gluten-free whole pizza(s)';pizzaRows.push(gf);
     if(s.glutenFreePizzaOz){remaining=Math.max(0,remaining-gf.ounces);if(gf.ounces>pizza.ounces)warnings.push('Requested gluten-free pizzas exceed the pizza weight allocation. Chef must reconcile quantities before production.');}
     else warnings.push('Gluten-free pizzas are requested. Their finished weight is unverified; deduct them from the pizza allocation after weighing. Do not add them on top of the regular pizza plan.');
   }
   const unresolvedGf=Boolean(f.glutenFreeCount&&!s.glutenFreePizzaOz);
   const regularCount=s.regularPizzaOz&&!unresolvedGf?Math.ceil(Math.max(0,remaining-1e-9)/s.regularPizzaOz):null;
   for(const [index,name] of styles.entries()){
     const r=row(name,1,remaining/(styles.length||1));
     if(unresolvedGf)r.detail='Provisional share before deducting gluten-free pizzas.';
     else if(regularCount!==null&&s.regularPizzaOz){r.count=Math.floor(regularCount/styles.length)+(index<regularCount%styles.length?1:0);r.countLabel='whole pizza(s)';r.ounces=r.count*s.regularPizzaOz;}
     else r.detail='Chef to confirm pizza count: finished weight per pizza is not configured.';
     pizzaRows.push(r);
   }
   if(regularCount!==null&&regularCount<styles.length)warnings.push('The pizza allowance produces fewer whole pizzas than selected styles. Chef must reconcile the style choices and quantities before production.');
   if(!styles.length)warnings.push('Pizza Bar is selected but no pizza styles are saved. Confirm the styles with the coordinator.');
   if(s.regularPizzaOz&&!unresolvedGf){const rounded=pizzaRows.filter(r=>r.countLabel==='whole pizza(s)').reduce((total,r)=>total+(r.count||0)*s.regularPizzaOz!,0)+(s.glutenFreePizzaOz?f.glutenFreeCount*s.glutenFreePizzaOz:0);pizzaRoundingOz=Math.max(0,rounded-pizza.ounces);if(rounded>pizza.ounces+.01)warnings.push(`Whole-pizza rounding adds ${productionWeight(rounded-pizza.ounces)} above the pizza allocation. This is the only rounding allowance; do not round other foods up to full trays.`);}
 }
 const custom=d.items.filter(i=>i.category==='Food');
 if(custom.length)warnings.push('Custom food orders below are explicit quantities. Their finished weights are not included in the buffet allowance; chef must reconcile them with the buffet before adding production.');
 if(buffet&&!groups.some(g=>g.name==='Entrees'))warnings.push('No entree selections are saved. This buffet plan is incomplete.');
 if(!guests)warnings.push('Guest count is missing. Set the guaranteed guest count before planning food.');
 return {guests,groups,pizza,pizzaRows,warnings,custom,totalOz:groups.reduce((n,g)=>n+g.totalOz,0),reservePercent:s.reservePercent,pizzaRoundingOz,buffet};
}
