#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

const projectRoot = process.cwd();
const exportRoot = path.join(projectRoot, ".migration-exports");

function loadEnvFile(file) {
  return fs.readFile(file, "utf8").then((source) => {
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
  }).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
}

await loadEnvFile(path.join(projectRoot, ".env.local"));

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) throw new Error("DATABASE_URL or POSTGRES_URL is required.");

function sslRequired(url) {
  return /sslmode=require/i.test(url) || process.env.POSTGRES_SSL === "true";
}

function safeDatabaseSummary(url) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port || "5432",
    database: parsed.pathname.replace(/^\//, ""),
    ssl: sslRequired(url),
  };
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

const tableNames = [
  "website.settings",
  "website.content_blocks",
  "website.media_assets",
  "website.events",
  "website.beverages",
  "website.keg_package_inventory",
  "website.locations",
  "website.shop_categories",
  "website.shop_products",
  "website.shop_product_variants",
  "website.shop_settings",
  "public.flight_log_posts",
];

const orderBy = {
  "website.settings": "key",
  "website.content_blocks": "area, slug",
  "website.media_assets": "target, target_slug, file_name",
  "website.events": "slug",
  "website.beverages": "slug",
  "website.keg_package_inventory": "normalized_name",
  "website.locations": "slug",
  "website.shop_categories": "id",
  "website.shop_products": "id",
  "website.shop_product_variants": "id",
  "website.shop_settings": "id",
  "public.flight_log_posts": "slug",
};

