import type {CateringCatalog, EventOrderItem} from '@/lib/event-plan';

export const appetizerBillingUnits = {guest:'Guest serving', tray:'Tray', piece:'Piece'} as const;
export type AppetizerBillingUnit = keyof typeof appetizerBillingUnits;

export function appetizerGuestPrice(name:string, catalog:CateringCatalog) {
  return catalog.extraPrices.appetizer + (catalog.menu.premiumAppetizers.includes(name) ? catalog.extraPrices.premiumAppetizer : 0);
}

// Uses ordinary custom food charges so existing summaries, proposals and payments stay authoritative.
export function appetizerOrderItem(input:{id:string;name:string;unit:AppetizerBillingUnit;quantity:number;unitPriceCents:number}, catalog:CateringCatalog):EventOrderItem {
  if (![...catalog.menu.appetizers,...catalog.menu.premiumAppetizers].includes(input.name) || catalog.disabledItems.includes(input.name)) throw new Error('Choose an available appetizer.');
  if (!Object.hasOwn(appetizerBillingUnits,input.unit)) throw new Error('Choose how this appetizer is priced.');
  if (!Number.isInteger(input.quantity) || input.quantity<1 || input.quantity>10000) throw new Error('Enter an appetizer quantity from 1 to 10,000.');
  if (!Number.isInteger(input.unitPriceCents) || input.unitPriceCents<0 || input.unitPriceCents>10000000) throw new Error('Enter a valid appetizer unit price.');
  return {id:input.id,category:'Food',name:`Appetizer: ${input.name} / ${input.unit}`,quantity:input.quantity,unitPriceCents:input.unitPriceCents,taxable:true,notes:input.unit==='guest'?'Quantity is guest servings.':`Quantity is ${input.unit}s. Confirm portions and preparation with the kitchen.`};
}
