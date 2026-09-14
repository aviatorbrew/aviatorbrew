import { beerProfiles, type Flavor } from "../data/beer-picker";
import { packageOptions, type KegItem, type PackageSize } from "./keg-packages";

export type PickerPreferences = { flavor: Flavor; strength: "any" | "lower" | "middle" | "higher"; format: "any" | "kegs" | "packs" };
export const defaultPreferences: PickerPreferences = { flavor: "any", strength: "any", format: "any" };

// Exact normalized aliases prevent a seasonal variant from inheriting another beer's notes or ABV.
function normalizeName(name: string) { return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
export function findBeerProfile(name: string) {
  const normalized = normalizeName(name);
  return beerProfiles.find((profile) => [profile.name, ...profile.aliases].some((alias) => normalizeName(alias) === normalized));
}
export function matchesFormat(size: PackageSize, format: PickerPreferences["format"]) {
  const keg = size === "1/6 bbl" || size === "50 L";
  return format === "any" || (format === "kegs" ? keg : !keg);
}
export function getBeerMatches(items: KegItem[], preferences: PickerPreferences) {
  return items.flatMap((item) => {
    if (item.forSale === false) return [];
    const profile = findBeerProfile(item.beerName);
    if (!profile) return [];
    const packages = packageOptions(item).filter((option) => matchesFormat(option.value, preferences.format));
    if (!packages.length) return [];
    if (preferences.flavor !== "any" && !profile.flavors.includes(preferences.flavor)) return [];
    if (preferences.strength === "lower" && profile.abv > 5.5) return [];
    if (preferences.strength === "middle" && (profile.abv <= 5.5 || profile.abv >= 7)) return [];
    if (preferences.strength === "higher" && profile.abv < 7) return [];
    return [{ item, profile, packages }];
  }).sort((a, b) => a.profile.name.localeCompare(b.profile.name));
}
