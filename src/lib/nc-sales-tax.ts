import type { PreparedShopCart } from "@/lib/shop";
import type { ShopShippingAddress } from "@/lib/shop-shipping";

export type NcCountyTaxRate = { county: string; rateBasisPoints: number; rateLabel: string; includesTransit?: boolean };

export const ncCountyTaxRates: NcCountyTaxRate[] = [
  ["Alamance",675],["Alexander",700],["Alleghany",700],["Anson",700],["Ashe",700],["Avery",675],["Beaufort",675],["Bertie",700],["Bladen",675],["Brunswick",675],
  ["Buncombe",700],["Burke",675],["Cabarrus",700],["Caldwell",675],["Camden",675],["Carteret",675],["Caswell",675],["Catawba",700],["Chatham",700],["Cherokee",700],
  ["Chowan",675],["Clay",700],["Cleveland",675],["Columbus",675],["Craven",675],["Cumberland",700],["Currituck",675],["Dare",675],["Davidson",700],["Davie",675],
  ["Duplin",700],["Durham",750,true],["Edgecombe",700],["Forsyth",700],["Franklin",675],["Gaston",700],["Gates",675],["Graham",700],["Granville",675],["Greene",700],
  ["Guilford",675],["Halifax",700],["Harnett",700],["Haywood",700],["Henderson",675],["Hertford",700],["Hoke",675],["Hyde",675],["Iredell",675],["Jackson",700],
  ["Johnston",675],["Jones",700],["Lee",700],["Lenoir",675],["Lincoln",700],["Macon",675],["Madison",700],["Martin",700],["McDowell",675],["Mecklenburg",825,true],
  ["Mitchell",675],["Montgomery",700],["Moore",700],["Nash",675],["New Hanover",700],["Northampton",675],["Onslow",700],["Orange",750,true],["Pamlico",675],["Pasquotank",700],
  ["Pender",675],["Perquimans",675],["Person",675],["Pitt",700],["Polk",675],["Randolph",700],["Richmond",675],["Robeson",700],["Rockingham",700],["Rowan",700],
  ["Rutherford",700],["Sampson",700],["Scotland",675],["Stanly",700],["Stokes",675],["Surry",700],["Swain",700],["Transylvania",675],["Tyrrell",675],["Union",675],
  ["Vance",675],["Wake",725,true],["Warren",675],["Washington",700],["Watauga",675],["Wayne",675],["Wilkes",700],["Wilson",675],["Yadkin",675],["Yancey",675],
].map(([county, rateBasisPoints, includesTransit]) => ({ county: String(county), rateBasisPoints: Number(rateBasisPoints), rateLabel: (Number(rateBasisPoints) / 100).toFixed(2).replace(/\.00$/, "") + "%", includesTransit: includesTransit === true }));

const ratesByCounty = new Map(ncCountyTaxRates.map((rate) => [normalizeCounty(rate.county), rate]));

function normalizeCounty(value: string) {
  return value.toLowerCase().replace(/county$/i, "").replace(/[^a-z]/g, "");
}

export function getNcCountyTaxRate(county: string) {
  return ratesByCounty.get(normalizeCounty(county));
}

export function publicNcCountyTaxRates() {
  return ncCountyTaxRates.map(({ county, rateBasisPoints, rateLabel, includesTransit }) => ({ county, rateBasisPoints, rateLabel, includesTransit }));
}

export function calculateShopSalesTax(cart: PreparedShopCart, shippingCents: number, address: Pick<ShopShippingAddress, "state" | "county" | "country">) {
  const state = String(address.state || "").trim().toUpperCase();
  const country = String(address.country || "US").trim().toUpperCase();
  if (country !== "US" || state !== "NC") return { taxCents: 0, taxCounty: "", taxRateBasisPoints: 0, taxRateLabel: "0%", taxableCents: 0 };
  const county = String(address.county || "").trim();
  const rate = getNcCountyTaxRate(county);
  if (!rate) throw new Error("Choose a valid North Carolina county for sales tax.");
  const taxableCents = cart.subtotalCents + Math.max(0, Math.floor(shippingCents));
  const taxCents = Math.round(taxableCents * rate.rateBasisPoints / 10000);
  return { taxCents, taxCounty: rate.county, taxRateBasisPoints: rate.rateBasisPoints, taxRateLabel: rate.rateLabel, taxableCents };
}
