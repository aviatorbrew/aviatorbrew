import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { menuPublicUrl, menuRoots } from "@/lib/menu-files";

const execFileAsync = promisify(execFile);

export type CateringMenuOption = { label: string; value: string };
export type CateringMenuOptionGroup = { name: string; options: CateringMenuOption[] };
export type CateringMenuItem = { id: string; group: string; name: string; note?: string; priceCents?: number; options?: CateringMenuOption[]; optionSlots?: number; optionLabel?: string; optionGroups?: CateringMenuOptionGroup[] };
export type CateringMenuScan = { menuName: string; menuUrl: string; source: "json" | "scanned" | "fallback"; items: CateringMenuItem[] };

type MenuFile = { name: string; file: string; url: string; mtimeMs: number; type: "drinks" | "food" };
type TextColumn = { start: number; end?: number };
type VariantSectionConfig = {
  group: string;
  start: string;
  end: string[];
  column: TextColumn;
  optionsForBaseName?: (baseName: string) => CateringMenuOption[] | undefined;
  variantLabel?: (variant: string) => string;
};

const sauceOptions = ["Jet Fuel Buffalo", "Honey Bourbon BBQ", "Garlic Parm", "Lemon Pepper", "Hot Honey", "BlackMamba", "Aviator Dry Rub BBQ", "Afterburner (+$5)", "Cherry Bomb (+$5)"].map((value) => ({ label: value, value }));
const drinkOptions = ["Root Beer", "Cream Soda", "Mixed"].map((value) => ({ label: value, value }));
const sliderOptions = ["No add-ons", "Add bacon (+$12)", "Add jalapenos (+$12)", "Add bacon and jalapenos (+$24)"].map((value) => ({ label: value, value }));

