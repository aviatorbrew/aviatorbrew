import { promises as fs } from "node:fs";
import path from "node:path";

export type KegInventoryItem = {
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
  case16PriceCents?: number;
  caseCount?: number;
  hidden?: boolean;
  sixtelsAvailableViaBackfill?: number;
};

export type KegInventory = {
  schemaVersion?: number;
  exportType?: string;
  columns?: unknown[];
  items: KegInventoryItem[];
  backfillPickupNote?: string;
  inventoryUpdatedAt?: string;
  exportedAt?: string;
  updatedAt: string;
  uploadedAt: string;
};

const dataFile = () => process.env.KEG_INVENTORY_DATA_FILE || path.join(process.cwd(), "data", "keg-inventory.json");
const importArchiveDir = () => process.env.KEG_IMPORT_ARCHIVE_DIR || path.join(path.dirname(dataFile()), "keg-imports");
const maxItems = 250;
const maxImportArchives = 20;

function text(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeImportFilename(value: string) {
  const filename = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  return (filename || "kegs-for-sale.json").slice(-120);
}

export async function saveKegImportCopy(rawText: string, originalName: string) {
  const directory = importArchiveDir();
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const filename = timestamp + "-" + safeImportFilename(originalName);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, filename), rawText, "utf8");
  const extension = path.extname(filename).toLowerCase() || ".txt";
  await fs.writeFile(path.join(directory, "latest" + extension), rawText, "utf8");
  await fs.writeFile(path.join(directory, "latest-upload.txt"), rawText, "utf8");
  const archived = (await fs.readdir(directory)).filter((name) => !name.startsWith("latest") && /\.(json|csv|txt)$/i.test(name)).sort().reverse();
  await Promise.all(archived.slice(maxImportArchives).map((name) => fs.unlink(path.join(directory, name)).catch(() => undefined)));
  return { fileName: filename, directory };
}

function count(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[$,]/g, "")) : NaN;
  return Number.isFinite(number) && number >= 0 && number <= 10000 ? Math.floor(number) : null;
}

function field(row: Record<string, unknown> | null, names: string[]) {
  if (!row) return undefined;
  const normalized = new Map(Object.keys(row).map((key) => [key.toLowerCase().replace(/[^a-z0-9]+/g, ""), row[key]]));
  for (const name of names) {
    const exact = row[name];
    if (exact !== undefined) return exact;
    const value = normalized.get(name.toLowerCase().replace(/[^a-z0-9]+/g, ""));
    if (value !== undefined) return value;
  }
  return undefined;
}

function rowKeys(row: Record<string, unknown> | null) {
  return row ? Object.keys(row).slice(0, 20).join(", ") || "none" : "not an object";
}

function firstCount(row: Record<string, unknown> | null, names: string[]) {
  for (const name of names) {
    const value = count(field(row, [name]));
    if (value !== null) return value;
  }
  return null;
}

function firstCents(row: Record<string, unknown> | null, names: string[]) {
  for (const name of names) {
    const value = cents(field(row, [name]));
    if (value !== undefined) return value;
  }
  return undefined;
}

function total(value: unknown, sixth: number, fifty: number) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (Number.isFinite(number) && number >= 0 && number <= 100000) return Number(number.toFixed(2));
  return Number((sixth * (5.1667 / 31) + fifty * (50 / 117.3478)).toFixed(2));
}

function cents(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[$,]/g, "")) : NaN;
  return Number.isFinite(number) && number >= 0 && number <= 100000 ? Math.round(number * (number < 1000 ? 100 : 1)) : undefined;
}

function validDate(value: unknown, fallback: string) {
  if (typeof value !== "string" || !value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function identityKey(name: string) {
  return name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").replace(/\b\d+(?:\.\d+)?%?\b/g, " ").replace(/\s+/g, " ").trim();
}

function parseCsvRows(rawText: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  const source = rawText.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(value.trim()); value = ""; }
    else if (char === "\n") { row.push(value.trim()); rows.push(row); row = []; value = ""; }
    else if (char !== "\r") value += char;
  }
  if (value || row.length) { row.push(value.trim()); rows.push(row); }
  return rows.filter((item) => item.some(Boolean));
}

