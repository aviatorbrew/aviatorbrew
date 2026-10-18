import { defaultCateringCatalog, type CateringCatalog } from "@/lib/event-plan";

export function parseCateringCatalog(value: unknown): CateringCatalog {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Provide catering settings.");
  const c = structuredClone(value) as CateringCatalog;
  const integer = (n: number, max = 10000000) => Number.isInteger(n) && n >= 0 && n <= max;
  const text = (s: unknown) => typeof s === "string" && s.trim().length > 0 && s.length <= 200 && !/[\r\n<>]/.test(s);
  if (!integer(c.minimumGuests, 10000) || c.minimumGuests < 1 || !integer(c.maximumGuests, 10000) || c.maximumGuests < c.minimumGuests || !text(c.venue) || !integer(c.salesTaxBps, 10000) || !integer(c.pfbTaxBps, 10000)) throw new Error("Check venue capacity and tax settings.");
  if (!Array.isArray(c.packages) || c.packages.length < 1 || c.packages.length > 12 || new Set(c.packages.map(p => p.id)).size !== c.packages.length) throw new Error("Use distinct package IDs.");
  for (const p of c.packages) {
    if (!/^[a-z0-9-]{1,40}$/.test(p.id) || !text(p.name) || !integer(p.priceCents) || p.priceCents < 100 || typeof p.enabled !== "boolean" || typeof p.premiumEntreesIncluded !== "boolean" || [p.appetizers, p.entrees, p.sides, p.salads].some(n => !integer(n, 12))) throw new Error("Check package prices and selection limits.");
  }
  for (const key of Object.keys(defaultCateringCatalog.menu) as (keyof CateringCatalog["menu"])[]) {
    const choices = c.menu?.[key];
    if (!Array.isArray(choices) || choices.length > 100 || choices.some(s => !text(s)) || new Set(choices).size !== choices.length) throw new Error(`Check ${key} menu choices.`);
  }
  for (const key of Object.keys(defaultCateringCatalog.extraPrices) as (keyof CateringCatalog["extraPrices"])[]) if (!integer(c.extraPrices?.[key])) throw new Error(`Check ${key} upgrade price.`);
  if (!Array.isArray(c.disabledItems) || c.disabledItems.length > 500 || c.disabledItems.some(s => !text(s))) throw new Error("Check unavailable food items.");
  return c;
}
export function availableCatalog(catalog: CateringCatalog): CateringCatalog {
  return {...catalog, packages: catalog.packages.filter(p => p.enabled), menu: Object.fromEntries(Object.entries(catalog.menu).map(([key, values]) => [key, values.filter(name => !catalog.disabledItems.includes(name))])) as CateringCatalog["menu"]};
}
