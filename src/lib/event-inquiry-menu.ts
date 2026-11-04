import {parseEventPlan,type CateringCatalog,type EventPlanDetails,type FlightPlan} from '@/lib/event-plan';

const foodKeys: (keyof FlightPlan)[]=['packageId','appetizers','entrees','sides','salads','pizzas','extraAppetizers','extraEntrees','extraSides','extraSalads','extraSidePriceCents','extraSaladPriceCents','extraAppetizerPriceCents','extraEntreePriceCents','extraPremiumEntreePriceCents','dessert','coffee','pizzaExtra','glutenFreeCount','pizzaTime','pizzaNotes','wingSauce','dietaryNeeds','foodNotes','appetizerTime'];
export function inquiryLastName(name:string){
  const words=name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,'').split(/[^a-z0-9]+/).filter(Boolean);
  while(words.length&&['jr','sr','ii','iii','iv'].includes(words.at(-1)!))words.pop();
  return words.at(-1)||'';
}
export function inquiryLastNameMatches(name:string,event:{title:string;contactName:string}){
  const surname=inquiryLastName(name);if(!surname)return false;
  const text=(event.contactName+' '+event.title).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,'');
  return text.split(/[^a-z0-9]+/).includes(surname);
}
export function mergeInquiryMenuDetails(current:EventPlanDetails,incoming:EventPlanDetails,catalog:CateringCatalog){
  if(current.status!=='Confirmed')throw new Error('Choose an active confirmed event.');
  if(!incoming?.flightPlan?.packageId)throw new Error('This website inquiry does not contain a buffet menu to merge.');
  const food=Object.fromEntries(foodKeys.filter(key=>Object.hasOwn(incoming.flightPlan!,key)).map(key=>[key,incoming.flightPlan![key]]));
  const flightPlan={...current.flightPlan,...food} as FlightPlan;
  delete flightPlan.cateringMode;
  // Retain the confirmed booking, financial adjustments, custom items and staff notes.
  return parseEventPlan({...current,flightPlan,guestCount:incoming.guestCount,foodTime:incoming.foodTime||current.foodTime,
    contactName:current.contactName||incoming.contactName,contactEmail:current.contactEmail||incoming.contactEmail,phone:current.phone||incoming.phone,
    notes:incoming.notes&&!current.notes.includes(incoming.notes)?[current.notes,incoming.notes].filter(Boolean).join('\n\n'):current.notes},catalog);
}