function csvToKegSource(rawText: string) {
  const rows = parseCsvRows(rawText);
  const headers = rows.shift()?.map((header) => header.trim()) || [];
  if (!headers.length) throw new Error("CSV file needs a header row.");
  const items = rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])));
  return {
    schemaVersion: 2,
    exportType: "kegs-for-sale",
    columns: headers.map((label) => ({ key: label, label, type: "string" })),
    items,
    exportedAt: new Date().toISOString(),
  };
}

export function parseKegImportSource(rawText: string, fileName: string) {
  return fileName.toLowerCase().endsWith(".csv") ? csvToKegSource(rawText) : JSON.parse(rawText.replace(/^\uFEFF/, "")) as unknown;
}

function normalizeUploadedRows(value: unknown, options: { requireKegsForSaleExport?: boolean } = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const rows = source ? source.items : Array.isArray(value) ? value : null;
  if (options.requireKegsForSaleExport && (!source || !Array.isArray(source.items) || (typeof source.exportType === "string" && source.exportType !== "kegs-for-sale"))) {
    const keys = source ? Object.keys(source).slice(0, 20).join(", ") || "none" : "not an object";
    throw new Error("Upload kegs-for-sale.json with an items array. This file has top-level keys: " + keys + ". Do not upload the full product inventory export.");
  }
  if (!Array.isArray(rows)) return [];
  return rows.map((row, index) => {
    const item = row && typeof row === "object" ? row as Record<string, unknown> : null;
    const beerName = text(field(item, ["beerName", "beer", "name", "productName", "Beer", "Product", "Product Name"]));
    const sixthBblKegs = firstCount(item, ["sixthBblKegs", "sixthBbl", "sixtelKegs", "1/6 BBL Kegs", "1/6 BBL", "Sixtel Kegs", "Sixtels", "1/6 BBL kegs available now"]);
    const fiftyLKegs = firstCount(item, ["fiftyLKegs", "fiftyL", "50L Kegs", "50 L Kegs", "50L", "50 L", "1/2 BBL", "Half BBL", "Half Barrels", "50L kegs available now"]);
    if (!beerName || sixthBblKegs === null || fiftyLKegs === null) throw new Error("Item " + (index + 1) + " needs beerName, sixthBblKegs, and fiftyLKegs from the kegs-for-sale items array. Found keys: " + rowKeys(item) + ".");
    const category = text(field(item, ["category", "Category", "Type", "Beer Type"]), 80) || "Other";
    const packaging = text(field(item, ["packaging", "Packaging", "Package Size", "Package", "Format"]), 80) || "Draft";
    const sixthBblPriceCents = firstCents(item, ["sixthBblPriceCents", "1/6 BBL Price", "1/6 BBL Keg Price", "Sixtel Price", "Sixtel Keg Price", "1/6 Price"]);
    const fiftyLPriceCents = firstCents(item, ["fiftyLPriceCents", "50L Price", "50 L Price", "50L Keg Price", "50 L Keg Price", "1/2 BBL Price", "Half BBL Price"]);
    const case12PriceCents = firstCents(item, ["case12PriceCents", "12oz Case Price", "12 oz Case Price", "12oz Price", "12 oz Price"]);
    const case16PriceCents = firstCents(item, ["case16PriceCents", "16oz Case Price", "16 oz Case Price", "16oz Price", "16 oz Price"]);
    const casePriceCents = firstCents(item, ["casePriceCents", "Case Price"]);
    const caseSize = text(field(item, ["caseSize", "Case Size"]), 24) || (case12PriceCents ? "12oz" : case16PriceCents ? "16oz" : casePriceCents ? "Case" : "");
    const sixtelsAvailableViaBackfill = firstCount(item, ["sixtelsAvailableViaBackfill", "sixtelsByBackfill", "sixtelsAvailableByBackfill", "Backfill Sixtels", "Sixtels Available By Backfill", "sixtels available by backfill"]) ?? 0;
    return {
      category,
      beerName,
      packaging,
      sixthBblKegs,
      fiftyLKegs,
      totalBbl: total(field(item, ["totalBbl", "Total BBL", "total BBL", "Total Bbl", "totalBarrels"]), sixthBblKegs, fiftyLKegs),
      ...(sixthBblPriceCents === undefined ? {} : { sixthBblPriceCents }),
      ...(fiftyLPriceCents === undefined ? {} : { fiftyLPriceCents }),
      ...(caseSize ? { caseSize } : {}),
      ...(casePriceCents === undefined ? case12PriceCents === undefined ? case16PriceCents === undefined ? {} : { casePriceCents: case16PriceCents } : { casePriceCents: case12PriceCents } : { casePriceCents }),
      ...(case12PriceCents === undefined ? {} : { case12PriceCents }),
      ...(case16PriceCents === undefined ? {} : { case16PriceCents }),
      caseCount: count(field(item, ["caseCount", "Cases", "Case Count"])) ?? 0,
      ...(item?.hidden === true ? { hidden: true } : {}),
      sixtelsAvailableViaBackfill,
    } satisfies KegInventoryItem;
  });
}

