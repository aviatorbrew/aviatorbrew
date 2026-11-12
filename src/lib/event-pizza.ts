import type {EventOrderItem} from '@/lib/event-plan';
import type {EventProductionSettings} from '@/lib/event-production';
export const pizzaBarName='Aviator Pizzeria Pizza Bar';
export function isPizzaOrder(item:Pick<EventOrderItem,'name'|'pizzaStyles'>){return Boolean(item.pizzaStyles?.length)||/^(?:Pizza: .+|Entree: Aviator Pizzeria Pizza Bar) \/ (guest|portion|pizza)$/.test(item.name);}
export function pizzaOrderStyles(item:EventOrderItem){
 if(item.pizzaStyles?.length)return [...item.pizzaStyles];
 const match=/^Pizza: (.+) \/ (guest|portion|pizza)$/.exec(item.name);
 return match&&match[1]!==pizzaBarName?[match[1]]:[];
}
export function splitPizzaStyles(total:number,styles:string[]){const unique=[...new Set(styles)];return unique.map((name,index)=>({name,count:Math.floor(total/unique.length)+(index<total%unique.length?1:0)}));}
export function pizzaOrderCount(item:EventOrderItem,s:EventProductionSettings){
 const match=/^(?:Pizza: .+|Entree: Aviator Pizzeria Pizza Bar) \/ (guest|portion|pizza)$/.exec(item.name);
 const previous=match&&match[1]!=='pizza'&&item.kitchen?.pizzasPerUnit===.25&&(s.pizzaSlicesPerGuest||3)===3;
 const perUnit=previous?(s.pizzaSlicesPerGuest||3)/(s.pizzaSlicesPerPie||8):item.kitchen?.pizzasPerUnit??(match?(match[1]==='pizza'?1:(s.pizzaSlicesPerGuest||3)/(s.pizzaSlicesPerPie||8)):null);
 return perUnit===null?null:Math.ceil(perUnit*item.quantity-1e-8);
}
// Old style-by-style guest rows describe one group's variety. Merge only matching
// guest counts and serving allowances; explicit whole-pizza orders stay separate.
export function sharedPizzaOrders(items:EventOrderItem[],s:EventProductionSettings,fallbackStyles:string[]=[]){
 const result:EventOrderItem[]=[],groups=new Map<string,EventOrderItem>();
 for(const item of items){
  const match=isPizzaOrder(item)&&/ \/ (guest|portion)$/.exec(item.name);
  if(!match){result.push(item);continue;}
  const count=pizzaOrderCount(item,s),key=`${match[1]}:${item.quantity}:${count}`,styles=pizzaOrderStyles(item),chosen=styles.length?styles:fallbackStyles;
  const previous=groups.get(key);
  if(previous){previous.pizzaStyles=[...new Set([...(previous.pizzaStyles||[]),...chosen])];if(item.notes&&!previous.notes.includes(item.notes))previous.notes+='\n'+item.notes;}
  else{const group={...item,kitchen:item.kitchen?{...item.kitchen}:undefined,name:`Pizza: ${pizzaBarName} / ${match[1]}`,pizzaStyles:[...chosen]};groups.set(key,group);result.push(group);}
 }
 return result;
}
