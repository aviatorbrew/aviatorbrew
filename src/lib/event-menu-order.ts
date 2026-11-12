import type {CateringCatalog, EventOrderItem, EventItemKitchen} from '@/lib/event-plan';

export const menuBillingUnits = {guest:'Guest serving',portion:'Individual portion',tray:'Full tray',piece:'Piece',pizza:'Whole pizza'} as const;
export type MenuBillingUnit = keyof typeof menuBillingUnits;
export type EventMenuChoice = {id:string;name:string;group:string;prefix:string;category:EventOrderItem['category'];unavailable:boolean;managerOnly:boolean;referenceCents:number|null};

export function eventMenuChoices(catalog:CateringCatalog):EventMenuChoice[] {
  const groups = [
    ['appetizers','Appetizers','Appetizer',catalog.extraPrices.appetizer],
    ['premiumAppetizers','Premium appetizers','Appetizer',catalog.extraPrices.appetizer+catalog.extraPrices.premiumAppetizer],
    ['entrees','Entrées','Entree',catalog.extraPrices.entree],
    ['premiumEntrees','Premium entrées','Entree',catalog.extraPrices.premiumEntree],
    ['sides','Sides','Side',catalog.extraPrices.side],
    ['salads','Salads','Salad',catalog.extraPrices.salad],
    ['pizzas','Pizzas','Pizza',null],
  ] as const;
  const choices:EventMenuChoice[]=groups.flatMap(([key,group,prefix,referenceCents])=>[...new Set(catalog.menu[key])].map(name=>({id:key+':'+name,name,group,prefix,category:'Food' as const,unavailable:catalog.disabledItems.includes(name),managerOnly:Boolean(catalog.managerOnlyItems?.includes(name)),referenceCents})));
  choices.push({id:'dessert',name:'Dessert display',group:'Dessert & coffee',prefix:'Dessert',category:'Food',unavailable:catalog.disabledItems.includes('Dessert display'),managerOnly:false,referenceCents:catalog.extraPrices.dessert},{id:'coffee',name:'Coffee service',group:'Dessert & coffee',prefix:'Beverage',category:'Drinks',unavailable:catalog.disabledItems.includes('Coffee service'),managerOnly:false,referenceCents:catalog.extraPrices.coffee});
  return choices;
}

// Ordinary order rows preserve agreed prices and quantities in existing quotes and kitchen sheets.
export function eventMenuOrderItem(input:{id:string;choiceId:string;unit:MenuBillingUnit;quantity:number;unitPriceCents:number;notes?:string;pizzaStyles?:string[];kitchen?:EventItemKitchen},catalog:CateringCatalog):EventOrderItem {
  const choice=eventMenuChoices(catalog).find(item=>item.id===input.choiceId);
  if(!choice||choice.unavailable)throw new Error('Choose an available menu item.');
  if(!Object.hasOwn(menuBillingUnits,input.unit))throw new Error('Choose a billing unit.');
  if(!Number.isInteger(input.quantity)||input.quantity<1||input.quantity>10000)throw new Error('Enter a quantity from 1 to 10,000.');
  if(!Number.isInteger(input.unitPriceCents)||input.unitPriceCents<0||input.unitPriceCents>10000000)throw new Error('Enter a valid agreed unit price.');
  const pizza=choice.prefix==='Pizza'||choice.name==='Aviator Pizzeria Pizza Bar';
  const styles=pizza?(input.pizzaStyles??(choice.prefix==='Pizza'?[choice.name]:[])):undefined;
  if(styles&&(!styles.length||styles.length>3||new Set(styles).size!==styles.length||styles.some(n=>!catalog.menu.pizzas.includes(n)||catalog.disabledItems.includes(n))))throw new Error('Choose one to three available pizza styles.');
  if(pizza&&!['guest','portion','pizza'].includes(input.unit))throw new Error('Price Pizza Bar by guest serving, portion or whole pizza.');
  if(styles&&input.kitchen?.pizzasPerUnit&&Math.ceil(input.kitchen.pizzasPerUnit*input.quantity-1e-8)<styles.length)throw new Error('Choose fewer styles or increase the whole-pizza quantity.');
  const notes=`${styles?`Pizza styles: ${styles.join(', ')}. One serving allowance shared across all styles. `:''}Quantity is ${menuBillingUnits[input.unit].toLowerCase()}${input.unit==='guest'?'s':''}. ${input.notes?.trim()||'Confirm portions and preparation with the kitchen.'}`;
  if(notes.length>1000)throw new Error('Shorten the preparation notes so the full order note stays under 1,000 characters.');
  return {...(styles?{pizzaStyles:styles}:{}),...(input.kitchen?{kitchen:input.kitchen}:{}),id:input.id,category:choice.category,name:styles?`Pizza: Aviator Pizzeria Pizza Bar / ${input.unit}`:`${choice.prefix}: ${choice.name} / ${input.unit}`,quantity:input.quantity,unitPriceCents:input.unitPriceCents,taxable:true,notes};
}
