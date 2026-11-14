import { defaultCateringCatalog, type CateringCatalog } from "@/lib/event-plan";

export function parseCateringCatalog(value: unknown): CateringCatalog {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Provide catering settings.");
  const c = structuredClone(value) as CateringCatalog;
  const integer = (n: number, max = 10000000) => Number.isInteger(n) && n >= 0 && n <= max;
  const text = (s: unknown) => typeof s === "string" && s.trim().length > 0 && s.length <= 200 && !/[\r\n<>]/.test(s);
  if (!integer(c.minimumGuests, 10000) || c.minimumGuests < 1 || !integer(c.maximumGuests, 10000) || c.maximumGuests < c.minimumGuests || !text(c.venue) || !integer(c.salesTaxBps, 10000) || !integer(c.pfbTaxBps, 10000)) throw new Error("Check venue capacity and tax settings.");
  if (!Array.isArray(c.packages) || c.packages.length < 1 || c.packages.length > 12 || new Set(c.packages.map(p => p.id)).size !== c.packages.length) throw new Error("Use distinct package IDs.");
  for (const p of c.packages) {
    if(p.pricingMode!==undefined&&p.pricingMode!=='appetizer-selection')throw new Error("Choose a supported package pricing method.");
    if(p.pricingMode==='appetizer-selection'&&(p.id!=='appetizers-social'||p.appetizers!==3||p.entrees!==0||p.sides!==0||p.salads!==0||p.premiumEntreesIncluded))throw new Error("Appetizers & Socializing includes 3 appetizer selections and a hosted tab.");
    if (!/^[a-z0-9-]{1,40}$/.test(p.id) || !text(p.name) || !integer(p.priceCents) || (p.pricingMode==='appetizer-selection'?p.priceCents!==0:p.priceCents<100) || typeof p.enabled !== "boolean" || typeof p.premiumEntreesIncluded !== "boolean" || [p.appetizers, p.entrees, p.sides, p.salads].some(n => !integer(n, 12))) throw new Error("Check package prices and selection limits.");
  }
  for (const key of Object.keys(defaultCateringCatalog.menu) as (keyof CateringCatalog["menu"])[]) {
    const choices = c.menu?.[key];
    if (!Array.isArray(choices) || choices.length > 100 || choices.some(s => !text(s)) || new Set(choices).size !== choices.length) throw new Error(`Check ${key} menu choices.`);
  }
  for (const key of Object.keys(defaultCateringCatalog.extraPrices) as (keyof CateringCatalog["extraPrices"])[]) if (!integer(c.extraPrices?.[key])) throw new Error(`Check ${key} upgrade price.`);
  if (!Array.isArray(c.disabledItems) || c.disabledItems.length > 500 || c.disabledItems.some(s => !text(s))) throw new Error("Check unavailable food items.");
  if(c.managerOnlyItems===undefined)c.managerOnlyItems=[];
  if (!Array.isArray(c.managerOnlyItems) || c.managerOnlyItems.length > 500 || c.managerOnlyItems.some(s => !text(s)) || new Set(c.managerOnlyItems).size !== c.managerOnlyItems.length) throw new Error("Check manager-only food items.");
  if(c.entreeDescriptions!==undefined){
    if(!c.entreeDescriptions||typeof c.entreeDescriptions!=='object'||Array.isArray(c.entreeDescriptions)||Object.keys(c.entreeDescriptions).length>200)throw new Error('Check entrée descriptions.');
    const entries=Object.entries(c.entreeDescriptions);if(entries.some(([name,description])=>!text(name)||typeof description!=='string'||description.length>300||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(description)))throw new Error('Use short entrée descriptions of up to 300 characters.');
    const entrees=new Set([...c.menu.entrees,...c.menu.premiumEntrees]);c.entreeDescriptions=Object.fromEntries(entries.filter(([name,description])=>entrees.has(name)&&description.trim()).map(([name,description])=>[name,description.trim()]));
  }
  return c;
}
export function availableCatalog(catalog: CateringCatalog): CateringCatalog {
  const hidden=new Set([...catalog.disabledItems,...(catalog.managerOnlyItems||[])]);
  const menu=Object.fromEntries(Object.entries(catalog.menu).map(([key,values])=>[key,values.filter(name=>!hidden.has(name))])) as CateringCatalog["menu"];
  return {...catalog,...(catalog.appetizerPricing?{appetizerPricing:Object.fromEntries(Object.entries(catalog.appetizerPricing).filter(([name])=>[...menu.appetizers,...menu.premiumAppetizers].includes(name)))}:{}), disabledItems:[], managerOnlyItems:[], packages:catalog.packages.filter(p=>p.enabled),menu,...(catalog.entreeDescriptions?{entreeDescriptions:Object.fromEntries(Object.entries(catalog.entreeDescriptions).filter(([name])=>[...menu.entrees,...menu.premiumEntrees].includes(name)))}:{})};
}
