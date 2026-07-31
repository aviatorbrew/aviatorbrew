#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

const projectRoot = process.cwd();
const exportRoot = path.join(projectRoot, ".migration-exports");

async function loadEnvFile(file) {
  try {
    const source = await fs.readFile(file, "utf8");
    for (const line of source.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 1) continue;
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

await loadEnvFile(path.join(projectRoot, ".env.render.local"));

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const replaceShopInventory = args.has("--replace-shop-inventory");
const allowLocalTest = args.has("--allow-local-test");
const explicitDirectory = process.argv.slice(2).find((argument) => !argument.startsWith("--"));

async function latestExportDirectory() {
  const entries = await fs.readdir(exportRoot, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith("render-migration-")).map((entry) => entry.name).sort().reverse();
  if (!directories.length) throw new Error("No Render migration export exists. Run npm run render:data:export first.");
  return path.join(exportRoot, directories[0]);
}

const exportDirectory = explicitDirectory ? path.resolve(explicitDirectory) : await latestExportDirectory();
const bundleFile = path.join(exportDirectory, "catalog-data.json");
const bundle = JSON.parse(await fs.readFile(bundleFile, "utf8"));
if (bundle.schemaVersion !== 1 || bundle.exportType !== "aviatorbrew-render-catalog") throw new Error("Unsupported or invalid catalog export.");

const connectionString = process.env.TARGET_DATABASE_URL || process.env.RENDER_EXTERNAL_DATABASE_URL;
if (!connectionString) throw new Error("Set TARGET_DATABASE_URL in .env.render.local to the Render external PostgreSQL URL.");

function sslRequired(url) {
  return /sslmode=require/i.test(url) || process.env.TARGET_POSTGRES_SSL !== "false";
}

const parsedTarget = new URL(connectionString);
const targetSummary = {
  host: parsedTarget.hostname,
  port: parsedTarget.port || "5432",
  database: parsedTarget.pathname.replace(/^\//, ""),
  ssl: sslRequired(connectionString),
};

if (["localhost", "127.0.0.1", "::1"].includes(targetSummary.host) && !allowLocalTest) throw new Error("TARGET_DATABASE_URL must be the Render external database, not the local database.");
if (!targetSummary.host.endsWith(".render.com") && !args.has("--allow-non-render") && !allowLocalTest) throw new Error("Target host is not a Render database. Use --allow-non-render only when this is intentional.");
if (apply && process.env.CONFIRM_RENDER_IMPORT !== "aviatorbrew") throw new Error("Set CONFIRM_RENDER_IMPORT=aviatorbrew before using --apply.");

function qualified(name) {
  return name.split(".").map((part) => '"' + part.replaceAll('"', '""') + '"').join(".");
}

function identifier(name) {
  return '"' + name.replaceAll('"', '""') + '"';
}

const jsonColumns = new Map([
  ["website.settings", new Set(["value"])],
  ["website.content_blocks", new Set(["data"])],
  ["website.media_assets", new Set(["metadata"])],
  ["website.events", new Set(["details"])],
  ["website.beverages", new Set(["metadata"])],
  ["website.locations", new Set(["data"])],
  ["website.shop_products", new Set(["metadata", "additional_image_urls"])],
  ["website.shop_product_variants", new Set(["metadata"])],
]);

function normalizeValues(row, columns, table) {
  const json = jsonColumns.get(table);
  return columns.map((column) => {
    const value = row[column] === undefined ? null : row[column];
    return value !== null && json?.has(column) && typeof value !== "string" ? JSON.stringify(value) : value;
  });
}

async function upsertRows(client, table, rows, conflictColumns, options = {}) {
  if (!rows.length) return 0;
  const omitted = new Set(options.omit || []);
  const allColumns = Object.keys(rows[0]).filter((column) => !omitted.has(column));
  const updateColumns = allColumns.filter((column) => !conflictColumns.includes(column) && !(options.preserveOnConflict || []).includes(column));
  for (const rawRow of rows) {
    const row = options.transform ? await options.transform(rawRow) : rawRow;
    const columns = allColumns.filter((column) => Object.hasOwn(row, column));
    const values = normalizeValues(row, columns, table);
    const placeholders = columns.map((_, index) => "$" + (index + 1));
    const conflict = conflictColumns.map(identifier).join(", ");
    const update = updateColumns.filter((column) => columns.includes(column)).map((column) => identifier(column) + " = EXCLUDED." + identifier(column)).join(", ");
    const sql = "INSERT INTO " + qualified(table) + " (" + columns.map(identifier).join(", ") + ") VALUES (" + placeholders.join(", ") + ") ON CONFLICT (" + conflict + ") DO " + (update ? "UPDATE SET " + update : "NOTHING");
    await client.query(sql, values);
  }
  return rows.length;
}

function sourceRows(table) {
  const rows = bundle.tables?.[table];
  if (!Array.isArray(rows)) throw new Error("Export is missing " + table + ".");
  return rows;
}

function sundayOfMonth(year, monthIndex, ordinal) {
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  return 1 + ((7 - firstWeekday) % 7) + (ordinal - 1) * 7;
}

function easternLocalTimestamp(date, time = "00:00") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const year = Number(date.slice(0, 4));
  const springForward = year + "-03-" + String(sundayOfMonth(year, 2, 2)).padStart(2, "0") + "T02:00";
  const fallBack = year + "-11-" + String(sundayOfMonth(year, 10, 1)).padStart(2, "0") + "T02:00";
  const local = date + "T" + time;
  return local + ":00" + (local >= springForward && local < fallBack ? "-04:00" : "-05:00");
}

function importedEvents() {
  const rows = [...sourceRows("website.events")];
  const known = new Set(rows.map((row) => row.slug));
  for (const event of Array.isArray(bundle.legacy?.managedEvents) ? bundle.legacy.managedEvents : []) {
    if (!event?.id || known.has(event.id)) continue;
    const startsAt = event.date && event.startTime ? easternLocalTimestamp(event.date, event.startTime) : null;
    const endsAt = event.date && event.endTime ? easternLocalTimestamp(event.date, event.endTime) : null;
    rows.push({
      slug: event.id,
      title: event.title || "Aviator Event",
      event_type: event.eventType === "live_music" ? "live_music" : "special",
      starts_at: startsAt,
      ends_at: endsAt,
      location: event.location || "",
      description: event.description || "",
      details: event,
      published: event.published === true,
      created_at: event.createdAt || bundle.exportedAt,
      updated_at: event.updatedAt || bundle.exportedAt,
    });
    known.add(event.id);
  }
  return rows;
}

function importedContentBlocks() {
  const rows = [...sourceRows("website.content_blocks")];
  const known = new Set(rows.map((row) => row.area + ":" + row.slug));
  const alerts = Array.isArray(bundle.legacy?.releaseAlerts?.alerts) ? bundle.legacy.releaseAlerts.alerts : [];
  for (const alert of alerts) {
    if (!alert?.id || known.has("new_release_alerts:" + alert.id)) continue;
    rows.push({
      area: "new_release_alerts",
      slug: alert.id,
      eyebrow: "New release alert",
      title: alert.beerName || "New Aviator release",
      body: alert.specials || "",
      data: alert,
      published: alert.enabled === true,
      starts_at: alert.releaseDate ? easternLocalTimestamp(alert.releaseDate, alert.releaseTime || "00:00") : null,
      ends_at: null,
      sort_order: 0,
      created_at: alert.updatedAt || bundle.exportedAt,
      updated_at: alert.updatedAt || bundle.exportedAt,
    });
    known.add("new_release_alerts:" + alert.id);
  }
  return rows;
}

async function countTables(client) {
  const result = {};
  for (const table of Object.keys(bundle.counts || {})) {
    try {
      const count = await client.query("SELECT count(*)::int AS count FROM " + qualified(table));
      result[table] = Number(count.rows[0].count);
    } catch (error) {
      if (error.code === "42P01" || error.code === "3F000") result[table] = "missing";
      else throw error;
    }
  }
  for (const table of ["website.shop_orders", "website.newsletter_subscribers", "flight_log.profiles", "flight_log.sessions"]) {
    try {
      const count = await client.query("SELECT count(*)::int AS count FROM " + qualified(table));
      result[table] = Number(count.rows[0].count);
    } catch (error) {
      if (error.code === "42P01" || error.code === "3F000") result[table] = "missing";
      else throw error;
    }
  }
  return result;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function backupTarget() {
  const backupFile = path.join(exportDirectory, "render-before-import-" + timestamp() + ".dump");
  const result = spawnSync("pg_dump", [
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--file=" + backupFile,
    connectionString,
  ], { stdio: ["ignore", "inherit", "inherit"] });
  if (result.status !== 0) throw new Error("Render backup failed. Import was not started.");
  return backupFile;
}

function runSchemaMigration() {
  const result = spawnSync(process.execPath, [path.join(projectRoot, "scripts", "migrate-database.mjs")], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: connectionString, POSTGRES_URL: "", POSTGRES_SSL: sslRequired(connectionString) ? "true" : "false" },
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error("Render schema migration failed. Catalog import was not started.");
}

const poolConfig = {
  connectionString,
  ...(sslRequired(connectionString) ? { ssl: { rejectUnauthorized: false } } : {}),
  max: 1,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 15000,
};

let pool = new Pool(poolConfig);
let client = await pool.connect();
let before;
try {
  before = await countTables(client);
} finally {
  client.release();
  await pool.end();
}

console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  exportDirectory,
  exportedAt: bundle.exportedAt,
  target: targetSummary,
  sourceCounts: bundle.counts,
  targetCountsBefore: before,
  legacyEventsIncluded: importedEvents().length - sourceRows("website.events").length,
  legacyReleaseAlertsIncluded: importedContentBlocks().length - sourceRows("website.content_blocks").length,
}, null, 2));

