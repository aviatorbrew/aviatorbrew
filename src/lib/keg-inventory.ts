import { promises as fs } from "node:fs";
import path from "node:path";

export type KegInventoryItem = {
  beerName: string;
  sixthBblKegs: number;
  fiftyLKegs: number;
  totalBbl: number;
  sixtelsAvailableViaBackfill?: number;
};

export type KegInventory = {
  items: KegInventoryItem[];
  backfillPickupNote?: string;
  updatedAt: string;
  uploadedAt: string;
};

const dataFile = () => process.env.KEG_INVENTORY_DATA_FILE || path.join(process.cwd(), "data", "keg-inventory.json");
const maxItems = 250;

function text(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function count(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 && number <= 10000 ? Math.floor(number) : null;
}

function total(value: unknown, sixth: number, fifty: number) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (Number.isFinite(number) && number >= 0 && number <= 100000) return Number(number.toFixed(2));
  return Number((sixth * (5.1667 / 31) + fifty * (50 / 117.3478)).toFixed(2));
}

function validDate(value: unknown, fallback: string) {
  if (typeof value !== "string" || !value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

/**
 * Accepts the JSON returned by BrewOps /api/public/kegs-for-sale:
 * { items: [{ beerName, sixthBblKegs, fiftyLKegs, totalBbl }], backfillPickupNote?, updatedAt? }.
 */
export function normalizeKegInventory(value: unknown): KegInventory {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : null;
  const rows = Array.isArray(value) ? value : source?.items;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("The JSON must contain a non-empty items array.");

  const items = rows.map((row, index) => {
    const item = row && typeof row === "object" ? row as Record<string, unknown> : null;
    const beerName = text(item?.beerName);
    const sixthBblKegs = count(item?.sixthBblKegs);
    const fiftyLKegs = count(item?.fiftyLKegs);
    if (!beerName || sixthBblKegs === null || fiftyLKegs === null) {
      throw new Error("Item " + (index + 1) + " needs beerName, sixthBblKegs, and fiftyLKegs.");
    }
    const sixtelsAvailableViaBackfill = count(item?.sixtelsAvailableViaBackfill);
    return {
      beerName,
      sixthBblKegs,
      fiftyLKegs,
      totalBbl: total(item?.totalBbl, sixthBblKegs, fiftyLKegs),
      ...(sixtelsAvailableViaBackfill === null ? {} : { sixtelsAvailableViaBackfill }),
    };
  });

  if (items.length > maxItems) throw new Error("Inventory is limited to " + maxItems + " beers.");
  const duplicate = new Set<string>();
  if (items.some((item) => duplicate.has(item.beerName.toLowerCase()) || !duplicate.add(item.beerName.toLowerCase()))) {
    throw new Error("Each beer name can appear only once.");
  }

  const now = new Date().toISOString();
  return {
    items,
    ...(text(source?.backfillPickupNote, 500) ? { backfillPickupNote: text(source?.backfillPickupNote, 500) } : {}),
    updatedAt: validDate(source?.updatedAt, now),
    uploadedAt: now,
  };
}

export async function getUploadedKegInventory(): Promise<KegInventory | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(dataFile(), "utf8")) as unknown;
    const inventory = normalizeKegInventory(parsed);
    return { ...inventory, uploadedAt: validDate((parsed as Record<string, unknown>).uploadedAt, inventory.updatedAt) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    return null;
  }
}

export async function saveKegInventory(value: unknown) {
  const inventory = normalizeKegInventory(value);
  const file = dataFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + ".tmp";
  await fs.writeFile(temp, JSON.stringify(inventory, null, 2) + "\n", "utf8");
  await fs.rename(temp, file);
  return inventory;
}