const fallbackItems: CateringMenuItem[] = [
  { id: "wings-25", group: "Wing packs", name: "25 Wings", options: sauceOptions, optionSlots: 2, optionLabel: "Wing sauce", note: "$45 - choose up to 2 sauces" },
  { id: "wings-50", group: "Wing packs", name: "50 Wings", options: sauceOptions, optionSlots: 3, optionLabel: "Wing sauce", note: "$85 - choose up to 3 sauces" },
  { id: "wings-100", group: "Wing packs", name: "100 Wings", options: sauceOptions, optionSlots: 4, optionLabel: "Wing sauce", note: "$160 - choose up to 4 sauces" },
  { id: "smash-sliders-12", group: "Slider & sandwich packs", name: "Hangar Smash Slider Pack - 12 sliders", options: sliderOptions, note: "$48" },
  { id: "smash-sliders-24", group: "Slider & sandwich packs", name: "Hangar Smash Slider Pack - 24 sliders", options: sliderOptions, note: "$90" },
  { id: "pulled-pork-10", group: "Slider & sandwich packs", name: "Pulled Pork BBQ Pack w/Buns - serves 10-12", note: "$110" },
  { id: "pulled-pork-20", group: "Slider & sandwich packs", name: "Pulled Pork BBQ Pack w/Buns - serves 20-25", note: "$210" },
  { id: "brisket-10", group: "Slider & sandwich packs", name: "Smoked Brisket Sandwich Pack - serves 10-12", note: "$145" },
  { id: "brisket-20", group: "Slider & sandwich packs", name: "Smoked Brisket Sandwich Pack - serves 20-25", note: "$275" },
  { id: "cheesesteak-10", group: "Slider & sandwich packs", name: "Cheesesteak Tray - serves 10-12", note: "$150" },
  { id: "cheesesteak-20", group: "Slider & sandwich packs", name: "Cheesesteak Tray - serves 20-25", note: "$285" },
  { id: "egg-rolls-25", group: "App packs", name: "Flight Deck Egg Roll Tray - 25 pieces", note: "$55" },
  { id: "egg-rolls-50", group: "App packs", name: "Flight Deck Egg Roll Tray - 50 pieces", note: "$100" },
  { id: "jalapeno-bomb-small", group: "App packs", name: "Jalapeno Bomb Tray - small tray", note: "$45" },
  { id: "jalapeno-bomb-large", group: "App packs", name: "Jalapeno Bomb Tray - large tray", note: "$80" },
  { id: "pretzel-board-small", group: "App packs", name: "Big Bavarian Pretzel Board - serves 10-15", note: "$45" },
  { id: "pretzel-board-large", group: "App packs", name: "Big Bavarian Pretzel Board - serves 20-30", note: "$80" },
  { id: "loaded-tots-half", group: "App packs", name: "Loaded Tot Tray - half tray", note: "$40" },
  { id: "loaded-tots-full", group: "App packs", name: "Loaded Tot Tray - full tray", note: "$75" },
  { id: "brisket-meal-10", group: "BBQ & comfort catering", name: "Pitmaster Brisket Meal - serves 10", note: "$185" },
  { id: "brisket-meal-20", group: "BBQ & comfort catering", name: "Pitmaster Brisket Meal - serves 20", note: "$350" },
  { id: "meatloaf-10", group: "BBQ & comfort catering", name: "Bacon Wrapped Meatloaf Meal - serves 10", note: "$160" },
  { id: "meatloaf-20", group: "BBQ & comfort catering", name: "Bacon Wrapped Meatloaf Meal - serves 20", note: "$300" },
  { id: "fried-chicken-10", group: "BBQ & comfort catering", name: "Country Fried Chicken Meal - serves 10", note: "$165" },
  { id: "fried-chicken-20", group: "BBQ & comfort catering", name: "Country Fried Chicken Meal - serves 20", note: "$310" },
  { id: "shrimp-5", group: "Seafood packs", name: "Peel & Eat Shrimp Party Tray - 5 lb", note: "$110" },
  { id: "shrimp-10", group: "Seafood packs", name: "Peel & Eat Shrimp Party Tray - 10 lb", note: "$210" },
  { id: "crab-boil-small", group: "Seafood packs", name: "Aviator Crab Boil - serves 5-7", note: "$145" },
  { id: "crab-boil-large", group: "Seafood packs", name: "Aviator Crab Boil - serves 10-14", note: "$275" },
  { id: "mac-half", group: "House catering sides", name: "Mac & Cheese - half tray", note: "$45" },
  { id: "mac-full", group: "House catering sides", name: "Mac & Cheese - full tray", note: "$75" },
  { id: "collards-half", group: "House catering sides", name: "Collard Greens - half tray", note: "$35" },
  { id: "collards-full", group: "House catering sides", name: "Collard Greens - full tray", note: "$65" },
  { id: "potato-salad-half", group: "House catering sides", name: "Potato Salad - half tray", note: "$35" },
  { id: "potato-salad-full", group: "House catering sides", name: "Potato Salad - full tray", note: "$65" },
  { id: "broccoli-salad-half", group: "House catering sides", name: "Broccoli Salad - half tray", note: "$35" },
  { id: "broccoli-salad-full", group: "House catering sides", name: "Broccoli Salad - full tray", note: "$65" },
  { id: "tomato-cucumber-half", group: "House catering sides", name: "Tomato Cucumber Salad - half tray", note: "$35" },
  { id: "tomato-cucumber-full", group: "House catering sides", name: "Tomato Cucumber Salad - full tray", note: "$65" },
  { id: "caesar-half", group: "House catering sides", name: "Side Caesar - half tray", note: "$35" },
  { id: "caesar-full", group: "House catering sides", name: "Side Caesar - full tray", note: "$65" },
  { id: "garden-half", group: "House catering sides", name: "Side Garden Salad - half tray", note: "$35" },
  { id: "garden-full", group: "House catering sides", name: "Side Garden Salad - full tray", note: "$65" },
  { id: "root-cream-12", group: "Drink packs", name: "Aviator Root Beer or Cream Soda - 12-pack", options: drinkOptions, note: "$36" },
  { id: "root-cream-24", group: "Drink packs", name: "Aviator Root Beer or Cream Soda - 24-pack", options: drinkOptions, note: "$68" },
  { id: "ranch-pint", group: "Add-ons", name: "Ranch - pint", note: "$8" },
  { id: "bleu-cheese-pint", group: "Add-ons", name: "Bleu Cheese - pint", note: "$8" },
  { id: "burger-sauce-pint", group: "Add-ons", name: "House Burger Sauce - pint", note: "$8" },
  { id: "beer-cheese-pint", group: "Add-ons", name: "Beer Cheese - pint", note: "$10" },
  { id: "brioche-buns", group: "Add-ons", name: "Brioche Buns - dozen", note: "$12" },
  { id: "hawaiian-rolls", group: "Add-ons", name: "Hawaiian Slider Rolls - dozen", note: "$10" },
  { id: "biscuits", group: "Add-ons", name: "House Biscuits - dozen", note: "$15" },
];

