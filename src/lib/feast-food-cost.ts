import type {EventFoodCostSettings} from '@/lib/event-food-cost';
import type {FeastOrder,FeastSettings,FeastYield} from '@/lib/feast';
const aliases:Record<string,string>={'smoked beef brisket':'Aviator Beef Brisket','bbq pulled pork':'Aviator Pulled Pork BBQ','baked mac & cheese':'Mac & Cheese','southern potato salad':'Potato Salad','prime rib (cooked, trimmed, boneless)':'Holiday Prime Rib','aviator bbq sauce':'Aviator BBQ Sauce'};
export function feastCostKey(y:FeastYield){const normalized=y.name.replace(/ \(cooked\)$/i,''),name=aliases[normalized.toLowerCase()]||normalized;return ['egg halves','pieces','meatballs','shrimp','skewers'].includes(y.unit)?name+' / '+y.unit:name;}
export function feastCostQuantity(y:FeastYield,basis:string){
 if(!Number.isFinite(y.amount)||y.amount<=0)return null;
 if(basis==='lb'){if(['oz','oz cheese','oz dip'].includes(y.unit))return y.amount/16;if(y.unit==='lb'||y.unit==='1 lb tub')return y.amount;if(y.unit==='8 oz tub')return y.amount/2;}
 if(basis==='fl-oz'){const units:Record<string,number>={'fl oz':1,pint:16,quart:32,gallon:128};return units[y.unit]?y.amount*units[y.unit]:null;}
 if(basis==='each'&&['each','egg halves','pieces','meatballs','shrimp','skewers'].includes(y.unit))return y.amount;
 return null;
}
export function feastFoodCostEstimate(order:Pick<FeastOrder,'quote'|'input'>,settings:FeastSettings,costs:EventFoodCostSettings){
 const rows=order.quote.production.map(y=>{const key=feastCostKey(y),cost=costs[key],quantity=cost?feastCostQuantity(y,cost.basis):null;return {name:y.name,key,quantityLabel:`${Number(y.amount.toFixed(3))} ${y.unit}`,amountCents:cost&&quantity!==null?Math.round(quantity*cost.costCents):null,source:cost?.source||'',updatedAt:cost?.updatedAt||''};});
 for(const p of order.input.packages){const pkg=settings.packages.find(v=>v.id===p.id),key='Feast accompaniments: '+p.id,cost=costs[key],quoted=pkg?order.quote.lines.find(l=>l.name===pkg.name&&['guest','complete feast'].includes(l.unit)):null,count=quoted?.description.match(/^(\d+) planned servings/)?.[1]?Number(quoted.description.match(/^(\d+) planned servings/)![1]):null;rows.push({name:'Included sauces / condiments allowance · '+(pkg?.name||p.id),key,quantityLabel:count===null?'Package serving count needs review':count+' package servings',amountCents:cost?.basis==='event-guest'&&count!==null?Math.round(count*cost.costCents):null,source:cost?.source||'',updatedAt:cost?.updatedAt||''});}
 const packaging=costs['Feast standard packaging'],packagingCount=order.quote.capacity||order.input.guests;rows.push({name:'Standard food packaging allowance',key:'Feast standard packaging',quantityLabel:packagingCount+' planned servings',amountCents:packaging?.basis==='event-guest'?Math.round(packaging.costCents*packagingCount):null,source:packaging?.source||'',updatedAt:packaging?.updatedAt||''});
 // Beer inventory contains selling prices, not brewery production costs. Never treat one as the other.
 if(order.quote.productionNotes.some(n=>/beer/i.test(n))&&!order.quote.production.some(y=>/beer/i.test(y.name)))rows.push({name:'Beer production cost',key:'Beer production cost',quantityLabel:'Not supplied by selling-price inventory',amountCents:null,source:'',updatedAt:''});
 const missing=rows.filter(r=>r.amountCents===null).map(r=>r.name),knownCents=rows.reduce((n,r)=>n+(r.amountCents||0),0);return {rows,missing,knownCents,complete:missing.length===0,percent:!missing.length&&order.quote.subtotalCents?knownCents/order.quote.subtotalCents*100:null};
}