/**
 * Accepts the JSON returned by BrewOps /api/public/kegs-for-sale:
 * { items: [{ beerName, sixthBblKegs, fiftyLKegs, totalBbl }], backfillPickupNote?, updatedAt? }.
 */
export function normalizeKegInventory(value: unknown, previous?: KegInventory | null, options: { requireKegsForSaleExport?: boolean; preserveHidden?: boolean } = {}): KegInventory {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const uploadedItems = normalizeUploadedRows(value, options);
  if (options.requireKegsForSaleExport && uploadedItems.length === 0) throw new Error("No keg rows found in the items array.");
  if (uploadedItems.length > maxItems) throw new Error("Inventory is limited to " + maxItems + " beers.");

  const previousHidden = new Map((previous?.items || []).map((item) => [identityKey(item.beerName), item.hidden === true]));
  const items = uploadedItems.map((item) => ({ ...item, ...(options.preserveHidden && previousHidden.get(identityKey(item.beerName)) === true ? { hidden: true } : {}) }));

  const duplicate = new Set<string>();
  if (items.some((item) => duplicate.has(identityKey(item.beerName)) || !duplicate.add(identityKey(item.beerName)))) {
    throw new Error("Each beer name can appear only once.");
  }

  const now = new Date().toISOString();
  return {
    schemaVersion: 2,
    exportType: "kegs-for-sale",
    columns: Array.isArray(source?.columns) ? source.columns : [],
    items,
    ...(items.some((item) => (item.sixtelsAvailableViaBackfill || 0) > 0) && text(source?.backfillPickupNote, 500) ? { backfillPickupNote: text(source?.backfillPickupNote, 500) } : {}),
    updatedAt: validDate(source?.inventoryUpdatedAt, validDate(source?.exportedAt, validDate(source?.updatedAt, previous?.updatedAt || now))),
    inventoryUpdatedAt: validDate(source?.inventoryUpdatedAt, validDate(source?.exportedAt, validDate(source?.updatedAt, previous?.updatedAt || now))),
    exportedAt: validDate(source?.exportedAt, validDate(source?.uploadedAt, now)),
    uploadedAt: validDate(source?.exportedAt, validDate(source?.uploadedAt, now)),
  };
}

