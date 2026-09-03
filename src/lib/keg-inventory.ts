import { promises as fs } from "node:fs";
import path from "node:path";
import { databaseConfigured, withDatabase } from "@/lib/database";

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

const bundledSnapshotFile = () => process.env.KEG_SNAPSHOT_FILE || path.join(process.cwd(), "public", "data", "kegs-for-sale.json");
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

function firstBoolean(row: Record<string, unknown> | null, names: string[]) {
  for (const name of names) {
    const raw = field(row, [name]);
    if (typeof raw === "boolean") return raw;
    if (typeof raw === "string") {
      const normalized = raw.trim().toLowerCase();
      if (["true", "yes", "y", "1"].includes(normalized)) return true;
      if (["false", "no", "n", "0"].includes(normalized)) return false;
    }
    if (typeof raw === "number" && Number.isFinite(raw)) return raw !== 0;
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

function dollarsFromCents(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? Number((value / 100).toFixed(2)) : 0;
}

function centsFromDollars(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

function usesBrewOpsAvailability(item: KegInventoryItem) {
  return Boolean(item.status || item.forSale !== undefined);
}

function availableForPublic(item: KegInventoryItem) {
  if (!usesBrewOpsAvailability(item)) return true;
  return item.status?.toLowerCase() === "available" && item.forSale === true;
}

function hasAnyQuantity(item: KegInventoryItem) {
  return item.sixthBblKegs > 0 || item.fiftyLKegs > 0 || (item.case12Count || 0) > 0 || (item.case12FourPackCount || 0) > 0 || (item.case12SixPackCount || 0) > 0 || (item.case16Count || 0) > 0 || (item.case16FourPackCount || 0) > 0 || (item.caseCount || 0) > 0;
}

function visibleKegItem(item: KegInventoryItem) {
  return item.hidden !== true && availableForPublic(item) && (usesBrewOpsAvailability(item) || hasAnyQuantity(item));
}

async function readDatabaseKegInventory(options: { includeHidden?: boolean } = {}): Promise<KegInventory | null> {
  if (!databaseConfigured()) return null;
  return withDatabase(async (client) => {
    const result = await client.query(
      `SELECT beer_name, normalized_name, category, packaging, sixth_bbl_kegs, sixth_bbl_price, fifty_l_kegs, fifty_l_price,
              cases_12oz, case_12oz_price, case_12oz_four_pack_price, case_12oz_six_pack_price,
              cases_16oz, case_16oz_price, case_16oz_four_pack_price, case_size, case_price,
              total_bbl, inventory_value, batches, source_file, imported_at, updated_at, hidden, sixtels_available_via_backfill
       FROM website.keg_package_inventory
       ORDER BY beer_name`,
    );
    const metaResult = await client.query("SELECT value FROM website.settings WHERE key = $1", ["keg_package_inventory_meta"]);
    const hasDatabaseInventoryState = (metaResult.rowCount || 0) > 0;
    if (result.rowCount === 0 && !hasDatabaseInventoryState) return null;
    const meta = metaResult.rows[0]?.value && typeof metaResult.rows[0].value === "object" ? metaResult.rows[0].value as Partial<KegInventory> : {};
    const items = result.rows.map((row): KegInventoryItem => {
      const case12PriceCents = centsFromDollars(row.case_12oz_price);
      const case16PriceCents = centsFromDollars(row.case_16oz_price);
      const case12Count = Number(row.cases_12oz) || 0;
      const case16Count = Number(row.cases_16oz) || 0;
      return {
        beerName: row.beer_name,
        category: row.category || "Other",
        packaging: row.packaging || "Draft",
        sixthBblKegs: Number(row.sixth_bbl_kegs) || 0,
        fiftyLKegs: Number(row.fifty_l_kegs) || 0,
        totalBbl: Number(row.total_bbl) || 0,
        sixthBblPriceCents: centsFromDollars(row.sixth_bbl_price),
        fiftyLPriceCents: centsFromDollars(row.fifty_l_price),
        caseSize: row.case_size || undefined,
        casePriceCents: centsFromDollars(row.case_price),
        case12PriceCents,
        case12FourPackPriceCents: centsFromDollars(row.case_12oz_four_pack_price),
        case12SixPackPriceCents: centsFromDollars(row.case_12oz_six_pack_price),
        case16PriceCents,
        case16FourPackPriceCents: centsFromDollars(row.case_16oz_four_pack_price),
        case12Count,
        case16Count,
        caseCount: case12Count + case16Count,
        hidden: row.hidden === true ? true : undefined,
        sixtelsAvailableViaBackfill: Number(row.sixtels_available_via_backfill) || 0,
      };
    });
    const filtered = options.includeHidden ? items : items.filter(visibleKegItem);
    const now = new Date().toISOString();
    return {
      schemaVersion: 2,
      exportType: "kegs-for-sale",
      columns: [],
      items: filtered,
      backfillPickupNote: text(meta.backfillPickupNote, 500),
      updatedAt: text(meta.updatedAt, 40) || now,
      inventoryUpdatedAt: text(meta.inventoryUpdatedAt, 40) || text(meta.updatedAt, 40) || now,
      exportedAt: text(meta.exportedAt, 40) || now,
      uploadedAt: text(meta.uploadedAt, 40) || now,
    };
  });
}

async function saveDatabaseKegInventory(inventory: KegInventory) {
  if (!databaseConfigured()) return false;
  await withDatabase(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query("DELETE FROM website.keg_package_inventory");
      for (const item of inventory.items) {
        await client.query(
          `INSERT INTO website.keg_package_inventory (
             beer_name, normalized_name, category, packaging, sixth_bbl_kegs, sixth_bbl_price, fifty_l_kegs, fifty_l_price,
             cases_12oz, case_12oz_price, case_12oz_four_pack_price, case_12oz_six_pack_price,
             cases_16oz, case_16oz_price, case_16oz_four_pack_price, case_size, case_price,
             total_bbl, inventory_value, batches, source_file, imported_at, updated_at, hidden, sixtels_available_via_backfill
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,now(),now(),$22,$23)
           ON CONFLICT (normalized_name) DO UPDATE SET
             beer_name = EXCLUDED.beer_name,
             category = EXCLUDED.category,
             packaging = EXCLUDED.packaging,
             sixth_bbl_kegs = EXCLUDED.sixth_bbl_kegs,
             sixth_bbl_price = EXCLUDED.sixth_bbl_price,
             fifty_l_kegs = EXCLUDED.fifty_l_kegs,
             fifty_l_price = EXCLUDED.fifty_l_price,
             cases_12oz = EXCLUDED.cases_12oz,
             case_12oz_price = EXCLUDED.case_12oz_price,
             case_12oz_four_pack_price = EXCLUDED.case_12oz_four_pack_price,
             case_12oz_six_pack_price = EXCLUDED.case_12oz_six_pack_price,
             cases_16oz = EXCLUDED.cases_16oz,
             case_16oz_price = EXCLUDED.case_16oz_price,
             case_16oz_four_pack_price = EXCLUDED.case_16oz_four_pack_price,
             case_size = EXCLUDED.case_size,
             case_price = EXCLUDED.case_price,
             total_bbl = EXCLUDED.total_bbl,
             inventory_value = EXCLUDED.inventory_value,
             batches = EXCLUDED.batches,
             source_file = EXCLUDED.source_file,
             updated_at = now(),
             hidden = EXCLUDED.hidden,
             sixtels_available_via_backfill = EXCLUDED.sixtels_available_via_backfill`,
          [
            item.beerName,
            identityKey(item.beerName),
            item.category || "Other",
            item.packaging || "Draft",
            item.sixthBblKegs || 0,
            dollarsFromCents(item.sixthBblPriceCents),
            item.fiftyLKegs || 0,
            dollarsFromCents(item.fiftyLPriceCents),
            item.case12Count || 0,
            dollarsFromCents(item.case12PriceCents),
            dollarsFromCents(item.case12FourPackPriceCents),
            dollarsFromCents(item.case12SixPackPriceCents),
            item.case16Count || 0,
            dollarsFromCents(item.case16PriceCents),
            dollarsFromCents(item.case16FourPackPriceCents),
            item.caseSize || null,
            dollarsFromCents(item.casePriceCents),
            item.totalBbl || 0,
            0,
            null,
            inventory.exportedAt || inventory.uploadedAt || null,
            item.hidden === true,
            item.sixtelsAvailableViaBackfill || 0,
          ],
        );
      }
      await client.query(
        `INSERT INTO website.settings (key, value, description, updated_at)
         VALUES ($1, $2::jsonb, $3, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = now()`,
        ["keg_package_inventory_meta", JSON.stringify({
          backfillPickupNote: inventory.backfillPickupNote || "",
          updatedAt: inventory.updatedAt,
          inventoryUpdatedAt: inventory.inventoryUpdatedAt || inventory.updatedAt,
          exportedAt: inventory.exportedAt || inventory.uploadedAt,
          uploadedAt: inventory.uploadedAt,
        }), "Keg/package inventory import metadata"],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  });
  return true;
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
    const sixthBblKegs = firstCount(item, ["sixthBblKegs", "sixthBbl", "sixtelKegs", "1/6 BBL Kegs", "1/6 BBL", "Sixtel Kegs", "Sixtels", "1/6 BBL kegs available now"]) ?? 0;
    const fiftyLKegs = firstCount(item, ["fiftyLKegs", "fiftyL", "50L Kegs", "50 L Kegs", "50L", "50 L", "1/2 BBL", "Half BBL", "Half Barrels", "50L kegs available now"]) ?? 0;
    if (!beerName) throw new Error("Item " + (index + 1) + " needs beerName from the kegs-for-sale items array. Found keys: " + rowKeys(item) + ".");
    const category = text(field(item, ["category", "Category", "Type", "Beer Type"]), 80) || "Other";
    const status = text(field(item, ["status", "Status"]), 40);
    const forSale = firstBoolean(item, ["forSale", "for_sale", "For Sale", "forsale"]);
    const has12ozFourPack = firstBoolean(item, ["has12ozFourPack", "has12OzFourPack", "has12oz4Pack", "12oz 4 Pack Offered", "12 oz 4 Pack Offered"]);
    const has12ozSixPack = firstBoolean(item, ["has12ozSixPack", "has12OzSixPack", "has12oz6Pack", "12oz 6 Pack Offered", "12 oz 6 Pack Offered"]);
    const has16ozFourPack = firstBoolean(item, ["has16ozFourPack", "has16OzFourPack", "has16oz4Pack", "16oz 4 Pack Offered", "16 oz 4 Pack Offered"]);
    const quantityNote = text(field(item, ["quantityNote", "quantity_note", "Quantity Note"]), 240);
    const sixthBblPriceCents = firstCents(item, ["sixthBblPriceCents", "sixthBblPrice", "1/6 BBL Price", "1/6 BBL Keg Price", "Sixtel Price", "Sixtel Keg Price", "1/6 Price"]);
    const fiftyLPriceCents = firstCents(item, ["fiftyLPriceCents", "fiftyLPrice", "50L Price", "50 L Price", "50L Keg Price", "50 L Keg Price", "1/2 BBL Price", "Half BBL Price"]);
    const case12PriceCents = firstCents(item, ["case12PriceCents", "case12ozPrice", "case12OzPrice", "cases12ozPrice", "12oz Case Price", "12 oz Case Price", "12oz Price", "12 oz Price"]);
    const case12FourPackPriceCents = firstCents(item, ["case12FourPackPriceCents", "fourPack12ozPrice", "fourPack12OzPrice", "case12FourPackPrice", "case12ozFourPackPrice", "case12oz4PackPrice", "12oz 4 Pack Price", "12 oz 4 Pack Price", "12oz 4-pack Price", "12 oz 4-pack Price"]);
    const case12SixPackPriceCents = firstCents(item, ["case12SixPackPriceCents", "sixPack12ozPrice", "sixPack12OzPrice", "case12SixPackPrice", "case12ozSixPackPrice", "case12oz6PackPrice", "12oz 6 Pack Price", "12 oz 6 Pack Price", "12oz 6-pack Price", "12 oz 6-pack Price"]);
    if (Number(case12FourPackPriceCents || 0) > 0 && Number(case12SixPackPriceCents || 0) > 0) throw new Error("Item " + (index + 1) + " has both 12oz 4-pack and 12oz 6-pack prices. Set only the package actually sold.");
    const case16PriceCents = firstCents(item, ["case16PriceCents", "case16ozPrice", "case16OzPrice", "cases16ozPrice", "16oz Case Price", "16 oz Case Price", "16oz Price", "16 oz Price"]);
    const case16FourPackPriceCents = firstCents(item, ["case16FourPackPriceCents", "fourPack16ozPrice", "fourPack16OzPrice", "case16FourPackPrice", "case16ozFourPackPrice", "case16oz4PackPrice", "16oz 4 Pack Price", "16 oz 4 Pack Price", "16oz 4-pack Price", "16 oz 4-pack Price"]);
    const casePriceCents = firstCents(item, ["casePriceCents", "casePrice", "Case Price"]);
    const rawCaseCount = count(field(item, ["caseCount", "Cases", "Case Count"]));
    const importedCaseSize = text(field(item, ["caseSize", "Case Size"]), 24);
    const importedCase12Count = firstCount(item, ["case12Count", "cases12oz", "case12ozQuantity", "case12OzQuantity", "case12ozCases", "12oz Cases", "12 oz Cases", "12oz Case Count", "12 oz Case Count", "12oz Cases Available", "12 oz Cases Available"]);
    const case12FourPackCount = firstCount(item, ["case12FourPackCount", "fourPack12ozQuantity", "fourPack12OzQuantity", "fourPacks12oz", "fourPacks12Oz", "12oz 4 Packs", "12 oz 4 Packs", "12oz 4-pack Count", "12 oz 4-pack Count"]) ?? 0;
    const case12SixPackCount = firstCount(item, ["case12SixPackCount", "sixPack12ozQuantity", "sixPack12OzQuantity", "sixPacks12oz", "sixPacks12Oz", "12oz 6 Packs", "12 oz 6 Packs", "12oz 6-pack Count", "12 oz 6-pack Count"]) ?? 0;
    const importedCase16Count = firstCount(item, ["case16Count", "cases16oz", "case16ozQuantity", "case16OzQuantity", "case16ozCases", "16oz Cases", "16 oz Cases", "16oz Case Count", "16 oz Case Count", "16oz Cases Available", "16 oz Cases Available"]);
    const case16FourPackCount = firstCount(item, ["case16FourPackCount", "fourPack16ozQuantity", "fourPack16OzQuantity", "fourPacks16oz", "fourPacks16Oz", "16oz 4 Packs", "16 oz 4 Packs", "16oz 4-pack Count", "16 oz 4-pack Count"]) ?? 0;
    const case12Count = importedCase12Count ?? (/^12\s*oz$/i.test(importedCaseSize) ? rawCaseCount ?? 0 : 0);
    const case16Count = importedCase16Count ?? (/^16\s*oz$/i.test(importedCaseSize) ? rawCaseCount ?? 0 : 0);
    const caseCount = rawCaseCount ?? 0;
    const caseSize = importedCaseSize || (case12PriceCents || case12Count || case12FourPackCount || case12SixPackCount ? "12oz" : case16PriceCents || case16Count || case16FourPackCount ? "16oz" : casePriceCents || caseCount ? "Case" : "");
    const hasDraft = sixthBblKegs > 0 || fiftyLKegs > 0;
    const hasCases = case12Count > 0 || case16Count > 0 || caseCount > 0;
    const packaging = text(field(item, ["packaging", "Packaging", "Package Size", "Package", "Format"]), 80) || (hasDraft && hasCases ? "Draft/Cans" : hasCases ? "Cans" : "Draft");
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
      ...(case12FourPackPriceCents === undefined ? {} : { case12FourPackPriceCents }),
      ...(case12SixPackPriceCents === undefined ? {} : { case12SixPackPriceCents }),
      ...(case16PriceCents === undefined ? {} : { case16PriceCents }),
      ...(case16FourPackPriceCents === undefined ? {} : { case16FourPackPriceCents }),
      case12Count,
      case12FourPackCount,
      case12SixPackCount,
      case16Count,
      case16FourPackCount,
      caseCount,
      ...(has12ozFourPack === undefined ? {} : { has12ozFourPack }),
      ...(has12ozSixPack === undefined ? {} : { has12ozSixPack }),
      ...(has16ozFourPack === undefined ? {} : { has16ozFourPack }),
      ...(status ? { status } : {}),
      ...(forSale === undefined ? {} : { forSale }),
      ...(quantityNote ? { quantityNote } : {}),
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
  const items = uploadedItems
    .filter(availableForPublic)
    .map((item) => ({ ...item, ...(options.preserveHidden && previousHidden.get(identityKey(item.beerName)) === true ? { hidden: true } : {}) }));

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
    ...(text(source?.backfillPickupNote, 500) ? { backfillPickupNote: text(source?.backfillPickupNote, 500) } : {}),
    updatedAt: validDate(field(source, ["inventoryUpdatedAt", "updatedAt", "generatedAt", "timestamp"]), validDate(field(source, ["exportedAt", "uploadedAt"]), previous?.updatedAt || now)),
    inventoryUpdatedAt: validDate(field(source, ["inventoryUpdatedAt", "updatedAt", "generatedAt", "timestamp"]), validDate(field(source, ["exportedAt", "uploadedAt"]), previous?.updatedAt || now)),
    exportedAt: validDate(field(source, ["exportedAt", "generatedAt", "timestamp"]), validDate(source?.uploadedAt, now)),
    uploadedAt: validDate(field(source, ["uploadedAt", "exportedAt", "generatedAt", "timestamp"]), now),
  };
}

async function readKegInventoryFile(file: string, options: { includeHidden?: boolean } = {}) {
  const parsed = JSON.parse(await fs.readFile(file, "utf8")) as unknown;
  const inventory = normalizeKegInventory(parsed);
  const items = options.includeHidden ? inventory.items : inventory.items.filter(visibleKegItem);
  return { ...inventory, items };
}

export async function getUploadedKegInventory(options: { includeHidden?: boolean } = {}): Promise<KegInventory | null> {
  try {
    return await readKegInventoryFile(bundledSnapshotFile(), options);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") return null;
  }
  try {
    const databaseInventory = await readDatabaseKegInventory(options);
    if (databaseInventory) return databaseInventory;
  } catch {
    // Keep the legacy file fallback available if the database is temporarily unavailable.
  }
  try {
    return await readKegInventoryFile(dataFile(), options);
  } catch {
    return null;
  }
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
  case12PriceCents?: unknown;
  case12FourPackPriceCents?: unknown;
  case12SixPackPriceCents?: unknown;
  case16PriceCents?: unknown;
  case16FourPackPriceCents?: unknown;
  case12Count?: unknown;
  case16Count?: unknown;
  caseCount?: unknown;
  hidden?: boolean;
};

export async function saveKegInventory(value: unknown) {
  const previous = await getUploadedKegInventory({ includeHidden: true });
  const inventory = normalizeKegInventory(value, previous, { requireKegsForSaleExport: true, preserveHidden: false });
  if (!(await saveDatabaseKegInventory(inventory))) await saveInventory(inventory);
  return inventory;
}

export async function importBundledKegInventory() {
  const sourceFile = bundledSnapshotFile();
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
  if (!(await saveDatabaseKegInventory(inventory))) await saveInventory(inventory);
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
  const case12Count = count(patch.case12Count) ?? target.case12Count ?? 0;
  const case16Count = count(patch.case16Count) ?? target.case16Count ?? 0;
  const caseCount = count(patch.caseCount) ?? case12Count + case16Count;
  const case12FourPackPriceCents = cents(patch.case12FourPackPriceCents);
  const case12SixPackPriceCents = cents(patch.case12SixPackPriceCents);
  const finalCase12FourPackPriceCents = case12FourPackPriceCents === undefined ? target.case12FourPackPriceCents : case12FourPackPriceCents;
  const finalCase12SixPackPriceCents = case12SixPackPriceCents === undefined ? target.case12SixPackPriceCents : case12SixPackPriceCents;
  if (Number(finalCase12FourPackPriceCents || 0) > 0 && Number(finalCase12SixPackPriceCents || 0) > 0) throw new Error("Set either the 12oz 4-pack price or the 12oz 6-pack price, not both.");
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
    ...(cents(patch.case12PriceCents) === undefined ? { case12PriceCents: target.case12PriceCents } : { case12PriceCents: cents(patch.case12PriceCents) }),
    case12FourPackPriceCents: finalCase12FourPackPriceCents,
    case12SixPackPriceCents: finalCase12SixPackPriceCents,
    ...(cents(patch.case16PriceCents) === undefined ? { case16PriceCents: target.case16PriceCents } : { case16PriceCents: cents(patch.case16PriceCents) }),
    ...(cents(patch.case16FourPackPriceCents) === undefined ? { case16FourPackPriceCents: target.case16FourPackPriceCents } : { case16FourPackPriceCents: cents(patch.case16FourPackPriceCents) }),
    case12Count,
    case16Count,
    caseCount,
    hidden: patch.hidden === true ? true : undefined,
  };
  const inventory = { ...current, items: current.items.map((item) => identityKey(item.beerName) === targetKey ? updated : item), uploadedAt: new Date().toISOString() };
  if (!(await saveDatabaseKegInventory(inventory))) await saveInventory(inventory);
  return inventory;
}

export async function setKegHidden(beerName: string, hidden: boolean) {
  return updateKegItem({ beerName, hidden });
}
