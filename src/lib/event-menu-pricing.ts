import type {EventMenuChoice,MenuBillingUnit} from '@/lib/event-menu-order';
import type {CateringCatalog,EventItemKitchen} from '@/lib/event-plan';
import type {EventFoodCostSettings} from '@/lib/event-food-cost';
import type {EventProductionSettings} from '@/lib/event-production';

export const aLaCarteFoodCostPercent=28;
export function eventMenuPricing(choice:EventMenuChoice,unit:MenuBillingUnit,c:CateringCatalog,p:EventProductionSettings,costs:EventFoodCostSettings,portionOz?:number,quantity=1){
 const wings=choice.name==='Aviator Smoked Wings',pizza=choice.prefix==='Pizza'||choice.name==='Aviator Pizzeria Pizza Bar';
 const cost=costs[choice.name]||(pizza?costs['Aviator Pizzeria Pizza Bar']:undefined),kitchen:EventItemKitchen={};
 const salad=c.menu.salads.includes(choice.name),fullLb=p.trayFinishedLb[choice.name]||(salad?p.estimatedSaladPanLb||5:p.estimatedFullPanLb||10),halfLb=p.halfTrayFinishedLb?.[choice.name]||p.estimatedHalfPanLb||5;
 const perGuest=choice.prefix==='Appetizer'?p.aLaCarteAppetizerOz??3:choice.prefix==='Entree'?(p.proteinPortionLb?.[choice.name]?p.proteinPortionLb[choice.name]*16:p.aLaCarteEntreeOz??8):choice.prefix==='Side'?p.aLaCarteSideOz??8:choice.prefix==='Salad'?p.aLaCarteSaladOz??2:undefined;
 const capacity=p.wingsPerFullTray||200;
 if(wings){kitchen.piecesPerTray=capacity;kitchen.piecesPerHalfTray=p.wingsPerHalfTray||75;if(unit==='tray')kitchen.piecesPerUnit=capacity;if(unit==='piece')kitchen.piecesPerUnit=1;if(unit==='guest'||unit==='portion')kitchen.piecesPerUnit=p.buffetWingsPerGuest||5;}
 if(pizza){if(unit==='pizza')kitchen.pizzasPerUnit=1;if(unit==='guest'||unit==='portion')kitchen.pizzasPerUnit=(p.pizzaSlicesPerGuest||3)/(p.pizzaSlicesPerPie||8);}
 if(unit==='piece'||unit==='portion'&&choice.prefix==='Dessert'||unit==='guest'&&choice.prefix==='Dessert')kitchen.piecesPerUnit=1;
 const defaultOz=unit==='tray'?(wings?(p.cookedWingsPerLb?capacity/p.cookedWingsPerLb*16:undefined):fullLb*16):unit==='guest'||unit==='portion'?(wings?undefined:perGuest):undefined;
 const ounces=portionOz??(wings&&kitchen.piecesPerUnit&&p.cookedWingsPerLb?kitchen.piecesPerUnit/p.cookedWingsPerLb*16:defaultOz);
 if(ounces!==undefined&&Number.isFinite(ounces)&&ounces>0&&ounces<=100000){if(cost?.basis==='fl-oz')kitchen.fluidOzPerUnit=ounces;else kitchen.ouncesPerUnit=ounces;}
 if(wings&&!kitchen.piecesPerUnit&&kitchen.ouncesPerUnit&&p.cookedWingsPerLb)kitchen.piecesPerUnit=kitchen.ouncesPerUnit/16*p.cookedWingsPerLb;
 let costQuantity:number|null=null;
 if(cost?.basis==='lb'&&kitchen.ouncesPerUnit)costQuantity=kitchen.ouncesPerUnit/16;
 if(cost?.basis==='full-pan')costQuantity=wings?(kitchen.piecesPerUnit?kitchen.piecesPerUnit/capacity:null):unit==='tray'?1:kitchen.ouncesPerUnit?kitchen.ouncesPerUnit/16/fullLb:null;
 if(cost?.basis==='half-pan')costQuantity=wings?(kitchen.piecesPerUnit?kitchen.piecesPerUnit/(p.wingsPerHalfTray||75):null):kitchen.ouncesPerUnit?kitchen.ouncesPerUnit/16/halfLb:null;
 if(cost?.basis==='event-guest'&&(unit==='guest'||unit==='portion'))costQuantity=1;
 if(cost?.basis==='each'&&kitchen.piecesPerUnit)costQuantity=kitchen.piecesPerUnit;
 if(cost?.basis==='pizza'&&kitchen.pizzasPerUnit)costQuantity=Math.ceil(kitchen.pizzasPerUnit*Math.max(1,quantity)-1e-8)/Math.max(1,quantity);
 if(cost?.basis==='fl-oz'&&kitchen.fluidOzPerUnit)costQuantity=kitchen.fluidOzPerUnit;
 const unitCostCents=cost&&cost.costCents>0&&costQuantity!==null?cost.costCents*costQuantity:null;
 const suggestedCents=unitCostCents!==null?Math.ceil(unitCostCents*100/aLaCarteFoodCostPercent-1e-8):null;
 return {kitchen,defaultOz,cost,unitCostCents,suggestedCents: suggestedCents!==null&&suggestedCents<=10000000?suggestedCents:null,reason:!cost||cost.costCents<=0?'Enter an internal food cost to calculate a price.':unitCostCents===null?'Enter a portion weight or the missing piece/serving yield to match the food-cost unit.':suggestedCents!>10000000?'Suggested price exceeds the order limit. Review cost and quantity.':'',basisNote:cost?`${cost.costCents/100} dollars per ${cost.basis}; portion and pan weights are planning estimates unless measured.`:'',estimated:Boolean(cost?.estimate)||!p.trayFinishedLb[choice.name]};
}