function priceFromNote(note?: string) {
  const match = note?.match(/\$(\d+(?:\.\d{2})?)/);
  return match ? Math.round(Number(match[1]) * 100) : undefined;
}

const pricedFallbackItems = fallbackItems.map((item) => ({ ...item, priceCents: priceFromNote(item.note) }));

const sectionMap = new Map([
  ["WING PACKS", "Wing packs"],
  ["SLIDER & SANDWICH PACKS", "Slider & sandwich packs"],
  ["APP PACKS", "App packs"],
  ["BBQ & COMFORT CATERING", "BBQ & comfort catering"],
  ["HOUSE CATERING SIDES", "House catering sides"],
  ["SEAFOOD PACKS", "Seafood packs"],
  ["DRINK PACKS", "Drink packs"],
  ["ADD-ONS", "Add-ons"],
]);

const ignored = new Set(["PICKUP TO GO CATERING", "PICKUP DETAILS", "NAME", "PICKUP DATE", "PICKUP TIME", "NOTES", "QUANTITY", "SAUCE OPTIONS", "PRICE", "ITEM", "SIZE", "SIZE / SERVES", "SERVES", "SIDE", "HALF TRAY", "FULL TRAY", "PACK", "HOUSE SAUCES", "SLIDER ADD-ONS", "PICKUP & SERVICE", "BEER & THC BEVERAGES"]);

function slugify(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "menu-item";
}

function normalizeLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function priceCents(value: string) {
  return Math.round(Number(value.replace(/[$,]/g, "")) * 100);
}

