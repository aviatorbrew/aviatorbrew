import {eventOrderItems,eventTotals,type CateringCatalog,type EventPlanDetails} from '@/lib/event-plan';
import {eventProductionPlan,type EventProductionSettings} from '@/lib/event-production';
export type FoodCostBasis='lb'|'full-pan'|'half-pan'|'pizza'|'event-guest'|'each'|'fl-oz';
export type EventFoodCostSettings=Record<string,{costCents:number;basis:FoodCostBasis;source?:string;updatedAt?:string;estimate?:boolean}>;
// Costs are supplied by authenticated manager settings; unknown foods stay unpriced.
export const defaultEventFoodCosts:EventFoodCostSettings={};
export function parseEventFoodCosts(raw:unknown):EventFoodCostSettings{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length>500)throw new Error('Provide internal food-cost estimates.');
 const result=structuredClone(raw) as EventFoodCostSettings;
 for(const [name,value] of Object.entries(result))if(!name.trim()||name.length>200||/[<>\r\n]/.test(name)||!value||typeof value!=='object'||!Number.isInteger(value.costCents)||value.costCents<0||value.costCents>100000000||!['lb','full-pan','half-pan','pizza','event-guest','each','fl-oz'].includes(value.basis)||value.source!==undefined&&(typeof value.source!=='string'||value.source.length>300||/[<>\r\n]/.test(value.source)))throw new Error('Check food-cost names, amounts, units and sources.');
 for(const v of Object.values(result))if(v.updatedAt!==undefined&&(typeof v.updatedAt!=='string'||!Number.isFinite(Date.parse(v.updatedAt)))||v.estimate!==undefined&&typeof v.estimate!=='boolean')throw new Error('Check food-cost estimate dates.');
 return result;
}
export function eventFoodCostEstimate(d:EventPlanDetails,c:CateringCatalog,p:EventProductionSettings,costs:EventFoodCostSettings){
 const production=eventProductionPlan(d,c,p),rows:{name:string;amountCents:number|null;quantity:number|null;basis?:FoodCostBasis;source?:string;updatedAt?:string;note:string}[]=[];
 const foods=production.groups.flatMap(g=>g.rows).map(r=>({name:r.name,ounces:r.ounces+(r.name==='Aviator Pizzeria Pizza Bar'?production.pizzaRoundingOz:0),guests:d.guestCount,each:r.name==='Aviator Pizzeria Pizza Bar'&&d.flightPlan?.pizzas.length?production.pizzaCountTotal:null}));
 if(d.flightPlan?.dessert)foods.push({name:'Dessert display',ounces:0,guests:d.guestCount,each:d.guestCount});
 if(d.flightPlan?.coffee)foods.push({name:'Coffee service',ounces:0,guests:d.guestCount,each:d.guestCount});
 for(const i of production.custom){const match=i.name.match(/^(?:Appetizer|Entree|Side|Salad|Pizza|Dessert): (.+) \/ (guest|tray|piece|portion|pizza)$/);foods.push({name:match?.[1]||i.name,ounces:match?.[2]==='tray'?i.quantity*(p.trayFinishedLb[match[1]]||p.estimatedFullPanLb||10)*16:0,guests:match?.[2]==='guest'?i.quantity:0,each:match&&['piece','portion','pizza'].includes(match[2])?i.quantity:null});}
 for(const f of foods){const cost=costs[f.name];let quantity:number|null=null,note='Cost not entered; excluded from known-cost subtotal.';
   if(cost){
     if(cost.basis==='lb'&&f.ounces)quantity=f.ounces/16;
     if(cost.basis==='full-pan'&&f.ounces){const measured=p.trayFinishedLb[f.name];const fill=measured||(c.menu.salads.includes(f.name)?p.estimatedSaladPanLb||5:p.estimatedFullPanLb||10);quantity=f.ounces/16/fill;if(!measured)note=`Prorated using an estimated ${fill} lb full-pan fill weight.`;}
     if(cost.basis==='half-pan'&&f.ounces){const measured=p.halfTrayFinishedLb?.[f.name];quantity=f.ounces/16/(measured||p.estimatedHalfPanLb||5);if(!measured)note=`Prorated using an estimated ${p.estimatedHalfPanLb||5} lb half-pan fill weight.`;}
     if(cost.basis==='event-guest'&&f.guests)quantity=f.guests;
     if((cost.basis==='pizza'||cost.basis==='each')&&f.each!==null)quantity=f.each;
     if(quantity===null)note='Cost entered, but its production quantity is unverified. Excluded from known-cost subtotal.';
     else if(note.startsWith('Cost not entered'))note=f.name==='Aviator Pizzeria Pizza Bar'&&cost.basis==='pizza'?'Planned whole pizzas from buffet serving estimates; measured weights also apply when configured.':'Allocated prepared-food estimate.';
   }
   rows.push({name:f.name,amountCents:cost&&quantity!==null?Math.round(cost.costCents*quantity):null,quantity,basis:cost?.basis,source:cost?.source,updatedAt:cost?.updatedAt,note});
 }
 const knownCents=rows.reduce((n,r)=>n+(r.amountCents??0),0),missing=rows.filter(r=>r.amountCents===null).map(r=>r.name),complete=missing.length===0;
 const totals=eventTotals(d,c),foodBeforeDiscount=eventOrderItems(d,c).filter(i=>i.category==='Food').reduce((n,i)=>n+i.quantity*i.unitPriceCents,0),foodRevenueCents=foodBeforeDiscount-(totals.subtotal?Math.round((totals.discount||0)*foodBeforeDiscount/totals.subtotal):0);
 return {rows,knownCents,missing,complete,foodRevenueCents,foodCostPercent:complete&&foodRevenueCents>0?knownCents/foodRevenueCents*100:null,foodMarginCents:complete?foodRevenueCents-knownCents:null};
}