async function readJson(relativePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(path.join(projectRoot, relativePath), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function fileHash(file) {
  const hash = createHash("sha256");
  hash.update(await fs.readFile(file));
  return hash.digest("hex");
}

const mediaMappings = [
  { source: "public/images/products/managed", destination: "beer-images" },
  { source: "public/media/branding", destination: "branding" },
  { source: "public/media/shop-products", destination: "shop-products" },
  { source: "public/media/website-photos", destination: "website-photos/website-photos" },
  { source: "public/media/brewery-photos", destination: "website-photos/brewery-photos" },
  { source: "public/media/private-event-photos", destination: "website-photos/private-event-photos" },
  { source: "public/media/event-page-media", destination: "website-photos/event-page-media" },
  { source: "public/media/location-photos", destination: "website-photos/location-photos" },
  { source: "public/media/flight-log-avatars", destination: "flight-log-avatars" },
  { source: "public/media/flight-log-posts", destination: "flight-log-posts" },
  { source: "data/event-images", destination: "event-images" },
  { source: "data/flight-log-images", destination: "flight-log-images" },
  { source: "data/beer-release-alert-assets", destination: "beer-release-alert-assets" },
];

async function copyMediaTree(sourceRoot, destinationRoot, manifest, sourceLabel) {
  let entries;
  try {
    entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  await fs.mkdir(destinationRoot, { recursive: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const source = path.join(sourceRoot, entry.name);
    const destination = path.join(destinationRoot, entry.name);
    if (entry.isDirectory()) {
      await copyMediaTree(source, destination, manifest, sourceLabel + "/" + entry.name);
      continue;
    }
    if (!entry.isFile() || entry.name === ".gitkeep") continue;
    await fs.copyFile(source, destination);
    const stats = await fs.stat(destination);
    manifest.push({
      source: sourceLabel + "/" + entry.name,
      destination: "aviatorbrew/" + path.relative(renderMediaRoot, destination).replaceAll(path.sep, "/"),
      size: stats.size,
      sha256: await fileHash(destination),
    });
  }
}

const exportDirectory = path.join(exportRoot, "render-migration-" + timestamp());
const stagingDirectory = path.join(exportDirectory, ".media-stage");
const renderMediaRoot = path.join(stagingDirectory, "aviatorbrew");
await fs.mkdir(exportDirectory, { recursive: true });

const pool = new Pool({
  connectionString,
  ...(sslRequired(connectionString) ? { ssl: { rejectUnauthorized: false } } : {}),
  max: 1,
});

const tables = {};
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    for (const table of tableNames) {
      const result = await client.query("SELECT * FROM " + table + " ORDER BY " + orderBy[table]);
      tables[table] = result.rows;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}

const legacy = {
  managedEvents: await readJson("data/managed-events.json", []),
  releaseAlerts: await readJson("data/beer-release-alert.json", { schemaVersion: 2, alerts: [] }),
};

const bundle = {
  schemaVersion: 1,
  exportType: "aviatorbrew-render-catalog",
  exportedAt: new Date().toISOString(),
  source: safeDatabaseSummary(connectionString),
  counts: Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, rows.length])),
  tables,
  legacy,
};

await fs.writeFile(path.join(exportDirectory, "catalog-data.json"), JSON.stringify(bundle, null, 2) + "\n", "utf8");

const mediaManifest = [];
for (const mapping of mediaMappings) {
  await copyMediaTree(
    path.join(projectRoot, mapping.source),
    path.join(renderMediaRoot, mapping.destination),
    mediaManifest,
    mapping.source,
  );
}

for (const fileName of ["hidden-photos.json", "featured-photos.json"]) {
  const source = path.join(projectRoot, "public", "media", fileName);
  try {
    const destination = path.join(renderMediaRoot, "website-photos", fileName);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
    const stats = await fs.stat(destination);
    mediaManifest.push({
      source: "public/media/" + fileName,
      destination: "aviatorbrew/website-photos/" + fileName,
      size: stats.size,
      sha256: await fileHash(destination),
    });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

const mediaSummary = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  extractionRoot: "/var/data",
  destinationRoot: "/var/data/aviatorbrew",
  fileCount: mediaManifest.length,
  totalBytes: mediaManifest.reduce((sum, file) => sum + file.size, 0),
  files: mediaManifest,
};
await fs.writeFile(path.join(exportDirectory, "media-manifest.json"), JSON.stringify(mediaSummary, null, 2) + "\n", "utf8");

const mediaArchive = path.join(exportDirectory, "render-media.tar.gz");
const tar = spawnSync("tar", ["-czf", mediaArchive, "-C", stagingDirectory, "aviatorbrew"], { stdio: "inherit" });
if (tar.status !== 0) throw new Error("Could not create the Render media archive.");
await fs.rm(stagingDirectory, { recursive: true, force: true });

const sourceBackup = path.join(exportDirectory, "local-source-backup.dump");
const dump = spawnSync("pg_dump", [
  "--format=custom",
  "--no-owner",
  "--no-privileges",
  "--exclude-table-data=flight_log.sessions",
  "--file=" + sourceBackup,
  connectionString,
], { stdio: ["ignore", "inherit", "inherit"] });
if (dump.status !== 0) throw new Error("Could not create the PostgreSQL source backup.");

const renderEnvironment = `# Render persistent disk mount: /var/data
BEER_IMAGES_DIRECTORY=/var/data/aviatorbrew/beer-images
BEVERAGE_IMAGES_DIRECTORY=/var/data/aviatorbrew/beer-images
SHOP_PRODUCT_IMAGES_DIRECTORY=/var/data/aviatorbrew/shop-products
WEBSITE_PHOTOS_DIRECTORY=/var/data/aviatorbrew/website-photos
BRANDING_MEDIA_DIRECTORY=/var/data/aviatorbrew/branding
MANAGED_EVENT_IMAGES_DIRECTORY=/var/data/aviatorbrew/event-images
FLIGHT_LOG_IMAGE_DIRECTORY=/var/data/aviatorbrew/flight-log-images
FLIGHT_LOG_AVATAR_DIRECTORY=/var/data/aviatorbrew/flight-log-avatars
FLIGHT_LOG_POST_MEDIA_DIRECTORY=/var/data/aviatorbrew/flight-log-posts
BEER_RELEASE_ALERT_ASSET_DIRECTORY=/var/data/aviatorbrew/beer-release-alert-assets
`;
await fs.writeFile(path.join(exportDirectory, "render-media.env"), renderEnvironment, "utf8");

const readme = `Aviator Brewing Render migration export
Generated: ${bundle.exportedAt}

Files:
- catalog-data.json: safe catalog/configuration export used by import-render-data.mjs
- local-source-backup.dump: full local PostgreSQL recovery snapshot, excluding active sessions
- render-media.tar.gz: extract with: tar -xzf render-media.tar.gz -C /var/data
- media-manifest.json: file sizes and SHA-256 checksums
- render-media.env: exact Render persistent-disk environment variables
- artifact-checksums.sha256: integrity checks for every export artifact

The catalog importer preserves production orders, subscribers, customer accounts, and sessions.
Do not commit this directory. The PostgreSQL backup can contain customer and order data.
`;
await fs.writeFile(path.join(exportDirectory, "README.txt"), readme, "utf8");

const checksumFiles = ["catalog-data.json", "local-source-backup.dump", "render-media.tar.gz", "media-manifest.json", "render-media.env", "README.txt"];
const checksumResult = spawnSync("sha256sum", checksumFiles, { cwd: exportDirectory, encoding: "utf8" });
if (checksumResult.status !== 0) throw new Error("Could not checksum the migration artifacts.");
await fs.writeFile(path.join(exportDirectory, "artifact-checksums.sha256"), checksumResult.stdout, "utf8");

console.log(JSON.stringify({
  exportDirectory,
  catalogCounts: bundle.counts,
  mediaFiles: mediaSummary.fileCount,
  mediaBytes: mediaSummary.totalBytes,
  artifacts: ["catalog-data.json", "local-source-backup.dump", "render-media.tar.gz", "media-manifest.json", "render-media.env", "artifact-checksums.sha256"],
}, null, 2));