export async function getUploadedKegInventory(options: { includeHidden?: boolean } = {}): Promise<KegInventory | null> {
  let parsed: unknown = { items: [] };
  try { parsed = JSON.parse(await fs.readFile(dataFile(), "utf8")) as unknown; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") return null; }
  try {
    const inventory = normalizeKegInventory(parsed);
    const items = options.includeHidden ? inventory.items : inventory.items.filter((item) => item.hidden !== true && (item.sixthBblKegs > 0 || item.fiftyLKegs > 0 || (item.caseCount || 0) > 0));
    return { ...inventory, items };
  } catch { return null; }
}


function inventoryFilePayload(inventory: KegInventory) {
  return {
    schemaVersion: 2,
    exportType: "kegs-for-sale",
    columns: [],
    items: inventory.items,
    backfillPickupNote: inventory.backfillPickupNote || "",
    inventoryUpdatedAt: inventory.updatedAt,
    exportedAt: inventory.uploadedAt,
    updatedAt: inventory.updatedAt,
    uploadedAt: inventory.uploadedAt,
  };
}

function saveInventory(inventory: KegInventory) {
  const file = dataFile();
  return fs.mkdir(path.dirname(file), { recursive: true })
    .then(() => fs.writeFile(file + ".tmp", JSON.stringify(inventoryFilePayload(inventory), null, 2) + "\n", "utf8"))
    .then(() => fs.rename(file + ".tmp", file));
}

export type KegInventoryPatch = {
  beerName: string;
  nextBeerName?: string;
  category?: string;
  packaging?: string;
  sixthBblKegs?: unknown;
  fiftyLKegs?: unknown;
  totalBbl?: unknown;
  sixthBblPriceCents?: unknown;
  fiftyLPriceCents?: unknown;
  caseSize?: string;
  casePriceCents?: unknown;
  caseCount?: unknown;
  hidden?: boolean;
};

export async function saveKegInventory(value: unknown) {
  const previous = await getUploadedKegInventory({ includeHidden: true });
  const inventory = normalizeKegInventory(value, previous, { requireKegsForSaleExport: true, preserveHidden: false });
  await saveInventory(inventory);
  return inventory;
}

export async function importBundledKegInventory() {
  const sourceFile = path.join(process.cwd(), "public", "data", "kegs-for-sale.json");
  let parsed: unknown;
  try { parsed = JSON.parse(await fs.readFile(sourceFile, "utf8")) as unknown; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("public/data/kegs-for-sale.json was not found on the website server.");
    throw new Error("public/data/kegs-for-sale.json is not valid JSON.");
  }
  return saveKegInventory(parsed);
}

export async function clearKegInventory() {
  const now = new Date().toISOString();
  const inventory: KegInventory = { schemaVersion: 2, exportType: "kegs-for-sale", columns: [], items: [], updatedAt: now, uploadedAt: now, inventoryUpdatedAt: now, exportedAt: now };
  await saveInventory(inventory);
  return inventory;
}

export async function updateKegItem(patch: KegInventoryPatch) {
  const current = await getUploadedKegInventory({ includeHidden: true });
  if (!current) throw new Error("Keg inventory unavailable.");
  const targetKey = identityKey(patch.beerName);
  const target = current.items.find((item) => identityKey(item.beerName) === targetKey);
  if (!target) throw new Error("Keg not found.");
  const nextBeerName = text(patch.nextBeerName, 120) || target.beerName;
  const nextKey = identityKey(nextBeerName);
  if (nextKey !== targetKey && current.items.some((item) => identityKey(item.beerName) === nextKey)) throw new Error("Another keg already uses that name.");
  const sixthBblKegs = count(patch.sixthBblKegs) ?? target.sixthBblKegs;
  const fiftyLKegs = count(patch.fiftyLKegs) ?? target.fiftyLKegs;
  const totalBblValue = typeof patch.totalBbl === "number" || typeof patch.totalBbl === "string" ? patch.totalBbl : target.totalBbl;
  const updated: KegInventoryItem = {
    ...target,
    beerName: nextBeerName,
    category: text(patch.category, 80) || target.category,
    packaging: text(patch.packaging, 80) || target.packaging,
    sixthBblKegs,
    fiftyLKegs,
    totalBbl: total(totalBblValue, sixthBblKegs, fiftyLKegs),
    ...(cents(patch.sixthBblPriceCents) === undefined ? { sixthBblPriceCents: undefined } : { sixthBblPriceCents: cents(patch.sixthBblPriceCents) }),
    ...(cents(patch.fiftyLPriceCents) === undefined ? { fiftyLPriceCents: undefined } : { fiftyLPriceCents: cents(patch.fiftyLPriceCents) }),
    caseSize: text(patch.caseSize, 24) || undefined,
    ...(cents(patch.casePriceCents) === undefined ? { casePriceCents: undefined } : { casePriceCents: cents(patch.casePriceCents) }),
    case12PriceCents: target.case12PriceCents,
    case16PriceCents: target.case16PriceCents,
    caseCount: count(patch.caseCount) ?? 0,
    hidden: patch.hidden === true ? true : undefined,
  };
  const inventory = { ...current, items: current.items.map((item) => identityKey(item.beerName) === targetKey ? updated : item), uploadedAt: new Date().toISOString() };
  await saveInventory(inventory);
  return inventory;
}

export async function setKegHidden(beerName: string, hidden: boolean) {
  return updateKegItem({ beerName, hidden });
}
