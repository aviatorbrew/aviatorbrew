import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { menuPublicUrl, menuRoots } from "@/lib/menu-files";

const execFileAsync = promisify(execFile);

export type CateringMenuOption = { label: string; value: string };
export type CateringMenuItem = { id: string; group: string; name: string; note?: string; priceCents?: number; options?: CateringMenuOption[] };
export type CateringMenuScan = { menuName: string; menuUrl: string; source: "scanned" | "fallback"; items: CateringMenuItem[] };

type MenuFile = { name: string; file: string; url: string; mtimeMs: number };

const sauceOptions = ["Jet Fuel Buffalo", "Honey Bourbon BBQ", "Garlic Parm", "Lemon Pepper", "Hot Honey", "BlackMamba", "Aviator Dry Rub BBQ", "Afterburner (+$5)", "Cherry Bomb (+$5)"].map((value) => ({ label: value, value }));
const drinkOptions = ["Root Beer", "Cream Soda", "Mixed"].map((value) => ({ label: value, value }));
const sliderOptions = ["No add-ons", "Add bacon (+$12)", "Add jalapenos (+$12)", "Add bacon and jalapenos (+$24)"].map((value) => ({ label: value, value }));

const fallbackItems: CateringMenuItem[] = [
  { id: "wings-25", group: "Wing packs", name: "25 Wings", options: sauceOptions, note: "$45 - choose up to 2 sauces" },
  { id: "wings-50", group: "Wing packs", name: "50 Wings", options: sauceOptions, note: "$85 - choose up to 3 sauces" },
  { id: "wings-100", group: "Wing packs", name: "100 Wings", options: sauceOptions, note: "$160 - choose up to 4 sauces" },
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

function isLikelyItem(line: string) {
  if (ignored.has(line.toUpperCase())) return false;
  if (/page \d+ of \d+/i.test(line)) return false;
  if (/events@|919-|688 brewing|questions|pricing and availability|delivery is available|setup is available|contact |order details|catering packs|meals, seafood|beer is available|current selections|ordering details|choose up to|confirm timing|service details|listed on page/i.test(line)) return false;
  if (/^\$?\d+(\.\d{2})?$/.test(line)) return false;
  if (/^(small|large|half|full) tray$/i.test(line)) return false;
  if (/^(add bacon|add jalapenos):/i.test(line)) return false;
  if (/^serves \d/i.test(line)) return false;
  if (/^\d+(-\d+)?$/.test(line)) return false;
  if (/^\d+\s+sliders$/i.test(line)) return false;
  if (/^\d+\s+(pieces|lb)$/i.test(line)) return false;
  if (/[.!?]$/.test(line)) return false;
  if (line.includes(",") || /\(\+\$\d+\)/.test(line)) return false;
  return /[a-z]/.test(line) || /^\d+\s+wings/i.test(line);
}

function parseScannedItems(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const items: CateringMenuItem[] = [];
  let group = "Catering menu";
  for (const line of lines) {
    const upper = line.toUpperCase();
    if (sectionMap.has(upper)) { group = sectionMap.get(upper)!; continue; }
    if (!isLikelyItem(line)) continue;
    if (line.length > 95) continue;
    const id = slugify(`${group}-${line}`);
    if (!items.some((item) => item.id === id || item.name.toLowerCase() === line.toLowerCase())) items.push({ id, group, name: line });
  }
  return items;
}

function scannedTextMatchesKnownMenu(text: string) {
  const normalized = text.toLowerCase();
  const markers = [
    "pickup to go catering",
    "hangar smash slider pack",
    "flight deck egg roll tray",
    "pitmaster brisket meal",
    "aviator crab boil",
    "aviator root beer or cream soda",
  ];
  return markers.filter((marker) => normalized.includes(marker)).length >= 4;
}

async function latestMenuFile(): Promise<MenuFile | null> {
  const files: MenuFile[] = [];
  for (const type of ["drinks", "food"]) {
    for (const root of menuRoots()) {
      const directory = path.join(root, "catering-events", type);
      try {
        const entries = await fs.readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile()) continue;
          const file = path.join(directory, entry.name);
          const stats = await fs.stat(file);
          files.push({ name: entry.name, file, url: menuPublicUrl("catering-events", type, entry.name), mtimeMs: stats.mtimeMs });
        }
      } catch {}
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0] || null;
}

async function extractPdfText(file: string) {
  if (!file.toLowerCase().endsWith(".pdf")) return "";
  const result = await execFileAsync("pdftotext", [file, "-"], { timeout: 8000, maxBuffer: 1024 * 1024 });
  return result.stdout;
}

export async function getCateringMenuScan(): Promise<CateringMenuScan> {
  const file = await latestMenuFile();
  if (!file) return { menuName: "Catering To Go menu", menuUrl: "", source: "fallback", items: pricedFallbackItems };
  try {
    const text = await extractPdfText(file.file);
    const scanned = parseScannedItems(text);
    if (scannedTextMatchesKnownMenu(text)) return { menuName: file.name, menuUrl: file.url, source: "scanned", items: pricedFallbackItems };
    if (scanned.length >= 8) return { menuName: file.name, menuUrl: file.url, source: "scanned", items: scanned };
  } catch {}
  return { menuName: file.name, menuUrl: file.url, source: "fallback", items: pricedFallbackItems };
}
