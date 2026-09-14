export type KegItem = {
  beerName: string;
  category: string;
  packaging: string;
  sixthBblKegs: number;
  fiftyLKegs: number;
  totalBbl: number;
  sixthBblPriceCents?: number;
  fiftyLPriceCents?: number;
  caseSize?: string;
  casePriceCents?: number;
  case12PriceCents?: number;
  case12FourPackPriceCents?: number;
  case12SixPackPriceCents?: number;
  case16PriceCents?: number;
  case16FourPackPriceCents?: number;
  case12Count?: number;
  case12FourPackCount?: number;
  case12SixPackCount?: number;
  case16Count?: number;
  case16FourPackCount?: number;
  caseCount?: number;
  has12ozFourPack?: boolean;
  has12ozSixPack?: boolean;
  has16ozFourPack?: boolean;
  status?: string;
  forSale?: boolean;
  quantityNote?: string;
  sixtelsAvailableViaBackfill?: number;
};

export type PackageSize = "1/6 bbl" | "50 L" | "12 oz cases" | "12 oz 6-packs" | "12 oz 4-packs" | "16 oz cases" | "16 oz 4-packs";
type PackageOption = { value: PackageSize; label: string };
const packageChoices: PackageOption[] = [
  { value: "1/6 bbl", label: "1/6 BBL" },
  { value: "50 L", label: "50 L" },
  { value: "12 oz cases", label: "12 oz cases" },
  { value: "12 oz 6-packs", label: "12 oz 6-packs" },
  { value: "12 oz 4-packs", label: "12 oz 4-packs" },
  { value: "16 oz cases", label: "16 oz cases" },
  { value: "16 oz 4-packs", label: "16 oz 4-packs" },
];

export function money(cents?: number) {
  return typeof cents === "number" && cents > 0
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100)
    : "";
}


export function countForPackage(item: KegItem, packageSize: PackageSize) {
  if (packageSize === "1/6 bbl") return item.sixthBblKegs;
  if (packageSize === "50 L") return item.fiftyLKegs;
  if (packageSize === "12 oz cases") return item.case12Count || 0;
  if (packageSize === "12 oz 6-packs") return item.case12SixPackCount || 0;
  if (packageSize === "12 oz 4-packs") return item.case12FourPackCount || 0;
  if (packageSize === "16 oz cases") return item.case16Count || 0;
  return item.case16FourPackCount || 0;
}

export function priceForPackage(item: KegItem, packageSize: PackageSize) {
  if (packageSize === "1/6 bbl") return item.sixthBblPriceCents;
  if (packageSize === "50 L") return item.fiftyLPriceCents;
  if (packageSize === "12 oz cases") return item.case12PriceCents || (/^12\s*oz$/i.test(item.caseSize || "") ? item.casePriceCents : undefined);
  if (packageSize === "12 oz 6-packs") return item.has12ozSixPack ? item.case12SixPackPriceCents : undefined;
  if (packageSize === "12 oz 4-packs") return item.has12ozFourPack ? item.case12FourPackPriceCents : undefined;
  if (packageSize === "16 oz cases") return item.case16PriceCents || (/^16\s*oz$/i.test(item.caseSize || "") ? item.casePriceCents : undefined);
  return item.has16ozFourPack ? item.case16FourPackPriceCents : undefined;
}

export function isOffered(item: KegItem, packageSize: PackageSize) {
  if (packageSize === "12 oz 6-packs") return item.has12ozSixPack === true && Number(item.case12SixPackPriceCents || 0) > 0;
  if (packageSize === "12 oz 4-packs") return item.has12ozFourPack === true && Number(item.case12FourPackPriceCents || 0) > 0;
  if (packageSize === "16 oz 4-packs") return item.has16ozFourPack === true && Number(item.case16FourPackPriceCents || 0) > 0;
  return Number(priceForPackage(item, packageSize) || 0) > 0;
}

export function canOrder(item: KegItem, packageSize: PackageSize) {
  return isOffered(item, packageSize) && countForPackage(item, packageSize) > 0;
}

export function packageOptions(item: KegItem) {
  return packageChoices.filter((option) => canOrder(item, option.value));
}

