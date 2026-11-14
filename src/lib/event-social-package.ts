import {eventMenuChoices} from '@/lib/event-menu-order';
import {eventMenuPricing} from '@/lib/event-menu-pricing';
import type {CateringCatalog} from '@/lib/event-plan';
import type {EventFoodCostSettings} from '@/lib/event-food-cost';
import type {EventProductionSettings} from '@/lib/event-production';
export function socialAppetizerSellingPrices(catalog:CateringCatalog,production:EventProductionSettings,costs:EventFoodCostSettings){
 return Object.fromEntries(eventMenuChoices(catalog).filter(choice=>choice.prefix==='Appetizer').map(choice=>{const price=eventMenuPricing(choice,'guest',catalog,production,costs);return [choice.name,{unitPriceCents:price.suggestedCents,kitchen:price.kitchen}];}));
}