if (!apply) {
  console.log("\nDry run only. Set CONFIRM_RENDER_IMPORT=aviatorbrew and add --apply to import.");
  process.exit(0);
}

const backupFile = await backupTarget();
runSchemaMigration();

pool = new Pool(poolConfig);
client = await pool.connect();
let shopOrderCount = 0;
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('aviatorbrew-render-catalog-import'))");

  shopOrderCount = Number((await client.query("SELECT count(*)::int AS count FROM website.shop_orders")).rows[0].count);

  await upsertRows(client, "website.settings", sourceRows("website.settings"), ["key"]);
  await upsertRows(client, "website.content_blocks", importedContentBlocks(), ["area", "slug"], { omit: ["id"] });
  await upsertRows(client, "website.media_assets", sourceRows("website.media_assets"), ["target", "target_slug", "file_name"], { omit: ["id"] });
  await upsertRows(client, "website.events", importedEvents(), ["slug"], { omit: ["id"] });
  await upsertRows(client, "website.beverages", sourceRows("website.beverages"), ["slug"], { omit: ["id"] });

  const beverageSlugs = sourceRows("website.beverages").map((row) => row.slug);
  if (beverageSlugs.length) await client.query("UPDATE website.beverages SET published=false, updated_at=now() WHERE NOT (slug = ANY($1::text[]))", [beverageSlugs]);

  await client.query("DELETE FROM website.keg_package_inventory");
  for (const row of sourceRows("website.keg_package_inventory")) {
    const columns = Object.keys(row).filter((column) => column !== "id");
    await client.query(
      "INSERT INTO website.keg_package_inventory (" + columns.map(identifier).join(", ") + ") VALUES (" + columns.map((_, index) => "$" + (index + 1)).join(", ") + ")",
      normalizeValues(row, columns, "website.keg_package_inventory"),
    );
  }

  await upsertRows(client, "website.locations", sourceRows("website.locations"), ["slug"]);

  const categories = sourceRows("website.shop_categories");
  await upsertRows(client, "website.shop_categories", categories, ["slug"], { omit: ["id"] });
  const categoryRows = await client.query("SELECT id, slug FROM website.shop_categories");
  const targetCategoryBySlug = new Map(categoryRows.rows.map((row) => [row.slug, Number(row.id)]));
  const sourceCategorySlugById = new Map(categories.map((row) => [String(row.id), row.slug]));

  const products = sourceRows("website.shop_products");
  await upsertRows(client, "website.shop_products", products, ["slug"], {
    omit: ["id"],
    transform: async (row) => ({
      ...row,
      category_id: row.category_id == null ? null : targetCategoryBySlug.get(sourceCategorySlugById.get(String(row.category_id))) || null,
    }),
  });
  const productRows = await client.query("SELECT id, slug FROM website.shop_products");
  const targetProductBySlug = new Map(productRows.rows.map((row) => [row.slug, Number(row.id)]));
  const sourceProductSlugById = new Map(products.map((row) => [String(row.id), row.slug]));
  const importedProductIds = products.map((row) => targetProductBySlug.get(row.slug)).filter(Boolean);

  if (importedProductIds.length) {
    await client.query("UPDATE website.shop_product_variants SET published=false, available_for_sale=false, updated_at=now() WHERE product_id=ANY($1::bigint[])", [importedProductIds]);
  }

  const variants = sourceRows("website.shop_product_variants");
  await upsertRows(client, "website.shop_product_variants", variants, ["product_id", "label"], {
    omit: ["id"],
    preserveOnConflict: shopOrderCount > 0 && !replaceShopInventory ? ["inventory_count"] : [],
    transform: async (row) => ({
      ...row,
      product_id: targetProductBySlug.get(sourceProductSlugById.get(String(row.product_id))),
    }),
  });

  const variantRows = await client.query(
    "SELECT v.id, v.label, p.slug AS product_slug FROM website.shop_product_variants v JOIN website.shop_products p ON p.id=v.product_id",
  );
  const targetVariantByKey = new Map(variantRows.rows.map((row) => [row.product_slug + "\n" + row.label, Number(row.id)]));
  const sourceVariantKeyById = new Map(variants.map((row) => [String(row.id), sourceProductSlugById.get(String(row.product_id)) + "\n" + row.label]));

  const settings = sourceRows("website.shop_settings").map((row) => ({
    ...row,
    bonus_variant_id: row.bonus_variant_id == null ? null : targetVariantByKey.get(sourceVariantKeyById.get(String(row.bonus_variant_id))) || null,
  }));
  await upsertRows(client, "website.shop_settings", settings, ["id"]);

  const categorySlugs = categories.map((row) => row.slug);
  const productSlugs = products.map((row) => row.slug);
  if (categorySlugs.length) await client.query("UPDATE website.shop_categories SET published=false, updated_at=now() WHERE NOT (slug = ANY($1::text[]))", [categorySlugs]);
  if (productSlugs.length) await client.query("UPDATE website.shop_products SET published=false, updated_at=now() WHERE NOT (slug = ANY($1::text[]))", [productSlugs]);

  await upsertRows(client, "public.flight_log_posts", sourceRows("public.flight_log_posts"), ["slug"], { omit: ["id"] });

  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}

pool = new Pool(poolConfig);
client = await pool.connect();
let after;
try {
  after = await countTables(client);
} finally {
  client.release();
  await pool.end();
}

console.log(JSON.stringify({
  imported: true,
  backupFile,
  target: targetSummary,
  targetCountsAfter: after,
  shopInventoryPolicy: shopOrderCount > 0 && !replaceShopInventory
    ? "Existing Render variant inventory preserved because production orders exist."
    : "Local variant inventory imported.",
  nextStep: "Extract render-media.tar.gz into /var/data and configure render-media.env.",
}, null, 2));