function formatOptionPrice(cents: number) {
  const amount = cents / 100;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function cappedOptionSlots(count: number) {
  return Number.isFinite(count) && count > 1 ? Math.min(6, Math.round(count)) : undefined;
}

function optionSlotsFromUnknown(value: unknown) {
  if (typeof value === "number") return cappedOptionSlots(value);
  if (typeof value !== "string") return undefined;
  const match = value.match(/\d+/);
  return match ? cappedOptionSlots(Number(match[0])) : undefined;
}

function optionSlotsFromText(...values: Array<string | undefined>) {
  const text = values.filter(Boolean).join(" ");
  const match = text.match(/choose\s+up\s+to\s+(\d+)/i) || text.match(/up\s+to\s+(\d+)\s+(?:wing\s+)?(?:sauces|choices|options)/i) || text.match(/\b(\d+)\s+(?:wing\s+)?sauces?\b/i);
  return match ? cappedOptionSlots(Number(match[1])) : undefined;
}

function inferredWingSauceSlots(item: CateringMenuItem) {
  const text = [item.group, item.name, item.note].filter(Boolean).join(" ");
  const explicit = optionSlotsFromText(text);
  if (explicit) return explicit;
  if (!/wing/i.test(text)) return undefined;
  const wingCount = Number(text.match(/\b(25|50|100)\s+(?:jumbo\s+)?wings?\b/i)?.[1] || 0);
  if (wingCount >= 100) return 4;
  if (wingCount >= 50) return 3;
  if (wingCount >= 25) return 2;
  return undefined;
}

function inferredOptionLabel(item: CateringMenuItem) {
  const text = [item.group, item.name, item.note].filter(Boolean).join(" ");
  return /wing|sauce/i.test(text) ? "Wing sauce" : "Option";
}

function withOptionSlots(item: CateringMenuItem) {
  if (item.optionGroups?.length || !item.options?.length) return item;
  const slots = cappedOptionSlots(item.optionSlots || 0) || inferredWingSauceSlots(item);
  return slots ? { ...item, optionSlots: slots, optionLabel: item.optionLabel || inferredOptionLabel(item) } : item;
}

function appendItem(items: CateringMenuItem[], item: CateringMenuItem) {
  if (items.some((existing) => existing.group === item.group && existing.name.toLowerCase() === item.name.toLowerCase())) return;
  let id = item.id;
  let suffix = 2;
  while (items.some((existing) => existing.id === id)) {
    id = item.id + "-" + suffix;
    suffix += 1;
  }
  const priceNote = item.priceCents ? "$" + formatOptionPrice(item.priceCents) : "";
  const note = priceNote && item.note && !item.note.includes("$") ? priceNote + " - " + item.note : item.note || priceNote || undefined;
  items.push(withOptionSlots({ ...item, id, note }));
}

function sectionLines(rawLines: string[], start: string, end: string[], column: TextColumn) {
  const startUpper = start.toUpperCase();
  const endUpper = end.map((value) => value.toUpperCase());
  const lines: string[] = [];
  let active = false;

  for (const rawLine of rawLines) {
    const upper = rawLine.toUpperCase();
    if (!active && upper.includes(startUpper)) active = true;
    if (!active) continue;
    if (lines.length && endUpper.some((heading) => upper.includes(heading))) break;
    const line = normalizeLine(rawLine.slice(column.start, column.end));
    if (line) lines.push(line);
  }

  return lines;
}

function sectionLinesFromLastExactHeading(rawLines: string[], start: string, end: string[], column: TextColumn) {
  const startUpper = start.toUpperCase();
  const endUpper = end.map((value) => value.toUpperCase());
  const startIndex = rawLines.reduce((latest, rawLine, index) => normalizeLine(rawLine.slice(column.start, column.end)).toUpperCase() === startUpper ? index : latest, -1);
  if (startIndex === -1) return [];

  const lines: string[] = [];
  for (const rawLine of rawLines.slice(startIndex)) {
    const upper = rawLine.toUpperCase();
    if (lines.length && endUpper.some((heading) => upper.includes(heading))) break;
    const line = normalizeLine(rawLine.slice(column.start, column.end));
    if (line) lines.push(line);
  }

  return lines;
}

function isTableNoise(line: string) {
  const upper = line.toUpperCase();
  if (!line || ignored.has(upper) || sectionMap.has(upper)) return true;
  if (/page \d+ of \d+/i.test(line)) return true;
  if (/^(ITEM|MEAL|SIDE|QUANTITY|SAUCE OPTIONS|PRICE|SIZE|SERVES|PACK|HALF TRAY|FULL TRAY)\b/i.test(line) && !/\$\d/.test(line)) return true;
  if (/events@|919-|688 brewing|questions|pricing and availability|delivery is available|setup is available|contact |order details|catering packs|meals, seafood|beer is available|current selections|ordering details|confirm timing|service details|listed on page/i.test(line)) return true;
  return false;
}

function isStandaloneItemName(line: string) {
  if (isTableNoise(line) || /\$/.test(line)) return false;
  if (line.length > 75 || /[.!?]$/.test(line) || line.includes(",")) return false;
  if (/^(small|large|half|full) tray$/i.test(line)) return false;
  if (/^serves \d/i.test(line) || /^\d+(-\d+)?$/.test(line)) return false;
  if (/^\d+\s*(sliders|pieces|lb|oysters|-?pack)$/i.test(line)) return false;
  return /[a-z]/i.test(line);
}

function parseVariantPriceLine(line: string) {
  const variantPattern = "(?:\\d+\\s*-\\s*pack|\\d+-pack|\\d+\\s*(?:sliders|pieces|lb|oysters)|(?:small|large|half|full)\\s+tray|serves\\s+\\d+(?:\\s*-\\s*\\d+)?|\\d+)";
  const match = line.match(new RegExp("^(?:(.+?)\\s+)?(" + variantPattern + ")\\s+\\$(\\d+(?:\\.\\d{2})?)\\b", "i"));
  if (!match) return null;
  return {
    baseName: match[1] ? normalizeLine(match[1]) : "",
    variant: normalizeLine(match[2].replace(/\s*-\s*/g, "-")),
    priceCents: priceCents(match[3]),
  };
}

function variantName(baseName: string, variant: string) {
  return baseName + " - " + variant;
}

function parseSauceOptions(text: string) {
  const rawLines = text.split(/\r?\n/);
  const parts: string[] = [];
  let active = false;

  for (const rawLine of rawLines) {
    const leftLine = normalizeLine(rawLine.slice(0, 80));
    if (/^HOUSE SAUCES$/i.test(leftLine)) { active = true; continue; }
    if (!active) continue;
    if (/^APP PACKS/i.test(leftLine)) break;
    if (leftLine && !isTableNoise(leftLine)) parts.push(leftLine);
  }

  const options = parts.join(" ").split(",").map((option) => normalizeLine(option).replace(/\s+\+\$(\d+(?:\.\d{2})?)/, (_match, amount) => " (+$" + amount + ")")).filter(Boolean);
  return options.length >= 4 ? options.map((value) => ({ label: value, value })) : sauceOptions;
}

function parseSliderOptions(text: string) {
  const bacon = text.match(/Add bacon:\s*\$(\d+(?:\.\d{2})?)/i);
  const jalapenos = text.match(/Add jalapenos:\s*\$(\d+(?:\.\d{2})?)/i);
  if (!bacon || !jalapenos) return sliderOptions;

  const baconCents = priceCents(bacon[1]);
  const jalapenoCents = priceCents(jalapenos[1]);
  const values = [
    "No add-ons",
    "Add bacon (+$" + formatOptionPrice(baconCents) + ")",
    "Add jalapenos (+$" + formatOptionPrice(jalapenoCents) + ")",
    "Add bacon and jalapenos (+$" + formatOptionPrice(baconCents + jalapenoCents) + ")",
  ];
  return values.map((value) => ({ label: value, value }));
}

function parseWingPacks(rawLines: string[], sauceChoices: CateringMenuOption[]) {
  const items: CateringMenuItem[] = [];
  for (const line of sectionLines(rawLines, "WING PACKS", ["HOUSE SAUCES", "APP PACKS"], { start: 0, end: 80 })) {
    const match = line.match(/^(\d+\s+wings)\s+(choose up to \d+)\s+\$(\d+(?:\.\d{2})?)\b/i);
    if (!match) continue;
    const name = normalizeLine(match[1]);
    const choiceNote = normalizeLine(match[2]).replace(/^choose/i, "Choose");
    appendItem(items, {
      id: slugify("Wing packs-" + name),
      group: "Wing packs",
      name,
      note: choiceNote + " sauces",
      options: sauceChoices,
      optionSlots: optionSlotsFromText(choiceNote),
      optionLabel: "Wing sauce",
      priceCents: priceCents(match[3]),
    });
  }
  return items;
}

function parseVariantSection(rawLines: string[], config: VariantSectionConfig) {
  const items: CateringMenuItem[] = [];
  let currentBaseName = "";

  for (const line of sectionLines(rawLines, config.start, config.end, config.column)) {
    if (isTableNoise(line)) continue;
    const priced = parseVariantPriceLine(line);
    if (priced) {
      const baseName = priced.baseName || currentBaseName;
      if (!baseName || isTableNoise(baseName)) continue;
      currentBaseName = baseName;
      const label = config.variantLabel ? config.variantLabel(priced.variant) : priced.variant;
      appendItem(items, {
        id: slugify(config.group + "-" + baseName + "-" + label),
        group: config.group,
        name: variantName(baseName, label),
        priceCents: priced.priceCents,
        options: config.optionsForBaseName?.(baseName),
      });
      continue;
    }
    if (isStandaloneItemName(line)) currentBaseName = line;
  }

  return items;
}

function parseTwoPriceSection(rawLines: string[], start: string, end: string[], column: TextColumn, group: string, firstLabel: string, secondLabel: string) {
  const items: CateringMenuItem[] = [];

  for (const line of sectionLines(rawLines, start, end, column)) {
    if (isTableNoise(line)) continue;
    const match = line.match(/^(.+?)\s+\$(\d+(?:\.\d{2})?)\s+\$(\d+(?:\.\d{2})?)$/);
    if (!match) continue;
    const name = normalizeLine(match[1]);
    appendItem(items, { id: slugify(group + "-" + name + "-" + firstLabel), group, name: variantName(name, firstLabel), priceCents: priceCents(match[2]) });
    appendItem(items, { id: slugify(group + "-" + name + "-" + secondLabel), group, name: variantName(name, secondLabel), priceCents: priceCents(match[3]) });
  }

  return items;
}

function parsePricedItemSection(rawLines: string[], start: string, end: string[], column: TextColumn, group: string) {
  const items: CateringMenuItem[] = [];

  for (const line of sectionLinesFromLastExactHeading(rawLines, start, end, column)) {
    if (isTableNoise(line)) continue;
    const match = line.match(/^(.+?)\s+\$(\d+(?:\.\d{2})?)$/);
    if (!match) continue;
    const name = normalizeLine(match[1]);
    appendItem(items, { id: slugify(group + "-" + name), group, name, priceCents: priceCents(match[2]) });
  }

  return items;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textField(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return normalizeLine(value).slice(0, 140);
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function noteField(record: JsonRecord) {
  for (const key of ["note", "notes", "description", "details"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return normalizeLine(value).slice(0, 260);
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function firstArray(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function normalizeGroupLabel(value: string) {
  const group = normalizeLine(value);
  return sectionMap.get(group.toUpperCase()) || group || "Catering menu";
}

function priceCentsFromUnknown(value: unknown, centsAlready = false) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(centsAlready ? value : value * 100));
  if (typeof value !== "string") return undefined;
  const match = value.replace(/,/g, "").match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
  if (!match) return undefined;
  return Math.max(0, Math.round((centsAlready && !value.includes("$") && !value.includes(".")) ? Number(match[1]) : Number(match[1]) * 100));
}

function priceCentsFromRecord(record: JsonRecord) {
  for (const key of ["priceCents", "price_cents", "unitPriceCents", "unit_price_cents"]) {
    const cents = priceCentsFromUnknown(record[key], true);
    if (cents !== undefined) return cents;
  }
  for (const key of ["price", "unitPrice", "unit_price", "amount", "cost"]) {
    const cents = priceCentsFromUnknown(record[key]);
    if (cents !== undefined) return cents;
  }
  return undefined;
}

function jsonOption(value: unknown): CateringMenuOption | null {
  if (typeof value === "string") {
    const label = normalizeLine(value);
    return label ? { label, value: label } : null;
  }
  if (!isRecord(value)) return null;
  const label = textField(value, ["label", "name", "title", "value"]);
  if (!label) return null;
  const extraPrice = priceCentsFromRecord(value);
  const pricedLabel = extraPrice && !/\+\$/.test(label) ? label + " (+$" + formatOptionPrice(extraPrice) + ")" : label;
  return { label: pricedLabel, value: pricedLabel };
}

function jsonOptionsFromValue(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const options = value.map(jsonOption).filter((option): option is CateringMenuOption => Boolean(option));
  return options.length ? options : undefined;
}

function jsonOptionsFromRecord(record: JsonRecord) {
  for (const key of ["options", "choices", "sauces", "modifiers", "selectOptions"]) {
    const options = jsonOptionsFromValue(record[key]);
    if (options) return options;
  }
  return undefined;
}

function jsonOptionGroupsFromValue(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const groups = value.flatMap((entry, index) => {
    if (Array.isArray(entry)) {
      const options = jsonOptionsFromValue(entry);
      return options ? [{ name: "Option " + (index + 1), options }] : [];
    }
    if (!isRecord(entry)) return [];
    const name = textField(entry, ["name", "label", "title"]) || "Option " + (index + 1);
    const options = ["options", "choices", "sauces", "modifiers", "selectOptions", "values"].map((key) => jsonOptionsFromValue(entry[key])).find(Boolean);
    return options ? [{ name, options }] : [];
  });
  return groups.length ? groups : undefined;
}

function jsonOptionGroupsFromRecord(record: JsonRecord) {
  for (const key of ["optionGroups", "option_groups", "choiceGroups", "choice_groups", "modifierGroups", "modifier_groups"]) {
    const groups = jsonOptionGroupsFromValue(record[key]);
    if (groups) return groups;
  }
  return undefined;
}

function jsonOptionSlotsFromRecord(record: JsonRecord) {
  for (const key of ["optionSlots", "option_slots", "optionCount", "option_count", "maxOptions", "max_options", "maxSelections", "max_selections", "sauceCount", "sauce_count"]) {
    const slots = optionSlotsFromUnknown(record[key]);
    if (slots) return slots;
  }
  return undefined;
}

function jsonOptionLabelFromRecord(record: JsonRecord) {
  return textField(record, ["optionLabel", "option_label", "choiceLabel", "choice_label", "selectLabel", "select_label"]);
}

function jsonVariantLabel(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return normalizeLine(String(value));
  if (!isRecord(value)) return "";
  const serves = textField(value, ["serves", "serving", "servings"]);
  if (serves) return /^serves\b/i.test(serves) ? serves : "serves " + serves;
  return textField(value, ["size", "pack", "package", "portion", "variant", "label", "title", "name"]);
}

function jsonInlineVariantLabel(record: JsonRecord) {
  const serves = textField(record, ["serves", "serving", "servings"]);
  if (serves) return /^serves\b/i.test(serves) ? serves : "serves " + serves;
  return textField(record, ["size", "pack", "package", "portion", "variant"]);
}

function itemNameWithVariant(name: string, variant: string) {
  if (!variant) return name;
  return name.toLowerCase().includes(variant.toLowerCase()) ? name : variantName(name, variant);
}

function addJsonItem(items: CateringMenuItem[], record: JsonRecord, fallbackGroup: string, inheritedOptions?: CateringMenuOption[]) {
  const nestedItems = firstArray(record, ["items", "menuItems", "orderItems", "products"]);
  const recordGroup = normalizeGroupLabel(textField(record, ["group", "category", "section", "groupName", "categoryName"]) || fallbackGroup);
  const name = textField(record, ["name", "item", "itemName", "title", "label"]);
  const optionGroups = jsonOptionGroupsFromRecord(record);
  const options = optionGroups ? undefined : jsonOptionsFromRecord(record) || inheritedOptions;
  const optionSlots = jsonOptionSlotsFromRecord(record);
  const optionLabel = jsonOptionLabelFromRecord(record);

  if (nestedItems.length && !name) {
    nestedItems.forEach((value) => { if (isRecord(value)) addJsonItem(items, value, recordGroup, options); });
    return;
  }
  if (!name) return;

  const baseNote = noteField(record);
  const basePrice = priceCentsFromRecord(record) ?? priceFromNote(baseNote);
  const variants = firstArray(record, ["variants", "sizes", "servingSizes", "servings", "packages"]);
  if (variants.length) {
    variants.forEach((variant) => {
      if (isRecord(variant)) {
        const label = jsonVariantLabel(variant);
        const variantNote = noteField(variant) || baseNote;
        appendItem(items, {
          id: slugify(recordGroup + "-" + name + "-" + label),
          group: recordGroup,
          name: itemNameWithVariant(name, label),
          note: variantNote || undefined,
          priceCents: priceCentsFromRecord(variant) ?? basePrice,
          options: jsonOptionGroupsFromRecord(variant) ? undefined : jsonOptionsFromRecord(variant) || options,
          optionSlots: jsonOptionSlotsFromRecord(variant) || optionSlots,
          optionLabel: jsonOptionLabelFromRecord(variant) || optionLabel || undefined,
          optionGroups: jsonOptionGroupsFromRecord(variant) || optionGroups,
        });
        return;
      }
      const label = jsonVariantLabel(variant);
      appendItem(items, { id: slugify(recordGroup + "-" + name + "-" + label), group: recordGroup, name: itemNameWithVariant(name, label), note: baseNote || undefined, priceCents: basePrice, options, optionSlots, optionLabel: optionLabel || undefined, optionGroups });
    });
    return;
  }

  const inlineVariant = jsonInlineVariantLabel(record);
  appendItem(items, {
    id: slugify(textField(record, ["id", "sku"]) || recordGroup + "-" + name + "-" + inlineVariant),
    group: recordGroup,
    name: itemNameWithVariant(name, inlineVariant),
    note: baseNote || undefined,
    priceCents: basePrice,
    options,
    optionSlots,
    optionLabel: optionLabel || undefined,
    optionGroups,
  });
}

function parseJsonMenuItems(value: unknown) {
  const items: CateringMenuItem[] = [];
  const root = isRecord(value) ? value : null;
  const defaultGroup = root ? normalizeGroupLabel(textField(root, ["group", "category", "section"]) || "Catering menu") : "Catering menu";

  const sections = root ? firstArray(root, ["sections", "categories", "groups"]) : [];
  sections.forEach((section) => {
    if (Array.isArray(section)) {
      section.forEach((entry) => { if (isRecord(entry)) addJsonItem(items, entry, defaultGroup); });
      return;
    }
    if (!isRecord(section)) return;
    const group = normalizeGroupLabel(textField(section, ["group", "category", "section", "name", "title", "label"]) || defaultGroup);
    const sectionOptions = jsonOptionsFromRecord(section);
    firstArray(section, ["items", "menuItems", "orderItems", "products"]).forEach((entry) => { if (isRecord(entry)) addJsonItem(items, entry, group, sectionOptions); });
  });

  const rootItems = Array.isArray(value) ? value : root ? firstArray(root, ["items", "menuItems", "orderItems", "products"]) : [];
  rootItems.forEach((entry) => { if (isRecord(entry)) addJsonItem(items, entry, defaultGroup); });

  return items.slice(0, 200);
}

async function parseJsonMenuFile(file: string) {
  const raw = await fs.readFile(file, "utf8");
  return parseJsonMenuItems(JSON.parse(raw));
}

function parseScannedItems(text: string) {
  const items: CateringMenuItem[] = [];
  const rawLines = text.split(/\r?\n/);
  const sauceChoices = parseSauceOptions(text);
  const sliderChoices = parseSliderOptions(text);

  const rootBeerOptions = (baseName: string) => /root beer|cream soda/i.test(baseName) ? drinkOptions : undefined;
  const sliderAddOns = (baseName: string) => /smash slider/i.test(baseName) ? sliderChoices : undefined;

  parseWingPacks(rawLines, sauceChoices).forEach((item) => appendItem(items, item));
  parseVariantSection(rawLines, { group: "Slider & sandwich packs", start: "SLIDER & SANDWICH PACKS", end: ["APP PACKS"], column: { start: 80 }, optionsForBaseName: sliderAddOns }).forEach((item) => appendItem(items, item));
  parseVariantSection(rawLines, { group: "App packs", start: "APP PACKS", end: ["Pricing and availability", "PICKUP TO GO CATERING"], column: { start: 0, end: 80 } }).forEach((item) => appendItem(items, item));
  parseVariantSection(rawLines, { group: "BBQ & comfort catering", start: "BBQ & COMFORT CATERING", end: ["SEAFOOD PACKS"], column: { start: 0, end: 75 }, variantLabel: (variant) => /^\d+$/.test(variant) ? "serves " + variant : variant }).forEach((item) => appendItem(items, item));
  parseTwoPriceSection(rawLines, "HOUSE CATERING SIDES", ["DRINK PACKS"], { start: 75 }, "House catering sides", "half tray", "full tray").forEach((item) => appendItem(items, item));
  parseVariantSection(rawLines, { group: "Seafood packs", start: "SEAFOOD PACKS", end: ["BEER & THC BEVERAGES"], column: { start: 0, end: 75 } }).forEach((item) => appendItem(items, item));
  parseVariantSection(rawLines, { group: "Drink packs", start: "DRINK PACKS", end: ["ADD-ONS"], column: { start: 75 }, optionsForBaseName: rootBeerOptions }).forEach((item) => appendItem(items, item));
  parsePricedItemSection(rawLines, "ADD-ONS", ["Questions, ordering"], { start: 75 }, "Add-ons").forEach((item) => appendItem(items, item));

  return items;
}

function scannedTextMatchesCateringToGo(text: string) {
  const normalized = text.toLowerCase();
  const markers = [
    "pickup to go catering",
    "hangar smash slider pack",
    "flight deck egg roll tray",
    "pitmaster brisket meal",
    "aviator crab boil",
    "aviator root beer or cream soda",
  ];
  return markers.filter((marker) => normalized.includes(marker)).length >= 3;
}

async function latestMenuFiles(): Promise<MenuFile[]> {
  const files: MenuFile[] = [];
  for (const type of ["drinks", "food"] as const) {
    for (const root of menuRoots()) {
      const directory = path.join(root, "catering-events", type);
      try {
        const entries = await fs.readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile()) continue;
          const file = path.join(directory, entry.name);
          const stats = await fs.stat(file);
          files.push({ name: entry.name, file, url: menuPublicUrl("catering-events", type, entry.name), mtimeMs: stats.mtimeMs, type });
        }
      } catch {}
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files;
}

async function extractPdfText(file: string) {
  if (!file.toLowerCase().endsWith(".pdf")) return "";
  const result = await execFileAsync("pdftotext", ["-layout", file, "-"], { timeout: 8000, maxBuffer: 1024 * 1024 });
  return result.stdout;
}

export async function getCateringMenuScan(): Promise<CateringMenuScan> {
  const files = await latestMenuFiles();
  if (!files.length) return { menuName: "Catering To Go menu", menuUrl: "", source: "fallback", items: pricedFallbackItems };

  for (const file of files) {
    try {
      const extension = path.extname(file.name).toLowerCase();
      if (extension === ".json" && file.type === "drinks") {
        const items = await parseJsonMenuFile(file.file);
        if (items.length) return { menuName: file.name, menuUrl: file.url, source: "json", items };
        continue;
      }
      const text = await extractPdfText(file.file);
      if (!scannedTextMatchesCateringToGo(text)) continue;
      const scanned = parseScannedItems(text);
      const pricedCount = scanned.filter((item) => item.priceCents).length;
      if (pricedCount >= 8) return { menuName: file.name, menuUrl: file.url, source: "scanned", items: scanned };
    } catch {}
  }

  return { menuName: files[0].name, menuUrl: files[0].url, source: "fallback", items: pricedFallbackItems };
}
